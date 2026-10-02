import Fastify from 'fastify';
import type { DatabaseAdapter } from '@db-explorer/core';
import { registerApi } from './api.js';
import { sendApiError } from './errors.js';
import { sqliteAdapter } from '@db-explorer/adapter-sqlite';
import { ConnectionManager } from './connections.js';
import { parseTarget } from './target.js';

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
export async function createApplication(
  options: { target?: string; adapters?: DatabaseAdapter[] } = {},
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
  registerApi(app, connections);
  try {
    const initial = target === undefined ? undefined : parseTarget(target);
    if (initial) await connections.open(initial.adapterId, initial.config);
    app.get('/', async (_request, reply) => {
      const message =
        target === undefined
          ? 'Start DB Explorer with a SQLite file path to connect.'
          : `Connected read-only to ${target}.`;
      return reply
        .type('text/html; charset=utf-8')
        .send(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DB Explorer</title></head><body><main><h1>DB Explorer</h1><p>${escapeHtml(message)}</p><p>Schema browsing will arrive in the next phases.</p></main></body></html>`,
        );
    });
    return { app, connections };
  } catch (error) {
    await app.close();
    throw error;
  }
}

export async function startApplication(target?: string) {
  const { app, connections } = await createApplication({ target });
  try {
    const url = await app.listen({ host: '127.0.0.1', port: 0 });
    return { app, connections, url };
  } catch (error) {
    await app.close();
    throw error;
  }
}
