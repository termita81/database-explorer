import { ApiError } from './errors.js';

const reference = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
export function isEnvironmentReference(value: string): boolean {
  return /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value);
}
/** One pass: an environment value is never interpreted as another reference. */
export function resolveEnvironment<T extends Record<string, unknown>>(
  fields: T,
  environment: NodeJS.ProcessEnv = process.env,
): T {
  const resolved = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? value.replace(reference, (_match, name: string) => {
            const replacement = environment[name];
            if (replacement === undefined)
              throw new ApiError(
                422,
                'ENVIRONMENT_VARIABLE_MISSING',
                `Environment variable ${name} is not set.`,
              );
            return replacement;
          })
        : value,
    ]),
  ) as Record<string, unknown>;
  if (typeof fields.port === 'string' && isEnvironmentReference(fields.port)) {
    const port = Number(resolved.port);
    if (
      !/^\d+$/.test(String(resolved.port)) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    )
      throw new ApiError(
        422,
        'ENVIRONMENT_VARIABLE_INVALID',
        'The port environment variable must contain a port number from 1 to 65535.',
      );
    resolved.port = port;
  }
  if (typeof fields.ssl === 'string' && isEnvironmentReference(fields.ssl)) {
    if (resolved.ssl !== 'true' && resolved.ssl !== 'false')
      throw new ApiError(
        422,
        'ENVIRONMENT_VARIABLE_INVALID',
        'The SSL environment variable must contain true or false.',
      );
    resolved.ssl = resolved.ssl === 'true';
  }
  return resolved as T;
}
