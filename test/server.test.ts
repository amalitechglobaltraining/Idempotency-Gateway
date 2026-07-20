import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

describe('startServer', () => {
  it('starts a listening HTTP server that reports health', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const server = startServer(0);

    try {
      expect(server.listening).toBe(true);

      const result = await request(server).get('/health');

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ status: 'ok' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      log.mockRestore();
    }
  });

  it.each([-1, 65536, 1.5, Number.NaN])('rejects invalid port %s before opening a socket', (port) => {
    expect(() => startServer(port)).toThrowError('Port must be an integer between 0 and 65535.');
  });
});
