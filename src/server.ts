import type { Server } from 'node:http';

import { createApp } from './app.js';

const invalidEnvironmentPortMessage = 'PORT must be ASCII decimal digits from 0 to 65535.';

interface LifecycleDependencies {
  exit?: (code: number) => unknown;
  logError?: (message: string) => void;
}

export function resolvePort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return 3000;
  }
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(invalidEnvironmentPortMessage);
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port > 65535) {
    throw new Error(invalidEnvironmentPortMessage);
  }

  return port;
}

export function startServer(port = resolvePort(process.env.PORT)): Server {
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

export function createServerLifecycle(
  server: Pick<Server, 'close'>,
  dependencies: LifecycleDependencies = {},
) {
  const exit = dependencies.exit ?? process.exit;
  const logError = dependencies.logError ?? console.error;
  let shuttingDown = false;

  return {
    shutdown() {
      if (shuttingDown) return;
      shuttingDown = true;

      server.close((error) => {
        if (error) {
          logError(`Failed to close idempotency gateway: ${error.message}`);
          exit(1);
          return;
        }

        exit(0);
      });
    },
    handleError(error: Error) {
      if (shuttingDown) return;
      shuttingDown = true;
      logError(`Failed to start idempotency gateway: ${error.message}`);
      exit(1);
    },
  };
}

// Keep process lifecycle hooks out of modules that import the server for tests or composition.
if (require.main === module) {
  const server = startServer();
  const lifecycle = createServerLifecycle(server);

  server.once('error', lifecycle.handleError);
  process.once('SIGINT', lifecycle.shutdown);
  process.once('SIGTERM', lifecycle.shutdown);
}
