import Fastify from 'fastify';
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
export async function startApplication(target?: string) {
  const connections = new ConnectionManager([sqliteAdapter]);
  const app = Fastify();
  app.addHook('onClose', () => connections.closeAll());
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
    const url = await app.listen({ host: '127.0.0.1', port: 0 });
    return { app, connections, url };
  } catch (error) {
    await app.close();
    throw error;
  }
}
