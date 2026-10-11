import { STATUS_CODES, type IncomingMessage, type ServerResponse } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger, LogRecord } from '../../application/ports/logger.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { describeError } from '../../domain/errors/descriptions.js';
import { toErrorReply } from './error-mapper.js';
import { fallbackSecurityHeaders } from './security-headers.js';

// RF-007, RF-1013, RF-1201, RF-009: requests refused before routing (a bad URL, an unparsable
// request line, oversized headers, a headers timeout, an Expect the server cannot meet, a CONNECT
// tunnel) skip the hooks, so helmet never runs for them. These handlers send the RST body with the
// same headers by hand and write the one `http` log entry themselves.

/** The statuses of the refusals written by hand. */
type RefusalStatus = 400 | 408 | 417 | 431;

/** What the handlers need from a client socket (`net.Socket` and `stream.Duplex` satisfy it). */
export interface ClientSocket {
  readonly destroyed: boolean;
  readonly writable: boolean;
  end(data: string): unknown;
}

const jsonContentType = 'application/json; charset=utf-8';

/** Writes the entries; a log that cannot be written never stops the response. */
function logSettled(logger: Logger, record: LogRecord): void {
  void Promise.allSettled([logger.log(record)]);
}

function logRefusal(logger: Logger, message: string, data: NonNullable<LogRecord['data']>): void {
  logSettled(logger, { level: 'info', logger: 'http', message, data });
}

/** The RST-2000 body of every refusal, serialised once. */
function refusedBody(): string {
  const code = ERROR_CODES.requestInvalid;
  return JSON.stringify({ code, ...describeError(code) });
}

/** The error code Node attached to a parser or timeout error, or the error's name. */
function errorCode(error: Error): string {
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : error.name;
}

/** A complete HTTP/1.1 response for the raw socket, closing the connection afterwards. */
function rawResponse(
  status: RefusalStatus,
  securityHeaders: Readonly<Record<string, string>>,
  body: string,
): string {
  const headers = {
    'Content-Type': jsonContentType,
    'Content-Length': String(Buffer.byteLength(body)),
    Connection: 'close',
    ...securityHeaders,
  };
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`);
  return `HTTP/1.1 ${String(status)} ${STATUS_CODES[status] ?? ''}\r\n${lines.join('')}\r\n${body}`;
}

/** Fastify's `frameworkErrors` option: the mapped error body with the security headers. */
export function frameworkErrorHandler(
  logger: Logger,
  publicUrl: string,
): (error: Error, request: FastifyRequest, reply: FastifyReply) => void {
  const headers = fallbackSecurityHeaders(publicUrl);
  return (error, request, reply) => {
    const { status, body } = toErrorReply(error);
    logRefusal(logger, `${request.method} (refused address) ${String(status)}`, {
      requestId: request.id,
      method: request.method,
      statusCode: status,
      code: body.code,
    });
    void reply.headers(headers).status(status).send(body);
  };
}

/** The status a parser or timeout error deserves: 408 for a timeout, 431 for oversized headers. */
function clientErrorStatus(code: string): RefusalStatus {
  if (code === 'ERR_HTTP_REQUEST_TIMEOUT') return 408;
  if (code === 'HPE_HEADER_OVERFLOW') return 431;
  return 400;
}

/**
 * Fastify's `clientErrorHandler` option: a minimal response on the raw socket, then close. A reset
 * or a socket that can no longer be written gets nothing, as nothing can be answered (RF-009: no
 * entry without a response).
 */
export function clientErrorHandler(
  logger: Logger,
  publicUrl: string,
): (error: Error, socket: ClientSocket) => void {
  const headers = fallbackSecurityHeaders(publicUrl);
  return (error, socket) => {
    const code = errorCode(error);
    if (code === 'ECONNRESET' || socket.destroyed || !socket.writable) return;
    const status = clientErrorStatus(code);
    logRefusal(logger, `Refused a malformed request: ${String(status)}`, {
      statusCode: status,
      error: code,
    });
    socket.end(rawResponse(status, headers, refusedBody()));
  };
}

/**
 * Node's `checkExpectation` event: an `Expect` header other than `100-continue`, which Node would
 * otherwise answer with a bare 417.
 */
export function expectationHandler(
  logger: Logger,
  publicUrl: string,
): (request: IncomingMessage, response: ServerResponse) => void {
  const headers = fallbackSecurityHeaders(publicUrl);
  return (request, response) => {
    const body = refusedBody();
    const method = request.method ?? '';
    logRefusal(logger, `${method} ${request.url ?? ''} 417`, { method, statusCode: 417 });
    response.writeHead(417, {
      'Content-Type': jsonContentType,
      'Content-Length': String(Buffer.byteLength(body)),
      ...headers,
    });
    response.end(body);
  };
}

/**
 * Node's `connect` event: a CONNECT tunnel request, which Node would otherwise drop without an
 * answer. Rosetta is not a proxy, so the request is invalid.
 */
export function connectHandler(
  logger: Logger,
  publicUrl: string,
): (request: IncomingMessage, socket: ClientSocket) => void {
  const headers = fallbackSecurityHeaders(publicUrl);
  return (request, socket) => {
    if (socket.destroyed || !socket.writable) return;
    logRefusal(logger, `CONNECT ${request.url ?? ''} 400`, { method: 'CONNECT', statusCode: 400 });
    socket.end(rawResponse(400, headers, refusedBody()));
  };
}
