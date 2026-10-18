// RF-1304, RNF-017, P1-55: what scripts/smoke.mjs and scripts/measure-rnf017.mjs share. A small
// client of a running Rosetta over its public HTTP API: it keeps the session and CSRF cookies,
// sends the public origin and the CSRF token with every state-changing request (RF-1009), and reads
// a run's event stream. Plain Node.js, no package, so it runs on any machine with Node.js 24.
// The account comes from the environment, never from an argument, and is never printed (RNF-003).

const REQUEST_TIMEOUT_MS = 20_000;

/** The smoke account from ROSETTA_SMOKE_USER and ROSETTA_SMOKE_PASSWORD, or undefined. */
export function accountFrom(env) {
  const userName = env.ROSETTA_SMOKE_USER ?? '';
  const password = env.ROSETTA_SMOKE_PASSWORD ?? '';
  return userName === '' || password === '' ? undefined : { userName, password };
}

export const missingAccount =
  'Set ROSETTA_SMOKE_USER and ROSETTA_SMOKE_PASSWORD in the environment (the account to sign in with).';

/** The detail of a failure, without a stack. */
export function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

export class RosettaClient {
  constructor(baseUrl) {
    this.base = new URL(baseUrl);
    this.origin = this.base.origin;
    this.cookies = new Map();
    this.csrfToken = '';
  }

  /** One request; never follows a redirect, so a redirect is seen as what it is. */
  async request(method, path, { body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const headers = { accept: 'application/json, text/html, text/event-stream' };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    if (method !== 'GET') {
      headers.origin = this.origin;
      if (this.csrfToken !== '') headers['x-csrf-token'] = this.csrfToken;
    }
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(new URL(path, this.base), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    this.keepCookies(response);
    return response;
  }

  keepCookies(response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const split = pair.indexOf('=');
      if (split > 0) this.cookies.set(pair.slice(0, split).trim(), pair.slice(split + 1).trim());
    }
  }

  /** RF-1100: signs in and returns the account the server answered. */
  async signIn(account) {
    const response = await this.request('POST', '/api/session', { body: account });
    if (response.status !== 200) {
      throw new Error(`POST /api/session answered ${String(response.status)}`);
    }
    const answer = await response.json();
    if (typeof answer?.csrfToken !== 'string') throw new Error('the sign-in answer has no token');
    this.csrfToken = answer.csrfToken;
    return answer.user ?? {};
  }

  /** RF-1100: signs out; a failure here is reported, not thrown. */
  async signOut() {
    if (this.csrfToken === '') return 'not signed in';
    const response = await this.request('DELETE', '/api/session');
    this.csrfToken = '';
    return response.status === 204
      ? 'signed out'
      : `DELETE /api/session answered ${response.status}`;
  }

  /**
   * RF-1006: reads the event stream of a run until the server closes it (after `run.ended`) or
   * the time runs out; calls `onEvent(event, receivedAtMs)` for each event.
   */
  async followEvents(runId, onEvent, timeoutMs) {
    const response = await this.request('GET', `/api/runs/${encodeURIComponent(runId)}/events`, {
      timeoutMs,
    });
    if (response.status !== 200 || response.body === null) {
      throw new Error(`the event stream answered ${String(response.status)}`);
    }
    const decoder = new TextDecoder();
    let pending = '';
    for await (const chunk of response.body) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines.filter((text) => text.startsWith('data: '))) {
        onEvent(JSON.parse(line.slice('data: '.length)), Date.now());
      }
    }
  }
}
