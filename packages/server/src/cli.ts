#!/usr/bin/env node
import { parseArgs } from 'node:util';
import open from 'open';
import { startApplication } from './app.js';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'no-browser': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(
      'Usage: db-explorer [--no-browser] [file-or-connection-string]',
    );
    console.log(
      'Supports SQLite paths, file: URLs, and sqlite:///absolute/path.db.',
    );
    return;
  }
  if (positionals.length > 1)
    throw new Error('Expected at most one database path or connection string.');
  const { app, connections, url } = await startApplication(positionals[0]);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void app.close().catch(() => {
      console.error('Failed to close DB Explorer.');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log(`DB Explorer ready at ${url}`);
  if (connections.list().length) console.log('SQLite connection is read-only.');
  if (!values['no-browser']) {
    try {
      await open(url);
    } catch {
      console.error(`Could not open the browser. Open ${url} manually.`);
    }
  }
}
main().catch((error: unknown) => {
  // Connection strings may contain secrets; never echo connection URLs in startup errors.
  const message =
    error instanceof Error && !error.message.includes('://')
      ? error.message
      : 'Unable to start DB Explorer. Check the database path or connection settings.';
  console.error(`DB Explorer: ${message}`);
  process.exitCode = 1;
});
