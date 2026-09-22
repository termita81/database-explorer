
## Overview

DB Explorer is a local web application: a Node.js process serves a JSON API and a pre-built single-page interface, and the user interacts with it through a browser on their own machine. The codebase is a monorepo of small packages — a database-agnostic core, one package per database adapter, a shared test kit, the server, and the web interface.

## Runtime and language

| Choice | Why |
|---|---|
| Node.js (current LTS) | Mature ecosystem of database drivers. |
| TypeScript | Typed adapter interfaces catch contract mistakes at compile time, which matters for a plugin-style architecture. |

## Monorepo and package management

| Choice | Why |
|---|---|
| pnpm workspaces | First-class monorepo support, with strict dependency resolution that prevents a package from using something it did not declare. |
| Corepack | Ships with Node; pins an exact pnpm version for everyone without a separate global install. |

The package layout:

```
packages/
  core/             canonical model, adapter interface, caching layer
  adapter-sqlite/
  adapter-postgres/
  adapter-mysql/
  adapter-mssql/
  adapter-oracle/
  adapter-testkit/   shared conformance suite run against every adapter
  server/            Fastify app, JSON API, command-line entry point
  web/               Vue single-page interface
```

Only `server` and `web` contribute to the shipped artifact. The other packages are internal and are marked private so they are never published by accident. The PostgreSQL, MySQL, SQL Server, and Oracle adapter packages are created in later phases — see the roadmap.

## Backend

| Choice | Why |
|---|---|
| Fastify | Fast, and its plugin model maps cleanly onto \"adapters as modules\". |
| Zod | Runtime validation of API requests and connection configuration, with types derived from the same definitions. |
| pino | Low-overhead structured logging. |
| env-paths | Resolves the correct per-operating-system directory for the connection configuration file. |
| @napi-rs/keyring | Maintained, prebuilt access to the operating system keychain for storing passwords. |
| Node's built-in argument parser | The command-line needs are simple; no separate dependency is warranted. |
| open | Launches the user's default browser at the local URL on startup. |

## Database drivers

| Database | Driver | Notes |
|---|---|---|
| SQLite | better-sqlite3 | Synchronous, fast, ships prebuilt binaries. Opened in read-only mode. |
| PostgreSQL | pg | The de facto standard driver; also honours native environment configuration. |
| MySQL and MariaDB | mariadb | Vendor-maintained. |
| SQL Server | mssql | The standard choice on Node. |
| Oracle | oracledb | Official driver; may require Oracle client libraries. Deferred to a late phase. |

## Frontend

| Choice | Why |
|---|---|
| Vue 3 (Composition API, `<script setup>`) | Mature and stable, with the largest ecosystem of the lighter frameworks and the most consistent support from tooling and documentation. |
| Vite | Fast development server and build. |
| Vue Router | Enables browser-style navigation and deep-linkable views. |
| Pinia | Holds the small amount of global interface state — open tabs, the active connection, preferences. Data returned by the database is not kept here. |
| TanStack Query | Request deduplication and client-side caching, complementing the server-side cache. |
| TanStack Virtual | Smooth scrolling for lists of thousands of objects. |
| TanStack Table | Powers the data-dense grids, such as sampled rows. |
| Vue Flow | Draggable nodes and edges for the relationship diagram. |
| Naive UI | The component library: TypeScript-first, tree-shakeable, with adequate data components. |

PrimeVue is a reasonable alternative to Naive UI if a richer out-of-the-box data grid becomes important; it is heavier. A headless approach with Tailwind CSS was considered and set aside, because it front-loads significant design work.

## Testing

| Layer | Tool | Notes |
|---|---|---|
| Unit and integration tests | Vitest | Shares configuration with the frontend build. |
| API tests | Vitest with Fastify's injection helper | Exercises the HTTP layer without opening a network port. |
| Real-database tests | Testcontainers | Starts a throwaway PostgreSQL, MySQL, or SQL Server instance in a container for the duration of the test. |
| End-to-end tests | Playwright | Drives the real interface against a seeded database. |

SQLite tests use a small database file committed to the repository and do not need a container.

## Tooling

| Choice | Why |
|---|---|
| ESLint and Prettier | Consistent style and static checks. |
| GitHub Actions | Runs linting and tests on every change, and builds release executables. |

## Distribution

DB Explorer is distributed as a standalone executable — one file per operating system and processor architecture — built by continuous integration and attached to each release. A user downloads the file for their platform and runs it; no separate runtime needs to be installed.

Each executable contains a JavaScript runtime, the server code, the database drivers (including any native components for that platform), and the pre-built interface. Expect roughly 35–55 MB to download and 80–130 MB on disk per platform.

Executables are not signed initially, so operating systems will show a warning the first time one is run.

## Choices deliberately deferred

- Whether to sign and notarise the executables.
- Whether to later wrap the tool as a desktop application.
- Whether to move the runtime to Bun, which would remove the need to bundle a native SQLite component but would require verifying every database driver against it.