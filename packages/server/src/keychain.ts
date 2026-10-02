import { ApiError } from './errors.js';

export interface PasswordStore {
  get(id: string): Promise<string | null>;
  set(id: string, password: string): Promise<void>;
  delete(id: string): Promise<void>;
}
/** Load the native library only when a user chooses keychain storage. */
export class OsPasswordStore implements PasswordStore {
  private async entry(id: string) {
    const { AsyncEntry } = await import('@napi-rs/keyring');
    return new AsyncEntry('db-explorer', id, {
      linux: { store: 'secret-service' },
    });
  }
  async get(id: string): Promise<string | null> {
    try {
      return (await (await this.entry(id)).getPassword()) ?? null;
    } catch {
      throw this.unavailable();
    }
  }
  async set(id: string, password: string): Promise<void> {
    try {
      await (await this.entry(id)).setPassword(password);
    } catch {
      throw this.unavailable();
    }
  }
  async delete(id: string): Promise<void> {
    try {
      const entry = await this.entry(id);
      await entry.deletePassword();
    } catch {
      throw this.unavailable();
    }
  }
  private unavailable() {
    return new ApiError(
      503,
      'KEYCHAIN_UNAVAILABLE',
      'The OS keychain is unavailable or locked. Unlock it or choose to enter a password when connecting.',
    );
  }
}
