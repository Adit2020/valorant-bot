import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { z } from 'zod';
import { apiPort } from '../server/config.js';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Server credentials are read only by config.ts, never Vite's client env loader.
  envDir: false,
  server: {
    host: '127.0.0.1',
    port: z.coerce.number().int().min(1).max(65535).default(5173).parse(process.env.WEB_PORT),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))], deny: ['**/.env', '**/.env.*', '**/.git/**'] },
  },
});
