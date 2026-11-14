import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { z } from 'zod';

// Loaded only by Node/Vite configuration, never imported by browser code.
// Root npm scripts use the repository root as cwd, in dev and after compilation.
const envPath = resolve('server/.env');
if (existsSync(envPath)) loadEnvFile(envPath);

export const apiPort = z.coerce.number().int().min(1).max(65535).default(3001).parse(process.env.PORT);

export const voiceConfig = {
  llmProvider: z.enum(['auto', 'local', 'openai']).default('auto').parse(process.env.LLM_PROVIDER),
  ttsProvider: z.enum(['auto', 'browser', 'openai']).default('auto').parse(process.env.TTS_PROVIDER),
  llmKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || undefined,
  ttsKey: process.env.TTS_API_KEY || process.env.OPENAI_API_KEY || undefined,
  llmModel: process.env.LLM_MODEL || 'gpt-4.1-mini',
  ttsModel: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
  ttsVoice: process.env.TTS_VOICE_ID || 'onyx',
};
export const llmTimeoutMs = z.coerce.number().int().min(100).max(30000).default(2000).parse(process.env.LLM_TIMEOUT_MS);
export const ttsTimeoutMs = z.coerce.number().int().min(100).max(60000).default(15000).parse(process.env.TTS_TIMEOUT_MS);
