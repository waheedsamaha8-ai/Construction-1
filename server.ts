import express, { type Request, type Response } from 'express';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Readable } from 'stream';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- LOAD .ENV IF PRESENT (NEVER OVERWRITING EXISTING PROCESS ENV) ---
if (fs.existsSync('.env')) {
  try {
    const envContent = fs.readFileSync('.env', 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  } catch (e) {
    console.warn('Could not read .env file:', e);
  }
}

// --- SERVER-ONLY GEMINI API KEY MANAGEMENT (SMART ROTATION & COOLDOWN) ---
const deadKeysSet = new Set<string>();
const disabledKeysSet = new Set<string>();
const rateLimitedUntilMap = new Map<string, number>();
const keyUsageCountMap = new Map<string, number>();
let currentKeyIndex = 0;

const incrementKeyUsage = (key: string) => {
  if (!key) return;
  keyUsageCountMap.set(key, (keyUsageCountMap.get(key) || 0) + 1);
};

const collectAllConfiguredServerKeys = (): string[] => {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEYS,
    process.env.GOOGLE_API_KEY,
    process.env.API_KEY,
  ];
  const keys: string[] = [];
  for (const cand of candidates) {
    if (!cand) continue;
    const parts = cand
      .split(/[,;\n\r]+/)
      .map(k => k.trim().replace(/^["']|["']$/g, ''))
      .filter(k => k.length > 0);
    keys.push(...parts);
  }
  return [...new Set(keys)];
};

const collectServerEnvKeys = (): string[] => {
  const now = Date.now();
  const alive = collectAllConfiguredServerKeys().filter(
    k => !deadKeysSet.has(k) && !disabledKeysSet.has(k)
  );
  const healthy = alive.filter(k => (rateLimitedUntilMap.get(k) || 0) <= now);
  if (healthy.length > 0) return healthy;
  // If all alive keys are temporarily cooled down, sort by earliest cooldown expiry
  return [...alive].sort((a, b) => (rateLimitedUntilMap.get(a) || 0) - (rateLimitedUntilMap.get(b) || 0));
};

const getActiveServerKey = (): string => {
  const keys = collectServerEnvKeys();
  if (keys.length === 0) return '';
  return keys[currentKeyIndex % keys.length];
};

const markKeyCooldown = (key: string, cooldownMs: number) => {
  if (!key) return;
  rateLimitedUntilMap.set(key, Date.now() + cooldownMs);
};

const rotateServerKey = (failedKey?: string, cooldownMs: number = 0): boolean => {
  if (failedKey && cooldownMs > 0) {
    markKeyCooldown(failedKey, cooldownMs);
  }
  const keys = collectServerEnvKeys();
  if (keys.length === 0) return false;
  if (keys.length === 1) {
    currentKeyIndex = 0;
    return keys[0] !== failedKey;
  }
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  return true;
};

const buildRotationStatusPayload = () => {
  const now = Date.now();
  const allConfigured = collectAllConfiguredServerKeys();
  const eligibleKeys = collectServerEnvKeys();
  const activeKey = eligibleKeys.length > 0 ? eligibleKeys[currentKeyIndex % eligibleKeys.length] : '';

  let healthyKeysCount = 0;
  let cooldownKeysCount = 0;
  let disabledKeysCount = 0;
  let deadKeysCount = 0;

  const slots = allConfigured.map((key, idx) => {
    const isDead = deadKeysSet.has(key);
    const isDisabled = disabledKeysSet.has(key);
    const cooldownUntil = rateLimitedUntilMap.get(key) || 0;
    const cooldownRemainingSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

    let status: 'active' | 'cooldown' | 'disabled' | 'dead' = 'active';
    if (isDead) {
      status = 'dead';
      deadKeysCount++;
    } else if (isDisabled) {
      status = 'disabled';
      disabledKeysCount++;
    } else if (cooldownRemainingSec > 0) {
      status = 'cooldown';
      cooldownKeysCount++;
    } else {
      healthyKeysCount++;
    }

    return {
      slotIndex: idx + 1,
      label: `منفذ الخادم الآمن #${idx + 1}`,
      status,
      isCurrentActive: activeKey === key && !isDead && !isDisabled,
      cooldownRemainingSec,
      usageCount: keyUsageCountMap.get(key) || 0,
    };
  });

  return {
    smartRotationEnabled: true,
    totalConfiguredKeys: allConfigured.length,
    healthyKeysCount,
    cooldownKeysCount,
    disabledKeysCount,
    deadKeysCount,
    slots,
  };
};

const getAiClient = (apiKeyOverride?: string) => {
  const apiKey = apiKeyOverride || getActiveServerKey() || process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// --- ACTIVE MODEL SELECTION & CONFIG SANITIZATION ---
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
const DEFAULT_LIVE_MODEL = 'gemini-3.8-live';

const normalizeModel = (model?: string): string => {
  if (!model || typeof model !== 'string') return PRIMARY_MODEL;
  const m = model.trim();
  if (!m) return PRIMARY_MODEL;
  if (
    m.includes('1.5') ||
    m.includes('2.0') ||
    m.includes('gemini-pro') ||
    m === 'gemini-3.8-flash' ||
    m.includes('preview') ||
    m.includes('latest')
  ) {
    return PRIMARY_MODEL;
  }
  return m;
};

const sanitizeConfigForModel = (model: string, config: any) => {
  if (!config || typeof config !== 'object') return undefined;
  const cleaned = { ...config };
  if (cleaned.tools === undefined) delete cleaned.tools;

  // Gemini 4 models do not accept deprecated sampling parameters or thinkingBudget
  if (model.startsWith('gemini-4-')) {
    delete cleaned.temperature;
    delete cleaned.topP;
    delete cleaned.topK;
    delete cleaned.candidateCount;
    if (cleaned.thinkingConfig && typeof cleaned.thinkingConfig === 'object') {
      const tc = { ...cleaned.thinkingConfig };
      delete tc.thinkingBudget;
      if (Object.keys(tc).length === 0) {
        delete cleaned.thinkingConfig;
      } else {
        cleaned.thinkingConfig = tc;
      }
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
};

const extractErrorInfo = (error: any): { status: number; message: string } => {
  const rawStatus = Number(error?.status || error?.statusCode || error?.code);
  const msg = String(error?.message || error || 'Gemini API request failed');
  const lower = msg.toLowerCase();

  if (Number.isFinite(rawStatus) && rawStatus >= 400 && rawStatus < 600) {
    return { status: rawStatus, message: msg };
  }
  if (lower.includes('permission_denied') || lower.includes('403')) {
    return { status: 403, message: msg };
  }
  if (lower.includes('api_key_invalid') || lower.includes('api key not valid') || lower.includes('invalid argument')) {
    return { status: 400, message: msg };
  }
  if (lower.includes('not_found') || lower.includes('not found') || lower.includes('404')) {
    return { status: 404, message: msg };
  }
  if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('429')) {
    return { status: 429, message: msg };
  }
  if (lower.includes('unavailable') || lower.includes('503')) {
    return { status: 503, message: msg };
  }
  return { status: 500, message: msg };
};

const app = express();
const server = createHttpServer(app);

// Enable CORS for cross-origin requests
app.use((req: Request, res: Response, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Increase limits for large base64 files/audio
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Non-secret Smart Rotation Status & Slot Controls (never exposes key strings or prefixes)
app.get('/api/gemini/rotation-status', (_req: Request, res: Response) => {
  res.json(buildRotationStatusPayload());
});

app.post('/api/gemini/rotation-activate-slot', (req: Request, res: Response) => {
  const slotIndex = Number(req.body?.slotIndex);
  const allConfigured = collectAllConfiguredServerKeys();
  if (!Number.isInteger(slotIndex) || slotIndex < 1 || slotIndex > allConfigured.length) {
    return res.status(400).json({ error: 'رقم المنفذ غير صحيح' });
  }
  const targetKey = allConfigured[slotIndex - 1];
  disabledKeysSet.delete(targetKey);
  deadKeysSet.delete(targetKey);
  rateLimitedUntilMap.delete(targetKey);

  const eligibleKeys = collectServerEnvKeys();
  const idx = eligibleKeys.indexOf(targetKey);
  currentKeyIndex = idx >= 0 ? idx : 0;
  return res.json(buildRotationStatusPayload());
});

app.post('/api/gemini/rotation-toggle-slot', (req: Request, res: Response) => {
  const slotIndex = Number(req.body?.slotIndex);
  const allConfigured = collectAllConfiguredServerKeys();
  if (!Number.isInteger(slotIndex) || slotIndex < 1 || slotIndex > allConfigured.length) {
    return res.status(400).json({ error: 'رقم المنفذ غير صحيح' });
  }
  const targetKey = allConfigured[slotIndex - 1];
  if (disabledKeysSet.has(targetKey)) {
    disabledKeysSet.delete(targetKey);
  } else {
    const remainingEnabled = allConfigured.filter(
      k => k !== targetKey && !disabledKeysSet.has(k) && !deadKeysSet.has(k)
    );
    if (remainingEnabled.length === 0) {
      return res.status(400).json({ error: 'يجب إبقاء منفذ واحد نشط على الأقل لتشغيل الذكاء الاصطناعي' });
    }
    disabledKeysSet.add(targetKey);
    currentKeyIndex = 0;
  }
  return res.json(buildRotationStatusPayload());
});

app.post('/api/gemini/rotation-reset-all', async (_req: Request, res: Response) => {
  rateLimitedUntilMap.clear();
  deadKeysSet.clear();
  const allConfigured = collectAllConfiguredServerKeys();

  await Promise.all(
    allConfigured.map(async (key) => {
      if (disabledKeysSet.has(key)) return;
      try {
        const client = getAiClient(key);
        await client.models.list({ config: { pageSize: 1 } });
      } catch (err: any) {
        const { status, message } = extractErrorInfo(err);
        const msgLower = (message || '').toLowerCase();
        if (
          msgLower.includes('api_key_invalid') ||
          msgLower.includes('api key not valid') ||
          msgLower.includes('leaked') ||
          status === 403
        ) {
          deadKeysSet.add(key);
        } else if (status === 429) {
          markKeyCooldown(key, 60000);
        } else if (status === 503) {
          markKeyCooldown(key, 15000);
        }
      }
    })
  );

  return res.json(buildRotationStatusPayload());
});

// High-Speed HTTP Range Proxy for Google Drive Video & Media Streaming
app.get('/api/drive/stream/:fileId', async (req: Request, res: Response) => {
  const fileId = String(req.params.fileId || '').trim();
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim() : '';
  const token = queryToken || authHeader;

  if (!/^[a-zA-Z0-9_-]{5,128}$/.test(fileId) || !token) {
    return res.status(400).json({ error: 'Invalid fileId or missing token' });
  }

  const controller = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      try { controller.abort(); } catch {}
    }
  });

  try {
    const upstreamHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (typeof req.headers.range === 'string' && req.headers.range.trim()) {
      upstreamHeaders.Range = req.headers.range;
    }

    const upstreamRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      {
        method: 'GET',
        headers: upstreamHeaders,
        signal: controller.signal,
      }
    );

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return res.status(upstreamRes.status).end();
    }

    res.status(upstreamRes.status);
    const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag'];
    for (const h of forwardHeaders) {
      const val = upstreamRes.headers.get(h);
      if (val) res.setHeader(h, val);
    }
    if (!upstreamRes.headers.get('accept-ranges')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (!upstreamRes.body) {
      return res.end();
    }

    const nodeStream = Readable.fromWeb(upstreamRes.body as any);
    nodeStream.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    res.on('error', () => {
      try { nodeStream.destroy(); } catch {}
    });
    nodeStream.pipe(res);
  } catch (err: any) {
    if (err?.name === 'AbortError' || res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }
    return res.status(502).json({ error: 'Media stream proxy failed' });
  }
});

// --- GEMINI GENERATE CONTENT ENDPOINT ---
app.post('/api/gemini/generate', async (req: Request, res: Response) => {
  const { model: requestedModel, contents, config, cachedContent } = req.body || {};

  if (!contents) {
    return res.status(400).json({ error: 'Missing required field: contents' });
  }

  const serverKeys = collectServerEnvKeys();
  if (serverKeys.length === 0) {
    return res.status(500).json({ error: 'Gemini API key is not configured on the server.' });
  }

  const primaryModel = normalizeModel(requestedModel);
  const modelSequence = [...new Set([primaryModel, ...FALLBACK_MODELS])];

  let lastErrInfo = { status: 500, message: 'Failed to generate content' };

  for (const model of modelSequence) {
    const activeKeys = collectServerEnvKeys();
    const maxAttempts = Math.max(1, activeKeys.length);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const currentKey = getActiveServerKey();
      if (!currentKey) break;

      const hasSearchTool = Array.isArray(config?.tools) && config.tools.some((t: any) => t.googleSearch);
      const configVariants = hasSearchTool
        ? [config, { ...config, tools: undefined }]
        : [config];

      for (const activeConfig of configVariants) {
        try {
          const client = getAiClient(currentKey);
          const requestParams: any = {
            model,
            contents,
          };

          const sanitized = sanitizeConfigForModel(model, activeConfig);
          if (sanitized) {
            requestParams.config = sanitized;
          }
          if (cachedContent && String(cachedContent).startsWith('cachedContents/')) {
            requestParams.cachedContent = cachedContent;
          }

          incrementKeyUsage(currentKey);
          const response = await client.models.generateContent(requestParams);
          if (activeKeys.length > 1) {
            currentKeyIndex = (currentKeyIndex + 1) % activeKeys.length;
          }
          const hasText = typeof response?.text === 'string' && response.text.length > 0;
          const hasFunctionCalls = Array.isArray(response?.functionCalls) && response.functionCalls.length > 0;

          if (response && (hasText || hasFunctionCalls)) {
            return res.json({
              text: hasText ? response.text : '',
              functionCalls: response.functionCalls || null,
              modelContent: response.candidates?.[0]?.content || null,
              usedModel: model,
            });
          }

          return res.json({
            text: response?.text || '',
            functionCalls: null,
            modelContent: response?.candidates?.[0]?.content || null,
            usedModel: model,
          });
        } catch (error: any) {
          lastErrInfo = extractErrorInfo(error);
          const msgLower = lastErrInfo.message.toLowerCase();

          // If googleSearch failed (e.g., combined with structured JSON schema), retry once without googleSearch
          if (activeConfig?.tools && hasSearchTool) {
            continue;
          }

          if (lastErrInfo.status === 404) {
            break;
          }

          if (
            lastErrInfo.status === 400 ||
            lastErrInfo.status === 403 ||
            msgLower.includes('api_key_invalid') ||
            msgLower.includes('api key not valid') ||
            msgLower.includes('leaked')
          ) {
            if (msgLower.includes('api_key_invalid') || msgLower.includes('api key not valid') || msgLower.includes('leaked')) {
              deadKeysSet.add(currentKey);
              rotateServerKey(currentKey);
              continue;
            }
            break;
          }

          if (lastErrInfo.status === 429 || lastErrInfo.status === 503) {
            const cooldownMs = lastErrInfo.status === 429 ? 60000 : 15000;
            if (rotateServerKey(currentKey, cooldownMs)) {
              await new Promise(r => setTimeout(r, 200));
              continue;
            }
            await new Promise(r => setTimeout(r, 300));
            break;
          }

          break;
        }
      }
    }
  }

  return res.status(lastErrInfo.status).json({
    error: lastErrInfo.message,
    status: lastErrInfo.status,
  });
});

// --- GEMINI STREAMING ENDPOINT (Server-Sent Events) ---
app.post('/api/gemini/stream', async (req: Request, res: Response) => {
  const { model: requestedModel, contents, config } = req.body || {};

  if (!contents) {
    return res.status(400).json({ error: 'Missing required field: contents' });
  }

  const serverKeys = collectServerEnvKeys();
  if (serverKeys.length === 0) {
    return res.status(500).json({ error: 'Gemini API key is not configured on the server.' });
  }

  const primaryModel = normalizeModel(requestedModel);
  const modelSequence = [...new Set([primaryModel, ...FALLBACK_MODELS])];

  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let streamedSuccessfully = false;
  let lastErrInfo = { status: 500, message: 'Streaming failed' };

  for (const model of modelSequence) {
    if (streamedSuccessfully || clientDisconnected) break;
    const activeKeys = collectServerEnvKeys();
    const maxAttempts = Math.max(1, activeKeys.length);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (streamedSuccessfully || clientDisconnected) break;
      const currentKey = getActiveServerKey();
      if (!currentKey) break;

      try {
        const client = getAiClient(currentKey);
        const sanitized = sanitizeConfigForModel(model, config);
        incrementKeyUsage(currentKey);
        const responseStream = await client.models.generateContentStream({
          model,
          contents,
          ...(sanitized ? { config: sanitized } : {}),
        });

        for await (const chunk of responseStream) {
          if (clientDisconnected || res.writableEnded) break;
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
          }
        }
        if (activeKeys.length > 1) {
          currentKeyIndex = (currentKeyIndex + 1) % activeKeys.length;
        }
        streamedSuccessfully = true;
        break;
      } catch (error: any) {
        lastErrInfo = extractErrorInfo(error);
        const msgLower = lastErrInfo.message.toLowerCase();
        console.warn(`Streaming attempt with model ${model} failed:`, lastErrInfo.message);

        if (msgLower.includes('api_key_invalid') || msgLower.includes('api key not valid') || msgLower.includes('leaked')) {
          deadKeysSet.add(currentKey);
          rotateServerKey(currentKey);
          continue;
        }
        if (lastErrInfo.status === 429 || lastErrInfo.status === 503) {
          const cooldownMs = lastErrInfo.status === 429 ? 60000 : 15000;
          if (rotateServerKey(currentKey, cooldownMs)) continue;
        }
        if (lastErrInfo.status === 400 || lastErrInfo.status === 403) {
          break;
        }
        rotateServerKey(currentKey);
      }
    }
  }

  if (!clientDisconnected && !res.writableEnded) {
    if (!streamedSuccessfully) {
      res.write(`data: ${JSON.stringify({ error: lastErrInfo.message, status: lastErrInfo.status })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// --- LIVE API WEBSOCKET BRIDGE ---
const wss = new WebSocketServer({ server, path: '/api/gemini/live' });
wss.on('error', (err) => {
  console.error('Live WebSocketServer error:', err);
});

wss.on('connection', (clientWs: WebSocket, req) => {
  const serverKeys = collectServerEnvKeys();
  if (serverKeys.length === 0) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ error: 'Gemini API key is not configured on the server.' }));
      clientWs.close();
    }
    return;
  }

  const urlParams = new URLSearchParams((req.url || '').split('?')[1] || '');
  const requestedModel = (urlParams.get('model') || '').trim() || DEFAULT_LIVE_MODEL;
  const voiceName = (urlParams.get('voiceName') || '').trim() || 'Zephyr';
  const systemInstruction =
    (urlParams.get('systemInstruction') || '').trim() ||
    'أنت استشاري هندسي ومساعد صوتي ذكي لمشروعات التشييد والبناء.';

  let clientClosed = false;
  let activeSession: any = null;

  const isTranscribeLive = requestedModel === 'gemini-3.5-transcribe-live';
  const liveConfig: any = isTranscribeLive
    ? {
        responseModalities: [Modality.TEXT],
        inputAudioTranscription: {},
      }
    : {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction,
      };

  const connectLiveWithRotation = async () => {
    const keysToTry = collectServerEnvKeys();
    let lastError: any = null;
    for (let i = 0; i < Math.max(1, keysToTry.length); i++) {
      if (clientClosed) return null;
      const candidateKey = getActiveServerKey();
      if (!candidateKey) break;
      try {
        const client = getAiClient(candidateKey);
        incrementKeyUsage(candidateKey);
        const session = await client.live.connect({
          model: requestedModel,
          config: liveConfig,
          callbacks: {
            onmessage: (message: LiveServerMessage) => {
              if (clientWs.readyState !== WebSocket.OPEN) return;

              const content = message.serverContent;
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                }
                if (part.text) {
                  clientWs.send(JSON.stringify({ text: part.text }));
                }
              }
              if (content?.inputTranscription?.text) {
                clientWs.send(JSON.stringify({ inputTranscript: content.inputTranscription.text }));
              }
              if (content?.outputTranscription?.text) {
                clientWs.send(JSON.stringify({ outputTranscript: content.outputTranscription.text }));
              }
              if (content?.interrupted) {
                clientWs.send(JSON.stringify({ interrupted: true }));
              }
              if (content?.turnComplete) {
                clientWs.send(JSON.stringify({ turnComplete: true }));
              }
              if (message.toolCall) {
                clientWs.send(JSON.stringify({ toolCall: message.toolCall }));
              }
            },
            onclose: () => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ status: 'session_closed' }));
              }
            },
            onerror: (err: any) => {
              console.error('Gemini Live session error:', err);
              const { status, message } = extractErrorInfo(err);
              const msgLower = (message || '').toLowerCase();
              if (msgLower.includes('api_key_invalid') || msgLower.includes('api key not valid') || msgLower.includes('leaked')) {
                deadKeysSet.add(candidateKey);
                rotateServerKey(candidateKey);
              } else if (status === 429 || status === 503) {
                rotateServerKey(candidateKey, status === 429 ? 60000 : 15000);
              }
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ error: message || 'Live session error' }));
              }
            },
          },
        });
        return session;
      } catch (err: any) {
        lastError = err;
        const { status, message } = extractErrorInfo(err);
        const msgLower = (message || '').toLowerCase();
        if (msgLower.includes('api_key_invalid') || msgLower.includes('api key not valid') || msgLower.includes('leaked')) {
          deadKeysSet.add(candidateKey);
          rotateServerKey(candidateKey);
          continue;
        }
        if (status === 429 || status === 503) {
          rotateServerKey(candidateKey, status === 429 ? 60000 : 15000);
          continue;
        }
        rotateServerKey(candidateKey);
      }
    }
    throw lastError || new Error('Failed to connect Live session');
  };

  const sessionPromise = connectLiveWithRotation();

  sessionPromise
    .then((session) => {
      if (!session) return;
      activeSession = session;
      if (clientClosed) {
        try {
          session.close();
        } catch {}
        return;
      }
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ status: 'connected' }));
      }
    })
    .catch((err: any) => {
      console.error('Failed to initialize Gemini Live session:', err);
      const { message } = extractErrorInfo(err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: message || 'Failed to connect Live session' }));
        clientWs.close();
      }
    });

  // Attach message/close handlers immediately and route via sessionPromise to prevent race drops
  clientWs.on('message', (data: Buffer | string) => {
    let payload: any;
    try {
      payload = JSON.parse(data.toString());
    } catch (err) {
      console.error('Failed to parse Live input:', err);
      return;
    }

    sessionPromise
      .then((session) => {
        if (!session || clientClosed) return;
        if (payload.audio) {
          session.sendRealtimeInput({
            audio: {
              data: payload.audio,
              mimeType: payload.mimeType || 'audio/pcm;rate=16000',
            },
          });
        } else if (payload.video) {
          session.sendRealtimeInput({
            video: {
              data: payload.video,
              mimeType: payload.mimeType || 'image/jpeg',
            },
          });
        } else if (payload.text) {
          session.sendRealtimeInput({
            text: payload.text,
          });
        } else if (payload.toolResponse) {
          session.sendToolResponse(payload.toolResponse);
        }
      })
      .catch((err) => {
        console.error('Failed to forward Live input:', err);
      });
  });

  clientWs.on('close', () => {
    clientClosed = true;
    if (activeSession) {
      try {
        activeSession.close();
      } catch {}
    } else {
      sessionPromise
        .then((session) => {
          try {
            session.close();
          } catch {}
        })
        .catch(() => {});
    }
  });
});

const getCliPort = (): number | undefined => {
  const idx = process.argv.indexOf('--port');
  if (idx !== -1 && process.argv[idx + 1]) {
    const p = Number(process.argv[idx + 1]);
    if (Number.isFinite(p) && p > 0) return p;
  }
  const eqArg = process.argv.find(a => a.startsWith('--port='));
  if (eqArg) {
    const p = Number(eqArg.split('=')[1]);
    if (Number.isFinite(p) && p > 0) return p;
  }
  return undefined;
};

// --- VITE MIDDLEWARE IN DEV OR STATIC FILES IN PROD ---
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  let viteServer: { close: () => Promise<void> } | null = null;
  let viteMiddlewares: any = null;
  let viteInitError: any = null;

  const cliPort = getCliPort();
  const envPort = Number(process.env.PORT);
  const defaultPort = Number(process.env.DEFAULT_APP_PORT) || 3000;
  const nginxPort = Number(process.env.NGINX_PORT);
  const PORT = cliPort || (envPort && envPort !== nginxPort ? envPort : defaultPort);

  let viteReadyPromise: Promise<void> = Promise.resolve();

  if (!isProd) {
    viteReadyPromise = (async () => {
      try {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          server: {
            middlewareMode: true,
            hmr: false,
          },
          appType: 'spa',
        });
        viteServer = vite;
        viteMiddlewares = vite.middlewares;
      } catch (err) {
        viteInitError = err;
        console.error('Vite middleware initialization error:', err);
      }
    })();

    app.use(async (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api')) return next();
      await viteReadyPromise;
      if (viteInitError) {
        return res.status(500).send('Dev server Vite initialization error');
      }
      if (viteMiddlewares) {
        return viteMiddlewares(req, res, next);
      }
      return next();
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get(/.*/, (_req: Request, res: Response) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      console.warn('Production build folder dist does not exist yet. Please run npm run build.');
    }
  }

  server.on('error', (err: any) => {
    console.error('HTTP Server error:', err);
    if (err?.code === 'EADDRINUSE') {
      process.exit(1);
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Construction Pro Server running on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async () => {
    try {
      if (viteServer) await viteServer.close();
    } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch(err => {
  console.error('Server startup error:', err);
  process.exit(1);
});
