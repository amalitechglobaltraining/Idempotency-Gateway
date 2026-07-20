import request from 'supertest';
import type { Server } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createServerLifecycle, resolvePort, startServer } from '../src/server.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startServer', () => {
  it('starts a listening HTTP server that reports health', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
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
    }
  });

  it.each([-1, 65536, 1.5, Number.NaN])('rejects invalid port %s before opening a socket', (port) => {
    expect(() => startServer(port)).toThrowError('Port must be an integer between 0 and 65535.');
  });
});

describe('resolvePort', () => {
  it.each([
    [undefined, 3000],
    ['', 3000],
    ['   ', 3000],
    ['0', 0],
    ['3000', 3000],
    ['65535', 65535],
  ])('resolves %s to %i', (value, expected) => {
    expect(resolvePort(value)).toBe(expected);
  });

  it.each(['1e3', '+3000', '-1', '1.5', '3000x', '65536'])('rejects invalid environment port %s', (value) => {
    expect(() => resolvePort(value)).toThrowError('PORT must be ASCII decimal digits from 0 to 65535.');
  });
});

describe('server lifecycle', () => {
  it('closes and exits only once when shutdown is requested repeatedly', () => {
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const exit = vi.fn();
    const lifecycle = createServerLifecycle({ close } as unknown as Server, { exit });

    lifecycle.shutdown();
    lifecycle.shutdown();

    expect(close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('logs a concise startup error and exits nonzero only once', () => {
    const exit = vi.fn();
    const logError = vi.fn();
    const lifecycle = createServerLifecycle({ close: vi.fn() } as unknown as Server, { exit, logError });

    lifecycle.handleError(new Error('address in use'));
    lifecycle.handleError(new Error('second error'));

    expect(logError).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith('Failed to start idempotency gateway: address in use');
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('ignores server errors after shutdown begins', () => {
    const exit = vi.fn();
    const logError = vi.fn();
    const close = vi.fn();
    const lifecycle = createServerLifecycle({ close } as unknown as Server, { exit, logError });

    lifecycle.shutdown();
    lifecycle.handleError(new Error('late error'));

    expect(close).toHaveBeenCalledOnce();
    expect(logError).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
