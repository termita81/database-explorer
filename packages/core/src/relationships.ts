import type { Relationship, TableDetail } from './index.js';

/** Each foreign key is one directed edge, including composite keys and self-references. */
export function buildRelationshipGraph(
  tables: readonly TableDetail[],
): Relationship[] {
  const relationships = tables.flatMap((table) =>
    table.foreignKeys.map((foreignKey) => ({
      from: { schema: table.schema, name: table.name },
      to: foreignKey.referencedTable,
      foreignKey,
    })),
  );
  const key = (relationship: Relationship) =>
    JSON.stringify([
      relationship.from.schema,
      relationship.from.name,
      relationship.to.schema,
      relationship.to.name,
      relationship.foreignKey.columns,
      relationship.foreignKey.referencedColumns,
      relationship.foreignKey.name ?? '',
    ]);
  return relationships.sort((left, right) => {
    const a = key(left);
    const b = key(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}
