/** Unresolved fields are safe to persist; passwords may only be environment references. */
export interface ConnectionFields {
  path?: string;
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
  username?: string;
  password?: string;
  ssl?: boolean | string;
  serviceName?: string;
  sid?: string;
}
export interface ConnectionPreferences {
  activeProfiling: boolean;
}
export type CredentialSource = 'none' | 'prompt' | 'keychain' | 'environment';
export interface ConnectionProfile {
  id: string;
  name: string;
  adapterId: string;
  config: ConnectionFields;
  preferences: ConnectionPreferences;
  credential: CredentialSource;
}
export interface ProfileInput {
  name: string;
  adapterId: string;
  config: ConnectionFields;
  preferences?: ConnectionPreferences;
  credential?: CredentialSource;
  /** Transient: used only to write a keychain entry, never persisted or returned. */
  password?: string;
}
