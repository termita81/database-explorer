import { resolve } from 'node:path';
import { z } from 'zod';
import {
  UnsupportedOperationError,
  type Capabilities,
  type DatabaseAdapter,
  type DatabaseConnection,
} from '@db-explorer/core';
import { openReadOnlyDatabase } from './database.js';
import { getTable, listTables } from './introspection.js';

export const sqliteCapabilities: Capabilities = Object.freeze({
  schemas: false,
  objectTypes: Object.freeze(['table', 'view', 'index', 'trigger'] as const),
  introspection: true,
  estimatedRowCount: false,
  cheapExactRowCount: false,
  columnHistograms: false,
  activeProfiling: false,
  rowSampling: false,
  readOnlyEnforcement: 'driver',
  extraSections: Object.freeze([]),
});
const configSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .refine((path) => path.trim().length > 0, 'Path must not be blank'),
  })
  .strict();

export const sqliteAdapter: DatabaseAdapter = {
  id: 'sqlite',
  staticCapabilities: sqliteCapabilities,
  async connect(config): Promise<DatabaseConnection> {
    const { path } = configSchema.parse(config);
    if (path === ':memory:')
      throw new Error('SQLite requires an existing database file.');
    const database = openReadOnlyDatabase(resolve(path));
    const assertOpen = () => {
      if (!database.open) throw new Error('Connection is closed.');
    };
    const unavailable = async (operation: string): Promise<never> => {
      assertOpen();
      throw new UnsupportedOperationError(operation);
    };
    return {
      capabilities: sqliteCapabilities,
      async testConnection() {
        assertOpen();
        database.prepare('SELECT count(*) FROM sqlite_schema').get();
      },
      async listSchemas() {
        assertOpen();
        return [{ name: 'main' }];
      },
      async listTables(schema) {
        assertOpen();
        return listTables(database, schema);
      },
      async getTable(ref) {
        assertOpen();
        return getTable(database, ref);
      },
      listRelationships: () => unavailable('Relationships'),
      getTableMetadataStats: () => unavailable('Metadata statistics'),
      profileTable: () => unavailable('Active profiling'),
      sampleRows: () => unavailable('Row sampling'),
      async close() {
        if (database.open) database.close();
      },
    };
  },
};
