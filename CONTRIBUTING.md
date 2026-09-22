
## Prerequisites

- Node.js, current LTS release.
- pnpm, installed through Corepack. Run `corepack enable` once; the correct pnpm version is pinned in the repository.
- For the integration tests that use real databases, a container runtime (see below). This is not needed to work on SQLite support.

## Getting started

```
git clone <repository>
cd db-explorer
pnpm install
```

## Running the application in development

```
pnpm dev
```

This starts the server and the interface with live reloading. To open a database immediately, pass a file path or a connection string:

```
pnpm dev -- ./path/to/database.db
```

## Running tests

```
pnpm test             # unit and integration tests
pnpm test:e2e          # end-to-end tests
pnpm test:adapters     # adapter conformance tests, including those that need a container runtime
```

SQLite tests use a fixture file in the repository and need no container runtime.

## Container runtime for integration tests

The adapter conformance tests for PostgreSQL, MySQL and MariaDB, and SQL Server start a throwaway database in a container. Any Docker-compatible runtime works:

- On Linux, install Docker Engine or Podman from your package manager.
- On macOS, Podman Desktop, Colima, and Rancher Desktop are free options. Docker Desktop and OrbStack are alternatives with their own licensing terms.
- On Windows, Podman Desktop or Rancher Desktop work, as does Docker Engine inside WSL2.

Continuous integration already has a runtime available, so this setup is only needed to run these tests locally. If you use Podman, the test runner may need a couple of environment variables to locate its socket; see its documentation.

## Project layout

See the package layout in `tech-stack.md`. In short: a database-agnostic core, one package per database adapter, a shared conformance test kit, the server, and the Vue interface.

## Code style

- TypeScript throughout.
- ESLint and Prettier are enforced in continuous integration. Run `pnpm lint` before opening a pull request.
