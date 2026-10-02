import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import envPaths from 'env-paths';
import lockfile from 'proper-lockfile';
import { z } from 'zod';
import type { ConnectionProfile } from '@db-explorer/core';
import { ApiError } from './errors.js';
import { isEnvironmentReference, resolveEnvironment } from './environment.js';
import { OsPasswordStore, type PasswordStore } from './keychain.js';

const field = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) =>
      !/:\/\/[^/\s]*@/.test(value) &&
      !/(?:^|[;?&])\s*(?:password|pwd|token|secret)\s*=/i.test(value),
    'Use separate connection fields and a password prompt or environment reference instead of embedded credentials.',
  );
const environmentField = z
  .string()
  .refine(isEnvironmentReference, 'Use a ${VARIABLE} reference.');
const configSchema = z
  .object({
    path: field.optional(),
    host: field.optional(),
    port: z
      .union([z.number().int().min(1).max(65535), environmentField])
      .optional(),
    database: field.optional(),
    user: field.optional(),
    username: field.optional(),
    password: z
      .string()
      .refine(
        isEnvironmentReference,
        'Passwords in connection fields must be a ${VARIABLE} reference.',
      )
      .optional(),
    ssl: z.union([z.boolean(), environmentField]).optional(),
    serviceName: field.optional(),
    sid: field.optional(),
  })
  .strict();
const preferencesSchema = z.object({ activeProfiling: z.boolean() }).strict();
const credentialSchema = z.enum(['none', 'prompt', 'keychain', 'environment']);
export const profileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    adapterId: z.string().min(1).max(100),
    config: configSchema,
    preferences: preferencesSchema.optional(),
    credential: credentialSchema.optional(),
    password: z.string().min(1).max(4096).optional(),
  })
  .strict();
const profileSchema = profileInputSchema
  .omit({ password: true })
  .extend({
    id: z.uuid(),
    keychainId: z.uuid().optional(),
    baseDirectory: z.string().optional(),
    preferences: preferencesSchema,
    credential: credentialSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    if (
      (profile.credential === 'keychain') !== Boolean(profile.keychainId) ||
      (profile.credential === 'environment') !==
        Boolean(profile.config.password) ||
      (profile.adapterId === 'sqlite' &&
        (!profile.config.path || profile.credential !== 'none'))
    )
      context.addIssue({
        code: 'custom',
        message: 'Invalid profile credential configuration.',
      });
  });
type StoredProfile = z.infer<typeof profileSchema>;
function publicProfile({
  keychainId: _keychainId,
  baseDirectory: _baseDirectory,
  ...profile
}: StoredProfile): ConnectionProfile {
  return profile;
}
const fileSchema = z
  .object({ version: z.literal(1), profiles: z.array(profileSchema).max(1000) })
  .strict();

export function defaultProfilesPath(): string {
  return join(envPaths('db-explorer', { suffix: '' }).config, 'profiles.json');
}
export class ProfileStore {
  constructor(
    readonly path = defaultProfilesPath(),
    private readonly passwords: PasswordStore = new OsPasswordStore(),
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}
  private async records(): Promise<StoredProfile[]> {
    try {
      const { profiles } = fileSchema.parse(
        JSON.parse(await readFile(this.path, 'utf8')),
      );
      if (
        new Set(profiles.map((profile) => profile.id)).size !== profiles.length
      )
        throw new Error('Duplicate IDs');
      return profiles;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new ApiError(
        503,
        'PROFILES_UNAVAILABLE',
        'The connection profiles file could not be read. Check its format and permissions.',
      );
    }
  }
  async list(): Promise<ConnectionProfile[]> {
    return (await this.records()).map(publicProfile);
  }
  async get(id: string): Promise<ConnectionProfile> {
    return publicProfile(await this.record(id));
  }
  private async record(id: string): Promise<StoredProfile> {
    const profile = (await this.records()).find((profile) => profile.id === id);
    if (!profile)
      throw new ApiError(
        404,
        'PROFILE_NOT_FOUND',
        'Unknown connection profile.',
      );
    return profile;
  }
  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const release = await lockfile.lock(this.path, {
        realpath: false,
        retries: { retries: 20, minTimeout: 25, maxTimeout: 100 },
      });
      try {
        return await operation();
      } finally {
        await release();
      }
    } catch (error) {
      if (error instanceof ApiError || error instanceof z.ZodError) throw error;
      throw new ApiError(
        503,
        'PROFILES_UNAVAILABLE',
        'The connection profiles file could not be updated. Check its permissions and try again.',
      );
    }
  }
  private async write(profiles: StoredProfile[]): Promise<void> {
    // Serialize a strict schema, never the caller's input or resolved environment fields.
    const data = fileSchema.parse({ version: 1, profiles });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {
        mode: 0o600,
        flag: 'wx',
      });
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async save(input: unknown, id?: string): Promise<ConnectionProfile> {
    const body = profileInputSchema.parse(input);
    return this.mutate(async () => {
      const profiles = await this.records();
      const previous = id
        ? profiles.find((profile) => profile.id === id)
        : undefined;
      if (id && !previous)
        throw new ApiError(
          404,
          'PROFILE_NOT_FOUND',
          'Unknown connection profile.',
        );
      if (!id && profiles.length >= 1000)
        throw new ApiError(
          400,
          'PROFILE_LIMIT',
          'Remove a profile before adding another.',
        );
      const credential =
        body.credential ??
        (body.config.password
          ? 'environment'
          : (previous?.credential ?? (body.password ? 'prompt' : 'none')));
      if ((credential === 'environment') !== Boolean(body.config.password))
        throw new ApiError(
          400,
          'INVALID_CREDENTIAL_SOURCE',
          'Environment password references must use the environment credential source.',
        );
      if (
        body.adapterId === 'sqlite' &&
        (!body.config.path || credential !== 'none')
      )
        throw new ApiError(
          400,
          'INVALID_PROFILE',
          'SQLite profiles need a file path and do not use a password.',
        );
      const config = { ...body.config };
      // Anchor literal relative paths to the working directory when they are saved.
      if (
        config.path &&
        !isAbsolute(config.path) &&
        !config.path.startsWith('${')
      )
        config.path = resolve(config.path);
      const profile: StoredProfile = {
        id: previous?.id ?? randomUUID(),
        name: body.name,
        adapterId: body.adapterId,
        config,
        preferences: body.preferences ??
          previous?.preferences ?? {
            activeProfiling: body.adapterId === 'sqlite',
          },
        credential,
        ...(config.path?.startsWith('${')
          ? { baseDirectory: previous?.baseDirectory ?? process.cwd() }
          : {}),
      };
      let newSecret = false;
      if (credential === 'keychain') {
        if (body.password) {
          // A new entry makes a failed file write unable to change the old profile's password.
          profile.keychainId = randomUUID();
          await this.passwords.set(profile.keychainId, body.password);
          newSecret = true;
        } else if (previous?.credential !== 'keychain') {
          throw new ApiError(
            400,
            'PASSWORD_REQUIRED',
            'Enter a password to save it in the OS keychain.',
          );
        } else {
          profile.keychainId = previous.keychainId;
        }
      }
      const next = profiles.filter((item) => item.id !== previous?.id);
      next.push(profile);
      const replacedKey =
        previous?.credential === 'keychain' &&
        previous.keychainId !== profile.keychainId
          ? previous.keychainId
          : undefined;
      let oldSecret: string | null = null;
      let oldRemoved = false;
      try {
        if (replacedKey) {
          oldSecret = await this.passwords.get(replacedKey);
          await this.passwords.delete(replacedKey);
          oldRemoved = true;
        }
        await this.write(next);
      } catch (error) {
        if (oldRemoved && oldSecret !== null)
          await this.passwords.set(replacedKey!, oldSecret);
        if (newSecret) await this.passwords.delete(profile.keychainId!);
        throw error;
      }
      return publicProfile(profile);
    });
  }
  async delete(id: string): Promise<void> {
    await this.mutate(async () => {
      const profiles = await this.records();
      const profile = profiles.find((profile) => profile.id === id);
      if (!profile)
        throw new ApiError(
          404,
          'PROFILE_NOT_FOUND',
          'Unknown connection profile.',
        );
      // Fail visibly if the keychain is locked, leaving the profile available for retry.
      const secret =
        profile.credential === 'keychain'
          ? await this.passwords.get(profile.keychainId!)
          : null;
      if (profile.credential === 'keychain')
        await this.passwords.delete(profile.keychainId!);
      try {
        await this.write(profiles.filter((item) => item.id !== id));
      } catch (error) {
        if (secret !== null)
          await this.passwords.set(profile.keychainId!, secret);
        throw error;
      }
    });
  }
  async connectionSettings(id: string, password?: string) {
    const profile = await this.record(id);
    const config = resolveEnvironment({ ...profile.config }, this.environment);
    if (config.path && !isAbsolute(config.path))
      config.path = resolve(
        profile.baseDirectory ?? process.cwd(),
        config.path,
      );
    if (profile.credential === 'prompt' || profile.credential === 'keychain') {
      const secret =
        password ??
        (profile.credential === 'keychain'
          ? await this.passwords.get(profile.keychainId!)
          : null);
      if (!secret)
        throw new ApiError(
          409,
          'PASSWORD_REQUIRED',
          'Enter a password to connect with this profile.',
        );
      config.password = secret;
    } else if (password !== undefined) {
      throw new ApiError(
        400,
        'INVALID_PASSWORD',
        'This profile does not use a prompted password.',
      );
    }
    return { profile: publicProfile(profile), config };
  }
}
