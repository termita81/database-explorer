import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { sqliteAdapter } from '@db-explorer/adapter-sqlite';
import { UnsupportedOperationError } from '@db-explorer/core';
import type { ConnectionManager } from '../src/connections.js';
import { createApplication } from '../src/app.js';

const fixture = fileURLToPath(
  new URL('../../../tests/fixtures/sample.db', import.meta.url),
);
const body = { adapterId: 'sqlite', config: { path: fixture } };
let app: FastifyInstance;
let connections: ConnectionManager;
beforeEach(async () => {
  ({ app, connections } = await createApplication());
});
afterEach(async () => {
  await app.close();
});

async function openConnection() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/connections',
    payload: body,
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>().id;
}
function expectError(
  response: { statusCode: number; json: () => any },
  status: number,
  code: string,
) {
  expect(response.statusCode).toBe(status);
  expect(response.json()).toMatchObject({
    error: { code, message: expect.any(String) },
  });
  expect(response.json()).not.toHaveProperty('stack');
}

describe('JSON API', () => {
  it('lists, opens, retrieves, and closes connections without serializing configuration or driver handles', async () => {
    expect((await app.inject('/api/connections')).json()).toEqual([]);
    const id = await openConnection();
    const metadata = {
      id,
      adapterId: 'sqlite',
      capabilities: sqliteAdapter.staticCapabilities,
    };
    const response = await app.inject(`/api/connections/${id}`);
    expect(response.json()).toEqual(metadata);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toContain(fixture);
    expect((await app.inject('/api/connections')).json()).toEqual([metadata]);
    const connection = connections.get(id).connection;
    const closed = await app.inject({
      method: 'DELETE',
      url: `/api/connections/${id}`,
    });
    expect(closed.statusCode).toBe(204);
    expect(closed.body).toBe('');
    await expect(connection.testConnection()).rejects.toThrow('closed');
    expect((await app.inject('/api/connections')).json()).toEqual([]);
    expectError(
      await app.inject(`/api/connections/${id}`),
      404,
      'CONNECTION_NOT_FOUND',
    );
  });
  it('returns a Location header pointing to the newly opened connection', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: body,
    });
    expect(response.statusCode).toBe(201);
    expect(
      (await app.inject(response.headers.location as string)).json(),
    ).toEqual(response.json());
  });
  it('lists schemas, tables, and all table details from the fixture', async () => {
    const id = await openConnection();
    expect((await app.inject(`/api/connections/${id}/schemas`)).json()).toEqual(
      [{ name: 'main' }],
    );
    const expected = await connections.get(id).connection.listTables();
    expect((await app.inject(`/api/connections/${id}/tables`)).json()).toEqual(
      expected,
    );
    expect(
      (await app.inject(`/api/connections/${id}/tables?schema=main`)).json(),
    ).toEqual(expected);
    expect(expected.map((table) => table.name)).toEqual([
      'memberships',
      'people',
      'projects',
      'teams',
    ]);
    for (const table of expected) {
      const response = await app.inject(
        `/api/connections/${id}/tables/${table.name}?schema=main`,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        await connections.get(id).connection.getTable(table),
      );
    }
    expect(
      (await app.inject(`/api/connections/${id}/tables/teams`)).json(),
    ).toEqual(
      await connections
        .get(id)
        .connection.getTable({ schema: 'main', name: 'teams' }),
    );
  });
  it('returns directed relationships with self-references and ordered composite key columns', async () => {
    const id = await openConnection();
    const response = await app.inject(`/api/connections/${id}/relationships`);
    expect(response.statusCode).toBe(200);
    const edges = response.json();
    expect(edges).toHaveLength(5);
    expect(edges).toContainEqual({
      from: { schema: 'main', name: 'people' },
      to: { schema: 'main', name: 'people' },
      foreignKey: {
        columns: ['manager_id'],
        referencedTable: { schema: 'main', name: 'people' },
        referencedColumns: ['id'],
      },
    });
    expect(edges).toContainEqual({
      from: { schema: 'main', name: 'memberships' },
      to: { schema: 'main', name: 'projects' },
      foreignKey: {
        name: 'membership_project',
        columns: ['tenant_id', 'project_id'],
        referencedTable: { schema: 'main', name: 'projects' },
        referencedColumns: ['tenant_id', 'project_id'],
      },
    });
    expect(
      (
        await app.inject(`/api/connections/${id}/relationships?schema=main`)
      ).json(),
    ).toEqual(edges);
  });
  it('includes the CLI-selected initial database in the connection list', async () => {
    await app.close();
    ({ app, connections } = await createApplication({ target: fixture }));
    const response = await app.inject('/api/connections');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].id).toBe(connections.list()[0]!.id);
  });
  it.each([
    {},
    { adapterId: 'sqlite' },
    { ...body, unexpected: true },
    { adapterId: '', config: {} },
    { adapterId: 'sqlite', config: {} },
    { adapterId: 'sqlite', config: { path: '' } },
    { adapterId: 'sqlite', config: { path: fixture, sql: 'DROP TABLE teams' } },
  ])(
    'validates connection body %j without opening a database',
    async (payload) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/connections',
        payload,
      });
      expectError(response, 400, 'VALIDATION_ERROR');
      expect(response.json().error.details).toEqual(expect.any(Array));
      expect(connections.list()).toEqual([]);
    },
  );
  it('reports unavailable adapters without returning supplied secrets', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        adapterId: 'postgres',
        config: { connectionString: 'postgres://user:topsecret@localhost/db' },
      },
    });
    expectError(response, 400, 'ADAPTER_NOT_AVAILABLE');
    expect(response.body).not.toContain('topsecret');
  });
  it('reports connection failures without exposing local paths', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        adapterId: 'sqlite',
        config: { path: '/missing/private/database.db' },
      },
    });
    expectError(response, 422, 'CONNECTION_FAILED');
    expect(response.body).not.toContain('/missing/private');
    expect(connections.list()).toEqual([]);
  });
  it.each(['', '/schemas', '/tables', '/tables/teams', '/relationships'])(
    'returns an unknown-connection error for GET suffix %s',
    async (suffix) => {
      expectError(
        await app.inject(`/api/connections/missing${suffix}`),
        404,
        'CONNECTION_NOT_FOUND',
      );
    },
  );
  it('returns an unknown-connection error when closing an unknown ID', async () => {
    expectError(
      await app.inject({ method: 'DELETE', url: '/api/connections/missing' }),
      404,
      'CONNECTION_NOT_FOUND',
    );
  });
  it.each([
    '/tables?schema=missing',
    '/tables/teams?schema=missing',
    '/tables/missing?schema=main',
    '/relationships?schema=missing',
  ])('returns an unknown-object error for suffix %s', async (suffix) => {
    const id = await openConnection();
    expectError(
      await app.inject(`/api/connections/${id}${suffix}`),
      404,
      'OBJECT_NOT_FOUND',
    );
  });
  it.each([
    '/tables?schema=',
    '/relationships?schema=',
    '/tables/teams?schema=',
    '/tables?unknown=1',
    '/relationships?schema=main&schema=main',
    '/schemas?sql=DROP',
    '?unknown=1',
  ])('validates queries on suffix %s', async (suffix) => {
    const id = await openConnection();
    expectError(
      await app.inject(`/api/connections/${id}${suffix}`),
      400,
      'VALIDATION_ERROR',
    );
  });
  it('uses the JSON error envelope for malformed JSON, unsupported media types, and unknown routes', async () => {
    expectError(
      await app.inject({
        method: 'POST',
        url: '/api/connections',
        headers: { 'content-type': 'application/json' },
        payload: '{ invalid',
      }),
      400,
      'INVALID_REQUEST',
    );
    expectError(
      await app.inject({
        method: 'POST',
        url: '/api/connections',
        headers: { 'content-type': 'application/xml' },
        payload: '<connection />',
      }),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
    expectError(await app.inject('/api/no-such-route'), 404, 'ROUTE_NOT_FOUND');
  });
  it('normalizes malformed URL and overlong path errors without echoing the path', async () => {
    const invalid = await app.inject('/api/connections/private-secret%ZZ');
    expectError(invalid, 400, 'INVALID_REQUEST');
    expect(invalid.body).not.toContain('private-secret');
    expectError(
      await app.inject(`/api/connections/${'x'.repeat(1025)}`),
      414,
      'URI_TOO_LONG',
    );
  });
  it('reports oversized bodies consistently', async () => {
    expectError(
      await app.inject({
        method: 'POST',
        url: '/api/connections',
        payload: { ...body, padding: 'x'.repeat(1024 * 1024) },
      }),
      413,
      'PAYLOAD_TOO_LARGE',
    );
  });
  it.each([
    { host: 'evil.example' },
    { origin: 'https://evil.example' },
    { origin: 'null' },
  ])('rejects cross-site or nonlocal requests %j', async (headers) => {
    expectError(
      await app.inject({
        method: 'POST',
        url: '/api/connections',
        headers,
        payload: body,
      }),
      403,
      'ACCESS_DENIED',
    );
    expect(connections.list()).toEqual([]);
  });
  it('accepts same-origin requests and rejects origin/port mismatches', async () => {
    const headers = { host: '127.0.0.1:4567', origin: 'http://127.0.0.1:4567' };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/connections',
          headers,
          payload: body,
        })
      ).statusCode,
    ).toBe(201);
    expectError(
      await app.inject({
        url: '/api/connections',
        headers: { ...headers, origin: 'http://127.0.0.1:5678' },
      }),
      403,
      'ACCESS_DENIED',
    );
  });
  it('returns safe errors for unexpected adapter failures and unsupported operations', async () => {
    await app.close();
    const adapter = {
      ...sqliteAdapter,
      async connect(config: unknown) {
        const connection = await sqliteAdapter.connect(config);
        return {
          ...connection,
          async getTable() {
            throw new Error('secret-password and private file path');
          },
          async listRelationships() {
            throw new UnsupportedOperationError('private-operation');
          },
        };
      },
    };
    ({ app, connections } = await createApplication({ adapters: [adapter] }));
    const id = await openConnection();
    const failure = await app.inject(`/api/connections/${id}/tables/teams`);
    expectError(failure, 500, 'INTERNAL_ERROR');
    expect(failure.body).not.toContain('secret-password');
    expectError(
      await app.inject(`/api/connections/${id}/relationships`),
      501,
      'OPERATION_NOT_SUPPORTED',
    );
  });
  it('requires an explicit schema for a multi-schema connection and decodes table names safely', async () => {
    await app.close();
    let requested: unknown;
    const adapter = {
      ...sqliteAdapter,
      async connect(config: unknown) {
        const connection = await sqliteAdapter.connect(config);
        return {
          ...connection,
          async listSchemas() {
            return [{ name: 'one' }, { name: 'two' }];
          },
          async getTable(ref: { schema: string; name: string }) {
            requested = ref;
            return connection.getTable({ schema: 'main', name: 'teams' });
          },
        };
      },
    };
    ({ app, connections } = await createApplication({ adapters: [adapter] }));
    const id = await openConnection();
    expectError(
      await app.inject(`/api/connections/${id}/tables/teams`),
      400,
      'SCHEMA_REQUIRED',
    );
    const name = "a/b ?#'; DROP TABLE teams; --" + 'x'.repeat(128);
    const response = await app.inject(
      `/api/connections/${id}/tables/${encodeURIComponent(name)}?schema=one`,
    );
    expect(response.statusCode).toBe(200);
    expect(requested).toEqual({ schema: 'one', name });
  });
});
