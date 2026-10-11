import { afterEach, describe, expect, it } from 'vitest';
import { describeError, ERROR_CODES, type ErrorCode } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-007, RNF-008: every API error is { code, message, nextStep } with the status of its cause and
// never a stack trace; one route per status through fastify.inject.

let current: TestServer | undefined;

function serverThrowing(error: unknown): TestServer {
  current = createTestServer();
  current.server.get('/test/failure', () => {
    throw error;
  });
  current.server.post('/test/echo', (request) => ({ received: request.body }));
  return current;
}

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const statusCases: readonly (readonly [number, ErrorCode])[] = [
  [400, ERROR_CODES.requestInvalid],
  [401, ERROR_CODES.notSignedIn],
  [403, ERROR_CODES.notAllowed],
  [404, ERROR_CODES.notFound],
  [409, ERROR_CODES.conflict],
  [429, ERROR_CODES.rateLimited],
  [500, ERROR_CODES.unexpected],
];

describe('error responses', () => {
  it.each(statusCases)(
    'RF-007 a route failing with the cause of status %i answers it with code, message and next step',
    async (status, code) => {
      const { server } = serverThrowing(new RosettaError(code));

      const response = await server.inject({ method: 'GET', url: '/test/failure' });

      expect(response.statusCode).toBe(status);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.json()).toEqual({ code, ...describeError(code) });
    },
  );

  it('RF-007 a request body that is not valid JSON answers 400 with RST-2000', async () => {
    const { server } = serverThrowing(new Error('unused'));

    const response = await server.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{ "name": ',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });

  it('RF-007 a request body over the size limit answers 400 with RST-2000', async () => {
    const { server } = serverThrowing(new Error('unused'));

    const response = await server.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'x'.repeat(1_100_000) }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });

  it('RF-007 an unknown address answers 404 with RST-2003', async () => {
    const { server } = serverThrowing(new Error('unused'));

    const response = await server.inject({ method: 'GET', url: '/api/no-such-thing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: ERROR_CODES.notFound,
      ...describeError(ERROR_CODES.notFound),
    });
  });

  it('RF-007 a thrown error with a stack answers 500 without any stack line or internal detail', async () => {
    const failure = new Error('connection to postgres://db:5432 refused');
    expect(failure.stack).toMatch(/\n\s+at /);
    const { server } = serverThrowing(failure);

    const response = await server.inject({ method: 'GET', url: '/test/failure' });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toMatch(/\bat /);
    expect(response.body).not.toContain('postgres://');
    expect(response.json()).toEqual({
      code: ERROR_CODES.unexpected,
      ...describeError(ERROR_CODES.unexpected),
    });
  });

  it('RF-007 the stack of an unexpected error is written only to the debug log', async () => {
    const failure = new Error('the failure route always fails');
    const { server, logger } = serverThrowing(failure);

    await server.inject({ method: 'GET', url: '/test/failure' });

    const withStack = logger.entries.filter((entry) => JSON.stringify(entry).includes(' at '));
    expect(withStack.length).toBeGreaterThan(0);
    expect(withStack.every((entry) => entry.level === 'debug')).toBe(true);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({ level: 'error', code: ERROR_CODES.unexpected }),
    );
  });
});
