import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ConnectionManager, ManagedConnection } from './connections.js';
import type { ProfileStore } from './profiles.js';
import { ApiError, UnknownAdapterError } from './errors.js';

const params = z.object({ profileId: z.uuid() }).strict();
const empty = z.object({}).strict();
export function registerProfileRoutes(
  api: FastifyInstance,
  connections: ConnectionManager,
  profiles: ProfileStore,
  publicConnection: (connection: ManagedConnection) => unknown,
) {
  api.get('/profiles', async (request) => {
    empty.parse(request.query);
    return profiles.list();
  });
  api.post('/profiles', async (request, reply) => {
    empty.parse(request.query);
    const profile = await profiles.save(request.body);
    return reply
      .code(201)
      .header('Location', `/api/profiles/${profile.id}`)
      .send(profile);
  });
  api.get('/profiles/:profileId', async (request) => {
    empty.parse(request.query);
    return profiles.get(params.parse(request.params).profileId);
  });
  api.put('/profiles/:profileId', async (request) => {
    empty.parse(request.query);
    return profiles.save(request.body, params.parse(request.params).profileId);
  });
  api.delete('/profiles/:profileId', async (request, reply) => {
    empty.parse(request.query);
    await profiles.delete(params.parse(request.params).profileId);
    return reply.code(204).send();
  });
  api.post('/profiles/:profileId/connect', async (request, reply) => {
    empty.parse(request.query);
    const { profileId } = params.parse(request.params);
    const { password } = z
      .object({ password: z.string().min(1).max(4096).optional() })
      .strict()
      .parse(request.body ?? {});
    const { profile, config } = await profiles.connectionSettings(
      profileId,
      password,
    );
    try {
      const connection = await connections.open(profile.adapterId, config, {
        label: profile.name,
        profileId: profile.id,
        preferences: profile.preferences,
      });
      return reply
        .code(201)
        .header('Location', `/api/connections/${connection.id}`)
        .send(publicConnection(connection));
    } catch (error) {
      if (error instanceof UnknownAdapterError) throw error;
      throw new ApiError(
        422,
        'CONNECTION_FAILED',
        'Unable to open the database. Check the profile and its connection settings.',
      );
    }
  });
}
