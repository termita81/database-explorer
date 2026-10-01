import Database from 'better-sqlite3';

// This helper stays internal: consumers cannot execute arbitrary SQL via the adapter.
export function openReadOnlyDatabase(path: string): Database.Database {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    database.pragma('query_only = ON');
    // Reading the schema catches existing files that are not valid SQLite databases.
    database.prepare('SELECT count(*) FROM sqlite_schema').get();
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
