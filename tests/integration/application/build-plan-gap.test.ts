import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { withCoverageAnswer } from '../../support/coverage-plan-harness.js';
import { closingGapRecording, gapRecordingOf } from '../../support/gap-plan-harness.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// Q-45, RF-627, RF-630, RF-604, RNF-004, ADR-008: after the coverage call the planner gets one more
// call for the items no task card builds. It lists only those items, asks for task cards that build
// them, and the cards join the plan after the last; the gaps left after it are reported. The call
// replays tests/recordings/fake/planner-gap.json. The coverage call links only the first feature,
// so nine items are left without a card.

const temp = useTempRoot('rosetta-gap-');

const linksOne = JSON.stringify({ links: [{ task: 1, builds: ['feature:F-001'] }] });

const nineGaps = [
  'feature:F-002',
  'operation:getOrder',
  'operation:listCustomers',
  'operation:listOrders',
  'operation:placeOrder',
  'operation:signIn',
  'flow:FLOW-001',
  'screen:SCRN-001',
  'screen:SCRN-003',
];

async function gappedPlan(gap?: Awaited<ReturnType<typeof closingGapRecording>>) {
  return seededUxPlan(temp.path, {
    harness: {
      coverageRecording: await withCoverageAnswer(linksOne),
      gapRecording: gap ?? (await closingGapRecording()),
    },
  });
}

const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

describe('BuildPlan: the call for the items no card builds is sent', () => {
  it('RF-627 sends only the gaps, by id, as data, with its own prompt, and numbers the call after the others', async () => {
    const h = await gappedPlan();

    await h.plan();

    expect(h.providers.gapRequests()).toHaveLength(1);
    const request = h.providers.gapRequests()[0];
    const message = request?.messages.map((each) => each.content).join('\n') ?? '';
    for (const id of nineGaps) expect(message).toContain(`"id": "${id}"`);
    for (const built of ['feature:F-001', 'table:customer', 'table:customer_order']) {
      expect(message).not.toContain(`"id": "${built}"`);
    }
    expect(message).toContain('"title": "Order placement"');
    expect(request?.system).toBe(await readFile('prompts/planner/gap.v1.md', 'utf8'));
    expect(request?.context).toMatchObject({ role: 'planner', agentTaskId: 'planner-gap' });
    const all = [
      ...h.providers.requests(),
      ...h.providers.coverageRequests(),
      ...h.providers.gapRequests(),
    ];
    expect(new Set(all.map((each) => each.context.callId)).size).toBe(8);
  });

  it('RNF-004 the manifest records the prompt of the gap call, and the coverage prompt stays', async () => {
    const h = await gappedPlan();

    const manifest = await h.manifestOf(await h.plan());

    expect(Object.keys(manifest.promptVersions)).toEqual(
      expect.arrayContaining(['planner/gap.v1.md', 'planner/coverage.v1.md']),
    );
  });

  it('RF-627 a package whose cards build everything makes no gap call', async () => {
    const h = await seededUxPlan(temp.path);

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(0);
  });
});

describe('BuildPlan: gaps closed by the call', () => {
  it('Q-45 the run completes and checks.md has no gap', async () => {
    const h = await gappedPlan();

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const checks = plain((await h.handoffOf(run))['checks.md']);
    expect(checks).toContain('Every item is built by at least one task card.');
    expect(checks).not.toMatch(/^\| (feature|table|operation|flow|screen) /mu);
    expect(h.s.logger.entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
  });

  it('Q-45 RF-630 the new cards come after the last, in the format of a task card, with the items they build', async () => {
    const h = await gappedPlan();

    const written = await h.handoffOf(await h.plan());

    const cards = plain(written['tasks.md']).split(/^## /mu).slice(1);
    expect(cards.map((card) => card.split('\n')[0])).toEqual([
      ...['T-001', 'T-002', 'T-003', 'T-004', 'T-005', 'T-006'],
    ]);
    const added = cards.slice(3).join('\n');
    expect(added).toContain('Place and read orders through the API');
    expect(added).toContain('operation:placeOrder');
    expect(added).toContain('flow:FLOW-001');
    expect(added).toContain('Invariant: Only a signed-in customer reads the customer list');
    expect(added).toContain('Review probes:');
    expect(added).not.toContain('A card in a phase that does not exist');
    const first = cards[3] ?? '';
    expect(first).not.toContain('table:customer');
    expect(first).not.toContain('operation:ghost');
  });

  it('RF-634 a new card waits for the card it names', async () => {
    const h = await gappedPlan();

    const written = await h.handoffOf(await h.plan());

    const second = plain(written['tasks.md']).split(/^## /mu)[5] ?? '';
    expect(second).toMatch(/^T-005\n/u);
    expect(second).toContain('Depends on: [T-004]');
  });
});

function cardOf() {
  return {
    phase: 1,
    requirements: [1],
    acceptanceCriteria: ['Given a basket of 60, when it is posted, then the order is stored.'],
    invariant: 'An order posted is an order stored.',
  };
}

describe('BuildPlan: gaps left after the call', () => {
  const card = cardOf();
  const operationsOnly = JSON.stringify({
    tasks: [
      {
        ...card,
        title: 'Orders through the API',
        builds: [
          ...['operation:placeOrder', 'operation:getOrder', 'operation:listOrders'],
          ...['operation:signIn', 'operation:listCustomers', 'feature:F-002'],
        ],
      },
    ],
  });

  it('Q-45 RF-627 ends RST-1806 with only the gaps left, and the package says the same', async () => {
    const h = await gappedPlan(gapRecordingOf(operationsOnly));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.s.logger.entries).toContainEqual(
      expect.objectContaining({
        code: 'RST-1806',
        message: 'The package was written, but 3 item(s) are built by no task card; see checks.md.',
      }),
    );
    const written = await h.handoffOf(run);
    const checks = plain(written['checks.md']);
    expect(checks).toContain('3 items of 12 are built by no task card');
    for (const left of ['flow:FLOW-001', 'screen:SCRN-001', 'screen:SCRN-003']) {
      expect(checks).toContain(left);
    }
    for (const closed of ['operation:placeOrder', 'feature:F-002', 'operation:signIn']) {
      expect(checks).not.toContain(closed);
    }
    expect(plain(written['tasks.md'])).toContain('## T-004');
  });
});

describe('BuildPlan: answers that close nothing', () => {
  const card = cardOf();

  it('Q-45 an answer that is not task cards leaves every gap, and the log says so', async () => {
    const h = await gappedPlan(gapRecordingOf('All of it is built.'));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    const checks = plain((await h.handoffOf(run))['checks.md']);
    for (const left of nineGaps) expect(checks).toContain(left);
    const warned = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warned.map((entry) => entry.message).join(' ')).toContain('task cards for the');
  });

  it('Q-45 a card that builds no gap adds nothing, and the call is made once', async () => {
    const nothing = {
      ...card,
      title: 'Nothing new',
      builds: ['feature:F-001', 'table:customer', 'operation:ghost'],
    };
    const h = await gappedPlan(gapRecordingOf(JSON.stringify({ tasks: [nothing] })));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(plain((await h.handoffOf(run))['tasks.md'])).not.toContain('Nothing new');
    expect(h.providers.gapRequests()).toHaveLength(1);
  });
});
