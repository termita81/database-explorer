# DB Explorer

A local, read-only database explorer. Phases 1–5 implement SQLite connections, schema introspection, relationship
graphs, persistent connection profiles, a validated JSON API, and a Vue browser
interface for exploring tables.

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

## Browser interface

Open a live connection from the home screen, choose a SQLite file, drop it anywhere,
or enter a path on the server's filesystem. File uploads open a temporary read-only
copy (up to 100 MB), removed when the connection closes or the server shuts down.

Search the virtualized navigator or press Cmd/Ctrl+K to find tables. Object tabs
show overview, columns, keys and constraints, indexes, and relationships. Click
foreign-key targets to navigate; browser back/forward and table deep links work
while the server connection remains open.

Recent names and paths use browser localStorage for the current origin. Imported
files must be selected again. Saved connection profiles live on disk and survive
server restarts and port changes. Existing browser-saved connections can be moved
to the profile file with **Import browser profiles** on the home screen.

## Saved profiles

Enter a local SQLite path, enable **Save connection profile**, and connect. Saved
profiles can be reopened, renamed, edited, or removed from the home screen.
The active-profiling preference is saved with each profile and applied on its next
connection; profiling itself arrives in Phase 7. Its default is on for SQLite and
off for network databases.

The configuration file is `profiles.json` in the OS configuration directory:

- macOS: `~/Library/Preferences/db-explorer/`
- Linux: `$XDG_CONFIG_HOME/db-explorer/` or `~/.config/db-explorer/`
- Windows: `%APPDATA%\db-explorer\Config\`

Literal relative paths are anchored when saved. Connection fields support
`${VARIABLE}` references to the server process's environment. For example, start
with `DATABASE_PATH=/absolute/path/sample.db pnpm dev`, then save `${DATABASE_PATH}`
as the database path. References stay unresolved in the file and are expanded on
each reconnect. An unset variable produces an actionable error. Port and SSL
references must resolve to a valid port number and `true` or `false`, respectively.

The profile API accepts separate connection fields, never credential-bearing
connection strings. Literal passwords belong in a transient top-level `password`
field. By default they are not saved; use `credential: "prompt"` to enter a password
on each reconnect, `credential: "keychain"` to explicitly store it in the OS keychain,
or `config.password: "${DB_PASSWORD}"` to read it from the environment. Keychain
entries and resolved environment values are never returned by the API or written
to the configuration file. Linux uses a persistent Secret Service provider; a
locked or unavailable keychain produces an error and permits a transient password
at reconnect. SQLite needs no password; network adapters are still planned for
later phases.

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
  console.dir(await connection.listRelationships(), { depth: null });
  console.dir(await connection.getTable({ schema: 'main', name: 'memberships' }), { depth: null });
} finally {
  await connection.close();
}
JS
```

## JSON API

The API is served at the URL printed by the CLI. A database opened on the command
line appears in `GET /api/connections`. Connection responses contain an ID,
adapter ID, capabilities, and an optional display label; they never contain configuration or credentials.

| Method | Path                                     | Result                     |
| ------ | ---------------------------------------- | -------------------------- |
| GET    | `/api/connections`                       | Open connections           |
| POST   | `/api/connections`                       | Open a connection (201)    |
| POST   | `/api/connections/upload?name=sample.db` | Upload a SQLite copy (201) |
| GET    | `/api/connections/:id`                   | Connection metadata        |
| DELETE | `/api/connections/:id`                   | Close a connection (204)   |
| GET    | `/api/connections/:id/schemas`           | Schema names               |
| GET    | `/api/connections/:id/tables`            | Table summaries            |
| GET    | `/api/connections/:id/tables/:tableName` | Full table detail          |
| GET    | `/api/connections/:id/relationships`     | Directed foreign-key edges |

Uploads use an `application/octet-stream` body containing the database bytes.

Saved profiles have their own routes:

| Method | Path                        | Result                                  |
| ------ | --------------------------- | --------------------------------------- |
| GET    | `/api/profiles`             | Saved profiles                          |
| POST   | `/api/profiles`             | Save a profile (201)                    |
| GET    | `/api/profiles/:id`         | Profile fields and preferences          |
| PUT    | `/api/profiles/:id`         | Replace editable profile fields         |
| DELETE | `/api/profiles/:id`         | Remove profile and keychain entry (204) |
| POST   | `/api/profiles/:id/connect` | Open a saved profile (201)              |

For example, POST a profile with
`{"name":"Sample","adapterId":"sqlite","config":{"path":"${DATABASE_PATH}"},"preferences":{"activeProfiling":false}}`.
The connect route accepts `{}` or a transient `{"password":"..."}` for a password
profile. A missing prompted password returns `409 PASSWORD_REQUIRED`; an
unavailable keychain or profile file returns 503. Connecting returns only connection
metadata, including the profile ID and preferences.

Table and relationship routes accept `?schema=main`. Without that filter, table
and relationship lists cover the connection. Table detail can omit the schema
only when the connection exposes a single schema. URL-encode table names and
schema query values.

For example, replace the URL below with the printed URL:

```sh
DB_EXPLORER_URL='http://127.0.0.1:12345'
curl "$DB_EXPLORER_URL/api/connections"
curl -X POST "$DB_EXPLORER_URL/api/connections" \
  -H 'Content-Type: application/json' \
  -d '{"adapterId":"sqlite","config":{"path":"./tests/fixtures/sample.db"}}'
```

Use the returned ID in subsequent requests. Each relationship contains `from`,
`to`, and `foreignKey`; a composite key produces one edge with ordered column
arrays, and a self-reference has the same source and destination.

Errors share the shape below (validation errors also include field details):

```json
{
  "error": { "code": "CONNECTION_NOT_FOUND", "message": "Unknown connection." }
}
```

Invalid requests return 400, unavailable connections or objects return 404,
failed database opens return 422, unsupported operations return 501, and
unexpected failures return 500 with a generic message. Oversized bodies return
413 and overly long path parameters return 414. Browser requests must
come from the same origin, and requests must use a loopback Host header.

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
