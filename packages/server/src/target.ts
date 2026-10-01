import { fileURLToPath } from 'node:url';
export interface ConnectionTarget {
  adapterId: string;
  config: unknown;
}
export function parseTarget(target: string): ConnectionTarget {
  if (!target.trim())
    throw new Error('Provide a database file path or connection string.');
  if (target.startsWith('file:'))
    return { adapterId: 'sqlite', config: { path: fileURLToPath(target) } };
  if (target.startsWith('sqlite:')) {
    const url = new URL(target);
    if (
      (url.hostname && url.hostname !== 'localhost') ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'Use sqlite:///absolute/path.db without a remote host, query, or fragment.',
      );
    }
    return {
      adapterId: 'sqlite',
      config: {
        path: fileURLToPath(new URL(`file://${url.host}${url.pathname}`)),
      },
    };
  }
  const match = /^([a-z][a-z0-9+.-]*):\/\//i.exec(target);
  if (match) {
    const scheme = match[1]!.toLowerCase();
    const adapterId = (
      {
        postgres: 'postgres',
        postgresql: 'postgres',
        mysql: 'mysql',
        mariadb: 'mysql',
        mssql: 'mssql',
        sqlserver: 'mssql',
        oracle: 'oracle',
      } as Record<string, string>
    )[scheme];
    if (!adapterId)
      throw new Error('Unsupported database connection-string scheme.');
    return { adapterId, config: { connectionString: target } };
  }
  return { adapterId: 'sqlite', config: { path: target } };
}
