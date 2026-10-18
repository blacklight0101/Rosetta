import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

// RF-1304, RNF-017, P1-55: a loopback stand-in for a deployed Rosetta, for the tests of
// scripts/smoke.mjs and scripts/measure-rnf017.mjs. It answers the public routes, the session
// API, project creation and deletion, the start of a scan and the run's event stream with the
// shapes of the real server, and records every request. Each behaviour can be changed to a fault.

export interface FakeHostBehaviour {
  /** The status of /healthz; 200 answers `{ status: 'ok' }`. */
  health: number;
  /** The account the sign-in accepts. */
  userName: string;
  password: string;
  /** `MustChangePassword` for an account that still has its temporary password (RF-1102). */
  accountState: 'Active' | 'MustChangePassword';
  /** How the scan run ends in its `run.ended` event. */
  endState: 'Completed' | 'Failed';
  /** Milliseconds the landing page waits before it answers. */
  landingDelayMs: number;
  /** Milliseconds between the creation of a live event and its `at` (a late event). */
  eventLagMs: number;
}

export interface HostRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<IncomingHttpHeaders>;
  readonly body: string;
}

const sessionId = 'fake-session';
const csrfToken = 'fake-csrf-token';
const projectId = 'project-1';
const runId = '20261018-100000-scan';

async function bodyOf(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function json(response: ServerResponse, status: number, body?: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeRosettaHost {
  readonly received: HostRequest[] = [];
  readonly behaviour: FakeHostBehaviour = {
    health: 200,
    userName: 'teacher',
    password: 'fake-teacher-password',
    accountState: 'Active',
    endState: 'Completed',
    landingDelayMs: 0,
    eventLagMs: 0,
  };
  private origin = '';
  private readonly server = createServer((request, response) => {
    void this.answer(request, response);
  });

  /** Starts on a free loopback port and returns its base URL. */
  async start(): Promise<string> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
    const address: AddressInfo | string | null = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('not listening');
    this.origin = `http://127.0.0.1:${String(address.port)}`;
    return this.origin;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  /** The requests received as "METHOD path", in order. */
  calls(): string[] {
    return this.received.map((request) => `${request.method} ${request.path}`);
  }

  private async answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const entry = {
      method: request.method ?? '',
      path: request.url ?? '',
      headers: request.headers,
      body: await bodyOf(request),
    };
    this.received.push(entry);
    if (entry.method === 'GET' && entry.path === '/healthz') this.health(response);
    else if (entry.method === 'GET' && entry.path === '/') await this.landing(response);
    else if (entry.path === '/api/session') this.session(entry, response);
    else if (!this.signedIn(entry)) json(response, 401, { code: 'RST-1100' });
    else this.api(entry, response);
  }

  private health(response: ServerResponse): void {
    const ok = this.behaviour.health === 200;
    json(response, this.behaviour.health, ok ? { status: 'ok', version: '0.1.0' } : undefined);
  }

  private async landing(response: ServerResponse): Promise<void> {
    await delay(this.behaviour.landingDelayMs);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Rosetta</title><h1>Read legacy code</h1>');
  }

  private signedIn(entry: HostRequest): boolean {
    const cookie = entry.headers.cookie ?? '';
    if (!cookie.includes(`__Host-rosetta_session=${sessionId}`)) return false;
    if (entry.method === 'GET') return true;
    return entry.headers['x-csrf-token'] === csrfToken && entry.headers.origin === this.origin;
  }

  private session(entry: HostRequest, response: ServerResponse): void {
    const { userName, password, accountState } = this.behaviour;
    if (entry.method === 'DELETE') json(response, this.signedIn(entry) ? 204 : 401);
    else if (entry.method !== 'POST' || entry.headers.origin !== this.origin) {
      json(response, 403, { code: 'RST-1102' });
    } else if (entry.body !== JSON.stringify({ userName, password })) {
      json(response, 401, { code: 'RST-1100' });
    } else {
      response.setHeader('set-cookie', [
        `__Host-rosetta_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict`,
        '__Host-rosetta_csrf=fake-secret; Path=/; HttpOnly; Secure; SameSite=Strict',
      ]);
      json(response, 200, { user: { userName, role: 'user', state: accountState }, csrfToken });
    }
  }

  private api(entry: HostRequest, response: ServerResponse): void {
    const answers: Readonly<Record<string, readonly [number, unknown]>> = {
      'GET /api/session': [200, { csrfToken }],
      'GET /api/projects': [200, { projects: [] }],
      'POST /api/projects': [201, { id: projectId }],
      [`POST /api/projects/${projectId}/runs`]: [202, { id: runId }],
      [`DELETE /api/projects/${projectId}`]: [200, {}],
    };
    const answer = answers[`${entry.method} ${entry.path}`];
    if (answer !== undefined) json(response, answer[0], answer[1]);
    else if (entry.method === 'GET' && entry.path === `/api/runs/${runId}/events`) {
      void this.events(response);
    } else if (entry.method === 'GET' && !entry.path.startsWith('/api/')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><title>Rosetta</title><div id="app"></div>');
    } else json(response, 404, { code: 'RST-1003' });
  }

  /**
   * The events are created after the stream opened (live events), each sent `eventLagMs` after
   * its `at`; the stream ends after `run.ended`, as the real one does.
   */
  private async events(response: ServerResponse): Promise<void> {
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
    const types = ['run.started', 'source.downloaded', 'run.ended'];
    for (const [index, type] of types.entries()) {
      await delay(20);
      const data = type === 'run.ended' ? { endState: this.behaviour.endState } : {};
      const event = { schemaVersion: 1, seq: index + 1, at: new Date().toISOString(), runId, type };
      await delay(this.behaviour.eventLagMs);
      const text = JSON.stringify({ ...event, data });
      response.write(`id: ${String(index + 1)}\nevent: ${type}\ndata: ${text}\n\n`);
    }
    response.end();
  }
}
