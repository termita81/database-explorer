import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter, DatabaseConnection } from '@db-explorer/core';
import { sqliteCapabilities } from '@db-explorer/adapter-sqlite';
import { ConnectionManager } from '../src/connections.js';

function setup() {
  const connection = {
    capabilities: sqliteCapabilities,
    testConnection: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseConnection;
  const adapter: DatabaseAdapter = {
    id: 'fake',
    staticCapabilities: sqliteCapabilities,
    connect: vi.fn().mockResolvedValue(connection),
  };
  return { connection, adapter, manager: new ConnectionManager([adapter]) };
}
describe('Connection manager lifecycle', () => {
  it('registers verified connections with unique IDs and removes closed connections', async () => {
    const { manager, connection } = setup();
    const first = await manager.open('fake', {});
    const second = await manager.open('fake', {});
    expect(first.id).not.toBe(second.id);
    expect(manager.get(first.id)).toBe(first);
    expect(manager.list()).toHaveLength(2);
    expect(connection.testConnection).toHaveBeenCalledTimes(2);
    await manager.close(first.id);
    expect(() => manager.get(first.id)).toThrow('Unknown connection');
    await manager.closeAll();
    expect(manager.list()).toEqual([]);
    expect(connection.close).toHaveBeenCalledTimes(2);
    await expect(manager.open('fake', {})).rejects.toThrow('closed');
    await manager.closeAll();
    expect(connection.close).toHaveBeenCalledTimes(2);
  });
  it('closes a failed connection and never registers it', async () => {
    const { manager, connection } = setup();
    vi.mocked(connection.testConnection).mockRejectedValue(
      new Error('Probe failed'),
    );
    await expect(manager.open('fake', {})).rejects.toThrow('Probe failed');
    expect(connection.close).toHaveBeenCalledOnce();
    expect(manager.list()).toEqual([]);
  });
  it('does not register failed adapter connections', async () => {
    const { manager, adapter } = setup();
    vi.mocked(adapter.connect).mockRejectedValue(new Error('Connect failed'));
    await expect(manager.open('fake', {})).rejects.toThrow('Connect failed');
    expect(manager.list()).toEqual([]);
  });
  it('rejects unknown adapters and duplicate registrations', async () => {
    const { manager, adapter } = setup();
    await expect(manager.open('postgres', {})).rejects.toThrow('not available');
    expect(() => new ConnectionManager([adapter, adapter])).toThrow(
      'Duplicate adapter',
    );
  });
  it('waits for pending opens during shutdown and closes them', async () => {
    const { manager, adapter, connection } = setup();
    let resolve!: (connection: DatabaseConnection) => void;
    vi.mocked(adapter.connect).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const rejected = expect(manager.open('fake', {})).rejects.toThrow('closed');
    const closing = manager.closeAll();
    resolve(connection);
    await rejected;
    await closing;
    expect(connection.close).toHaveBeenCalledOnce();
    expect(manager.list()).toEqual([]);
  });
  it('attempts every close even when one fails', async () => {
    const { manager, connection } = setup();
    await manager.open('fake', {});
    await manager.open('fake', {});
    vi.mocked(connection.close).mockRejectedValueOnce(
      new Error('Close failed'),
    );
    await expect(manager.closeAll()).rejects.toThrow('Failed to close');
    expect(connection.close).toHaveBeenCalledTimes(2);
  });
});
