import { render, type RenderResult } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { vi, type Mock } from 'vitest';
import { createApiClient } from '../../../web/src/api/client.js';
import type { Session } from '../../../web/src/api/schemas.js';
import { AppContext } from '../../../web/src/app/app-context.js';
import { RouteParamsContext } from '../../../web/src/app/route-params.js';
import { SessionContext } from '../../../web/src/app/session-context.js';

// A page under test: the real API client over a fake `fetch`, the recorded calls, and the
// providers the pages read (the client with `assign`, and the signed-in user).

interface RecordedCall {
  readonly method: string;
  readonly path: string;
  readonly csrf: string | null;
  /** The `If-Match` header, for a save that names the version it started from. */
  readonly ifMatch?: string;
  readonly body: unknown;
}

export type Answer = Response | ((call: RecordedCall) => Response | Promise<Response>);

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

function recordedCall(input: RequestInfo | URL, init: RequestInit | undefined): RecordedCall {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const text = typeof init?.body === 'string' ? init.body : undefined;
  const body: unknown = text === undefined ? undefined : JSON.parse(text);
  const headers = new Headers(init?.headers);
  const csrf = headers.get('x-csrf-token');
  const ifMatch = headers.get('if-match');
  const named = ifMatch === null ? {} : { ifMatch };
  return { method: init?.method ?? 'GET', path, csrf, ...named, body };
}

function answerTo(
  answers: Readonly<Record<string, Answer>>,
  call: RecordedCall,
): Response | Promise<Response> {
  const answer = answers[`${call.method} ${call.path}`];
  if (answer === undefined) return failure(404, 'RST-2003');
  return typeof answer === 'function' ? answer(call) : answer.clone();
}

export interface RenderedPage extends RenderResult {
  readonly calls: RecordedCall[];
  readonly assign: Mock<(path: string) => void>;
}

export function renderPage(
  page: ComponentChildren,
  answers: Readonly<Record<string, Answer>>,
  user: Session['user'] = ana,
  params: Readonly<Record<string, string>> = {},
): RenderedPage {
  const calls: RecordedCall[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    const call = recordedCall(input, init);
    calls.push(call);
    return Promise.resolve(answerTo(answers, call));
  };
  const client = createApiClient({ fetch: fetchFn });
  client.setCsrfToken('csrf-0');
  const assign = vi.fn<(path: string) => void>();
  const view = render(
    <AppContext.Provider value={{ client, assign }}>
      <SessionContext.Provider value={user}>
        <RouteParamsContext.Provider value={params}>{page}</RouteParamsContext.Provider>
      </SessionContext.Provider>
    </AppContext.Provider>,
  );
  return { calls, assign, ...view };
}
