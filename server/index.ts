import { app } from './app.js';
import { apiPort } from './config.js';

const server = app.listen(apiPort, '127.0.0.1', () => {
  console.log(`BRIM API: http://127.0.0.1:${apiPort}`);
});
server.on('error', (error) => {
  console.error('API could not start:', error.message);
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
