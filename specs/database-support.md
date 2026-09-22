
## Purpose

This document records what DB Explorer can show for each database engine, how read-only behaviour is enforced for it, and the engine-specific details worth surfacing. It is a reference that grows as each adapter is built.

## How support is described

- **Canonical model.** Every adapter maps the engine's structure onto one shared model: databases, schemas, tables, columns, keys, constraints, indexes, and relationships. The rest of DB Explorer works only with this model.
- **Capabilities.** Each adapter declares what it supports. Some capabilities are fixed for the engine; others depend on the server version or the connecting account's permissions and are determined when the connection opens.
- **Engine-specific sections.** Where an engine exposes features that do not fit the canonical model — installed extensions, for example — the adapter can provide them as a structured section that the interface displays generically.
- **Read-only enforcement layers.** Read-only behaviour is enforced in up to three layers: the connecting account's privileges; the engine's own read-only session or transaction mode, where one exists; and a fixed set of reviewed queries, since DB Explorer executes no user-supplied SQL in the first version.

## SQLite

- **Status:** first supported engine.
- **Connection:** a path to a database file.
- **Read-only enforcement:** the file is opened in read-only mode by the driver, which rejects any write. This is a genuine guarantee at the driver level.
- **Statistics from the catalog:** limited. Approximate row counts and index information exist only if the database has been analysed. There are no catalog-provided histograms. For large files, active profiling relies on bounded queries with a timeout.
- **Schemas:** SQLite has no separate schemas.
- **Object types:** tables, views, indexes, and triggers. No stored procedures or functions.
- **Engine-specific features to surface:** compile-time options.
- **Known quirks:** column types are advisory rather than strict, so the reported type for a column may not constrain the values stored in it.

## PostgreSQL

- **Status:** planned.
- **Connection:** a connection string or the usual individual fields. Native environment configuration is honoured where the driver supports it.
- **Read-only enforcement:** every statement runs inside a read-only transaction, and the session is set to read-only. The server rejects writes. Connecting with a read-only role is still recommended.
- **Statistics from the catalog:** rich. Estimated row counts are available, and the engine's column statistics include the null fraction, a distinct-value estimate, the most common values, and histogram bounds — enough to show a histogram without reading table contents, provided statistics have been gathered.
- **Schemas:** supported.
- **Object types:** tables, views, materialized views, indexes, triggers, functions, and procedures.
- **Engine-specific features to surface:** installed extensions and their versions; custom types, domains, and enumerations; foreign data wrappers.
- **Known quirks:** catalog statistics are only as current as the last analyse operation, which is normally automatic but can lag.

## MySQL and MariaDB

- **Status:** planned.
- **Connection:** a connection string or individual fields.
- **Read-only enforcement:** statements run inside a read-only transaction, which the server enforces. Connecting with a read-only account is still recommended.
- **Statistics from the catalog:** partial. An estimated row count is available but can be inaccurate. Approximate distinct counts are available for indexed columns. Full histograms exist only where someone has explicitly created them.
- **Schemas:** a schema and a database are the same concept in these engines.
- **Object types:** tables, views, indexes, triggers, functions, and procedures.
- **Engine-specific features to surface:** loaded plugins and available storage engines.
- **Known quirks:** the estimated row count for a table can differ substantially from the real count.

## SQL Server

- **Status:** planned.
- **Connection:** a connection string or individual fields.
- **Read-only enforcement:** SQL Server has no read-only transaction mode, so enforcement relies on connecting with an account that has only read permissions, together with the fixed set of reviewed queries. This difference is surfaced to the user.
- **Statistics from the catalog:** good. A row count maintained by the engine is available and is usually accurate. Histogram data can be read from the engine's statistics objects without scanning table contents, subject to permissions.
- **Schemas:** supported.
- **Object types:** tables, views, indexes, triggers, functions, and procedures.
- **Engine-specific features to surface:** CLR assemblies and the modules they provide.
- **Known quirks:** reading statistics objects requires specific permissions, which a minimal read-only account may not have.

## Oracle

- **Status:** deferred.
- **Connection:** requires Oracle client libraries to be available. Details to be determined when the adapter is built.
- **Read-only enforcement:** Oracle supports read-only transactions; a read-only account is still recommended.
- **Statistics from the catalog:** Oracle maintains detailed optimiser statistics, including histograms. Specifics to be determined when the adapter is built.
- **Object types:** to be determined when the adapter is built.
- **Engine-specific features to surface:** candidates include Java stored procedures and vector data types in recent versions.
- **Known quirks:** to be determined.
