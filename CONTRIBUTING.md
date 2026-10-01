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
- `packages/adapter-sqlite`: validated file configuration and read-only SQLite lifecycle.
- `packages/server`: connection manager, Fastify startup screen, and CLI.

The web interface, shared adapter conformance kit, and other database adapters
will be added in later phases. SQLite's introspection, statistics, and profiling
methods currently reject with `UnsupportedOperationError`; capability flags
indicate those features are unavailable. `objectTypes` describes engine object
kinds, while `introspection` indicates whether browsing is implemented.

## Checks

```sh
pnpm build
pnpm test
pnpm typecheck
pnpm format:check
```

Tests cover connection lifecycle, invalid configurations, write rejection by the
real SQLite driver, target parsing, HTTP startup, and the built CLI's startup and
shutdown. They need no container runtime. The CLI tests use `--no-browser` so they
do not launch desktop applications.

`tests/fixtures/sample.db` is a small committed SQLite database.
`tests/fixtures/sample.sql` is its source schema and seed data. To regenerate it,
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
