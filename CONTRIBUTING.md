# Contributing

## Setup

Use Node.js 22.12 or newer and pnpm 10.34.6 (pinned in `package.json`).
With Corepack available, run `corepack enable` once, then:

```sh
pnpm install
pnpm dev ./tests/fixtures/sample.db
```

`pnpm dev` builds the packages and starts the CLI. It does not yet provide live
reloading. Use `pnpm dev --no-browser` when running without a desktop.
The SQLite driver uses a native component; platforms without a matching binary
need Python and a C/C++ build toolchain for installation.

## Packages

- `packages/core`: canonical model, adapter interface, and capabilities.
- `packages/adapter-sqlite`: read-only SQLite connections and schema introspection.
- `packages/adapter-testkit`: shared adapter lifecycle and introspection conformance suite.
- `packages/server`: connection manager, Fastify startup screen, and CLI.

The web interface and other database adapters will be added in later phases.
SQLite's `listTables` and `getTable` operations are implemented. Relationship
graphs, statistics, and profiling still reject with `UnsupportedOperationError`;
capability flags indicate unavailable features. `objectTypes` describes engine
object kinds; the current introspection API covers tables only.

## Checks

```sh
pnpm build
pnpm test
pnpm test:adapters
pnpm typecheck
pnpm format:check
```

Tests cover connection lifecycle, invalid configurations, write rejection by the
real SQLite driver, target parsing, HTTP startup, and the built CLI's startup and
shutdown, plus the complete fixture schema and SQLite-specific edge cases.
They need no container runtime. The CLI tests use `--no-browser` so they
do not launch desktop applications.

`tests/fixtures/sample.db` is a small committed SQLite database.
`tests/fixtures/sample.sql` is its source schema and seed data, covering composite
keys, self-references, nullable columns, named constraints, and multi-column
indexes. `packages/adapter-sqlite/test/fixture.ts` contains independently written
model expectations. To regenerate it,
run the following with SQLite installed, using a temporary file if the working
directory's filesystem does not support SQLite locking:

```sh
sqlite3 /tmp/db-explorer-sample.db < tests/fixtures/sample.sql
cp /tmp/db-explorer-sample.db tests/fixtures/sample.db
rm /tmp/db-explorer-sample.db
```

Run `pnpm format` to format changes. The design specifications in `specs/` are
excluded from automatic formatting. See those documents for the architecture,
adapter contract, and roadmap.

## Introspection and adapter conformance

SQLite introspection reads only `sqlite_schema` and read-only PRAGMA table-valued
functions. Each table detail is read in one transaction for a consistent schema
snapshot. CHECK expressions and declared constraint names come from a small
lexer for stored CREATE statements; this text is never executed. See SQLite's
[PRAGMA reference](https://www.sqlite.org/pragma.html) and
[CREATE TABLE rules](https://www.sqlite.org/lang_createtable.html).

The core index model includes optional ordered `terms` (column or expression,
sort direction, and collation) and a `predicate` for partial indexes. `columns`
contains only named columns; `terms` preserves mixed column/expression ordering.
An unresolved implicit foreign-key target column is represented by `null`.
Ordinary SQLite primary keys can be nullable; the adapter reports actual SQLite
nullability, including rowid aliases, STRICT tables, and WITHOUT ROWID tables.

To test a new adapter, call `defineAdapterConformanceSuite` from
`@db-explorer/adapter-testkit` with a connection factory, expected schemas and
full table models, and a driver-specific `assertReadOnly` hook. Supply models for
that engine's equivalent fixture schema; `normalizeTable` supports differences
in engine-specific types or index details. Introspection tests skip when the
capability is absent, and write-rejection tests skip for credentials-only
read-only enforcement. The conformance suite will grow with later roadmap phases.
