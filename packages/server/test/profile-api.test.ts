import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { DatabaseAdapter, DatabaseConnection } from '@db-explorer/core';
import { sqliteCapabilities } from '@db-explorer/adapter-sqlite';
import { ProfileStore } from '../src/profiles.js';
import { createApplication } from '../src/app.js';

const fixture = fileURLToPath(
  new URL('../../../tests/fixtures/sample.db', import.meta.url),
);
let directory: string;
let app: FastifyInstance;
let profiles: ProfileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'db-explorer-profile-api-'));
  profiles = new ProfileStore(join(directory, 'profiles.json'), undefined, {
    DATABASE: fixture,
  });
  ({ app } = await createApplication({ profiles }));
});
afterEach(async () => {
  await app.close();
  await rm(directory, { recursive: true, force: true });
});
const body = {
  name: 'Saved fixture',
  adapterId: 'sqlite',
  config: { path: '${DATABASE}' },
  preferences: { activeProfiling: false },
};

async function saveProfile() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/profiles',
    payload: body,
  });
  expect(response.statusCode).toBe(201);
  expect(response.headers.location).toBe(`/api/profiles/${response.json().id}`);
  return response.json().id as string;
}

describe('Profile API', () => {
  it('saves, lists, edits, and opens real SQLite profiles across application restarts', async () => {
    expect((await app.inject('/api/profiles')).json()).toEqual([]);
    const id = await saveProfile();
    expect((await app.inject('/api/profiles')).json()).toHaveLength(1);
    expect(
      (await app.inject(`/api/profiles/${id}`)).headers['cache-control'],
    ).toBe('no-store');
    await app.close();
    ({ app } = await createApplication({
      profiles: new ProfileStore(profiles.path, undefined, {
        DATABASE: fixture,
      }),
    }));
    const edited = await app.inject({
      method: 'PUT',
      url: `/api/profiles/${id}`,
      payload: {
        ...body,
        name: 'Renamed',
        preferences: { activeProfiling: true },
      },
    });
    expect(edited.statusCode).toBe(200);
    const opened = await app.inject({
      method: 'POST',
      url: `/api/profiles/${id}/connect`,
      payload: {},
    });
    expect(opened.statusCode).toBe(201);
    expect(opened.json()).toMatchObject({
      label: 'Renamed',
      profileId: id,
      preferences: { activeProfiling: true },
    });
    expect(opened.body).not.toContain(fixture);
    expect(opened.body).not.toContain('config');
    expect(
      (await app.inject(`/api/connections/${opened.json().id}/tables`)).json(),
    ).toHaveLength(4);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/profiles/${id}` }))
        .statusCode,
    ).toBe(204);
    expect((await app.inject(`/api/profiles/${id}`)).statusCode).toBe(404);
  });
  it('allows environment references for unsaved connections and reports missing variables clearly', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        adapterId: 'sqlite',
        config: { path: '${DB_EXPLORER_UNSET_TEST_VARIABLE}' },
      },
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.code).toBe('ENVIRONMENT_VARIABLE_MISSING');
    const saved = await profiles.save({
      ...body,
      config: { path: '${MISSING}' },
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/profiles/${saved.id}/connect`,
      payload: {},
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('ENVIRONMENT_VARIABLE_MISSING');
  });
  it('rejects cross-origin and non-loopback access before reading or changing profiles', async () => {
    for (const headers of [
      { origin: 'https://other.example' },
      { host: 'other.example' },
    ]) {
      for (const method of ['GET', 'POST'] as const) {
        const response = await app.inject({
          method,
          url: '/api/profiles',
          headers,
          ...(method === 'POST' ? { payload: body } : {}),
        });
        expect(response.statusCode).toBe(403);
      }
    }
    expect(await profiles.list()).toEqual([]);
  });
  it('validates names, configuration, preferences, IDs, and passwords without echoing request secrets', async () => {
    for (const payload of [
      { ...body, name: '' },
      { ...body, config: { path: fixture, password: 'secret-marker' } },
      { ...body, preferences: { activeProfiling: 'yes' } },
      { ...body, rememberSecret: true },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/profiles',
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain('secret-marker');
    }
    expect((await app.inject('/api/profiles/not-an-id')).statusCode).toBe(400);
    const id = await saveProfile();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/profiles/${id}/connect`,
          payload: { extra: true },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('does not expose secrets in responses, disk files, or adapter failure messages', async () => {
    await app.close();
    const secrets = new Map<string, string>();
    profiles = new ProfileStore(profiles.path, {
      get: async (id) => secrets.get(id) ?? null,
      set: async (id, password) => {
        secrets.set(id, password);
      },
      delete: async (id) => {
        secrets.delete(id);
      },
    });
    const connect = vi.fn(
      async (_config: unknown) =>
        ({
          capabilities: sqliteCapabilities,
          testConnection: async () => {},
          close: async () => {},
        }) as DatabaseConnection,
    );
    const adapter: DatabaseAdapter = {
      id: 'fake',
      staticCapabilities: sqliteCapabilities,
      connect,
    };
    ({ app } = await createApplication({ profiles, adapters: [adapter] }));
    const saved = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        name: 'Remote',
        adapterId: 'fake',
        config: { host: 'localhost' },
        credential: 'keychain',
        password: 'secret-marker',
      },
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.body).not.toContain('secret-marker');
    expect(saved.body).not.toContain('keychainId');
    const id = saved.json().id;
    const opened = await app.inject({
      method: 'POST',
      url: `/api/profiles/${id}/connect`,
      payload: {},
    });
    expect(opened.statusCode).toBe(201);
    expect(connect).toHaveBeenCalledWith({
      host: 'localhost',
      password: 'secret-marker',
    });
    expect(opened.body).not.toContain('secret-marker');
    expect(await readFile(profiles.path, 'utf8')).not.toContain(
      'secret-marker',
    );
    connect.mockRejectedValueOnce(new Error('Adapter leaked secret-marker'));
    const failed = await app.inject({
      method: 'POST',
      url: `/api/profiles/${id}/connect`,
      payload: {},
    });
    expect(failed.statusCode).toBe(422);
    expect(failed.body).not.toContain('secret-marker');
    const prompt = await profiles.save({
      name: 'Prompt',
      adapterId: 'fake',
      config: {},
      credential: 'prompt',
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/profiles/${prompt.id}/connect`,
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/profiles/${prompt.id}/connect`,
          payload: { password: 'once-secret' },
        })
      ).statusCode,
    ).toBe(201);
    expect(connect).toHaveBeenLastCalledWith({ password: 'once-secret' });
    expect(await readFile(profiles.path, 'utf8')).not.toContain('once-secret');
  });
  it('reports unavailable adapters without discarding a saved profile', async () => {
    const profile = await profiles.save({
      name: 'Future adapter',
      adapterId: 'postgres',
      config: { host: 'localhost' },
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/profiles/${profile.id}/connect`,
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('ADAPTER_NOT_AVAILABLE');
    expect(await profiles.get(profile.id)).toEqual(profile);
  });
});
