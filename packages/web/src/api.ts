import type {
  Capabilities,
  ConnectionProfile,
  ProfileInput,
  ConnectionPreferences,
  Relationship,
  TableDetail,
  TableSummary,
} from '@db-explorer/core';
export interface Connection {
  id: string;
  adapterId: string;
  capabilities: Capabilities;
  label?: string;
  profileId?: string;
  preferences?: ConnectionPreferences;
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
  profiles: (signal?: AbortSignal) =>
    request<ConnectionProfile[]>('/profiles', { signal }),
  saveProfile: (profile: ProfileInput, id?: string) =>
    request<ConnectionProfile>(id ? `/profiles/${segment(id)}` : '/profiles', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    }),
  deleteProfile: (id: string) =>
    request<void>(`/profiles/${segment(id)}`, { method: 'DELETE' }),
  connectProfile: (id: string, password?: string) =>
    request<Connection>(`/profiles/${segment(id)}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
  open: (path: string, label?: string, preferences?: ConnectionPreferences) =>
    request<Connection>('/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adapterId: 'sqlite',
        config: { path },
        label,
        preferences,
      }),
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
