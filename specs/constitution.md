
## Name

DB Explorer (`db-explorer`).

## Purpose

DB Explorer helps people understand databases they have access to — their structure, the relationships between objects, and the shape of the data inside them. It is a tool for exploration and comprehension, not for editing data or administering a server.

## Vision

Run one command, point DB Explorer at a database, and within seconds see every table, how the tables relate, and roughly what each one contains. Click a foreign key and follow it. The experience is the same whether the database is a SQLite file on a laptop or PostgreSQL in production.

## Principles

1. **Read-only and safe by default.** DB Explorer assumes it may be pointed at production. It never issues statements that change data or structure.
2. **Low friction.** Nothing is required to get started except the database you want to look at — no accounts, no configuration files to write by hand.
3. **Agnostic core, specific adapters.** All database-specific logic lives behind a single adapter interface. The rest of the system knows only a canonical model.
4. **Capability-driven.** Each adapter declares what it supports. The interface shows a feature only when the current connection supports it.
5. **Safe with data.** Structural information is always available. Reading actual table contents — counts, samples, histograms — is bounded and, for networked databases, opt-in.
6. **Simple and fast interface.** Few screens, browser-like navigation, interactions that feel immediate.
7. **Cache aggressively, invalidate explicitly.** Schema metadata changes rarely; it is cached, and the user has a clear manual refresh.
8. **Modular.** Adding support for a database means adding a package, not editing the core.
9. **Tested where it matters.** The adapter contract, introspection correctness, and the API are covered by automated tests. One shared suite verifies every adapter.
10. **Honest about uncertainty.** Estimated counts and sampled statistics are always labelled as estimates.

## Scope

The first version covers:

- Starting from the command line (`db-explorer [file-or-connection-string]`) or from a home screen.
- Saved and recent connections, with credentials stored only when the user opts in.
- Browsing tables and viewing their columns, primary keys, foreign keys, unique and check constraints, and indexes.
- Seeing relationships between tables and following them, both as inline links and as an on-demand diagram.
- Metadata-only statistics for every table, drawn from the database's own catalog.
- Optional active data profiling — exact counts, sampled rows, value frequencies, and histograms — protected by a large-table guard.
- Search, filtering, and a command palette for navigating large schemas.
- SQLite as the first supported database, followed by PostgreSQL, MySQL and MariaDB, and SQL Server.

## Non-goals

- Not a SQL query editor or development environment. Read-only ad-hoc querying may be considered much later; it is a low priority.
- Not a data editor.
- Not a schema migration or comparison tool.
- Not a monitoring or server-administration tool.

## Architecture tenets

- A canonical schema model that is independent of any driver.
- A single adapter interface; each database is its own package.
- A stable JSON API between the backend and the frontend; the frontend has no knowledge of any specific database.
- A caching layer that sits between the API and the adapters.
- Adapters may contribute additional, loosely structured sections for engine-specific features, which the interface can display without understanding their meaning.

## Security tenets

- Connect with the least privilege necessary. The tool documents and encourages the use of read-only credentials.
- Read-only behaviour is enforced in up to three layers: the connecting account's privileges; the database engine's own read-only session or transaction mode, where one exists; and a fixed set of reviewed queries, since no user-supplied SQL is executed in the first version.
- The local server listens only on the loopback interface, on a random port, and is reached through a URL that DB Explorer prints or opens itself.
- Saved connection details are kept in a local configuration file. Passwords are stored only in the operating system's keychain, and only when the user asks for that.
- Data profiling is bounded by a configurable size threshold and a query timeout, and is opt-in for networked databases.

## Quality bar

- Important features are covered by automated tests.
- The shared adapter conformance suite passes for every adapter.
- Continuous integration must pass before any change is merged.

## Key decisions

- The tool is named DB Explorer.
- It is written in TypeScript.
- It is distributed as standalone executables built in continuous integration; it is not published to a package registry.
- It is strictly read-only and executes no user-supplied SQL in the first version.
- Table statistics are provided in two tiers: metadata-only statistics that never read table contents, and opt-in active profiling that does.
- Active profiling defaults to off for networked databases and on for local SQLite files, and the choice is remembered per connection.
- The frontend is built with Vue.