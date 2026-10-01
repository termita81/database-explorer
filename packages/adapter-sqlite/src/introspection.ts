import type Database from 'better-sqlite3';
import type {
  ForeignKey,
  Index,
  SchemaRef,
  TableDetail,
  TableRef,
  TableSummary,
} from '@db-explorer/core';
import { readDeclaredConstraints, readIndexDefinition } from './sql.js';

interface TableRow {
  name: string;
  sql: string;
}
interface ColumnRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}
interface IndexRow {
  name: string;
  unique: number;
  origin: 'c' | 'u' | 'pk';
}
interface IndexColumnRow {
  seqno: number;
  cid: number;
  name: string | null;
  desc: number;
  coll: string | null;
  key: number;
}
interface ForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
}

function assertSchema(schema: SchemaRef): void {
  if (schema.name.toLowerCase() !== 'main')
    throw new Error('Unknown schema. SQLite exposes only main.');
}
// SQLite's default identifier comparison folds ASCII letters only.
const foldName = (name: string) =>
  name.replace(/[A-Z]/g, (character) => character.toLowerCase());
const sameName = (left: string, right: string) =>
  foldName(left) === foldName(right);
const sameColumns = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((name, index) => sameName(name, right[index]!));

export function listTables(
  database: Database.Database,
  schema: SchemaRef = { name: 'main' },
): TableSummary[] {
  assertSchema(schema);
  const rows = database
    .prepare(
      `
    SELECT name FROM pragma_table_list()
    WHERE schema = 'main' AND type IN ('table', 'virtual') AND name NOT GLOB 'sqlite_*'
    ORDER BY name COLLATE BINARY
  `,
    )
    .all() as { name: string }[];
  return rows.map((row) => ({ schema: 'main', name: row.name, kind: 'table' }));
}

function columnsFor(database: Database.Database, table: string): ColumnRow[] {
  return database
    .prepare("SELECT * FROM pragma_table_xinfo(?, 'main') ORDER BY cid")
    .all(table) as ColumnRow[];
}
function primaryKeyColumns(columns: ColumnRow[]): string[] {
  return columns
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => column.name);
}
function tableRow(
  database: Database.Database,
  name: string,
): TableRow | undefined {
  return database
    .prepare(
      `
    SELECT s.name, s.sql FROM main.sqlite_schema AS s
    JOIN pragma_table_list() AS t ON t.schema = 'main' AND t.name = s.name
    WHERE s.type = 'table' AND t.type IN ('table', 'virtual')
      AND s.name NOT GLOB 'sqlite_*' AND s.name = ? COLLATE NOCASE
  `,
    )
    .get(name) as TableRow | undefined;
}

function readIndexes(database: Database.Database, rows: IndexRow[]): Index[] {
  return rows.map((row) => {
    const columns = database
      .prepare(
        "SELECT * FROM pragma_index_xinfo(?, 'main') WHERE key = 1 ORDER BY seqno",
      )
      .all(row.name) as IndexColumnRow[];
    const definition = database
      .prepare(
        "SELECT sql FROM main.sqlite_schema WHERE type = 'index' AND name = ?",
      )
      .get(row.name) as { sql: string | null } | undefined;
    const parsed = definition?.sql
      ? readIndexDefinition(definition.sql)
      : undefined;
    return {
      name: row.name,
      columns: columns.flatMap((column) =>
        column.name === null ? [] : [column.name],
      ),
      unique: row.unique === 1,
      terms: columns.map((column) => ({
        column: column.name,
        ...(column.name === null
          ? {
              expression:
                column.cid === -1 ? 'rowid' : parsed?.expressions[column.seqno],
            }
          : {}),
        descending: column.desc === 1,
        collation: column.coll,
      })),
      ...(parsed?.predicate === undefined
        ? {}
        : { predicate: parsed.predicate }),
    };
  });
}

export function getTable(
  database: Database.Database,
  ref: TableRef,
): TableDetail {
  assertSchema({ name: ref.schema });
  // One read transaction gives all catalog queries a consistent schema snapshot.
  return database
    .transaction((): TableDetail => {
      const table = tableRow(database, ref.name);
      if (!table) throw new Error(`Unknown table: ${ref.name}`);
      const columns = columnsFor(database, table.name);
      const keyColumns = primaryKeyColumns(columns);
      const canonicalColumn = (name: string) =>
        columns.find((column) => sameName(column.name, name))?.name ?? name;
      const indexRows = database
        .prepare(
          "SELECT * FROM pragma_index_list(?, 'main') ORDER BY name COLLATE BINARY",
        )
        .all(table.name) as IndexRow[];
      const indexes = readIndexes(database, indexRows);
      const declared = readDeclaredConstraints(table.sql);
      // INTEGER PRIMARY KEY DESC is not a rowid alias; it has a separate PK index.
      const rowidAlias =
        keyColumns.length === 1 &&
        !indexRows.some((index) => index.origin === 'pk');
      const foreignKeyRows = database
        .prepare(
          "SELECT * FROM pragma_foreign_key_list(?, 'main') ORDER BY id, seq",
        )
        .all(table.name) as ForeignKeyRow[];
      const groups = new Map<number, ForeignKeyRow[]>();
      for (const row of foreignKeyRows) {
        const group = groups.get(row.id) ?? [];
        group.push(row);
        groups.set(row.id, group);
      }
      const declarations = [...declared.foreignKeys];
      const foreignKeys: ForeignKey[] = [...groups.values()].map((group) => {
        const first = group[0]!;
        const sourceColumns = group.map((row) => canonicalColumn(row.from));
        const parent = tableRow(database, first.table);
        const parentColumns = parent ? columnsFor(database, parent.name) : [];
        const parentKey = primaryKeyColumns(parentColumns);
        const implicitColumns =
          parentKey.length === group.length ? parentKey : [];
        const referencedColumns = group.map((row) =>
          row.to === null
            ? (implicitColumns[row.seq] ?? null)
            : (parentColumns.find((column) => sameName(column.name, row.to!))
                ?.name ?? row.to),
        );
        const match = declarations.findIndex(
          (key) =>
            sameColumns(key.columns, sourceColumns) &&
            sameName(key.referencedTable, first.table) &&
            (key.referencedColumns === undefined ||
              key.referencedColumns.every(
                (name, index) =>
                  referencedColumns[index] !== null &&
                  referencedColumns[index] !== undefined &&
                  sameName(name, referencedColumns[index]!),
              )),
        );
        const declaration =
          match < 0 ? undefined : declarations.splice(match, 1)[0];
        return {
          ...(declaration?.name === undefined
            ? {}
            : { name: declaration.name }),
          columns: sourceColumns,
          referencedTable: {
            schema: 'main',
            name: parent?.name ?? first.table,
          },
          referencedColumns,
        };
      });
      // Foreign key PRAGMA IDs aren't stable semantic identifiers; sort by their actual contents.
      foreignKeys.sort((left, right) => {
        const key = (foreignKey: ForeignKey) =>
          JSON.stringify([
            foreignKey.columns,
            foreignKey.referencedTable.name,
            foreignKey.referencedColumns,
            foreignKey.name ?? '',
          ]);
        const a = key(left);
        const b = key(right);
        return a < b ? -1 : a > b ? 1 : 0;
      });
      return {
        schema: 'main',
        name: table.name,
        kind: 'table',
        columns: columns.map((column) => ({
          name: column.name,
          type: column.type,
          nullable: !(
            column.notnull === 1 ||
            (column.pk > 0 &&
              rowidAlias &&
              column.type.toUpperCase() === 'INTEGER')
          ),
          default: column.dflt_value,
        })),
        primaryKey:
          keyColumns.length === 0
            ? null
            : {
                ...(declared.primaryKey?.name === undefined
                  ? {}
                  : { name: declared.primaryKey.name }),
                columns: keyColumns,
              },
        foreignKeys,
        uniqueConstraints: declared.uniqueConstraints.map((constraint) => ({
          ...constraint,
          columns: constraint.columns.map(canonicalColumn),
        })),
        checkConstraints: declared.checkConstraints,
        indexes,
      };
    })
    .deferred();
}
