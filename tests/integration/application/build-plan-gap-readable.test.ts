import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { separateFrontEnd } from '../../support/api-plan-harness.js';
import { gappedPlan as gappedPlanIn, plain } from '../../support/gap-repair-fixtures.js';
import { useTempRoot } from '../../support/temp-root.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';

// P7-14, RF-627, RF-607, ADR-013, ADR-008: the plan does not fail RST-1806 when its gap cards are
// readable. Recorded answers shaped like the two failed runs of the evaluation of 2026-10-29:
// tests/recordings/fake/planner-gap-item-depends.json (Ollama eShop a9700a80: item ids in
// dependsOn, a repair answer that is not JSON as a whole) and
// tests/recordings/fake/planner-gap-empty-requirements.json (Haiku Invoice 8ff8e480: SDD cards
// with `"requirements": []`).

const temp = useTempRoot('rosetta-gap-readable-');

const recording = (name: string) => loadRecording(join('tests', 'recordings', 'fake', name));

describe('BuildPlan: answers shaped like the eShop plan a9700a80 (P7-14)', () => {
  it('RF-627 P7-14 item ids in dependsOn and a repair that is not JSON leave no gap card unread', async () => {
    const h = await gappedPlanIn(temp.path, await recording('planner-gap-item-depends.json'));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(2);
    const tasks = plain((await h.handoffOf(run))['tasks.md']);
    for (const title of [
      'Order operations',
      'The checkout journey',
      'Order list screen',
      'Order detail screen',
    ]) {
      expect(tasks).toContain(title);
    }
    expect(tasks).not.toContain('Informational pages');
    expect(h.s.logger.entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
  });

  it('RF-627 P7-14 checks.md lists what the gap and the repair answers left out', async () => {
    const h = await gappedPlanIn(temp.path, await recording('planner-gap-item-depends.json'));

    const checks = plain((await h.handoffOf(await h.plan()))['checks.md']);

    expect(checks).toContain('### Gap answer');
    expect(checks).toMatch(/^- `2`: the field "dependsOn"\. 2 entries .*card was kept\./mu);
    expect(checks).toMatch(/^- `3`: the field "phase"\. .*card was left out\./mu);
    expect(checks).toContain('### Gap repair answer');
    expect(checks).toMatch(/^- `1`: the field "card"\. .*not valid JSON.*card was left out\./mu);
  });

  it('RF-627 P7-14 the log says the repair answer was read card by card, with no answer text', async () => {
    const h = await gappedPlanIn(temp.path, await recording('planner-gap-item-depends.json'));

    await h.plan();

    const warned = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    const text = warned.map((entry) => entry.message).join('\n');
    expect(text).toMatch(/gap repair answer was not valid JSON as a whole/u);
    expect(text).not.toContain('Informational pages');
  });
});

describe('BuildPlan: answers shaped like the Haiku Invoice plan 8ff8e480 (P7-14)', () => {
  it('RF-607 P7-14 under SDD a gap card with no requirement is kept and the run completes', async () => {
    const h = await gappedPlanIn(temp.path, await recording('planner-gap-empty-requirements.json'));
    await h.saveBrief({ ...separateFrontEnd, principles: ['sdd'] });

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const written = await h.handoffOf(run);
    const tasks = plain(written['tasks.md']);
    expect(tasks).toContain('Order operations');
    expect(tasks).toContain('Menu navigation between the journey and its screens');
    expect(h.s.logger.entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
  });

  it('RF-607 P7-14 checks.md names each item no requirement covers as one that needs a requirement', async () => {
    const h = await gappedPlanIn(temp.path, await recording('planner-gap-empty-requirements.json'));
    await h.saveBrief({ ...separateFrontEnd, principles: ['sdd'] });

    const checks = plain((await h.handoffOf(await h.plan()))['checks.md']);

    expect(checks).toMatch(/T-\d{3} builds flow:FLOW-001, but no requirement cites/u);
    expect(checks).toMatch(/needs a requirement/u);
  });
});
