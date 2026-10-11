import { STATUS_CODES } from 'node:http';
import type { Socket } from 'node:net';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger, LogRecord } from '../../application/ports/logger.js';
import { describeError, ERROR_CODES } from '../../domain/errors/codes.js';
import { toErrorReply } from './error-mapper.js';
import { fallbackSecurityHeaders } from './security-headers.js';

// RF-007, RF-1013, RF-1201: requests refused before routing (a bad URL, an unparsable request
// line, oversized headers) skip the hooks, so helmet never runs for them. These handlers send the
// RST body with the same headers by hand and write the `http` log entry themselves.

/** Writes the entries; a log that cannot be written never stops the response. */
function logSettled(logger: Logger, record: LogRecord): void {
  void Promise.allSettled([logger.log(record)]);
}

/** Fastify's `frameworkErrors` option: the mapped error body with the security headers. */
export function frameworkErrorHandler(
  logger: Logger,
  publicUrl: string,
): (error: Error, request: FastifyRequest, reply: FastifyReply) => void {
  const headers = fallbackSecurityHeaders(publicUrl);
  return (error, request, reply) => {
    const { status, body } = toErrorReply(error);
    logSettled(logger, {
      level: 'info',
      logger: 'http',
      message: `${request.method} (refused address) ${String(status)}`,
      data: { requestId: request.id, method: request.method, statusCode: status, code: body.code },
    });
    void reply.headers(headers).status(status).send(body);
  };
}

/** The status Node's parser error deserves: 431 for oversized headers, otherwise 400. */
function clientErrorStatus(error: Error): 400 | 431 {
  return Reflect.get(error, 'code') === 'HPE_HEADER_OVERFLOW' ? 431 : 400;
}

/** Fastify's `clientErrorHandler` option: a minimal response on the raw socket, then close. */
export function clientErrorHandler(
  logger: Logger,
  publicUrl: string,
): (error: Error, socket: Socket) => void {
  const securityHeaders = Object.entries(fallbackSecurityHeaders(publicUrl))
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join('');
  return (error, socket) => {
    const status = clientErrorStatus(error);
    logSettled(logger, {
      level: 'info',
      logger: 'http',
      message: `Refused a malformed request: ${String(status)}`,
      data: { statusCode: status, error: String(Reflect.get(error, 'code') ?? error.name) },
    });
    if (!socket.writable) return;
    const code = ERROR_CODES.requestInvalid;
    const body = JSON.stringify({ code, ...describeError(code) });
    socket.end(
      `HTTP/1.1 ${String(status)} ${STATUS_CODES[status] ?? ''}\r\n` +
        'Content-Type: application/json; charset=utf-8\r\n' +
        `Content-Length: ${String(Buffer.byteLength(body))}\r\n` +
        'Connection: close\r\n' +
        `${securityHeaders}\r\n${body}`,
    );
  };
}
