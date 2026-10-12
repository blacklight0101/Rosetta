import { render } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { vi } from 'vitest';
import { createApiClient } from '../../../web/src/api/client.js';
import type { Session } from '../../../web/src/api/schemas.js';
import { AppContext } from '../../../web/src/app/app-context.js';
import { SessionContext } from '../../../web/src/app/session-context.js';

// A page under test: the real API client over a fake `fetch`, the recorded calls, and the
// providers the pages read (the client with `assign`, and the signed-in user).

export interface RecordedCall {
  readonly method: string;
  readonly path: string;
  readonly csrf: string | null;
  readonly body: unknown;
}

export type Answer = Response | ((call: RecordedCall) => Response);

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const empty = (status: number): Response => new Response(null, { status });

export function failure(
  status: number,
  code: string,
  problems?: readonly { field: string; code: string }[],
): Response {
  const problemBodies = problems?.map((problem) => ({
    ...problem,
    message: `Message of ${problem.code}.`,
    nextStep: `Next step of ${problem.code}.`,
  }));
  return json(status, {
    code,
    message: `Message of ${code}.`,
    nextStep: `Next step of ${code}.`,
    ...(problemBodies === undefined ? {} : { problems: problemBodies }),
  });
}

export const ana: Session['user'] = {
  id: 'u-1',
  userName: 'ana.ruiz',
  displayName: 'Ana Ruiz',
  role: 'user',
  state: 'Active',
};

export function renderPage(
  page: ComponentChildren,
  answers: Readonly<Record<string, Answer>>,
  user: Session['user'] = ana,
) {
  const calls: RecordedCall[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const text = typeof init?.body === 'string' ? init.body : undefined;
    const body: unknown = text === undefined ? undefined : JSON.parse(text);
    const call = { method, path, csrf: new Headers(init?.headers).get('x-csrf-token'), body };
    calls.push(call);
    const answer = answers[`${method} ${path}`];
    if (answer === undefined) return Promise.resolve(failure(404, 'RST-2003'));
    return Promise.resolve(typeof answer === 'function' ? answer(call) : answer.clone());
  };
  const client = createApiClient({ fetch: fetchFn });
  client.setCsrfToken('csrf-0');
  const assign = vi.fn();
  const view = render(
    <AppContext.Provider value={{ client, assign }}>
      <SessionContext.Provider value={user}>{page}</SessionContext.Provider>
    </AppContext.Provider>,
  );
  return { calls, assign, ...view };
}
