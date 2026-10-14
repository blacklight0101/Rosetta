import { expect, it } from 'vitest';
import { z } from 'zod';
import { createApiClient } from '../../../web/src/api/client.js';

// RNF-008: every error shows a code, a plain message and the next step. RF-1009: a state-changing
// request carries the CSRF token in x-csrf-token and a read does not.

/** The address of a fetch input, which may be a string, a URL or a Request. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string | null;
  readonly credentials: RequestCredentials | undefined;
}

function fakeFetch(answer: (seen: Seen, signal: AbortSignal | undefined) => Promise<Response>): {
  fetch: typeof fetch;
  seen: Seen[];
} {
  const seen: Seen[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const record: Seen = {
      url: urlOf(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : null,
      credentials: init?.credentials,
    };
    seen.push(record);
    return await answer(record, init?.signal ?? undefined);
  };
  return { fetch: fetchFn, seen };
}

const json = (status: number, body: unknown): Promise<Response> =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
const thing = z.object({ name: z.string() });

it('RNF-008 maps an error body to its code, message and next step', async () => {
  const { fetch } = fakeFetch(() =>
    json(404, { code: 'RST-2003', message: 'Not found.', nextStep: 'Check the address.' }),
  );
  const result = await createApiClient({ fetch }).request({
    method: 'GET',
    path: '/api/projects/x',
    schema: thing,
  });
  expect(result).toEqual({
    ok: false,
    error: {
      status: 404,
      code: 'RST-2003',
      message: 'Not found.',
      nextStep: 'Check the address.',
      problems: [],
    },
  });
});

it('RNF-008 keeps the field problems of a refusal, each with its own code', async () => {
  const problem = {
    field: 'url',
    code: 'RST-1903',
    message: 'Private.',
    nextStep: 'Use a public repository.',
    reason: 'private',
  };
  const { fetch } = fakeFetch(() =>
    json(400, { code: 'RST-2000', message: 'Bad.', nextStep: 'Fix it.', problems: [problem] }),
  );
  const result = await createApiClient({ fetch }).request({
    method: 'POST',
    path: '/api/projects',
    body: {},
    schema: thing,
  });
  expect(result.ok ? [] : result.error.problems).toEqual([problem]);
});

it('RNF-008 answers a coded failure when the error body is not an error body', async () => {
  const { fetch } = fakeFetch(() =>
    Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })),
  );
  const result = await createApiClient({ fetch }).request({
    method: 'GET',
    path: '/api/session',
    schema: thing,
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toMatchObject({ status: 502, code: 'RST-2006' });
  expect(result.error.message).not.toBe('');
  expect(result.error.nextStep).not.toBe('');
  expect(JSON.stringify(result.error)).not.toContain('Bad gateway');
});

it('RNF-008 maps a network failure to a failure with status 0 instead of throwing', async () => {
  const { fetch } = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
  const result = await createApiClient({ fetch }).request({
    method: 'GET',
    path: '/api/session',
    schema: thing,
  });
  expect(result).toMatchObject({ ok: false, error: { status: 0, code: 'RST-2009' } });
});

it('RNF-008 treats an answer of the wrong shape as a failure, never as data', async () => {
  const { fetch } = fakeFetch(() => json(200, { name: 7 }));
  const result = await createApiClient({ fetch }).request({
    method: 'GET',
    path: '/api/session',
    schema: thing,
  });
  expect(result).toMatchObject({ ok: false, error: { status: 200, code: 'RST-2006' } });
});

it('RNF-008 returns the parsed value of a good answer and accepts an empty 204', async () => {
  const good = fakeFetch(() => json(200, { name: 'ok', extra: 1 }));
  expect(
    await createApiClient({ fetch: good.fetch }).request({
      method: 'GET',
      path: '/api/x',
      schema: thing,
    }),
  ).toEqual({ ok: true, value: { name: 'ok' } });
  const empty = fakeFetch(() => Promise.resolve(new Response(null, { status: 204 })));
  expect(
    await createApiClient({ fetch: empty.fetch }).request({
      method: 'DELETE',
      path: '/api/session',
      schema: z.undefined(),
    }),
  ).toEqual({ ok: true, value: undefined });
});

it('RF-1009 sends the token on state-changing requests and not on reads', async () => {
  const { fetch, seen } = fakeFetch(() => json(200, { name: 'a' }));
  const client = createApiClient({ fetch });
  client.setCsrfToken('token-1');
  await client.request({ method: 'GET', path: '/api/a', schema: thing });
  for (const method of ['POST', 'PUT', 'DELETE'] as const) {
    await client.request({ method, path: '/api/a', body: { x: 1 }, schema: thing });
  }
  expect(seen.map((request) => request.headers.get('x-csrf-token'))).toEqual([
    null,
    'token-1',
    'token-1',
    'token-1',
  ]);
});

it('RF-1009 sends JSON bodies with the session cookie of the same origin only', async () => {
  const { fetch, seen } = fakeFetch(() => json(200, { name: 'a' }));
  await createApiClient({ fetch }).request({
    method: 'POST',
    path: '/api/projects',
    body: { url: 'https://github.com/o/r' },
    schema: thing,
  });
  expect(seen[0]).toMatchObject({
    url: '/api/projects',
    credentials: 'same-origin',
    body: '{"url":"https://github.com/o/r"}',
  });
  expect(seen[0]?.headers.get('content-type')).toBe('application/json');
});

it('RF-1009 answers a typed failure and sends no token to a path outside /api/', async () => {
  const { fetch, seen } = fakeFetch(() => json(200, { name: 'a' }));
  const client = createApiClient({ fetch });
  client.setCsrfToken('token-1');
  const result = await client.request({
    method: 'POST',
    path: 'https://evil.example/api/',
    schema: thing,
  });
  expect(result).toMatchObject({ ok: false, error: { status: 0, code: 'RST-2006' } });
  expect(seen).toEqual([]);
});

it('RNF-002 aborts a request that takes longer than the timeout', async () => {
  const { fetch } = fakeFetch(
    (_seen, signal) =>
      new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
  );
  const result = await createApiClient({ fetch, timeoutMs: 20 }).request({
    method: 'GET',
    path: '/api/slow',
    schema: thing,
  });
  expect(result).toMatchObject({ ok: false, error: { status: 0, code: 'RST-2009' } });
});

it('RNF-008 answers a cancelled code, not an outage, when the caller aborts', async () => {
  const { fetch } = fakeFetch(
    (_seen, signal) =>
      new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
  );
  const controller = new AbortController();
  const pending = createApiClient({ fetch }).request({
    method: 'GET',
    path: '/api/slow',
    schema: thing,
    signal: controller.signal,
  });
  controller.abort();
  const result = await pending;
  expect(result).toMatchObject({ ok: false, error: { status: 0, code: 'RST-2010' } });
});
