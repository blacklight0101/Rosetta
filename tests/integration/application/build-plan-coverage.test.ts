import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { withCoverageAnswer, withoutTasks } from '../../support/coverage-plan-harness.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-627, RF-623, RF-613, ADR-008: the implementation plan covers the whole set. After the plan and
// the documents, the planner is asked a seventh time which items each task card builds; the
// package says what no card builds in checks.md, and a run with such a gap is not complete. The
// seventh call replays tests/recordings/fake/planner-coverage.json.

const temp = useTempRoot('rosetta-coverage-');

function warnings(h: Awaited<ReturnType<typeof seededUxPlan>>): string {
  return h.s.logger.entries
    .filter((entry) => entry.level === 'warn')
    .map((entry) => entry.message)
    .join(' ');
}

describe('BuildPlan: the coverage call is sent', () => {
  it('RF-627 sends the task cards by position and every item by id, as data, with its own prompt', async () => {
    const h = await seededUxPlan(temp.path);

    await h.plan();

    const request = h.providers.coverageRequests()[0];
    const message = request?.messages.map((each) => each.content).join('\n') ?? '';
    for (const sent of [
      '"position": 1',
      '"title": "Order placement"',
      '"id": "feature:F-001"',
      '"id": "table:customer_order"',
      '"id": "operation:placeOrder"',
      '"id": "flow:FLOW-001"',
      '"id": "screen:SCRN-001"',
    ]) {
      expect(message).toContain(sent);
    }
    expect(request?.system).toBe(await readFile('prompts/planner/coverage.v1.md', 'utf8'));
    expect(request?.context).toMatchObject({ role: 'planner', agentTaskId: 'planner-coverage' });
    const all = [...h.providers.requests(), ...h.providers.coverageRequests()];
    expect(new Set(all.map((each) => each.context.callId)).size).toBe(7);
  });

  it('RF-627 the manifest records the prompt of the coverage call', async () => {
    const h = await seededUxPlan(temp.path);

    const manifest = await h.manifestOf(await h.plan());

    expect(Object.keys(manifest.promptVersions)).toContain('planner/coverage.v1.md');
  });
});

describe('BuildPlan: a plan that covers the whole set', () => {
  it('RF-627 the demo package has no uncovered item, so the run is complete', async () => {
    const h = await seededUxPlan(temp.path);

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const written = await h.handoffOf(run);
    expect(written['checks.md']).toContain('Every item is built by at least one task card.');
    expect(written['checks.md']).not.toMatch(/^\| (feature|table|operation|flow|screen) /mu);
  });

  it('RF-623 the first card of the package writes the migrations and builds every table', async () => {
    const h = await seededUxPlan(temp.path);

    const written = await h.handoffOf(await h.plan());

    const tasks = (written['tasks.md'] ?? '').replaceAll('\\', '');
    const first = tasks.split(/^## /mu).find((card) => card.startsWith('T-002\n')) ?? '';
    expect(first).toMatch(/^T-002\n/u);
    expect(first).toContain('Write the database migrations in the chosen stack');
    expect(first).toContain('customer_order');
    expect(first).toContain('Phase: [Phase 1]');
  });
});

describe('BuildPlan: a plan with a gap', () => {
  const linksOne = JSON.stringify({ links: [{ task: 1, builds: ['feature:F-001'] }] });

  it('RF-627 an item no card builds is listed in checks.md and the run is not complete', async () => {
    const h = await seededUxPlan(temp.path, {
      harness: { coverageRecording: await withCoverageAnswer(linksOne) },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    const checks = ((await h.handoffOf(run))['checks.md'] ?? '').replaceAll('\\', '');
    expect(checks).not.toContain('feature:F-001 ');
    for (const listed of ['operation:placeOrder', 'flow:FLOW-001', 'screen:SCRN-001']) {
      expect(checks).toContain(listed);
    }
    expect(checks).not.toContain('Every item is built');
  });

  it('RF-627 an answer that is not links leaves every item without a card but the tables', async () => {
    const recording = await withCoverageAnswer('Everything is covered.');
    const h = await seededUxPlan(temp.path, { harness: { coverageRecording: recording } });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    const checks = ((await h.handoffOf(run))['checks.md'] ?? '').replaceAll('\\', '');
    expect(checks).toContain('feature:F-001');
    expect(checks).not.toContain('table:customer_order');
    expect(warnings(h)).toContain('links could not be read');
  });
});

describe('BuildPlan: the package of a run with a gap', () => {
  const linksOne = JSON.stringify({ links: [{ task: 1, builds: ['feature:F-001'] }] });

  it('RF-627 the package of a run with a gap is still written whole', async () => {
    const h = await seededUxPlan(temp.path, {
      harness: { coverageRecording: await withCoverageAnswer(linksOne) },
    });

    const written = await h.handoffOf(await h.plan());

    expect(Object.keys(written)).toEqual(
      expect.arrayContaining(['README.md', 'tasks.md', 'roadmap.md', 'checks.md']),
    );
  });

  it('RF-627 a link to an item that does not exist builds nothing', async () => {
    const answer = JSON.stringify({
      links: [{ task: 1, builds: ['feature:F-099', 'F-001', 'FEAT-001', 'operation:ghost'] }],
    });
    const h = await seededUxPlan(temp.path, {
      harness: { coverageRecording: await withCoverageAnswer(answer) },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    const checks = ((await h.handoffOf(run))['checks.md'] ?? '').replaceAll('\\', '');
    expect(checks).toContain('feature:F-001');
    expect(checks).not.toContain('F-099');
    expect(checks).not.toContain('ghost');
  });
});

describe('BuildPlan: a plan with no task card', () => {
  it('RF-627 reports every item uncovered, asks for no links and does not complete the run', async () => {
    const h = await seededUxPlan(temp.path, { recording: await withoutTasks() });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    expect(h.providers.coverageRequests()).toHaveLength(0);
    const checks = ((await h.handoffOf(run))['checks.md'] ?? '').replaceAll('\\', '');
    for (const listed of ['feature:F-001', 'table:customer', 'flow:FLOW-001', 'screen:SCRN-001']) {
      expect(checks).toContain(listed);
    }
  });
});
