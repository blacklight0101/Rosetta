import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defaultPrinciples } from '../../../../src/domain/planning/catalogue.js';
import { migrationStrategies } from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-605, RF-606, RF-610: GET /api/plan/catalogue gives Plan setup the catalogue it lists its
// questions from: every entry with its rule, why it matters, how to check it and whether a new brief
// switches it on (DEC-74), and the three migration strategies, Strangler Fig first.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const entry = z.object({
  ...{ id: z.string(), group: z.string(), title: z.string(), rule: z.string() },
  ...{ why: z.string(), check: z.string(), defaultOn: z.boolean() },
});
const catalogueBody = z.object({
  version: z.number(),
  entries: z.array(entry),
  migrations: z.array(z.object({ id: z.string(), title: z.string(), tradeOff: z.string() })),
});

async function open() {
  const test = createTestServer();
  current = test;
  return signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));
}

describe('GET /api/plan/catalogue', () => {
  it('RF-606 lists every entry of the shipped catalogue with its rule, why and check', async () => {
    const amy = await open();

    const response = await amy.request({ method: 'GET', url: '/api/plan/catalogue' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = catalogueBody.parse(response.json());
    expect(body.version).toBe(shippedCatalogue.version);
    expect(body.entries.map((each) => each.id)).toEqual(
      shippedCatalogue.entries.map((each) => each.id),
    );
    expect(body.entries[0]).toEqual({
      ...{ id: shippedCatalogue.entries[0]?.id, group: shippedCatalogue.entries[0]?.group },
      ...{ title: shippedCatalogue.entries[0]?.title, rule: shippedCatalogue.entries[0]?.rule },
      ...{ why: shippedCatalogue.entries[0]?.why, check: shippedCatalogue.entries[0]?.check },
      defaultOn: shippedCatalogue.entries[0]?.defaultOn,
    });
  });

  it('RF-606 marks the entries a new brief switches on, as DEC-74 lists them', async () => {
    const amy = await open();

    const response = await amy.request({ method: 'GET', url: '/api/plan/catalogue' });

    const body = catalogueBody.parse(response.json());
    const on = body.entries.filter((each) => each.defaultOn).map((each) => each.id);
    expect(on.sort()).toEqual(defaultPrinciples(shippedCatalogue));
    expect(on).toEqual(
      expect.arrayContaining([
        ...['solid', 'kiss', 'dry', 'yagni', 'tdd', 'sdd', 'adrs'],
        ...['testing-pyramid', 'security-by-design', 'ci-gates'],
      ]),
    );
    expect(body.entries.filter((each) => !each.defaultOn).length).toBeGreaterThan(10);
  });
});

describe('GET /api/plan/catalogue: migrations and access', () => {
  it('RF-610 lists the three migration strategies, Strangler Fig first, with their trade-off', async () => {
    const amy = await open();

    const response = await amy.request({ method: 'GET', url: '/api/plan/catalogue' });

    const { migrations } = catalogueBody.parse(response.json());
    expect(migrations.map((each) => each.id)).toEqual([...migrationStrategies]);
    expect(migrations[0]).toMatchObject({ title: 'Strangler Fig' });
    for (const each of migrations) expect(each.tradeOff.length).toBeGreaterThan(20);
  });

  it('RF-1009 needs a session', async () => {
    const test = createTestServer();
    current = test;

    const response = await test.server.inject({ method: 'GET', url: '/api/plan/catalogue' });

    expect(response.statusCode).toBe(401);
  });
});
