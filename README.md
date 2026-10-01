# DB Explorer

A local, read-only database explorer. Phases 1 and 2 implement the core adapter
contract, SQLite connections, command-line startup, and schema introspection.
The browser currently shows a startup screen; the JSON API and browsing interface
are planned for subsequent phases.

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

## SQLite introspection

The SQLite adapter lists tables and returns their columns, defaults, primary and
foreign keys, UNIQUE and CHECK constraints, and indexes. Composite keys retain
their column order; named constraints, generated columns, expression indexes,
and partial-index conditions are preserved. Views and SQLite's internal tables
are excluded from the table list.

After building, you can inspect a table directly through the adapter:

```sh
node --input-type=module <<'JS'
import { sqliteAdapter } from './packages/adapter-sqlite/dist/index.js';
const connection = await sqliteAdapter.connect({ path: './tests/fixtures/sample.db' });
try {
  console.log(await connection.listTables());
  console.dir(await connection.getTable({ schema: 'main', name: 'memberships' }), { depth: null });
} finally {
  await connection.close();
}
JS
```

## Develop

```sh
pnpm test
pnpm test:adapters
pnpm typecheck
pnpm format:check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the package layout and
[specs/roadmap.md](specs/roadmap.md) for subsequent phases. Standalone executables
are planned for Phase 9; the current build requires Node.js and installed dependencies.
