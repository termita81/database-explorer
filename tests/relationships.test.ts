import { describe, expect, it } from 'vitest';
import {
  buildRelationshipGraph,
  type ForeignKey,
  type TableDetail,
} from '../packages/core/src/index.js';

function table(
  name: string,
  foreignKeys: ForeignKey[] = [],
  schema = 'main',
): TableDetail {
  return {
    schema,
    name,
    kind: 'table',
    columns: [],
    primaryKey: null,
    foreignKeys,
    uniqueConstraints: [],
    checkConstraints: [],
    indexes: [],
  };
}
const key = (
  columns: string[],
  name: string,
  referencedColumns: (string | null)[],
  schema = 'main',
): ForeignKey => ({
  columns,
  referencedTable: { schema, name },
  referencedColumns,
});

describe('Foreign-key relationship graph', () => {
  it('returns no edges for tables without foreign keys', () => {
    expect(buildRelationshipGraph([])).toEqual([]);
    expect(buildRelationshipGraph([table('isolated')])).toEqual([]);
  });
  it('preserves composite keys as a single directed edge', () => {
    const foreignKey = key(['tenant', 'project'], 'projects', [
      'tenant_id',
      'id',
    ]);
    expect(
      buildRelationshipGraph([
        table('memberships', [foreignKey]),
        table('projects'),
      ]),
    ).toEqual([
      {
        from: { schema: 'main', name: 'memberships' },
        to: { schema: 'main', name: 'projects' },
        foreignKey,
      },
    ]);
  });
  it('retains self-references, cycles, and separate edges between the same tables', () => {
    const self = key(['manager'], 'people', ['id']);
    const first = { ...key(['created_by'], 'people', ['id']), name: 'creator' };
    const second = {
      ...key(['reviewed_by'], 'people', ['id']),
      name: 'reviewer',
    };
    const reverse = key(['current_task'], 'tasks', ['id']);
    const edges = buildRelationshipGraph([
      table('tasks', [first, second]),
      table('people', [self, reverse]),
    ]);
    expect(edges).toHaveLength(4);
    expect(edges).toContainEqual({
      from: { schema: 'main', name: 'people' },
      to: { schema: 'main', name: 'people' },
      foreignKey: self,
    });
    expect(
      edges
        .filter((edge) => edge.from.name === 'tasks')
        .map((edge) => edge.foreignKey.name),
    ).toEqual(['creator', 'reviewer']);
  });
  it('preserves cross-schema and unresolved targets and sorts without changing its input', () => {
    const missing = key(['parent'], 'missing', [null], 'external');
    const tables = [
      table('z', [missing]),
      table('a', [key(['parent'], 'z', ['id'])]),
    ];
    const before = structuredClone(tables);
    const edges = buildRelationshipGraph(tables);
    expect(edges).toEqual(buildRelationshipGraph([...tables].reverse()));
    expect(edges[1]).toEqual({
      from: { schema: 'main', name: 'z' },
      to: { schema: 'external', name: 'missing' },
      foreignKey: missing,
    });
    expect(tables).toEqual(before);
  });
});
