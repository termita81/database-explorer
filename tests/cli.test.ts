import { describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(
  new URL('../packages/server/dist/cli.js', import.meta.url),
);
const fixture = fileURLToPath(new URL('./fixtures/sample.db', import.meta.url));

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}
async function launch(args: string[]) {
  const child = spawn(process.execPath, [cli, '--no-browser', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stdout!.setEncoding('utf8');
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (text) => {
    errors += text;
  });
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('CLI startup timed out')),
      10000,
    );
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`CLI exited (${code}): ${errors}`));
    });
    child.stdout!.on('data', (text) => {
      output += text;
      const match = /DB Explorer ready at (http:\/\/127\.0\.0\.1:\d+)/.exec(
        output,
      );
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
  }).catch(async (error) => {
    await stop(child);
    throw error;
  });
  return { child, url };
}
describe('Built CLI', () => {
  it.each(
    [
      [fixture],
      [],
      [new URL(`file://${fixture}`).href],
      [`sqlite://${fixture}`],
    ].map((args) => ({ args })),
  )('starts with args %j and shuts down gracefully', async ({ args }) => {
    const { child, url } = await launch(args);
    try {
      const response = await fetch(url);
      expect(response.ok).toBe(true);
      expect(await response.text()).toContain('id="app"');
      const connections = await (await fetch(`${url}/api/connections`)).json();
      expect(connections).toHaveLength(args.length ? 1 : 0);
    } finally {
      await stop(child);
    }
    expect(child.exitCode).toBe(0);
  });
  it.each(
    [
      ['/nonexistent/db-explorer/missing.db'],
      ['postgres://user:topsecret@localhost/db'],
      ['--unknown'],
      [fixture, fixture],
    ].map((args) => ({ args })),
  )(
    'reports startup errors without a ready URL or credentials: %j',
    async ({ args }) => {
      const child = spawn(process.execPath, [cli, '--no-browser', ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      let errors = '';
      child.stdout!.on('data', (text) => {
        output += text;
      });
      child.stderr!.on('data', (text) => {
        errors += text;
      });
      const [code] = await once(child, 'exit');
      expect(code).toBe(1);
      expect(errors).toContain('DB Explorer:');
      expect(errors).not.toContain('topsecret');
      expect(output).not.toContain('ready at');
    },
  );
});
