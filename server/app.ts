import express, { type ErrorRequestHandler, type Response as ExpressResponse } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BrimRequestSchema, TtsRequestSchema } from '../shared/schema.js';
import { voiceConfig, llmTimeoutMs, ttsTimeoutMs } from './config.js';
import { ApiError, createVoiceServices, validateConversationResponse, type VoiceServices } from './voice.js';

function requestScope(res: ExpressResponse, timeout: number, code: string) {
  const controller = new AbortController();
  const closed = () => controller.abort(new ApiError(499, 'CANCELLED', 'Request cancelled.'));
  res.once('close', closed);
  const timer = setTimeout(() => controller.abort(new ApiError(504, code, 'Provider timed out. Try again.')), timeout);
  return {
    signal: controller.signal,
    async run<T>(work: Promise<T>): Promise<T> {
      let listener: () => void;
      const aborted = new Promise<never>((_resolve, reject) => {
        listener = () => reject(controller.signal.reason);
        if (controller.signal.aborted) listener();
        else controller.signal.addEventListener('abort', listener, { once: true });
      });
      try { return await Promise.race([work, aborted]); }
      finally { controller.signal.removeEventListener('abort', listener!); }
    },
    dispose() { clearTimeout(timer); res.off('close', closed); },
  };
}

export function createApp(services: VoiceServices, timeouts = { llm: llmTimeoutMs, tts: ttsTimeoutMs }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });

  app.use(['/api/brim', '/api/tts'], (req, res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) {
      res.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json.' } });
    } else next();
  });

  app.post('/api/brim', async (req, res) => {
    const request = BrimRequestSchema.safeParse(req.body);
    if (!request.success) throw new ApiError(400, 'INVALID_REQUEST', 'Expected transcript (1–2000 characters) and optional valid gameState.');
    const scope = requestScope(res, timeouts.llm, 'LLM_TIMEOUT');
    try {
      const result = await scope.run(services.reply(request.data, scope.signal));
      if (!scope.signal.aborted) {
        res.set('X-Brim-Source', result.source).set('Cache-Control', 'no-store')
          .json(validateConversationResponse(result.response));
      }
    } catch (error) {
      if (scope.signal.aborted) throw scope.signal.reason;
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, 'LLM_FAILED', 'Response generation failed. Try again or enable local mode.');
    } finally { scope.dispose(); }
  });

  app.post('/api/tts', async (req, res) => {
    const request = TtsRequestSchema.safeParse(req.body);
    if (!request.success || request.data.text.split(/\s+/u).length > 12) {
      throw new ApiError(400, 'INVALID_REQUEST', 'Expected text of 1–12 words, at most 240 characters.');
    }
    const scope = requestScope(res, timeouts.tts, 'TTS_TIMEOUT');
    try {
      const upstream = await scope.run(services.speech(request.data.text, scope.signal));
      if (!upstream.ok || !upstream.body) throw new ApiError(502, 'TTS_FAILED', 'Hosted speech failed.');
      res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      // Forward chunks as they arrive, with backpressure; never buffer the file.
      await pipeline(Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream), res, { signal: scope.signal });
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (scope.signal.aborted) throw scope.signal.reason;
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, 'TTS_FAILED', 'Hosted speech failed. Use browser speech synthesis.');
    } finally { scope.dispose(); }
  });

  app.use((_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }); });
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (res.destroyed) return;
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      res.status(status).json({ error: { code: 'INVALID_BODY', message: status === 413 ? 'Request body too large.' : 'Invalid request body.' } });
      return;
    }
    console.error('Unhandled API error');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
  };
  app.use(errorHandler);
  return app;
}

export const app = createApp(createVoiceServices(voiceConfig));
