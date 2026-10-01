# DB Explorer

A local, read-only database explorer. Phase 1 implements the core adapter contract,
SQLite connection lifecycle, and command-line startup. Schema introspection and
browsing are planned for later phases; the browser currently shows a startup screen.

## Run

Requires Node.js 22.12 or newer and pnpm 10.34.6. Enable pnpm with Corepack
(`corepack enable`) or install that pnpm version separately.

```sh
pnpm install
pnpm dev ./tests/fixtures/sample.db
```

The command opens your browser at a random port on `127.0.0.1`. Without a database
argument it opens the home screen. Press Ctrl+C to close the server and its database
connections. Use `--no-browser` in a headless environment.

```sh
pnpm dev --no-browser ./tests/fixtures/sample.db
pnpm build
pnpm start --no-browser sqlite:///absolute/path/to/database.db
pnpm start
```

SQLite accepts an existing file path, a `file:` URL, or a
`sqlite:///absolute/path.db` URL. Paths containing spaces should be quoted. Files
are opened read-only and never created automatically. PostgreSQL, MySQL/MariaDB,
SQL Server, and Oracle connection strings are recognized, but their adapters are
not available yet; startup reports an error without printing credentials.

## Develop

```sh
pnpm test
pnpm typecheck
pnpm format:check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the package layout and
[specs/roadmap.md](specs/roadmap.md) for subsequent phases. Standalone executables
are planned for Phase 9; the current build requires Node.js and installed dependencies.
