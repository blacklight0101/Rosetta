import { describe, expect, it } from 'vitest';
import { describeError, ERROR_CODES, type ErrorCode } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { toErrorReply } from '../../../../src/presentation/web/error-mapper.js';

// RF-007, RNF-008: the error-to-status mapper.

/** An error shaped like the ones Fastify and its plugins throw, with their HTTP status. */
function frameworkError(statusCode: number, code: string): Error {
  return Object.assign(new Error(`framework failure ${code}`), { statusCode, code });
}

function bodyOf(code: ErrorCode): { code: ErrorCode; message: string; nextStep: string } {
  return { code, ...describeError(code) };
}

describe('error mapper: Rosetta errors', () => {
  it.each([
    [ERROR_CODES.requestInvalid, 400],
    [ERROR_CODES.notSignedIn, 401],
    [ERROR_CODES.notAllowed, 403],
    [ERROR_CODES.notFound, 404],
    [ERROR_CODES.conflict, 409],
    [ERROR_CODES.rateLimited, 429],
    [ERROR_CODES.unexpected, 500],
  ] as const)('RF-007 %s maps to status %i', (code, status) => {
    const reply = toErrorReply(new RosettaError(code));

    expect(reply.status).toBe(status);
    expect(reply.body).toEqual(bodyOf(code));
  });

  it('RF-007 a Rosetta error whose code has no HTTP cause answers 500 and keeps its code', () => {
    const reply = toErrorReply(new RosettaError(ERROR_CODES.migrationFailed));

    expect(reply.status).toBe(500);
    expect(reply.body).toEqual(bodyOf(ERROR_CODES.migrationFailed));
  });

  it('RF-007 the response carries the catalogue message, never the internal one', () => {
    const error = new RosettaError(
      ERROR_CODES.conflict,
      'Row 42 of table projects was changed by postgres://db:5432',
    );

    const reply = toErrorReply(error);

    expect(JSON.stringify(reply.body)).not.toContain('postgres://');
  });
});

describe('error mapper: framework errors', () => {
  it.each([
    [400, 'FST_ERR_CTP_INVALID_JSON_BODY', 400, ERROR_CODES.requestInvalid],
    [413, 'FST_ERR_CTP_BODY_TOO_LARGE', 400, ERROR_CODES.requestInvalid],
    [415, 'FST_ERR_CTP_INVALID_MEDIA_TYPE', 400, ERROR_CODES.requestInvalid],
    [401, 'FST_UNAUTHORIZED', 401, ERROR_CODES.notSignedIn],
    [403, 'FST_CSRF_INVALID_TOKEN', 403, ERROR_CODES.notAllowed],
    [404, 'FST_ERR_NOT_FOUND', 404, ERROR_CODES.notFound],
    [409, 'FST_CONFLICT', 409, ERROR_CODES.conflict],
    [429, 'FST_ERR_RATE_LIMIT', 429, ERROR_CODES.rateLimited],
    [503, 'FST_UNAVAILABLE', 500, ERROR_CODES.unexpected],
  ] as const)('RF-007 a framework %i (%s) answers %i with %s', (statusCode, code, status, rst) => {
    const reply = toErrorReply(frameworkError(statusCode, code));

    expect(reply.status).toBe(status);
    expect(reply.body).toEqual(bodyOf(rst));
  });
});

describe('error mapper: unexpected failures', () => {
  it('RF-007 a plain error answers 500 with RST-2006 and no stack or message', () => {
    const error = new Error('secret detail at line 3');

    const reply = toErrorReply(error);

    expect(reply.status).toBe(500);
    expect(reply.body).toEqual(bodyOf(ERROR_CODES.unexpected));
    expect(JSON.stringify(reply.body)).not.toMatch(/\bat |secret detail/);
  });

  it.each([['a string'], [42], [null], [undefined], [{ statusCode: 400 }]])(
    'RF-007 a thrown non-error value (%j) answers 500 with RST-2006',
    (value) => {
      const reply = toErrorReply(value);

      expect(reply.status).toBe(500);
      expect(reply.body).toEqual(bodyOf(ERROR_CODES.unexpected));
    },
  );

  it('RF-007 marks 500 replies as unexpected so the caller logs them, and 4xx as expected', () => {
    expect(toErrorReply(new Error('boom')).unexpected).toBe(true);
    expect(toErrorReply(new RosettaError(ERROR_CODES.notFound)).unexpected).toBe(false);
  });
});
