
Phases are sequential. Later phases — additional adapters and additional object types — can be reordered according to priority. Each phase lists its goal, what it delivers, how it is tested, and what \"done\" means.

The phases group into four milestones:

- **Milestone A — A working SQLite explorer people can download and run.** Phases 0 to 9.
- **Milestone B — Support for networked databases.** Phases 10 and 11.
- **Milestone C — Richer exploration.** Phases 12 and 13.
- **Milestone D — Optional extensions.** Phase 14.

---

## Phase 0 — Project scaffolding

**Goal:** a monorepo that builds and tests in continuous integration.

**Deliverables**

- A pnpm workspace with the package layout from the tech-stack document; packages may be empty.
- Shared ESLint, Prettier, and TypeScript configuration.
- Vitest and Playwright configured.
- A build that bundles the server and the pre-built interface into a runnable application.
- A continuous integration pipeline that runs linting and tests.

**Tests**

- A trivial test in each package passes.
- The pipeline is green on a pull request.

**Done when:** a new contributor can clone the repository, install dependencies, run the test suite, and produce a runnable build.

---

## Phase 1 — Core model, adapter contract, and SQLite connection

**Goal:** define the canonical model and the adapter interface, connect to SQLite in read-only mode, and provide the command-line entry point.

**Deliverables**

- The canonical model types and the adapter interface in the core package, including the capabilities description.
- A SQLite adapter that connects from a file path in read-only mode, tests the connection, and closes it.
- A connection manager in the server.
- A command-line entry point: a file path opens that file, a connection string opens that database, and no argument starts the server and opens the browser at the home screen.
- The local server binds to the loopback interface on a random port.

**Tests**

- Unit tests for the connection manager's lifecycle.
- An integration test that connects to the committed sample SQLite file, and one that fails cleanly on an invalid path.
- A test that a write statement against the SQLite connection is rejected.
- A smoke test that launching with a file path starts the server and reports a ready URL.

**Done when:** launching DB Explorer with a SQLite file path starts the tool and the server reports a successful read-only connection.

---

## Phase 2 — SQLite schema introspection

**Goal:** read structure from SQLite into the canonical model.

**Deliverables**

- Listing tables.
- For each table: columns with name, type, nullability, and default; the primary key; foreign keys; unique constraints; check constraints; and indexes.

**Tests**

- A fixture SQLite database with a known schema that covers composite keys, self-references, nullable columns, and multi-column indexes.
- Integration tests asserting that the introspected model matches the known schema.
- The first version of the shared conformance suite in the test kit, run against SQLite.

**Done when:** the introspected model for the fixture database is correct and stable.

---

## Phase 3 — Relationships and the JSON API

**Goal:** expose schema and relationship data over HTTP.

**Deliverables**

- A foreign-key relationship graph derived from the introspected model.
- JSON endpoints to list and open connections, list tables, retrieve a table's detail, and retrieve relationships.
- Request validation with a consistent error format.

**Tests**

- API tests for each endpoint, covering success, validation failure, and an unknown connection.
- Tests that relationships are represented correctly, including self-references and composite foreign keys.

**Done when:** the full structure of the fixture database can be retrieved through the API.

---

## Phase 4 — Frontend

**Goal:** a usable interface for connecting and browsing.

**Deliverables**

- A home screen showing recent and saved connections and a way to start a new one — a file picker for SQLite, a connection string or short form otherwise.
- Opening a SQLite file by dragging it onto the window.
- The three-pane layout, with a searchable, virtualised object navigator.
- A command palette for jumping to any object by name.
- Tabs for open objects.
- A table detail view with sub-views for overview, columns, keys and constraints, indexes, and relationships.
- Clickable foreign keys that navigate to the referenced table, browser-style back and forward navigation, and deep-linkable URLs.

**Tests**

- Component tests for the object navigator, the command palette, and the table detail view.
- An end-to-end test that opens the fixture database, searches for a table, opens it, follows a relationship, and navigates back.

**Done when:** a user can open the fixture database from the home screen and explore it from end to end in the browser.

---

## Phase 5 — Connection profiles and secret handling

**Goal:** make reconnecting effortless without storing secrets unsafely.

**Deliverables**

- Named connection profiles saved to a local configuration file, without passwords by default.
- An option to store a password in the operating system keychain.
- Support for referencing environment variables in connection fields.
- Per-connection preferences saved with the profile, including the data-profiling setting used in Phase 7.

**Tests**

- Unit tests for reading and writing profiles and for environment-variable substitution.
- A test that passwords are never written to the configuration file.
- Keychain interaction tested against a substitute implementation.

**Done when:** a user can save a connection, close the tool, reopen it, and reconnect — entering a password only if they chose not to store it.

---

## Phase 6 — Caching layer

**Goal:** make repeated browsing fast.

**Deliverables**

- A cache in the core package between the API and the adapters, keyed by connection and object.
- A refresh action in the interface that clears the cached metadata for a connection.
- TanStack Query configured on the client.

**Tests**

- Unit tests for cache hits, misses, and invalidation.
- A test confirming that a cached table-detail request is served without reaching the adapter.

**Done when:** reopening a table does not query the database again unless the user refreshes.

---

## Phase 7 — Table statistics and data profiling

**Goal:** show the shape of the data, safely.

**Deliverables**

- Metadata-only statistics for every table, read from the database's catalog without scanning data: an estimated row count, plus whatever column statistics the engine exposes. For SQLite this is minimal.
- Opt-in active profiling: an exact row count, sampled rows, value frequencies for low-cardinality columns, and histograms for numeric and date or time columns.
- A large-table guard that checks a table's estimated size before running any active query and, above a configurable threshold, shows only metadata statistics with a per-table option to profile anyway.
- A setting for active profiling that defaults to off for networked databases and on for local SQLite files, remembered per connection.
- Enforced limits on rows scanned and a query timeout.
- A data-sample sub-view on the table detail, labelled as a sample alongside the estimated total.

**Tests**

- Accuracy tests for active profiling against a fixture dataset with known distributions.
- A test that the large-table guard prevents active queries above the threshold.
- A test that active profiling respects the scan limit and the timeout.
- A test confirming that metadata-only statistics issue no queries that scan table contents.

**Done when:** every table shows metadata statistics immediately, and active profiling works within its limits when enabled.

---

## Phase 8 — Connection overview

**Goal:** help a user get their bearings in an unfamiliar database.

**Deliverables**

- An overview page for a connection showing object counts, the largest tables, tables without a primary key, and tables with no relationships.

**Tests**

- Tests for the overview queries against fixtures with known characteristics.
- A component test for the overview page.

**Done when:** opening a connection presents a meaningful summary before the user navigates into a specific table.

---

## Phase 9 — Standalone executables and first release

**Goal:** produce downloadable builds that run without any separate installation.

**Deliverables**

- A continuous-integration job that builds a standalone executable for each supported operating system and architecture and attaches them to a release.
- Documentation of how to download and run each one, including the operating-system security warnings to expect.
- A recorded decision on whether to sign and notarise the executables.

**Tests**

- An automated check that each built executable starts, serves the interface, and connects to a bundled SQLite fixture.

**Done when:** a user can download one file for their platform, run it, and explore a SQLite database without installing anything else.

---

## Phase 10 — PostgreSQL adapter

**Goal:** prove the architecture is genuinely reusable.

**Deliverables**

- A PostgreSQL adapter implementing the full adapter interface.
- Read-only enforcement through read-only transactions and a read-only session setting.
- Catalog statistics wired into the metadata-only tier.
- PostgreSQL connection configuration in the interface.

**Tests**

- The shared conformance suite run against PostgreSQL using Testcontainers, with a seeded schema equivalent to the SQLite fixture.
- A test that a write statement is rejected by the read-only transaction.
- Profiling accuracy tests against the seeded PostgreSQL data.

**Done when:** the conformance and profiling tests pass for both SQLite and PostgreSQL, and writes are refused.

---

## Phase 11 — MySQL, MariaDB, and SQL Server adapters

**Goal:** broaden coverage to the remaining common engines.

**Deliverables**

- A MySQL and MariaDB adapter and a SQL Server adapter.
- Read-only enforcement through read-only transactions for MySQL and MariaDB, and through read-only credentials plus the fixed query set for SQL Server, with the difference documented and surfaced to the user.
- Catalog statistics wired in where available.
- Any adjustments to the canonical model needed for dialect differences.

**Tests**

- The shared conformance suite run against both engines using Testcontainers.
- Read-only rejection tests for MySQL and MariaDB.

**Done when:** the conformance suite passes for all four databases.

---

## Phase 12 — Relationship diagram

**Goal:** let a user see how tables connect, not just follow links one at a time.

**Deliverables**

- A diagram that begins at the current table and lets the user expand neighbouring tables on demand, rather than rendering the whole schema at once.

**Tests**

- Component tests for expanding and collapsing nodes.
- An end-to-end test that opens a table, expands its neighbours, and follows an edge.

**Done when:** a user can start from any table and explore its surrounding relationships visually.

---

## Phase 13 — Additional object types and engine-specific sections

**Goal:** support objects beyond tables, gated by what each engine provides.

**Deliverables, introduced incrementally**

- Views, with their definitions where the engine exposes them.
- Stored procedures and functions, with their definitions.
- Triggers, with their definitions.
- Adapter-contributed sections for engine-specific features, such as installed extensions or assemblies.
- Interface sections that appear only when the connection's capabilities allow.

**Tests**

- Per-adapter tests for each object type, skipped automatically when the capability is absent.
- An end-to-end test confirming that unsupported sections are hidden for SQLite.

**Done when:** each supported object type and engine-specific section is shown for the databases that provide it and absent for those that do not.

---

## Phase 14 — Optional and conditional work

Items to consider once the core tool is established:

- An Oracle adapter, which requires Oracle client libraries.
- Read-only ad-hoc querying, routed through the same read-only safeguards.
- Wrapping the tool as a desktop application.

---

## Cross-cutting work

Throughout every phase:

- A security review precedes any phase that introduces credential storage, data profiling, or a new adapter's read-only enforcement.
- Per-database connection documentation is kept current, including the recommendation to connect with a read-only account.
- The shared conformance suite is the acceptance gate for every adapter.
