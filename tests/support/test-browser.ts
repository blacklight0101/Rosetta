import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import type { UserAccount } from '../../src/domain/accounts/user.js';
import type { TestServer } from './web-server.js';
import { testPublicUrl } from './web-server.js';
import { fixturePassword, sampleAccount } from './account-fixtures.js';

// RF-1009, RF-1100, RF-1101: a browser for `fastify.inject`. It keeps the cookies the server sets
// (as a browser would for this origin), sends the public URL as `Origin` on state-changing
// requests and the CSRF token from the last sign-in or `GET /api/session` in `x-csrf-token`. Every
// response is kept, so a test can scan all of them for secrets.

type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

export interface BrowserRequest {
  readonly method: Method;
  readonly url: string;
  readonly payload?: InjectOptions['payload'];
  /** The Origin header; the public URL by default on state-changing requests, null for none. */
  readonly origin?: string | null;
  /** False sends no CSRF token; a string sends that token instead of the kept one. */
  readonly csrf?: boolean | string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly remoteAddress?: string;
}

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

function tokenOf(response: LightMyRequestResponse): string | undefined {
  const json = (response.headers['content-type'] ?? '').startsWith('application/json');
  if (!json || response.body === '') {
    return undefined;
  }
  const body: unknown = response.json();
  if (typeof body !== 'object' || body === null) return undefined;
  const token: unknown = Reflect.get(body, 'csrfToken');
  return typeof token === 'string' ? token : undefined;
}

export class TestBrowser {
  readonly cookies = new Map<string, string>();
  readonly responses: LightMyRequestResponse[] = [];
  csrfToken: string | undefined;
  private readonly server: FastifyInstance;

  constructor(server: FastifyInstance) {
    this.server = server;
  }

  async request(request: BrowserRequest): Promise<LightMyRequestResponse> {
    const response = await this.server.inject({
      method: request.method,
      url: request.url,
      headers: this.headersFor(request),
      ...(request.payload === undefined ? {} : { payload: request.payload }),
      ...(request.remoteAddress === undefined ? {} : { remoteAddress: request.remoteAddress }),
    });
    this.keep(response);
    return response;
  }

  signIn(
    userName: string,
    password: string,
    extra: Partial<BrowserRequest> = {},
  ): Promise<LightMyRequestResponse> {
    return this.request({
      method: 'POST',
      url: '/api/session',
      payload: { userName, password },
      ...extra,
    });
  }

  private headersFor(request: BrowserRequest): Record<string, string> {
    const headers: Record<string, string> = { ...request.headers };
    const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    if (cookie !== '') headers['cookie'] = cookie;
    if (!SAFE_METHODS.has(request.method)) {
      const origin = request.origin === undefined ? testPublicUrl : request.origin;
      if (origin !== null) headers['origin'] = origin;
    }
    const token = typeof request.csrf === 'string' ? request.csrf : this.csrfToken;
    if (request.csrf !== false && token !== undefined) headers['x-csrf-token'] = token;
    return headers;
  }

  private keep(response: LightMyRequestResponse): void {
    this.responses.push(response);
    for (const cookie of response.cookies) {
      const expired = cookie.maxAge === 0 || cookie.value === '';
      if (expired) this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
    this.csrfToken = tokenOf(response) ?? this.csrfToken;
  }
}

export interface TestUser {
  readonly account: UserAccount;
  readonly password: string;
}

/** Stores an account with a fixture password hashed by the server's hasher. */
export async function addUser(
  test: Pick<TestServer, 'users' | 'hasher'>,
  overrides: Partial<UserAccount> & { readonly userName: string },
): Promise<TestUser> {
  const password = fixturePassword(overrides.userName);
  const account = sampleAccount({ ...overrides, passwordHash: await test.hasher.hash(password) });
  const inserted = await test.users.insert(account);
  if (!inserted.ok) throw new Error(`Could not add the test user ${overrides.userName}`);
  return { account, password };
}

/** A browser signed in as the user; throws when the sign-in fails. */
export async function signedInBrowser(
  server: FastifyInstance,
  user: TestUser,
): Promise<TestBrowser> {
  const browser = new TestBrowser(server);
  const response = await browser.signIn(user.account.userName, user.password);
  if (response.statusCode !== 200) {
    throw new Error(`Sign-in of ${user.account.userName} answered ${String(response.statusCode)}`);
  }
  return browser;
}
