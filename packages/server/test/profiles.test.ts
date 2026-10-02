import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProfileStore } from '../src/profiles.js';
import { resolveEnvironment } from '../src/environment.js';
import type { PasswordStore } from '../src/keychain.js';
import { ApiError } from '../src/errors.js';

let directory: string;
let path: string;
let store: ProfileStore;
let secrets: Map<string, string>;
let passwords: PasswordStore;
const sqlite = {
  name: 'Local',
  adapterId: 'sqlite',
  config: { path: './sample.db' },
};
const network = {
  name: 'Remote',
  adapterId: 'postgres',
  config: { host: 'localhost', user: 'reader', database: 'example' },
};
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'db-explorer-profiles-test-'));
  path = join(directory, 'config', 'profiles.json');
  secrets = new Map();
  passwords = {
    get: vi.fn(async (id) => secrets.get(id) ?? null),
    set: vi.fn(async (id, password) => {
      secrets.set(id, password);
    }),
    delete: vi.fn(async (id) => {
      secrets.delete(id);
    }),
  };
  store = new ProfileStore(path, passwords, {
    DATABASE_PATH: '/data/test.db',
    DB_PASSWORD: 'environment-secret',
  });
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('Persistent profiles', () => {
  it('saves, updates, reloads, and deletes profiles with stable IDs and preferences', async () => {
    expect(await store.list()).toEqual([]);
    const saved = await store.save(sqlite);
    expect(saved.config.path).toBe(resolve('./sample.db'));
    expect(saved.preferences).toEqual({ activeProfiling: true });
    const restarted = new ProfileStore(path, passwords);
    expect(await restarted.list()).toEqual([saved]);
    const updated = await restarted.save(
      { ...sqlite, name: 'Renamed', preferences: { activeProfiling: false } },
      saved.id,
    );
    expect(updated.id).toBe(saved.id);
    expect((await store.get(saved.id)).preferences.activeProfiling).toBe(false);
    await store.delete(saved.id);
    expect(await restarted.list()).toEqual([]);
    await expect(store.get(saved.id)).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
    });
  });
  it('defaults profiling off for network databases and prompts when a password is supplied without keychain opt-in', async () => {
    const profile = await store.save({
      ...network,
      password: 'transient-secret',
    });
    expect(profile).toMatchObject({
      credential: 'prompt',
      preferences: { activeProfiling: false },
    });
    expect(await readFile(path, 'utf8')).not.toContain('transient-secret');
    expect(passwords.set).not.toHaveBeenCalled();
    await expect(store.connectionSettings(profile.id)).rejects.toMatchObject({
      code: 'PASSWORD_REQUIRED',
    });
    expect(
      (await store.connectionSettings(profile.id, 'just-this-time')).config
        .password,
    ).toBe('just-this-time');
    expect(await readFile(path, 'utf8')).not.toContain('just-this-time');
  });
  it('stores keychain secrets only in the substitute, rotates them without changing profile IDs, and removes them', async () => {
    const saved = await store.save({
      ...network,
      credential: 'keychain',
      password: 'first-secret',
    });
    expect(saved).not.toHaveProperty('keychainId');
    expect(saved).not.toHaveProperty('password');
    expect(await readFile(path, 'utf8')).not.toContain('first-secret');
    expect((await store.connectionSettings(saved.id)).config.password).toBe(
      'first-secret',
    );
    const edited = await store.save(
      { ...network, credential: 'keychain', name: 'Updated' },
      saved.id,
    );
    expect((await store.connectionSettings(edited.id)).config.password).toBe(
      'first-secret',
    );
    const updated = await store.save(
      { ...network, credential: 'keychain', password: 'second-secret' },
      saved.id,
    );
    expect(updated.id).toBe(saved.id);
    expect([...secrets.values()]).toEqual(['second-secret']);
    await store.save({ ...network, credential: 'prompt' }, saved.id);
    expect(secrets.size).toBe(0);
    const again = await store.save(
      { ...network, credential: 'keychain', password: 'third-secret' },
      saved.id,
    );
    await store.delete(again.id);
    expect(secrets.size).toBe(0);
    expect(await store.list()).toEqual([]);
  });
  it('keeps profiles intact on keychain failures and permits a transient password override', async () => {
    vi.mocked(passwords.set).mockRejectedValueOnce(
      new ApiError(503, 'KEYCHAIN_UNAVAILABLE', 'Locked'),
    );
    await expect(
      store.save({ ...network, credential: 'keychain', password: 'secret' }),
    ).rejects.toMatchObject({ code: 'KEYCHAIN_UNAVAILABLE' });
    expect(await store.list()).toEqual([]);
    const saved = await store.save({
      ...network,
      credential: 'keychain',
      password: 'secret',
    });
    vi.mocked(passwords.get).mockRejectedValueOnce(
      new ApiError(503, 'KEYCHAIN_UNAVAILABLE', 'Locked'),
    );
    await expect(store.connectionSettings(saved.id)).rejects.toMatchObject({
      code: 'KEYCHAIN_UNAVAILABLE',
    });
    expect(
      (await store.connectionSettings(saved.id, 'override')).config.password,
    ).toBe('override');
    vi.mocked(passwords.delete).mockRejectedValueOnce(
      new ApiError(503, 'KEYCHAIN_UNAVAILABLE', 'Locked'),
    );
    await expect(
      store.save({ ...network, credential: 'none' }, saved.id),
    ).rejects.toMatchObject({ code: 'KEYCHAIN_UNAVAILABLE' });
    expect((await store.get(saved.id)).credential).toBe('keychain');
    secrets.clear();
    await expect(store.connectionSettings(saved.id)).rejects.toMatchObject({
      code: 'PASSWORD_REQUIRED',
    });
  });
  it('resolves environment fields on reconnect without persisting their values', async () => {
    const saved = await store.save({
      ...network,
      config: { ...network.config, password: '${DB_PASSWORD}' },
    });
    expect(saved.credential).toBe('environment');
    expect((await store.connectionSettings(saved.id)).config.password).toBe(
      'environment-secret',
    );
    expect(await readFile(path, 'utf8')).not.toContain('environment-secret');
    const local = await store.save({
      ...sqlite,
      config: { path: '${DATABASE_PATH}' },
    });
    expect((await store.connectionSettings(local.id)).config.path).toBe(
      '/data/test.db',
    );
    expect(
      (
        await new ProfileStore(path, passwords, {
          DATABASE_PATH: '/other.db',
        }).connectionSettings(local.id)
      ).config.path,
    ).toBe('/other.db');
  });
  it('keeps the saved base directory when an environment-based file path is relative', async () => {
    const environment = { LOCATION: 'relative/sample.db' };
    const local = new ProfileStore(path, passwords, environment);
    const profile = await local.save({
      ...sqlite,
      config: { path: '${LOCATION}' },
    });
    expect(profile).not.toHaveProperty('baseDirectory');
    expect((await local.connectionSettings(profile.id)).config.path).toBe(
      resolve('relative/sample.db'),
    );
    expect((await store.get(profile.id)).config.path).toBe('${LOCATION}');
  });
  it('supports environment references for typed port and SSL fields', async () => {
    const local = new ProfileStore(path, passwords, {
      PORT: '5432',
      SSL: 'true',
    });
    const profile = await local.save({
      ...network,
      config: { ...network.config, port: '${PORT}', ssl: '${SSL}' },
    });
    expect((await local.connectionSettings(profile.id)).config).toMatchObject({
      port: 5432,
      ssl: true,
    });
    expect((await store.get(profile.id)).config).toMatchObject({
      port: '${PORT}',
      ssl: '${SSL}',
    });
  });
  it('rejects literal passwords, embedded URL credentials, unknown secret fields, and incompatible credential sources', async () => {
    for (const config of [
      { password: 'plaintext' },
      { token: 'plaintext' },
      { host: 'postgres://reader:plaintext@host/db' },
      { database: 'db;password=plaintext' },
      { connectionString: 'postgres://reader:plaintext@host/db' },
    ]) {
      await expect(store.save({ ...network, config })).rejects.toThrow();
    }
    await expect(
      store.save({ ...network, credential: 'environment' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL_SOURCE' });
    await expect(
      store.save({ ...sqlite, credential: 'prompt' }),
    ).rejects.toMatchObject({ code: 'INVALID_PROFILE' });
    expect(await store.list()).toEqual([]);
  });
  it('does not overwrite corrupt files, unsupported versions, or plaintext credentials', async () => {
    const saved = await store.save(sqlite);
    const variants = [
      'broken-json',
      JSON.stringify({ version: 99, profiles: [] }),
      JSON.stringify({
        version: 1,
        profiles: [{ ...saved, config: { password: 'hidden-secret' } }],
      }),
    ];
    for (const data of variants) {
      await writeFile(path, data);
      await expect(store.list()).rejects.toMatchObject({
        code: 'PROFILES_UNAVAILABLE',
      });
      await expect(store.save(sqlite)).rejects.toMatchObject({
        code: 'PROFILES_UNAVAILABLE',
      });
      expect(await readFile(path, 'utf8')).toBe(data);
    }
  });
  it('serializes writes across independent store instances without losing profiles', async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        new ProfileStore(path, passwords).save({
          ...sqlite,
          name: `Profile ${index}`,
        }),
      ),
    );
    expect(await store.list()).toHaveLength(8);
  });
  it('restores the previous keychain credential if the profile file cannot be committed', async () => {
    const profile = await store.save({
      ...network,
      credential: 'keychain',
      password: 'old-secret',
    });
    const disk = await readFile(path, 'utf8');
    vi.spyOn(
      store as unknown as { write: () => Promise<void> },
      'write',
    ).mockRejectedValueOnce(new Error('Disk full'));
    await expect(
      store.save(
        { ...network, credential: 'keychain', password: 'new-secret' },
        profile.id,
      ),
    ).rejects.toMatchObject({ code: 'PROFILES_UNAVAILABLE' });
    expect(await readFile(path, 'utf8')).toBe(disk);
    expect([...secrets.values()]).toEqual(['old-secret']);
    expect((await store.connectionSettings(profile.id)).config.password).toBe(
      'old-secret',
    );
  });
  it('restores a keychain credential when deleting its profile fails to write the file', async () => {
    const profile = await store.save({
      ...network,
      credential: 'keychain',
      password: 'old-secret',
    });
    vi.spyOn(
      store as unknown as { write: () => Promise<void> },
      'write',
    ).mockRejectedValueOnce(new Error('Disk full'));
    await expect(store.delete(profile.id)).rejects.toMatchObject({
      code: 'PROFILES_UNAVAILABLE',
    });
    expect((await store.connectionSettings(profile.id)).config.password).toBe(
      'old-secret',
    );
  });
  it('uses private filesystem permissions on POSIX', async () => {
    if (process.platform === 'win32') return;
    await store.save(sqlite);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(directory, 'config'))).mode & 0o777).toBe(0o700);
  });
});

describe('Environment references', () => {
  it('substitutes multiple variables, preserves scalar fields, and never expands replacement values recursively', () => {
    expect(
      resolveEnvironment(
        { path: '${ROOT}/${FILE}', user: '${USER}', port: 5432, ssl: false },
        { ROOT: '/data', FILE: 'sample.db', USER: '${SECRET}' },
      ),
    ).toEqual({
      path: '/data/sample.db',
      user: '${SECRET}',
      port: 5432,
      ssl: false,
    });
  });
  it('rejects invalid typed variables without returning their values', () => {
    for (const value of ['secret-marker', '0', '65536', '1.5', '']) {
      expect(() =>
        resolveEnvironment({ port: '${PORT}' }, { PORT: value }),
      ).toThrow('port environment variable');
    }
    expect(() =>
      resolveEnvironment({ ssl: '${SSL}' }, { SSL: 'secret-marker' }),
    ).toThrow('SSL environment variable');
    expect(resolveEnvironment({ ssl: '${SSL}' }, { SSL: 'false' }).ssl).toBe(
      false,
    );
  });
  it('distinguishes unset and empty variables and does not reveal environment values in errors', () => {
    expect(resolveEnvironment({ user: '${EMPTY}' }, { EMPTY: '' })).toEqual({
      user: '',
    });
    expect(() =>
      resolveEnvironment(
        { password: '${MISSING}' },
        { OTHER: 'private-secret' },
      ),
    ).toThrow('Environment variable MISSING is not set.');
  });
});
