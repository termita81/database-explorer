import { randomUUID } from 'node:crypto';
import { UnknownAdapterError, UnknownConnectionError } from './errors.js';
import type { DatabaseAdapter, DatabaseConnection } from '@db-explorer/core';

export interface ConnectionOptions {
  label?: string;
  onClose?: () => Promise<void>;
}
export interface ManagedConnection {
  id: string;
  adapterId: string;
  connection: DatabaseConnection;
  label?: string;
  onClose?: () => Promise<void>;
}
export class ConnectionManager {
  private readonly adapters = new Map<string, DatabaseAdapter>();
  private readonly connections = new Map<string, ManagedConnection>();
  private readonly pending = new Set<Promise<ManagedConnection>>();
  private closed = false;
  private closing?: Promise<void>;
  constructor(adapters: DatabaseAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.id))
        throw new Error(`Duplicate adapter: ${adapter.id}`);
      this.adapters.set(adapter.id, adapter);
    }
  }
  open(
    adapterId: string,
    config: unknown,
    options: ConnectionOptions = {},
  ): Promise<ManagedConnection> {
    if (this.closed)
      return Promise.reject(new Error('Connection manager is closed.'));
    const adapter = this.adapters.get(adapterId);
    if (!adapter)
      return Promise.reject(
        new UnknownAdapterError(adapterId, [...this.adapters.keys()]),
      );
    const task = this.connect(adapter, config, options);
    this.pending.add(task);
    void task.then(
      () => this.pending.delete(task),
      () => this.pending.delete(task),
    );
    return task;
  }
  private async connect(
    adapter: DatabaseAdapter,
    config: unknown,
    options: ConnectionOptions,
  ): Promise<ManagedConnection> {
    const connection = await adapter.connect(config);
    try {
      await connection.testConnection();
      if (this.closed) throw new Error('Connection manager is closed.');
    } catch (error) {
      await connection.close();
      throw error;
    }
    const managed = {
      id: randomUUID(),
      adapterId: adapter.id,
      connection,
      ...options,
    };
    this.connections.set(managed.id, managed);
    return managed;
  }
  get(id: string): ManagedConnection {
    const connection = this.connections.get(id);
    if (!connection) throw new UnknownConnectionError();
    return connection;
  }
  list(): ManagedConnection[] {
    return [...this.connections.values()];
  }
  async close(id: string): Promise<void> {
    const managed = this.get(id);
    this.connections.delete(id);
    try {
      await managed.connection.close();
    } finally {
      await managed.onClose?.();
    }
  }
  closeAll(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = (async () => {
      await Promise.allSettled([...this.pending]);
      const results = await Promise.allSettled(
        [...this.connections.keys()].map((id) => this.close(id)),
      );
      const errors = results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason);
      if (errors.length)
        throw new AggregateError(
          errors,
          'Failed to close database connections.',
        );
    })();
    return this.closing;
  }
}
