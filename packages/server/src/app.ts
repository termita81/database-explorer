import fastifyStatic from '@fastify/static';
import { createRequire } from 'node:module';
import { dirname, join, basename } from 'node:path';
import Fastify from 'fastify';
import type { DatabaseAdapter } from '@db-explorer/core';
import { registerApi } from './api.js';
import { sendApiError } from './errors.js';
import { sqliteAdapter } from '@db-explorer/adapter-sqlite';
import { ConnectionManager } from './connections.js';
import { ProfileStore } from './profiles.js';
import { parseTarget } from './target.js';

export async function createApplication(
  options: {
    target?: string;
    adapters?: DatabaseAdapter[];
    profiles?: ProfileStore;
  } = {},
) {
  const { target } = options;
  const connections = new ConnectionManager(
    options.adapters ?? [sqliteAdapter],
  );
  const app = Fastify({
    routerOptions: { maxParamLength: 1024 },
    // Routing failures happen before the regular Fastify error handler.
    frameworkErrors(error, _request, reply) {
      if (error.code === 'FST_ERR_BAD_URL')
        return sendApiError(
          reply,
          400,
          'INVALID_REQUEST',
          'The request URL could not be parsed.',
        );
      if (error.code === 'FST_ERR_MAX_PARAM_LENGTH')
        return sendApiError(
          reply,
          414,
          'URI_TOO_LONG',
          'A request path parameter is too long.',
        );
      return sendApiError(
        reply,
        500,
        'INTERNAL_ERROR',
        'An unexpected error occurred.',
      );
    },
  });
  app.addHook('onClose', () => connections.closeAll());
  const profiles = options.profiles ?? new ProfileStore();
  registerApi(app, connections, profiles);
  try {
    const initial = target === undefined ? undefined : parseTarget(target);
    if (initial)
      await connections.open(initial.adapterId, initial.config, {
        label: basename((initial.config as { path: string }).path ?? target!),
      });
    const webRoot = dirname(
      createRequire(import.meta.url).resolve('@db-explorer/web'),
    );
    app.register(fastifyStatic, {
      root: join(webRoot, 'assets'),
      prefix: '/assets/',
      index: false,
    });
    app.get('/', async (_request, reply) =>
      reply.sendFile('index.html', webRoot),
    );
    app.get('/connections/*', async (_request, reply) =>
      reply.sendFile('index.html', webRoot),
    );
    return { app, connections, profiles };
  } catch (error) {
    await app.close();
    throw error;
  }
}

export async function startApplication(
  target?: string,
  options: { profiles?: ProfileStore } = {},
) {
  const { app, connections } = await createApplication({ ...options, target });
  try {
    const url = await app.listen({ host: '127.0.0.1', port: 0 });
    return { app, connections, url };
  } catch (error) {
    await app.close();
    throw error;
  }
}
