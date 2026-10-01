import { expect } from 'vitest';
import { defineAdapterConformanceSuite } from '@db-explorer/adapter-testkit';
import { sqliteAdapter } from '../src/index.js';
import { openReadOnlyDatabase } from '../src/database.js';
import { expectedTables, fixturePath } from './fixture.js';

defineAdapterConformanceSuite({
  name: 'SQLite',
  openConnection: () => sqliteAdapter.connect({ path: fixturePath }),
  expectedSchemas: [{ name: 'main' }],
  expectedTables,
  async assertReadOnly() {
    const database = openReadOnlyDatabase(fixturePath);
    try {
      database.pragma('query_only = OFF');
      expect(() =>
        database.prepare("INSERT INTO teams (name) VALUES ('Forbidden')").run(),
      ).toThrow(/readonly/i);
      expect(() => database.exec('DROP TABLE people')).toThrow(/readonly/i);
    } finally {
      database.close();
    }
  },
});
