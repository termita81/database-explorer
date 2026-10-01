import { describe, expect, it } from 'vitest';
import { parseTarget } from '../src/target.js';
import { pathToFileURL } from 'node:url';
describe('CLI connection targets', () => {
  it.each([
    './data.db',
    '/tmp/data.db',
    'C:\\data\\sample.db',
    './has spaces.db',
  ])('accepts file path %s', (path) => {
    expect(parseTarget(path)).toEqual({
      adapterId: 'sqlite',
      config: { path },
    });
  });
  it('decodes local file and SQLite URLs', () => {
    const url = pathToFileURL('/tmp/sample file.db');
    expect(parseTarget(url.href)).toEqual({
      adapterId: 'sqlite',
      config: { path: '/tmp/sample file.db' },
    });
    expect(parseTarget('sqlite:///tmp/sample%20file.db')).toEqual({
      adapterId: 'sqlite',
      config: { path: '/tmp/sample file.db' },
    });
  });
  it.each([
    'postgresql',
    'postgres',
    'mysql',
    'mariadb',
    'mssql',
    'sqlserver',
    'oracle',
  ])('identifies %s connection strings', (scheme) => {
    expect(
      parseTarget(`${scheme}://user:secret@localhost/database`).config,
    ).toEqual({
      connectionString: `${scheme}://user:secret@localhost/database`,
    });
  });
  it.each([
    '',
    ' ',
    'https://example.com',
    'sqlite://remote/tmp/data.db',
    'sqlite:///tmp/data.db?mode=rw',
  ])('rejects invalid target %s', (target) => {
    expect(() => parseTarget(target)).toThrow();
  });
});
