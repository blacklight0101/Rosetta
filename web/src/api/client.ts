import type { z } from 'zod';
import { errorBodySchema } from './schemas.js';

// RNF-008, RF-1009: the typed API client. It sends the CSRF token on every state-changing request,
// maps an error body to its code, plain message and next step, and never throws for an HTTP or
// network failure: callers get a typed result (conventions section 6). Every call has a timeout
// and accepts an AbortSignal (conventions section 5).

export interface ApiProblem {
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly nextStep: string;
  readonly reason?: string | undefined;
}

export interface ApiFailure {
  /** The HTTP status; 0 when no answer arrived. */
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly nextStep: string;
  readonly problems: readonly ApiProblem[];
}

export type ApiResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiFailure };

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface ApiRequest<T> {
  readonly method: ApiMethod;
  /** Always under /api/: the CSRF token must never leave for another path or origin. */
  readonly path: string;
  readonly body?: unknown;
  /** Parses the body of a good answer; `z.undefined()` for an empty 204. */
  readonly schema: z.ZodType<T>;
  readonly signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(request: ApiRequest<T>): Promise<ApiResult<T>>;
  /** The token `GET /api/session` or the sign-in answered; kept in memory only. */
  setCsrfToken(token: string): void;
}

export interface ApiClientOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const csrfHeader = 'x-csrf-token';
const defaultTimeoutMs = 15_000;
/** RST-2006 is the catalogue's "unexpected error"; the wording is the client's own. */
const unexpectedCode = 'RST-2006';

function unexpected(status: number, message: string, nextStep: string): ApiResult<never> {
  return { ok: false, error: { status, code: unexpectedCode, message, nextStep, problems: [] } };
}

const unreachable = (): ApiResult<never> =>
  unexpected(0, 'Rosetta could not be reached.', 'Check your connection and try again.');
const unreadable = (status: number): ApiResult<never> =>
  unexpected(
    status,
    'Rosetta answered in a way this page does not understand.',
    'Reload the page. If it happens again, report the code.',
  );

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return undefined;
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

function failureOf(status: number, body: unknown): ApiResult<never> {
  const parsed = errorBodySchema.safeParse(body);
  if (!parsed.success) return unreadable(status);
  const { code, message, nextStep, problems = [] } = parsed.data;
  return { ok: false, error: { status, code, message, nextStep, problems } };
}

async function parseAnswer<T>(response: Response, schema: z.ZodType<T>): Promise<ApiResult<T>> {
  let body: unknown;
  try {
    body = await readJson(response);
  } catch {
    return unreadable(response.status);
  }
  if (!response.ok) return failureOf(response.status, body);
  const parsed = schema.safeParse(body);
  return parsed.success ? { ok: true, value: parsed.data } : unreadable(response.status);
}

// RNF-008, RF-1009
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const { timeoutMs = defaultTimeoutMs } = options;
  const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  let csrfToken: string | undefined;

  return {
    setCsrfToken(token) {
      csrfToken = token;
    },
    async request<T>(request: ApiRequest<T>): Promise<ApiResult<T>> {
      if (!request.path.startsWith('/api/')) {
        throw new Error(`API paths start with /api/, got ${request.path}`);
      }
      const headers = new Headers({ accept: 'application/json' });
      if (request.body !== undefined) headers.set('content-type', 'application/json');
      if (request.method !== 'GET' && csrfToken !== undefined) headers.set(csrfHeader, csrfToken);
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal =
        request.signal === undefined ? timeout : AbortSignal.any([timeout, request.signal]);
      try {
        const response = await send(request.path, {
          method: request.method,
          headers,
          credentials: 'same-origin',
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
          signal,
        });
        return await parseAnswer(response, request.schema);
      } catch {
        return unreachable();
      }
    },
  };
}
