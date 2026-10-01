import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { startApplication } from '../src/app.js';
const fixture = fileURLToPath(
  new URL('../../../tests/fixtures/sample.db', import.meta.url),
);
describe('Local application', () => {
  it('serves a home screen on loopback using an ephemeral port', async () => {
    const { app, url, connections } = await startApplication();
    try {
      expect(app.server.address()).toMatchObject({ address: '127.0.0.1' });
      expect(new URL(url).port).not.toBe('0');
      const response = await fetch(url);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('Start DB Explorer');
      expect(connections.list()).toEqual([]);
    } finally {
      await app.close();
    }
  });
  it('opens the initial connection and closes it with the server', async () => {
    const { app, connections } = await startApplication(fixture);
    const connection = connections.list()[0]!.connection;
    try {
      expect((await app.inject('/')).body).toContain('Connected read-only');
      await expect(connection.testConnection()).resolves.toBeUndefined();
    } finally {
      await app.close();
    }
    await expect(connection.testConnection()).rejects.toThrow('closed');
    expect(connections.list()).toEqual([]);
  });
  it('fails cleanly for an unavailable adapter without exposing credentials', async () => {
    await expect(
      startApplication('postgres://user:secret@localhost/db'),
    ).rejects.toThrow('Adapter "postgres" is not available');
  });
});
