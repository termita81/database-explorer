import type { FastifyReply } from 'fastify';

export class UnknownConnectionError extends Error {
  constructor() {
    super('Unknown connection.');
    this.name = 'UnknownConnectionError';
  }
}
export class UnknownAdapterError extends Error {
  constructor(adapterId: string, available: string[]) {
    super(
      `Adapter "${adapterId}" is not available. Available adapters: ${available.join(', ')}.`,
    );
    this.name = 'UnknownAdapterError';
  }
}
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function sendApiError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: { path: string; message: string }[],
) {
  return reply.code(status).send({
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });
}
