import { afterEach, describe, expect, it } from 'vitest';
import type { PasswordHasher } from '../../../../src/application/ports/password-hasher.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FakePasswordHasher, fixturePassword } from '../../../support/account-fixtures.js';
import { TestBrowser } from '../../../support/test-browser.js';
import {
  createTestServer,
  type TestServer,
  type TestServerOptions,
} from '../../../support/web-server.js';

// RF-1109, DEC-141 (P1-157, P1-49 F-01): every writer of a `request.refused` row (the Origin
// refusal, the route rate limits and the in-flight bound of sign-in) shares one limit per client
// address: 30 rows a minute, then one counted `rate-limit` row for the rest of that minute. The
// requests are still refused with their usual status. The address is `request.ip`, which follows
// a forwarded header only as far as ROSETTA_TRUST_PROXY says.

const MINUTE = 60_000;
const attacker = '203.0.113.66';

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

function serve(options: TestServerOptions = {}): TestServer {
  current = createTestServer(options);
  return current;
}

async function refusedRows(test: TestServer) {
  return test.audit.list({ since: 0, action: 'request.refused' });
}

function crossOrigin(test: TestServer, extra: { url?: string; headers?: Record<string, string> }) {
  return new TestBrowser(test.server).request({
    method: 'POST',
    url: extra.url ?? '/api/projects',
    origin: 'https://evil.example',
    remoteAddress: attacker,
    ...(extra.headers === undefined ? {} : { headers: extra.headers }),
  });
}

/** Ends the minute and lets the next refusal (from another address) write the count row. */
async function endMinute(test: TestServer): Promise<void> {
  test.clock.advance(MINUTE);
  await new TestBrowser(test.server).request({
    method: 'POST',
    url: '/api/projects',
    origin: null,
    remoteAddress: '198.51.100.200',
  });
}

function countRows(rows: Awaited<ReturnType<typeof refusedRows>>) {
  return rows.filter((row) => row.ip === attacker && 'count' in row.detail);
}

describe('refusal rows per address', () => {
  it('RF-1109 1,000 cross-origin POSTs from one address in a minute write at most 31 rows', async () => {
    const test = serve();
    const statuses = new Set<number>();

    for (let index = 0; index < 1_000; index += 1) {
      statuses.add((await crossOrigin(test, {})).statusCode);
    }
    const duringMinute = (await refusedRows(test)).filter((row) => row.ip === attacker);
    await endMinute(test);
    const rows = (await refusedRows(test)).filter((row) => row.ip === attacker);

    expect([...statuses]).toEqual([403]);
    expect(duringMinute).toHaveLength(30);
    expect(rows).toHaveLength(31);
    expect(countRows(rows).map((row) => row.detail)).toEqual([
      { reason: 'rate-limit', count: 970, windowStart: '2026-10-11T09:00:00.000Z' },
    ]);
  });

  it('RF-1109 1,000 same-origin sign-ins from one address in a minute write at most 31 refusal rows', async () => {
    const test = serve();
    const browser = new TestBrowser(test.server);
    const statuses: number[] = [];

    for (let index = 0; index < 1_000; index += 1) {
      const response = await browser.signIn(`nobody${String(index)}`, fixturePassword('X'), {
        remoteAddress: attacker,
      });
      statuses.push(response.statusCode);
    }
    await endMinute(test);
    const rows = (await refusedRows(test)).filter((row) => row.ip === attacker);

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(new Set(statuses.slice(10))).toEqual(new Set([429]));
    expect(rows).toHaveLength(31);
    expect(countRows(rows).map((row) => row.detail)).toEqual([
      { reason: 'rate-limit', count: 960, windowStart: '2026-10-11T09:00:00.000Z' },
    ]);
  });
});

describe('refusal rows shared by every writer', () => {
  it('RF-1109 the Origin refusal and the route rate limit share one limit per address', async () => {
    const test = serve();
    const browser = new TestBrowser(test.server);
    for (let index = 0; index < 20; index += 1) await crossOrigin(test, {});
    for (let index = 0; index < 25; index += 1) {
      await browser.signIn(`nobody${String(index)}`, fixturePassword('X'), {
        remoteAddress: attacker,
      });
    }

    await endMinute(test);
    const rows = (await refusedRows(test)).filter((row) => row.ip === attacker);

    expect(rows).toHaveLength(31);
    expect(countRows(rows)).toHaveLength(1);
    expect(countRows(rows)[0]?.detail).toMatchObject({ count: 5 });
  });

  it('RF-1109 two addresses each get their own 30 rows', async () => {
    const test = serve();
    for (const address of ['203.0.113.1', '203.0.113.2']) {
      for (let index = 0; index < 40; index += 1) {
        await new TestBrowser(test.server).request({
          method: 'POST',
          url: '/api/projects',
          origin: null,
          remoteAddress: address,
        });
      }
    }

    const rows = await refusedRows(test);

    expect(rows.filter((row) => row.ip === '203.0.113.1')).toHaveLength(30);
    expect(rows.filter((row) => row.ip === '203.0.113.2')).toHaveLength(30);
  });

  it('RF-1109 closing the server writes the count of a minute not yet ended', async () => {
    const test = serve();
    for (let index = 0; index < 35; index += 1) await crossOrigin(test, {});

    await test.server.close();
    current = undefined;

    expect(countRows(await refusedRows(test)).map((row) => row.detail)).toEqual([
      { reason: 'rate-limit', count: 5, windowStart: '2026-10-11T09:00:00.000Z' },
    ]);
  });
});

/** A hasher whose `verify` waits until `release` is called. */
function heldHasher() {
  const inner = new FakePasswordHasher();
  const state = { started: 0, release: (): void => undefined };
  const held = new Promise<void>((resolve) => {
    state.release = resolve;
  });
  const hasher: PasswordHasher = {
    hash: (password) => inner.hash(password),
    verify: async (password, hash) => {
      state.started += 1;
      await held;
      return inner.verify(password, hash);
    },
  };
  return { hasher, state };
}

describe('refusal rows of the in-flight bound', () => {
  it('RF-1109 the in-flight bound of sign-in shares the per-address limit', async () => {
    const { hasher, state } = heldHasher();
    const test = serve({ hasher });
    const browser = new TestBrowser(test.server);
    for (let index = 0; index < 30; index += 1) await crossOrigin(test, {});
    const held = Array.from({ length: 8 }, (_, index) =>
      browser.signIn(`held${String(index)}`, fixturePassword('X'), { remoteAddress: attacker }),
    );
    for (let turn = 0; turn < 1000 && state.started < 8; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    const ninth = await browser.signIn('ninth', fixturePassword('X'), { remoteAddress: attacker });
    state.release();
    await Promise.all(held);
    await endMinute(test);

    expect(ninth.statusCode).toBe(429);
    expect(ninth.json()).toMatchObject({ code: ERROR_CODES.rateLimited });
    const rows = (await refusedRows(test)).filter((row) => row.ip === attacker);
    expect(rows).toHaveLength(31);
    expect(countRows(rows)[0]?.detail).toMatchObject({ count: 1 });
  });
});

describe('refusal rows and forwarded addresses', () => {
  it('RF-1109 an X-Forwarded-For header is not trusted when ROSETTA_TRUST_PROXY is 0', async () => {
    const test = serve({ trustProxy: 0 });
    for (let index = 0; index < 100; index += 1) {
      await crossOrigin(test, { headers: { 'x-forwarded-for': `10.0.0.${String(index)}` } });
    }

    const rows = await refusedRows(test);

    expect(rows).toHaveLength(30);
    expect(new Set(rows.map((row) => row.ip))).toEqual(new Set([attacker]));
  });

  it('RF-1109 a trusted proxy hop gives each forwarded address its own limit', async () => {
    const test = serve({ trustProxy: 1 });
    for (let index = 0; index < 70; index += 1) {
      await crossOrigin(test, { headers: { 'x-forwarded-for': `10.0.0.${String(index % 2)}` } });
    }

    const rows = await refusedRows(test);

    expect(rows.filter((row) => row.ip === '10.0.0.0')).toHaveLength(30);
    expect(rows.filter((row) => row.ip === '10.0.0.1')).toHaveLength(30);
    expect(rows.filter((row) => row.ip === attacker)).toHaveLength(0);
  });
});

describe('refusal rows of long paths', () => {
  it('RF-1109 a refused request with a 16 KB path stores 512 characters of it and a marker', async () => {
    const test = serve();
    const path = `/api/${'p'.repeat(16_000)}`;

    const response = await crossOrigin(test, { url: path });

    expect(response.statusCode).toBe(403);
    const stored = `${path.slice(0, 512)}[cut]`;
    const [row] = await refusedRows(test);
    expect(row?.targetId).toBe(`POST ${stored}`);
    const event = test.logger.entries.find((entry) => entry.code === ERROR_CODES.originRefused);
    expect(event?.message).toBe(`Refused a request (origin): POST ${stored}`);
    expect(event?.data).toMatchObject({ path: stored });
    expect(JSON.stringify(event).includes('p'.repeat(600))).toBe(false);
  });
});
