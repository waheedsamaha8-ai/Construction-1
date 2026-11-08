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

// --- MULTI-KEY ROTATION & API KEY SETUP ---
const rawKeys = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const API_KEYS = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
let currentKeyIndex = API_KEYS.length > 0 ? Math.floor(Math.random() * API_KEYS.length) : 0;

const getAiClient = () => {
  const key = process.env.GEMINI_API_KEY || (API_KEYS.length > 0 ? API_KEYS[currentKeyIndex % API_KEYS.length] : (process.env.API_KEY || ''));
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

// Supported models according to guidelines (never use gemini-flash-latest or deprecated names)
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];

const normalizeModel = (model: string | undefined): string => {
  if (!model || model === 'gemini-flash-latest' || model === 'gemini-3.1-pro-preview' || model === 'gemini-3-flash-preview') {
    return 'gemini-3.8-flash';
  }
  return model;
};

const app = express();
const server = createHttpServer(app);

// Increase limits for large base64 files/audio
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// --- GEMINI GENERATE CONTENT ENDPOINT ---
app.post('/api/gemini/generate', async (req: Request, res: Response) => {
  const { model: requestedModel, contents, config, cachedContent } = req.body;
  const primaryModel = normalizeModel(requestedModel);

  const sequence = [primaryModel, ...FALLBACK_MODELS];
  const uniqueSequence = [...new Set(sequence)];

  let lastError: any = null;

  let stopAllModels = false;

  for (const model of uniqueSequence) {
    if (stopAllModels) break;
    const maxAttempts = Math.max(1, API_KEYS.length);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const client = getAiClient();
        const requestParams: any = {
          model,
          contents,
        };

        if (config) {
          requestParams.config = config;
        }
        if (cachedContent) {
          requestParams.cachedContent = cachedContent;
        }

        const response = await client.models.generateContent(requestParams);

        return res.json({
          text: response.text || '',
          functionCalls: response.functionCalls || null,
          usedModel: model,
        });
      } catch (error: any) {
        lastError = error;
        const status = error.status || 0;
        const msg = (error.message || '').toLowerCase();

        if (status === 404 || msg.includes('404')) {
          console.warn(`Model ${model} returned 404. Moving to next model...`);
          break;
        }

        if (status === 400 || status === 403 || msg.includes('api_key') || msg.includes('permission_denied') || msg.includes('leaked')) {
          if (attempt < API_KEYS.length - 1) {
            rotateKey();
            continue;
          } else {
            stopAllModels = true;
            break;
          }
        }

        if (status === 429 || status === 503) {
          if (attempt < API_KEYS.length - 1) {
            rotateKey();
            continue;
          } else {
            break;
          }
        }

        break;
      }
    }
  }

  console.error('All server-side Gemini generation attempts failed:', lastError?.message || lastError);
  return res.status(lastError?.status || 500).json({
    error: lastError?.message || 'Failed to generate content from AI services',
    status: lastError?.status || 500,
  });
});

// --- GEMINI STREAMING ENDPOINT (Server-Sent Events) ---
app.post('/api/gemini/stream', async (req: Request, res: Response) => {
  const { model: requestedModel, contents, config } = req.body;
  const primaryModel = normalizeModel(requestedModel);
  const sequence = [primaryModel, ...FALLBACK_MODELS];
  const uniqueSequence = [...new Set(sequence)];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let streamedSuccessfully = false;
  let lastError: any = null;

  for (const model of uniqueSequence) {
    try {
      const client = getAiClient();
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
      rotateKey();
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

wss.on('connection', async (clientWs: WebSocket) => {
  console.log('Client connected to Gemini Live WebSocket');
  let session: any = null;

  try {
    const client = getAiClient();
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
      app.get('*', (_req: Request, res: Response) => {
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
