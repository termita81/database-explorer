import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DatabaseObjectNotFoundError,
  UnsupportedOperationError,
} from '@db-explorer/core';
import type { ConnectionManager, ManagedConnection } from './connections.js';
import {
  sendApiError as sendError,
  ApiError,
  UnknownAdapterError,
  UnknownConnectionError,
} from './errors.js';

const identifier = z.string().min(1).max(1024);
const connectionParams = z.object({ connectionId: identifier }).strict();
const tableParams = connectionParams.extend({ tableName: identifier });
const schemaQuery = z.object({ schema: identifier.optional() }).strict();
const emptyQuery = z.object({}).strict();
const openBody = z
  .object({ adapterId: identifier, config: z.record(z.string(), z.unknown()) })
  .strict();

function publicConnection(managed: ManagedConnection) {
  return {
    id: managed.id,
    adapterId: managed.adapterId,
    capabilities: managed.connection.capabilities,
  };
}
export function registerApi(
  app: FastifyInstance,
  connections: ConnectionManager,
): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return sendError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Request validation failed.',
        error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      );
    }
    if (error instanceof UnknownConnectionError)
      return sendError(
        reply,
        404,
        'CONNECTION_NOT_FOUND',
        'Unknown connection.',
      );
    if (error instanceof UnknownAdapterError)
      return sendError(
        reply,
        400,
        'ADAPTER_NOT_AVAILABLE',
        'The requested database adapter is not available.',
      );
    if (error instanceof DatabaseObjectNotFoundError)
      return sendError(
        reply,
        404,
        'OBJECT_NOT_FOUND',
        `Unknown ${error.objectType}.`,
      );
    if (error instanceof UnsupportedOperationError)
      return sendError(
        reply,
        501,
        'OPERATION_NOT_SUPPORTED',
        'The connection does not support this operation.',
      );
    if (error instanceof ApiError)
      return sendError(reply, error.statusCode, error.code, error.message);
    // Fastify parser errors should use the same envelope and never echo request contents.
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'FST_ERR_CTP_BODY_TOO_LARGE'
    )
      return sendError(
        reply,
        413,
        'PAYLOAD_TOO_LARGE',
        'Request body is too large.',
      );
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE'
    )
      return sendError(
        reply,
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Use application/json for request bodies.',
      );
    if (
      error instanceof Error &&
      'statusCode' in error &&
      error.statusCode === 400
    )
      return sendError(
        reply,
        400,
        'INVALID_REQUEST',
        'The request could not be parsed.',
      );
    return sendError(
      reply,
      500,
      'INTERNAL_ERROR',
      'An unexpected error occurred.',
    );
  });
  app.setNotFoundHandler((_request, reply) =>
    sendError(reply, 404, 'ROUTE_NOT_FOUND', 'Unknown API route.'),
  );

  app.register(
    async (api) => {
      api.addHook('onRequest', async (request, reply) => {
        const origin = request.headers.origin;
        const hostAllowed = ['localhost', '127.0.0.1', '[::1]'].includes(
          request.hostname,
        );
        if (
          !hostAllowed ||
          (origin !== undefined && origin !== `http://${request.headers.host}`)
        ) {
          return sendError(
            reply,
            403,
            'ACCESS_DENIED',
            'Only local, same-origin requests are allowed.',
          );
        }
        reply.header('Cache-Control', 'no-store');
      });

      api.get('/connections', async (request) => {
        emptyQuery.parse(request.query);
        return connections.list().map(publicConnection);
      });
      api.post('/connections', async (request, reply) => {
        emptyQuery.parse(request.query);
        const body = openBody.parse(request.body);
        try {
          const managed = await connections.open(body.adapterId, body.config);
          return reply
            .code(201)
            .header('Location', `/api/connections/${managed.id}`)
            .send(publicConnection(managed));
        } catch (error) {
          if (
            error instanceof z.ZodError ||
            error instanceof UnknownAdapterError
          )
            throw error;
          throw new ApiError(
            422,
            'CONNECTION_FAILED',
            'Unable to open the database. Check its location and connection settings.',
          );
        }
      });
      api.get('/connections/:connectionId', async (request) => {
        const { connectionId } = connectionParams.parse(request.params);
        emptyQuery.parse(request.query);
        return publicConnection(connections.get(connectionId));
      });
      api.delete('/connections/:connectionId', async (request, reply) => {
        const { connectionId } = connectionParams.parse(request.params);
        emptyQuery.parse(request.query);
        await connections.close(connectionId);
        return reply.code(204).send();
      });
      api.get('/connections/:connectionId/schemas', async (request) => {
        const { connectionId } = connectionParams.parse(request.params);
        emptyQuery.parse(request.query);
        return connections.get(connectionId).connection.listSchemas();
      });
      api.get('/connections/:connectionId/tables', async (request) => {
        const { connectionId } = connectionParams.parse(request.params);
        const { schema } = schemaQuery.parse(request.query);
        return connections
          .get(connectionId)
          .connection.listTables(
            schema === undefined ? undefined : { name: schema },
          );
      });
      api.get(
        '/connections/:connectionId/tables/:tableName',
        async (request) => {
          const { connectionId, tableName } = tableParams.parse(request.params);
          const query = schemaQuery.parse(request.query);
          const { connection } = connections.get(connectionId);
          let schema = query.schema;
          if (schema === undefined) {
            const schemas = await connection.listSchemas();
            if (schemas.length !== 1)
              throw new ApiError(
                400,
                'SCHEMA_REQUIRED',
                'Specify a schema for this database.',
              );
            schema = schemas[0]!.name;
          }
          return connection.getTable({ schema, name: tableName });
        },
      );
      api.get('/connections/:connectionId/relationships', async (request) => {
        const { connectionId } = connectionParams.parse(request.params);
        const { schema } = schemaQuery.parse(request.query);
        return connections
          .get(connectionId)
          .connection.listRelationships(
            schema === undefined ? undefined : { name: schema },
          );
      });
    },
    { prefix: '/api' },
  );
}
