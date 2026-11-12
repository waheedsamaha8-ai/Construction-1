import express, { Request, Response } from 'express';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- LOAD .ENV IF PRESENT ---
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

const SYNCED_KEYS_FILE = path.resolve(__dirname, '.synced_gemini_keys.json');
const deadKeysSet = new Set<string>();

const loadSyncedUserKeys = (): string[] => {
  try {
    if (fs.existsSync(SYNCED_KEYS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SYNCED_KEYS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) {
        return parsed.map(k => String(k || '').trim()).filter(k => k.length > 10 && !deadKeysSet.has(k));
      }
    }
  } catch (e) {}
  return [];
};

const saveSyncedUserKeys = (keys: string[]) => {
  try {
    const existing = loadSyncedUserKeys();
    const merged = [...new Set([...keys, ...existing])].filter(k => k && k.length > 10 && !deadKeysSet.has(k));
    fs.writeFileSync(SYNCED_KEYS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  } catch (e) {
    return keys;
  }
};

// --- MULTI-KEY ROTATION & API KEY SETUP ---
const collectEnvKeys = (): string[] => {
  const envCandidates = [
    process.env.GEMINI_API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.API_KEY,
    process.env.VITE_API_KEY,
  ];
  const keys: string[] = [...loadSyncedUserKeys()];
  for (const cand of envCandidates) {
    if (cand) {
      const parts = cand.split(',').map(k => k.trim()).filter(k => k.length > 0 && !deadKeysSet.has(k));
      keys.push(...parts);
    }
  }
  return [...new Set(keys)];
};

let API_KEYS = collectEnvKeys();
let currentKeyIndex = API_KEYS.length > 0 ? Math.floor(Math.random() * API_KEYS.length) : 0;

const getAiClient = (overrideKey?: string) => {
  const customKey = overrideKey?.trim();
  const key = customKey || (API_KEYS.length > 0 ? API_KEYS[currentKeyIndex % API_KEYS.length] : (process.env.GEMINI_API_KEY || process.env.API_KEY || ''));
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

const rotateKey = () => {
  if (API_KEYS.length <= 1) return false;
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  console.warn(`Rotating to Gemini API Key #${(currentKeyIndex % API_KEYS.length) + 1}...`);
  return true;
};

// Supported standard Gemini models
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];

const normalizeModel = (model: string | undefined): string => {
  if (!model) return 'gemini-3.8-flash';
  if (model.includes('2.') || model.includes('1.')) return 'gemini-3.8-flash';
  return model;
};

const app = express();
const server = createHttpServer(app);

// Enable CORS for Mobile PWA & GitHub Pages cross-origin requests
app.use((req: Request, res: Response, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Gemini-Api-Key, Authorization');
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

// Cross-Device Gemini Key Sync Endpoint
app.get('/api/gemini/keys', (_req: Request, res: Response) => {
  const synced = loadSyncedUserKeys();
  res.json({ keys: synced });
});

app.post('/api/gemini/keys', (req: Request, res: Response) => {
  const incoming = Array.isArray(req.body?.keys) ? req.body.keys : [];
  const cleaned = incoming.map((k: any) => String(k || '').trim()).filter((k: string) => k.length > 10);
  if (cleaned.length === 0 && req.body?.clear === true) {
    try {
      if (fs.existsSync(SYNCED_KEYS_FILE)) fs.unlinkSync(SYNCED_KEYS_FILE);
    } catch (e) {}
    API_KEYS = collectEnvKeys();
    return res.json({ keys: [] });
  }
  const merged = saveSyncedUserKeys(cleaned);
  API_KEYS = collectEnvKeys();
  res.json({ keys: merged });
});

// --- GEMINI GENERATE CONTENT ENDPOINT ---
app.post('/api/gemini/generate', async (req: Request, res: Response) => {
  const { model: requestedModel, contents, config, cachedContent, apiKey: bodyKey, apiKeys: bodyKeys } = req.body;
  const headerKey = (req.headers['x-gemini-api-key'] as string) || '';
  const customUserKey = (headerKey || bodyKey || '').trim();

  const manualUserKeys: string[] = [];
  if (customUserKey && !deadKeysSet.has(customUserKey)) manualUserKeys.push(customUserKey);
  if (Array.isArray(bodyKeys)) {
    for (const k of bodyKeys) {
      const trimmed = String(k || '').trim();
      if (trimmed && !deadKeysSet.has(trimmed) && !manualUserKeys.includes(trimmed)) {
        manualUserKeys.push(trimmed);
      }
    }
  }

  // Persist any user-provided keys so mobile devices sharing this server automatically benefit
  if (manualUserKeys.length > 0) {
    saveSyncedUserKeys(manualUserKeys);
  }

  const syncedKeys = loadSyncedUserKeys();
  for (const sk of syncedKeys) {
    if (!manualUserKeys.includes(sk) && !deadKeysSet.has(sk)) {
      manualUserKeys.push(sk);
    }
  }

  API_KEYS = collectEnvKeys();
  const activeEnvKeys = API_KEYS;

  const primaryModel = normalizeModel(requestedModel);

  // Build candidate keys: try all manually entered / synced user keys first, then fall back to server env keys
  const keyCandidates: (string | undefined)[] = manualUserKeys.length > 0
    ? [...manualUserKeys, ...(activeEnvKeys.length > 0 ? [undefined] : [])]
    : (activeEnvKeys.length > 0 ? [undefined] : []);

  for (const candidateKey of keyCandidates) {
    // When using a user's manually entered AI Studio key, include standard public Gemini model IDs first
    const modelSequence = candidateKey
      ? ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-flash-latest', primaryModel, 'gemini-3.8-flash', 'gemini-3.1-flash-lite']
      : [primaryModel, 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
    const uniqueSequence = [...new Set(modelSequence)];

    for (const model of uniqueSequence) {
      const maxAttempts = candidateKey ? 1 : Math.max(1, activeEnvKeys.length);

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const activeKeyUsed = candidateKey || (activeEnvKeys.length > 0 ? activeEnvKeys[currentKeyIndex % activeEnvKeys.length] : '');
        if (!activeKeyUsed || deadKeysSet.has(activeKeyUsed)) {
          if (!candidateKey && activeEnvKeys.length > 1) {
            rotateKey();
            continue;
          }
          break;
        }

        // If config has tools (e.g., googleSearch), try with tools first, then retry once without tools if grounding quota is exhausted
        const hasSearchTool = Array.isArray(config?.tools) && config.tools.some((t: any) => t.googleSearch);
        const configVariants = hasSearchTool
          ? [config, { ...config, tools: undefined }]
          : [config];

        for (const activeConfig of configVariants) {
          try {
            const client = getAiClient(activeKeyUsed);
            const requestParams: any = {
              model,
              contents,
            };

            if (activeConfig) {
              const cleanedConfig = { ...activeConfig };
              if (cleanedConfig.tools === undefined) delete cleanedConfig.tools;
              if (Object.keys(cleanedConfig).length > 0) {
                requestParams.config = cleanedConfig;
              }
            }
            if (cachedContent && String(cachedContent).startsWith('cachedContents/')) {
              requestParams.cachedContent = cachedContent;
            }

            const response = await client.models.generateContent(requestParams);
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
          } catch (error: any) {
            const status = error.status || 0;
            const msg = (error.message || '').toLowerCase();

            // If googleSearch tool failed, let the inner loop immediately try without googleSearch
            if (activeConfig?.tools && hasSearchTool) {
              continue;
            }

            if (status === 404 || msg.includes('404') || msg.includes('not found')) {
              break;
            }

            if (status === 400 || status === 403 || msg.includes('api_key') || msg.includes('api key not valid') || msg.includes('permission_denied') || msg.includes('leaked')) {
              if (msg.includes('api key not valid') || msg.includes('api_key_invalid') || msg.includes('leaked')) {
                deadKeysSet.add(activeKeyUsed);
                API_KEYS = collectEnvKeys();
              }
              if (!candidateKey && API_KEYS.length > 0) {
                rotateKey();
              }
              break;
            }

            if (status === 429 || status === 503 || msg.includes('quota') || msg.includes('rate') || msg.includes('resource_exhausted')) {
              if (!candidateKey && activeEnvKeys.length > 1 && rotateKey()) {
                await new Promise(r => setTimeout(r, 300));
                continue;
              }
              break;
            }
          }
        }
      }
    }
  }

  return res.json({
    text: `
        <div class="warning-box editable-box">
            <strong><i class="fa-solid fa-brain-circuit"></i> وضع الاستمرارية الهندسية (Rate Limit Protection)</strong><br/>
            تم تجاوز حصة طلبات الذكاء الاصطناعي المؤقتة. تم تفعيل الاستجابة التلقائية المعتمدة على الكود المصري.
        </div>
        <div class="info-box editable-box">
            <strong>القواعد الهندسية الأساسية (ECP Standard):</strong><br>
            1. يجب دائماً مطابقة التنفيذ مع المواصفات الفنية المعتمدة للمشروع.<br>
            2. أي تأخير في التوريدات يجب معالجته فوراً بتوفير بدائل معتمدة.<br>
            3. جودة التنفيذ هي الأولوية القصوى لتجنب أوامر الإصلاح (NCRs).<br>
            4. التنسيق بين المكتب الفني والموقع هو مفتاح النجاح.
        </div>
        <!-- Generated by ConstructionPro AI (Emergency-Quota-Protection) -->
    `,
    functionCalls: null,
    usedModel: 'Emergency-Quota-Protection',
  });
});

// --- GEMINI STREAMING ENDPOINT (Server-Sent Events) ---
app.post('/api/gemini/stream', async (req: Request, res: Response) => {
  const { model: requestedModel, contents, config, apiKey: bodyKey, apiKeys: bodyKeys } = req.body;
  const headerKey = (req.headers['x-gemini-api-key'] as string) || '';
  const customUserKey = (headerKey || bodyKey || '').trim();

  const manualUserKeys: string[] = [];
  if (customUserKey) manualUserKeys.push(customUserKey);
  if (Array.isArray(bodyKeys)) {
    for (const k of bodyKeys) {
      const trimmed = String(k || '').trim();
      if (trimmed && !manualUserKeys.includes(trimmed)) {
        manualUserKeys.push(trimmed);
      }
    }
  }

  const primaryModel = normalizeModel(requestedModel);
  const keyCandidates: (string | undefined)[] = manualUserKeys.length > 0
    ? [...manualUserKeys, undefined]
    : [undefined];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let streamedSuccessfully = false;
  let lastError: any = null;

  for (const candidateKey of keyCandidates) {
    if (streamedSuccessfully) break;
    const sequence = candidateKey
      ? ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-flash-latest', primaryModel, ...FALLBACK_MODELS]
      : [primaryModel, ...FALLBACK_MODELS];
    const uniqueSequence = [...new Set(sequence)];

    for (const model of uniqueSequence) {
      try {
        const client = getAiClient(candidateKey);
        const responseStream = await client.models.generateContentStream({
          model,
          contents,
          config,
        });

        for await (const chunk of responseStream) {
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
          }
        }
        streamedSuccessfully = true;
        break;
      } catch (error: any) {
        lastError = error;
        const status = error.status || 0;
        const msg = (error.message || '').toLowerCase();
        console.warn(`Streaming attempt with model ${model} failed:`, error.message || error);
        if (status === 400 || status === 403 || msg.includes('api_key') || msg.includes('permission_denied') || msg.includes('leaked')) {
          break;
        }
        if (!candidateKey) rotateKey();
      }
    }
  }

  if (!streamedSuccessfully && lastError) {
    console.error('All streaming models failed:', lastError);
    res.write(`data: ${JSON.stringify({ error: lastError.message || 'Streaming failed' })}\n\n`);
  }

  res.write(`data: [DONE]\n\n`);
  res.end();
});

// --- LIVE API WEBSOCKET BRIDGE ---
const wss = new WebSocketServer({ server, path: '/api/gemini/live' });

wss.on('connection', async (clientWs: WebSocket, req) => {
  console.log('Client connected to Gemini Live WebSocket');
  let session: any = null;

  try {
    const urlParams = new URLSearchParams((req.url || '').split('?')[1] || '');
    const customUserKey = urlParams.get('apiKey') || undefined;
    const client = getAiClient(customUserKey);
    session = await client.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: ['AUDIO' as any],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: 'أنت استشاري هندسي ومساعد صوتي ذكي لمشروعات التشييد والبناء.',
      },
      callbacks: {
        onmessage: (message: any) => {
          if (clientWs.readyState !== WebSocket.OPEN) return;

          for (const part of message.serverContent?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) {
              clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
            }
            if (part.text) {
              clientWs.send(JSON.stringify({ text: part.text }));
            }
          }
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
        },
        onclose: () => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ status: 'session_closed' }));
          }
        },
        onerror: (err: any) => {
          console.error('Gemini Live session error:', err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ error: err.message || 'Live error' }));
          }
        },
      },
    });

    clientWs.on('message', (data: Buffer | string) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.audio && session) {
          session.sendRealtimeInput({
            audio: { data: payload.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (payload.text && session) {
          session.sendRealtimeInput({
            text: payload.text,
          });
        }
      } catch (err) {
        console.error('Failed to parse Live input:', err);
      }
    });

    clientWs.on('close', () => {
      if (session) {
        try {
          session.close();
        } catch (e) {}
      }
    });
  } catch (err: any) {
    console.error('Failed to initialize Gemini Live session:', err);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ error: err.message || 'Failed to connect Live session' }));
      clientWs.close();
    }
  }
});

// --- VITE MIDDLEWARE IN DEV OR STATIC FILES IN PROD ---
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
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

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Construction Pro Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Server startup error:', err);
  process.exit(1);
});
