import type { Server } from 'node:http';

import { createApp } from './app.js';

export function startServer(port = Number(process.env.PORT ?? 3000)): Server {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Port must be an integer between 0 and 65535.');
  }

  const server = createApp().listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address !== null ? address.port : port;
    console.log(`Idempotency gateway listening on port ${actualPort}`);
  });

  return server;
}

// Keep process lifecycle hooks out of modules that import the server for tests or composition.
if (require.main === module) {
  const server = startServer();
  const shutdown = () => {
    server.close((error) => {
      if (error) {
        console.error(`Failed to close idempotency gateway: ${error.message}`);
        process.exit(1);
      }

      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
