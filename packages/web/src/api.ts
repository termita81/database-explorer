import type {
  Capabilities,
  Relationship,
  TableDetail,
  TableSummary,
} from '@db-explorer/core';
export interface Connection {
  id: string;
  adapterId: string;
  capabilities: Capabilities;
  label?: string;
}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new ApiError(
      body?.error?.message ?? 'Could not reach the database. Please try again.',
      body?.error?.code ?? 'NETWORK_ERROR',
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
const segment = encodeURIComponent;
export const api = {
  connections: (signal?: AbortSignal) =>
    request<Connection[]>('/connections', { signal }),
  connection: (id: string, signal?: AbortSignal) =>
    request<Connection>(`/connections/${segment(id)}`, { signal }),
  open: (path: string, label?: string) =>
    request<Connection>('/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adapterId: 'sqlite', config: { path }, label }),
    }),
  upload: (file: File) =>
    request<Connection>(`/connections/upload?name=${segment(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    }),
  close: (id: string) =>
    request<void>(`/connections/${segment(id)}`, { method: 'DELETE' }),
  tables: (id: string, signal?: AbortSignal) =>
    request<TableSummary[]>(`/connections/${segment(id)}/tables`, { signal }),
  table: (id: string, schema: string, name: string, signal?: AbortSignal) =>
    request<TableDetail>(
      `/connections/${segment(id)}/tables/${segment(name)}?schema=${segment(schema)}`,
      { signal },
    ),
  relationships: (id: string, signal?: AbortSignal) =>
    request<Relationship[]>(`/connections/${segment(id)}/relationships`, {
      signal,
    }),
};
