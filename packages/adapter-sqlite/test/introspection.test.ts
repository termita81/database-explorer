import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseConnection } from '@db-explorer/core';
import { sqliteAdapter } from '../src/index.js';
import { fixturePath } from './fixture.js';

const connections: DatabaseConnection[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    connections.splice(0).map((connection) => connection.close()),
  );
  directories
    .splice(0)
    .forEach((directory) =>
      rmSync(directory, { recursive: true, force: true }),
    );
});
async function connect(sql?: string) {
  let path = fixturePath;
  if (sql !== undefined) {
    const directory = mkdtempSync(join(tmpdir(), 'db-explorer-schema-'));
    directories.push(directory);
    path = join(directory, 'schema.db');
    const database = new Database(path);
    try {
      database.exec(sql);
    } finally {
      database.close();
    }
  }
  const connection = await sqliteAdapter.connect({ path });
  connections.push(connection);
  return connection;
}
const table = (name: string) => ({ schema: 'main', name });

describe('SQLite schema edge cases', () => {
  it('excludes views, system tables, and virtual-table shadow tables', async () => {
    const connection =
      await connect(`CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE VIEW item_view AS SELECT * FROM items;
      CREATE VIRTUAL TABLE search USING fts5(content);`);
    expect(await connection.listTables()).toEqual([
      { schema: 'main', name: 'items', kind: 'table' },
      { schema: 'main', name: 'search', kind: 'table' },
    ]);
    expect(
      (await connection.getTable(table('search'))).columns.map(
        (column) => column.name,
      ),
    ).toEqual(['content', 'search', 'rank']);
    await expect(connection.getTable(table('search_data'))).rejects.toThrow(
      'Unknown table',
    );
    await expect(connection.getTable(table('item_view'))).rejects.toThrow(
      'Unknown table',
    );
    await expect(connection.getTable(table('sqlite_sequence'))).rejects.toThrow(
      'Unknown table',
    );
  });
  it('handles an empty database and a table without keys or declared types', async () => {
    const empty = await connect('');
    expect(await empty.listTables()).toEqual([]);
    const connection = await connect('CREATE TABLE loose (value, note TEXT);');
    expect(await connection.getTable(table('loose'))).toEqual({
      schema: 'main',
      name: 'loose',
      kind: 'table',
      columns: [
        { name: 'value', type: '', nullable: true, default: null },
        { name: 'note', type: 'TEXT', nullable: true, default: null },
      ],
      primaryKey: null,
      foreignKeys: [],
      uniqueConstraints: [],
      checkConstraints: [],
      indexes: [],
    });
  });
  it('preserves names and safely binds identifiers containing quotes and SQL punctuation', async () => {
    const connection =
      await connect(`CREATE TABLE "odd'; DROP TABLE people; --" (
      "a""b" TEXT CONSTRAINT "u""q" UNIQUE,
      [check] TEXT DEFAULT 'CHECK (bogus)',
      CONSTRAINT \`quoted check\` CHECK (length("a""b") > 0)
    );`);
    const detail = await connection.getTable(
      table("odd'; DROP TABLE people; --"),
    );
    expect(detail.columns).toEqual([
      { name: 'a"b', type: 'TEXT', nullable: true, default: null },
      {
        name: 'check',
        type: 'TEXT',
        nullable: true,
        default: "'CHECK (bogus)'",
      },
    ]);
    expect(detail.uniqueConstraints).toEqual([
      { name: 'u"q', columns: ['a"b'] },
    ]);
    expect(detail.checkConstraints).toEqual([
      { name: 'quoted check', expression: 'length("a""b") > 0' },
    ]);
    await expect(connection.getTable(table("x' OR 1=1 --"))).rejects.toThrow(
      'Unknown table',
    );
  });
  it('does not confuse CHECK text in comments, strings, or generated expressions with constraints', async () => {
    const connection = await connect(`CREATE TABLE checks (
      value TEXT DEFAULT '(CHECK (fake))' /* CHECK (ignored) */
        CONSTRAINT value_check CHECK ((length(value) > 0) AND value <> 'it''s ) CHECK('),
      twice INTEGER GENERATED ALWAYS AS (length(value) * 2) VIRTUAL,
      CONSTRAINT table_check CHECK (instr(value, ',') = 0),
      -- CHECK (also ignored)
      CHECK (twice >= 0)
    );`);
    const detail = await connection.getTable(table('checks'));
    expect(detail.columns.map((column) => column.name)).toEqual([
      'value',
      'twice',
    ]);
    expect(detail.checkConstraints).toEqual([
      {
        name: 'value_check',
        expression: "(length(value) > 0) AND value <> 'it''s ) CHECK('",
      },
      { name: 'table_check', expression: "instr(value, ',') = 0" },
      { expression: 'twice >= 0' },
    ]);
  });
  it('reports actual SQLite primary-key nullability including the DESC rowid exception', async () => {
    const connection = await connect(`
      CREATE TABLE ordinary (id TEXT PRIMARY KEY);
      CREATE TABLE composite (a TEXT, b INTEGER, PRIMARY KEY (b, a));
      CREATE TABLE integer_key (id INTEGER PRIMARY KEY);
      CREATE TABLE descending_key (id INTEGER PRIMARY KEY DESC);
      CREATE TABLE table_descending_key (id INTEGER, PRIMARY KEY (id DESC));
      CREATE TABLE strict_key (id TEXT PRIMARY KEY) STRICT;
      CREATE TABLE rowidless_key (a TEXT, b INTEGER, PRIMARY KEY (b, a)) WITHOUT ROWID;
    `);
    for (const name of ['ordinary', 'composite', 'descending_key']) {
      expect(
        (await connection.getTable(table(name))).columns.every(
          (column) => column.nullable,
        ),
      ).toBe(true);
    }
    for (const name of [
      'integer_key',
      'table_descending_key',
      'strict_key',
      'rowidless_key',
    ]) {
      expect(
        (await connection.getTable(table(name))).columns.every(
          (column) => !column.nullable,
        ),
      ).toBe(true);
    }
    expect((await connection.getTable(table('composite'))).primaryKey).toEqual({
      columns: ['b', 'a'],
    });
  });
  it('resolves implicit composite foreign-key targets without recursing through self-references', async () => {
    const connection =
      await connect(`CREATE TABLE parent (a TEXT, b INTEGER, PRIMARY KEY (b, a));
      CREATE TABLE child (x INTEGER, y TEXT, z INTEGER REFERENCES child(rowid),
        CONSTRAINT fk_parent FOREIGN KEY (x, y) REFERENCES parent);
      CREATE TABLE broken (x INTEGER REFERENCES missing, y INTEGER REFERENCES parent);`);
    expect((await connection.getTable(table('child'))).foreignKeys).toEqual([
      {
        name: 'fk_parent',
        columns: ['x', 'y'],
        referencedTable: table('parent'),
        referencedColumns: ['b', 'a'],
      },
      {
        columns: ['z'],
        referencedTable: table('child'),
        referencedColumns: ['rowid'],
      },
    ]);
    expect(
      (await connection.getTable(table('broken'))).foreignKeys.map(
        (key) => key.referencedColumns,
      ),
    ).toEqual([[null], [null]]);
  });
  it('preserves names for multiple inline and table-level constraints', async () => {
    const connection =
      await connect(`CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id TEXT CONSTRAINT child_pk PRIMARY KEY,
        value INTEGER CONSTRAINT minimum CHECK (value > 0) CONSTRAINT maximum CHECK (value < 10),
        parent_id INTEGER CONSTRAINT parent_ref REFERENCES parent(id),
        code TEXT CONSTRAINT code_unique UNIQUE,
        CONSTRAINT pair_unique UNIQUE (code, value));`);
    const detail = await connection.getTable(table('child'));
    expect(detail.primaryKey).toEqual({ name: 'child_pk', columns: ['id'] });
    expect(detail.foreignKeys[0]?.name).toBe('parent_ref');
    expect(detail.uniqueConstraints).toEqual([
      { name: 'code_unique', columns: ['code'] },
      { name: 'pair_unique', columns: ['code', 'value'] },
    ]);
    expect(detail.checkConstraints).toEqual([
      { name: 'minimum', expression: 'value > 0' },
      { name: 'maximum', expression: 'value < 10' },
    ]);
  });
  it('distinguishes unique indexes from constraints and retains expression/partial index terms', async () => {
    const connection = await connect(`CREATE TABLE items (a TEXT, b INTEGER);
      CREATE UNIQUE INDEX "odd'index" ON items (lower(a) COLLATE NOCASE DESC, b ASC) WHERE b > 0;
      CREATE INDEX ordered ON items (b, a COLLATE RTRIM DESC);`);
    const detail = await connection.getTable(table('items'));
    expect(detail.uniqueConstraints).toEqual([]);
    expect(detail.indexes).toEqual([
      {
        name: "odd'index",
        columns: ['b'],
        unique: true,
        terms: [
          {
            column: null,
            expression: 'lower(a)',
            descending: true,
            collation: 'NOCASE',
          },
          { column: 'b', descending: false, collation: 'BINARY' },
        ],
        predicate: 'b > 0',
      },
      {
        name: 'ordered',
        columns: ['b', 'a'],
        unique: false,
        terms: [
          { column: 'b', descending: false, collation: 'BINARY' },
          { column: 'a', descending: true, collation: 'RTRIM' },
        ],
      },
    ]);
  });
  it('rejects unknown schemas and missing tables, while resolving table name case', async () => {
    const connection = await connect();
    await expect(connection.listTables({ name: 'other' })).rejects.toThrow(
      'Unknown schema',
    );
    await expect(
      connection.getTable({
        schema: "main'; DROP TABLE teams; --",
        name: 'teams',
      }),
    ).rejects.toThrow('Unknown schema');
    await expect(connection.getTable(table('missing'))).rejects.toThrow(
      'Unknown table',
    );
    expect(
      (await connection.getTable({ schema: 'MAIN', name: 'TEAMS' })).name,
    ).toBe('teams');
  });
  it('preserves Unicode identifiers and distinguishes names SQLite considers different', async () => {
    const connection = await connect(`CREATE TABLE parent (id TEXT PRIMARY KEY);
      CREATE TABLE unicode_names (
        😀 TEXT, é INTEGER, Ä TEXT, ä TEXT,
        PRIMARY KEY (😀, é),
        CONSTRAINT upper_unique UNIQUE (Ä),
        CONSTRAINT lower_unique UNIQUE (ä),
        CONSTRAINT upper_reference FOREIGN KEY (Ä) REFERENCES parent(id),
        CONSTRAINT lower_reference FOREIGN KEY (ä) REFERENCES parent(id)
      );`);
    const detail = await connection.getTable(table('unicode_names'));
    expect(detail.primaryKey).toEqual({ columns: ['😀', 'é'] });
    expect(detail.uniqueConstraints).toEqual([
      { name: 'upper_unique', columns: ['Ä'] },
      { name: 'lower_unique', columns: ['ä'] },
    ]);
    expect(detail.foreignKeys.map((key) => [key.columns, key.name])).toEqual([
      [['Ä'], 'upper_reference'],
      [['ä'], 'lower_reference'],
    ]);
  });
  it('normalizes constraint references to the actual table and column spelling', async () => {
    const connection = await connect(`CREATE TABLE Parent (id TEXT PRIMARY KEY);
      CREATE TABLE child (value TEXT,
        CONSTRAINT parent_reference FOREIGN KEY (VALUE) REFERENCES parent(ID),
        CONSTRAINT value_unique UNIQUE (VALUE));`);
    const detail = await connection.getTable(table('child'));
    expect(detail.foreignKeys).toEqual([
      {
        name: 'parent_reference',
        columns: ['value'],
        referencedTable: table('Parent'),
        referencedColumns: ['id'],
      },
    ]);
    expect(detail.uniqueConstraints).toEqual([
      { name: 'value_unique', columns: ['value'] },
    ]);
  });
  it('keeps nested expression-index terms and string literals intact', async () => {
    const connection = await connect(`CREATE TABLE items (a TEXT, b INTEGER);
      CREATE INDEX nested ON items (coalesce(lower(a), 'it''s ) , WHERE') DESC, (b + 1))
        WHERE a <> 'WHERE )';`);
    const index = (await connection.getTable(table('items'))).indexes[0]!;
    expect(index.columns).toEqual([]);
    expect(index.terms).toEqual([
      {
        column: null,
        expression: "coalesce(lower(a), 'it''s ) , WHERE')",
        descending: true,
        collation: 'BINARY',
      },
      {
        column: null,
        expression: '(b + 1)',
        descending: false,
        collation: 'BINARY',
      },
    ]);
    expect(index.predicate).toBe("a <> 'WHERE )'");
  });
  it('retains declared UNIQUE constraints even when SQLite shares their backing index', async () => {
    const connection = await connect(`CREATE TABLE shared (
      id TEXT CONSTRAINT shared_pk PRIMARY KEY,
      CONSTRAINT first_unique UNIQUE (id), CONSTRAINT second_unique UNIQUE (id)
    );`);
    const detail = await connection.getTable(table('shared'));
    expect(detail.uniqueConstraints).toEqual([
      { name: 'first_unique', columns: ['id'] },
      { name: 'second_unique', columns: ['id'] },
    ]);
    expect(detail.indexes).toHaveLength(1);
  });
  it('leaves the database byte-for-byte unchanged after all introspection calls', async () => {
    const before = readFileSync(fixturePath);
    const connection = await connect();
    for (const ref of await connection.listTables())
      await connection.getTable(ref);
    await connection.close();
    expect(readFileSync(fixturePath)).toEqual(before);
  });
});
