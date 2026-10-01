export interface Database {
  name: string;
  schemas: SchemaRef[];
}
export interface SchemaRef {
  name: string;
}
export interface TableRef {
  schema: string;
  name: string;
}
export interface TableSummary extends TableRef {
  kind: 'table' | 'view' | 'materializedView';
}
export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}
export interface PrimaryKey {
  name?: string;
  columns: string[];
}
export interface ForeignKey {
  name?: string;
  columns: string[];
  referencedTable: TableRef;
  referencedColumns: string[];
}
export interface UniqueConstraint {
  name?: string;
  columns: string[];
}
export interface CheckConstraint {
  name?: string;
  expression: string;
}
export interface Index {
  name: string;
  columns: string[];
  unique: boolean;
}
export interface TableDetail extends TableSummary {
  columns: Column[];
  primaryKey: PrimaryKey | null;
  foreignKeys: ForeignKey[];
  uniqueConstraints: UniqueConstraint[];
  checkConstraints: CheckConstraint[];
  indexes: Index[];
}
export interface Relationship {
  from: TableRef;
  to: TableRef;
  foreignKey: ForeignKey;
}
export type ObjectType =
  | 'table'
  | 'view'
  | 'materializedView'
  | 'procedure'
  | 'function'
  | 'trigger'
  | 'index';
export interface Capabilities {
  schemas: boolean;
  objectTypes: readonly ObjectType[];
  introspection: boolean;
  estimatedRowCount: boolean;
  cheapExactRowCount: boolean;
  columnHistograms: boolean;
  activeProfiling: boolean;
  rowSampling: boolean;
  readOnlyEnforcement: 'driver' | 'session' | 'transaction' | 'credentials';
  extraSections: readonly string[];
}
export interface Statistic<T> {
  value: T;
  estimated: boolean;
}
export interface ColumnStatistics {
  column: string;
  nullFraction?: Statistic<number>;
  distinctCount?: Statistic<number>;
  frequencies?: { value: unknown; count: Statistic<number> }[];
  histogram?: { lower: unknown; upper: unknown; count: Statistic<number> }[];
}
export interface TableMetadataStats {
  rowCount: Statistic<number> | null;
  columns: ColumnStatistics[];
}
export interface ProfileOptions {
  maxRowsScanned: number;
  timeoutMs: number;
}
export interface RowSample {
  columns: string[];
  rows: Record<string, unknown>[];
  limit: number;
}
export interface TableProfile {
  rowCount: Statistic<number>;
  rowsScanned: number;
  columns: ColumnStatistics[];
}
export interface ExtraSection {
  id: string;
  title: string;
  entries: Record<string, unknown>[];
}
export interface DatabaseAdapter {
  readonly id: string;
  readonly staticCapabilities: Capabilities;
  connect(config: unknown): Promise<DatabaseConnection>;
}
export interface DatabaseConnection {
  readonly capabilities: Capabilities;
  testConnection(): Promise<void>;
  listSchemas(): Promise<SchemaRef[]>;
  listTables(schema?: SchemaRef): Promise<TableSummary[]>;
  getTable(ref: TableRef): Promise<TableDetail>;
  listRelationships(schema?: SchemaRef): Promise<Relationship[]>;
  getTableMetadataStats(ref: TableRef): Promise<TableMetadataStats>;
  profileTable(ref: TableRef, options: ProfileOptions): Promise<TableProfile>;
  sampleRows(ref: TableRef, limit: number): Promise<RowSample>;
  listExtraSections?(): Promise<ExtraSection[]>;
  close(): Promise<void>;
}
export class UnsupportedOperationError extends Error {
  constructor(operation: string) {
    super(`${operation} is not implemented by this adapter yet.`);
    this.name = 'UnsupportedOperationError';
  }
}
