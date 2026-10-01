import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  DatabaseConnection,
  SchemaRef,
  TableDetail,
} from '@db-explorer/core';

export interface AdapterConformanceOptions {
  name: string;
  openConnection: () => Promise<DatabaseConnection>;
  expectedSchemas: SchemaRef[];
  expectedTables: TableDetail[];
  // Each engine can supply its own types, index names, and supported index details.
  normalizeTable?: (table: TableDetail) => TableDetail;
  // The adapter doesn't expose arbitrary SQL. A driver-specific hook verifies write rejection.
  assertReadOnly?: () => Promise<void>;
}

export function defineAdapterConformanceSuite(
  options: AdapterConformanceOptions,
): void {
  const normalize = options.normalizeTable ?? ((table: TableDetail) => table);
  const sorted = <T extends { schema: string; name: string }>(items: T[]) =>
    [...items].sort((left, right) => {
      const a = `${left.schema}\0${left.name}`;
      const b = `${right.schema}\0${right.name}`;
      return a < b ? -1 : a > b ? 1 : 0;
    });

  describe(`${options.name} adapter conformance`, () => {
    let connection: DatabaseConnection;
    beforeEach(async () => {
      connection = await options.openConnection();
    });
    afterEach(async () => {
      await connection?.close();
    });

    it('opens and verifies a connection', async () => {
      await expect(connection.testConnection()).resolves.toBeUndefined();
      expect(connection.capabilities.readOnlyEnforcement).toBeDefined();
    });
    it('lists the canonical schemas', async () => {
      expect(await connection.listSchemas()).toEqual(options.expectedSchemas);
    });
    it('lists exactly the fixture tables', async (context) => {
      if (!connection.capabilities.introspection) {
        context.skip();
        return;
      }
      expect(sorted(await connection.listTables())).toEqual(
        sorted(
          options.expectedTables.map(({ schema, name, kind }) => ({
            schema,
            name,
            kind,
          })),
        ),
      );
      for (const schema of options.expectedSchemas) {
        expect(sorted(await connection.listTables(schema))).toEqual(
          sorted(
            options.expectedTables
              .filter((table) => table.schema === schema.name)
              .map(({ schema, name, kind }) => ({ schema, name, kind })),
          ),
        );
      }
    });
    for (const expected of options.expectedTables) {
      it(`introspects ${expected.schema}.${expected.name}`, async (context) => {
        if (!connection.capabilities.introspection) {
          context.skip();
          return;
        }
        expect(normalize(await connection.getTable(expected))).toEqual(
          normalize(expected),
        );
      });
    }
    it('returns stable metadata across repeated reads', async (context) => {
      if (!connection.capabilities.introspection) {
        context.skip();
        return;
      }
      expect(await connection.listTables()).toEqual(
        await connection.listTables(),
      );
      for (const table of options.expectedTables) {
        expect(await connection.getTable(table)).toEqual(
          await connection.getTable(table),
        );
      }
    });
    it('rejects an unknown table', async (context) => {
      if (!connection.capabilities.introspection) {
        context.skip();
        return;
      }
      await expect(
        connection.getTable({
          schema: options.expectedSchemas[0]!.name,
          name: '__missing_conformance_table__',
        }),
      ).rejects.toThrow();
    });
    it('rejects writes when the adapter declares engine or driver enforcement', async (context) => {
      if (connection.capabilities.readOnlyEnforcement === 'credentials') {
        context.skip();
        return;
      }
      if (!options.assertReadOnly)
        throw new Error(
          'Supply assertReadOnly for adapters declaring read-only enforcement.',
        );
      await options.assertReadOnly();
    });
    it('closes idempotently and rejects use after closing', async () => {
      await connection.close();
      await connection.close();
      await expect(connection.testConnection()).rejects.toThrow();
      if (connection.capabilities.introspection) {
        await expect(connection.listTables()).rejects.toThrow();
        for (const table of options.expectedTables)
          await expect(connection.getTable(table)).rejects.toThrow();
      }
    });
  });
}
