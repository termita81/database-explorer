
## Purpose

This document defines what a database adapter must do so that DB Explorer can work with it. It is the reference for building a new adapter and the specification that the shared conformance suite checks.

## The canonical model

Every adapter translates an engine's structure into one shared model. The rest of DB Explorer knows only this model.

The model's entities:

- **Database** — the database being explored.
- **Schema** — a namespace within a database. Engines without schemas report a single implicit schema.
- **Table** — a table, with its columns, keys, constraints, and indexes.
- **Column** — a name, a type as reported by the engine, whether it is nullable, and its default.
- **Primary key** — the ordered set of columns forming the primary key.
- **Foreign key** — a set of columns referencing a set of columns in another table.
- **Unique constraint** and **check constraint** — as reported by the engine.
- **Index** — a name, the columns it covers, and whether it is unique.
- **Relationship** — a directed connection between two tables, derived from a foreign key.

Additional object types — views, procedures, functions, triggers — are part of the model for engines that support them and are absent otherwise.

## The adapter interface

An adapter exposes a way to connect, and a connection exposes the operations below. The shape shown here is indicative.

```ts
interface DatabaseAdapter {
  id: string;                       // for example, \"sqlite\"
  staticCapabilities: Capabilities; // capabilities fixed for this engine
  connect(config: unknown): Promise<DatabaseConnection>;
}

interface DatabaseConnection {
  capabilities: Capabilities;       // static capabilities plus any determined at connect time

  testConnection(): Promise<void>;
  listSchemas(): Promise<SchemaRef[]>;
  listTables(schema?: SchemaRef): Promise<TableSummary[]>;
  getTable(ref: TableRef): Promise<TableDetail>;
  listRelationships(schema?: SchemaRef): Promise<Relationship[]>;

  getTableMetadataStats(ref: TableRef): Promise<TableMetadataStats>;
  profileTable(ref: TableRef, options: ProfileOptions): Promise<TableProfile>;
  sampleRows(ref: TableRef, limit: number): Promise<RowSample>;

  listExtraSections?(): Promise<ExtraSection[]>;

  close(): Promise<void>;
}
```

Operations for object types beyond tables — listing views, retrieving a view's definition, listing routines, and so on — are present only on adapters whose capabilities include them.

## Capabilities

An adapter declares what it supports so that the API and the interface can adapt without containing any engine-specific logic.

- Some capabilities are **static** — inherent to the engine. SQLite never has stored procedures, for example.
- Some are **connection-dependent** — they rely on the server version or on the connecting account's permissions, and must be determined when the connection opens.

Capabilities describe, at least:

- Whether the engine has schemas.
- Which object types exist: views, materialized views, procedures, functions, triggers.
- Whether an estimated row count is available from the catalog, and whether an exact row count is cheap.
- Whether the catalog provides column histograms.
- Whether read-only behaviour can be enforced at the session or transaction level, or only through credentials.
- Which engine-specific sections the adapter contributes.

## Engine-specific sections

Where an engine exposes something that does not fit the canonical model, an adapter may provide it as an extra section: a titled collection of structured entries that the interface can render without understanding their meaning. Installed extensions and CLR assemblies are examples. An adapter that provides no extra sections simply omits them, and the interface shows nothing in their place.

## Read-only obligations

- An adapter must never issue a statement that changes data or structure.
- Where the engine supports a read-only session or transaction mode, the adapter must enable it and must declare that capability.
- Where the engine has no such mode, the adapter relies on the connecting account's permissions and must declare that it cannot enforce read-only itself, so the interface can make that clear to the user.
- Adapters issue only queries from their own fixed, reviewed set. No externally supplied SQL is executed.

## Statistics obligations

Adapters provide statistics in two tiers.

- **Metadata-only statistics** must not read table contents. They draw on the engine's own catalog — an estimated row count, and whatever column statistics the engine maintains. An adapter returns whatever is available and indicates what is not.
- **Active profiling** reads data. It must respect the row limit and the timeout given in its options. DB Explorer will not invoke it for a table whose estimated size exceeds the configured threshold unless the user has explicitly asked for it; adapters can assume that check has already happened.

Every value that is an estimate must be marked as an estimate in the returned data.

## How the conformance suite works

The shared conformance suite, in the test kit package, encodes the expectations above once and runs them against every adapter.

- The suite exports a function that takes a name, a way to open a connection to a test database, and any per-engine expectation overrides.
- Each adapter package has a test file that calls this function, supplying a connection to a test database — a committed file for SQLite, or a container-managed instance for the networked engines.
- The suite includes a canonical seed schema expressed for each engine, so every adapter is tested against an equivalent structure, including composite keys, self-references, and nullable columns.
- The suite asserts, among other things, that connecting succeeds; that the seeded tables and relationships are reported correctly; that a write statement is rejected when the engine supports read-only enforcement; that every capability declared as supported actually works; and that metadata-only statistics issue no queries that scan table contents.
- Tests for a capability that an adapter does not declare are skipped automatically, so the same suite runs against every adapter without failing on features an engine legitimately lacks.

## Adding a new adapter

1. Create a package under `packages/` named for the engine.
2. Implement the adapter interface, mapping the engine's structure onto the canonical model.
3. Declare static capabilities, and determine connection-dependent capabilities when the connection opens.
4. Enable the engine's read-only mode if it has one; otherwise declare that read-only cannot be enforced by the adapter.
5. Provide metadata-only statistics from the catalog, and active profiling that respects its limits.
6. Add any engine-specific sections worth surfacing.
7. Add a test file that runs the shared conformance suite against the engine, using a container-managed instance where applicable.
8. Record the engine's specifics in `database-support.md`.
