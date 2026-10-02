import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/app.js';
import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../src/connections.js';
const fixture = fileURLToPath(
  new URL('../../../tests/fixtures/sample.db', import.meta.url),
);
let app: FastifyInstance;
let connections: ConnectionManager;
beforeEach(async () => {
  ({ app, connections } = await createApplication());
});
afterEach(async () => {
  await app.close();
});
const directories = async () =>
  (await readdir(tmpdir())).filter((name) =>
    name.startsWith('db-explorer-upload-'),
  );

describe('Browser file uploads', () => {
  it('opens a temporary read-only copy and removes it when the connection closes', async () => {
    const before = await directories();
    const original = await readFile(fixture);
    const response = await app.inject({
      method: 'POST',
      url: '/api/connections/upload?name=sample.db',
      headers: { 'content-type': 'application/octet-stream' },
      payload: original,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().label).toBe('sample.db');
    expect(response.body).not.toContain(tmpdir());
    const created = (await directories()).filter(
      (name) => !before.includes(name),
    );
    expect(created).toHaveLength(1);
    const path = join(tmpdir(), created[0]!, 'database.db');
    expect(await readFile(path)).toEqual(original);
    const id = response.json().id;
    expect(
      (await app.inject(`/api/connections/${id}/tables`)).json(),
    ).toHaveLength(4);
    await app.inject({ method: 'DELETE', url: `/api/connections/${id}` });
    await expect(access(path)).rejects.toThrow();
    expect(await readFile(fixture)).toEqual(original);
  });
  it('cleans up file copies on server shutdown', async () => {
    const before = await directories();
    const response = await app.inject({
      method: 'POST',
      url: '/api/connections/upload?name=sample.db',
      headers: { 'content-type': 'application/octet-stream' },
      payload: await readFile(fixture),
    });
    expect(response.statusCode).toBe(201);
    const created = (await directories()).filter(
      (name) => !before.includes(name),
    );
    await app.close();
    expect(
      (await directories()).filter((name) => created.includes(name)),
    ).toEqual([]);
  });
  it('rejects invalid SQLite files and removes failed uploads', async () => {
    const before = await directories();
    const response = await app.inject({
      method: 'POST',
      url: '/api/connections/upload?name=invalid.db',
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from('This is not SQLite'),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('CONNECTION_FAILED');
    expect(await directories()).toEqual(before);
    expect(connections.list()).toEqual([]);
  });
  it('validates the filename, rejects empty files, and enforces same-origin access', async () => {
    const request = {
      method: 'POST' as const,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.alloc(0),
    };
    expect(
      (await app.inject({ ...request, url: '/api/connections/upload' }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          ...request,
          url: '/api/connections/upload?name=empty.db',
        })
      ).json().error.code,
    ).toBe('INVALID_FILE');
    expect(
      (
        await app.inject({
          ...request,
          url: '/api/connections/upload?name=sample.db',
          headers: { ...request.headers, origin: 'https://evil.example' },
          payload: await readFile(fixture),
        })
      ).statusCode,
    ).toBe(403);
    expect(connections.list()).toEqual([]);
  });
  it('serves the SPA for deep links while keeping missing API routes as JSON errors', async () => {
    const root = await app.inject('/');
    const deep = await app.inject('/connections/missing/tables/main/people');
    expect(deep.statusCode).toBe(200);
    expect(deep.body).toBe(root.body);
    const asset = /src="([^"]+\.js)"/.exec(root.body)![1]!;
    const script = await app.inject(asset);
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('javascript');
    expect((await app.inject('/api/missing')).json().error.code).toBe(
      'ROUTE_NOT_FOUND',
    );
  });
});
