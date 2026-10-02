import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OsPasswordStore } from '../src/keychain.js';

const native = vi.hoisted(() => ({
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@napi-rs/keyring', () => ({
  AsyncEntry: class {
    constructor(service: string, account: string, options: unknown) {
      native.create(service, account, options);
    }
    getPassword = native.getPassword;
    setPassword = native.setPassword;
    deletePassword = native.deletePassword;
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  native.setPassword.mockResolvedValue(undefined);
  native.getPassword.mockResolvedValue(undefined);
  native.deletePassword.mockResolvedValue(false);
});
describe('OS keychain boundary', () => {
  it('uses namespaced entries and the persistent Secret Service store on Linux', async () => {
    const store = new OsPasswordStore();
    await store.set('credential-id', 'secret');
    expect(native.create).toHaveBeenCalledWith('db-explorer', 'credential-id', {
      linux: { store: 'secret-service' },
    });
    expect(native.setPassword).toHaveBeenCalledWith('secret');
    native.getPassword.mockResolvedValueOnce('secret');
    expect(await store.get('credential-id')).toBe('secret');
    await store.delete('credential-id');
    expect(native.deletePassword).toHaveBeenCalledOnce();
  });
  it('treats an absent keychain entry as a missing password', async () => {
    expect(await new OsPasswordStore().get('missing')).toBeNull();
  });
  it('returns actionable errors without native secret values', async () => {
    const store = new OsPasswordStore();
    for (const operation of [
      () => store.get('id'),
      () => store.set('id', 'secret-marker'),
      () => store.delete('id'),
    ]) {
      native.getPassword.mockRejectedValue(new Error('secret-marker'));
      native.setPassword.mockRejectedValue(new Error('secret-marker'));
      native.deletePassword.mockRejectedValue(new Error('secret-marker'));
      const error = await operation().catch((error) => error);
      expect(error).toMatchObject({
        statusCode: 503,
        code: 'KEYCHAIN_UNAVAILABLE',
      });
      expect(error.message).not.toContain('secret-marker');
    }
  });
});
