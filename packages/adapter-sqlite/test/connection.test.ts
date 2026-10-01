import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqliteAdapter } from '../src/index.js';
import { openReadOnlyDatabase } from '../src/database.js';
import type { DatabaseConnection } from '@db-explorer/core';

const fixture = fileURLToPath(
  new URL('../../../tests/fixtures/sample.db', import.meta.url),
);
const connections: DatabaseConnection[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    connections.splice(0).map((connection) => connection.close()),
  );
  directories
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true }));
});
function temporaryPath() {
  const directory = mkdtempSync(join(tmpdir(), 'db-explorer-'));
  directories.push(directory);
  return join(directory, 'database.db');
}
describe('SQLite connection', () => {
  it('opens the committed fixture without changing it', async () => {
    const before = readFileSync(fixture);
    const connection = await sqliteAdapter.connect({ path: fixture });
    connections.push(connection);
    await expect(connection.testConnection()).resolves.toBeUndefined();
    expect(connection.capabilities.readOnlyEnforcement).toBe('driver');
    expect(await connection.listSchemas()).toEqual([{ name: 'main' }]);
    await connection.close();
    expect(readFileSync(fixture)).toEqual(before);
  });
  it('rejects missing files without creating them', async () => {
    const path = temporaryPath();
    await expect(sqliteAdapter.connect({ path })).rejects.toThrow();
    expect(existsSync(path)).toBe(false);
  });
  it('rejects files that are not SQLite databases', async () => {
    const path = temporaryPath();
    writeFileSync(path, 'This is not a SQLite database.');
    await expect(sqliteAdapter.connect({ path })).rejects.toThrow();
  });
  it.each([{}, { path: '' }, { path: '   ' }, { path: ':memory:' }])(
    'rejects invalid config %j',
    async (config) => {
      await expect(sqliteAdapter.connect(config)).rejects.toThrow();
    },
  );
  it('rejects writes at the driver level even if query_only is disabled', () => {
    const database = openReadOnlyDatabase(fixture);
    try {
      expect(database.readonly).toBe(true);
      database.pragma('query_only = OFF');
      expect(() =>
        database.prepare("INSERT INTO teams (name) VALUES ('Forbidden')").run(),
      ).toThrow(/readonly/i);
      expect(() => database.exec('DROP TABLE people')).toThrow(/readonly/i);
      expect(
        database.prepare('SELECT count(*) AS count FROM teams').get(),
      ).toEqual({ count: 1 });
    } finally {
      database.close();
    }
  });
  it('closes idempotently and refuses use after close', async () => {
    const connection = await sqliteAdapter.connect({ path: fixture });
    await connection.close();
    await connection.close();
    await expect(connection.testConnection()).rejects.toThrow('closed');
    await expect(connection.listSchemas()).rejects.toThrow('closed');
  });
  it('reports future operations as unsupported', async () => {
    const connection = await sqliteAdapter.connect({ path: fixture });
    connections.push(connection);
    expect(connection.capabilities.introspection).toBe(true);
    await expect(connection.listRelationships()).rejects.toThrow(
      'not implemented',
    );
  });
});
