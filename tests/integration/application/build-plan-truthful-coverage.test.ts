import { describe, expect, it } from 'vitest';
import {
  withCoverageAnswer,
  withPhaseNames,
  withoutTasks,
} from '../../support/coverage-plan-harness.js';
import { dependenciesGapRecording, gapRecordingOf } from '../../support/gap-plan-harness.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-627, P5-40: the coverage checks count what they claim and the gap pass keeps dependencies. The
// demo plan has T-001 (migrations, by code), T-002 "Order placement" (REQ-001, REQ-002) and T-003
// "Order cancellation" (REQ-003, REQ-004); REQ-002 and REQ-003 cite FEAT-002, the source of F-002.

const temp = useTempRoot('rosetta-truthful-');

const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

function gapCard(overrides: Record<string, unknown>) {
  return {
    phase: 1,
    requirements: [1],
    acceptanceCriteria: ['Given a basket of 60, when it is posted, then the order is stored.'],
    invariant: 'An order posted is an order stored.',
    riskClass: 'none',
    ...overrides,
  };
}

const oneLink = JSON.stringify({ links: [{ task: 1, builds: ['screen:SCRN-003'] }] });
const noLinks = JSON.stringify({ links: [] });

describe('BuildPlan: the gap pass keeps its dependencies', () => {
  it('RF-627 P5-40 a recorded gap card that names the migrations card waits for it', async () => {
    const h = await seededUxPlan(temp.path, {
      harness: {
        coverageRecording: await withCoverageAnswer(oneLink),
        gapRecording: await dependenciesGapRecording(),
      },
    });

    const written = await h.handoffOf(await h.plan());

    const cards = plain(written['tasks.md']).split(/^## /mu);
    const card = cards.find((each) => each.includes('**Orders through the API**'));
    const waits = /Depends on: [^\n]*/u.exec(card ?? '')?.[0] ?? '';
    expect(waits).toContain('[T-001]');
    expect(waits).toContain('[T-002]');
  });
});

describe('BuildPlan: a feature built through the requirements of a card', () => {
  it('RF-627 P5-40 a card that lists the requirement of a feature builds it, and the run is not failed for it', async () => {
    const others = [
      ...['operation:getOrder', 'operation:listCustomers', 'operation:listOrders'],
      ...['operation:placeOrder', 'operation:signIn', 'flow:FLOW-001', 'screen:SCRN-001'],
    ];
    const answer = JSON.stringify({
      tasks: [gapCard({ title: 'Everything else', dependsOn: [], builds: others })],
    });
    const h = await seededUxPlan(temp.path, {
      harness: {
        coverageRecording: await withCoverageAnswer(oneLink),
        gapRecording: gapRecordingOf(answer),
      },
    });

    const run = await h.plan();

    expect(h.providers.gapRequests()).toHaveLength(1);
    const gapMessage = h.providers
      .gapRequests()[0]
      ?.messages.map((each) => each.content)
      .join('');
    expect(gapMessage).not.toContain('"id": "feature:F-002"');
    expect(run.endState).toBe('Completed');
    expect(h.s.logger.entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    const checks = plain((await h.handoffOf(run))['checks.md']);
    expect(checks).toContain('Every item is built by at least one task card.');
  });
});

describe('BuildPlan: coverage is checked again after the gap pass', () => {
  it('RF-627 P5-40 coverage is checked again after the gap pass: a gap card that lists a requirement builds its feature', async () => {
    const answer = JSON.stringify({
      tasks: [gapCard({ title: 'Checkout journey', builds: ['flow:FLOW-001'], requirements: [1] })],
    });
    const h = await seededUxPlan(temp.path, {
      harness: {
        coverageRecording: await withCoverageAnswer(noLinks),
        gapRecording: gapRecordingOf(answer),
      },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    const checks = plain((await h.handoffOf(run))['checks.md']);
    expect(checks).not.toContain('feature:');
    expect(checks).toContain('operation:placeOrder');
  });

  it('RF-627 P5-40 RST-1806 stays for a real gap: nothing builds the item', async () => {
    const h = await seededUxPlan(temp.path, {
      harness: { coverageRecording: await withCoverageAnswer(noLinks) },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    expect(plain((await h.handoffOf(run))['checks.md'])).toContain('feature:F-001');
  });
});

describe('BuildPlan: checks.md counts requirements and keeps phases true', () => {
  it('RF-627 P5-40 a requirement that no card lists is listed in checks.md', async () => {
    const h = await seededUxPlan(temp.path, { recording: await withoutTasks() });

    const checks = plain((await h.handoffOf(await h.plan()))['checks.md']);

    expect(checks).toContain('## Requirements built by no card');
    expect(checks).toContain('REQ-001');
  });

  it('RF-627 P5-40 the demo plan, where every requirement is on a card, has no such section', async () => {
    const h = await seededUxPlan(temp.path);

    const checks = plain((await h.handoffOf(await h.plan()))['checks.md']);

    expect(checks).not.toContain('## Requirements built by no card');
    expect(checks).not.toContain('## Phase titles');
  });
});

describe('BuildPlan: a phase is titled from the cards it holds', () => {
  it('RF-627 P5-40 a phase named for other work is renamed in the roadmap and listed in checks.md', async () => {
    const recording = await withPhaseNames(['Billing', 'Cancellation']);
    const h = await seededUxPlan(temp.path, { recording });

    const written = await h.handoffOf(await h.plan());

    const checks = plain(written['checks.md']);
    expect(checks).toContain('## Phase titles');
    expect(checks).toMatch(/Phase 1: "Billing" is now ".*Order placement"/u);
    expect(plain(written['roadmap.md'])).toContain('Order placement');
    expect(plain(written['roadmap.md'])).not.toContain('Billing');
  });
});
