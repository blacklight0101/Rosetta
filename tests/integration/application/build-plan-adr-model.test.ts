import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { withDecisions } from '../../support/coverage-plan-harness.js';
import { plain, seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// P9-15, RF-623, RF-613, ADR-007, ADR-008: after the gap rounds a plan run checks the data model
// against the decision records that name a stored structure, in one more planner call through the
// guarded provider; what it finds is named in checks.md and never fails the run. The plan is
// tests/recordings/fake/planner-package.json with its decision replaced by the eShop record
// ADR-001 (public eShopModernizing); the check replays a synthetic recording.

const temp = useTempRoot('rosetta-adr-model-');

const hilo = {
  title: 'Hi-lo ids generated in the application',
  context: 'The legacy catalog takes its ids from hi-lo sequences.',
  decision: 'Ids are generated in the application from hi-lo sequences.',
  consequences: 'The data model keeps the sequences.',
  sources: ['BR-001'],
};

const recordingOf = (name: string) => loadRecording(join('tests', 'recordings', 'fake', name));

async function checkedPlan(answer: string) {
  return seededUxPlan(temp.path, {
    recording: await withDecisions([hilo]),
    harness: { adrModelRecording: await recordingOf(answer) },
  });
}

describe('BuildPlan: the data model is checked against the decision records', () => {
  it('RF-623 P9-15 makes the call through the guarded provider, metered and recorded', async () => {
    const h = await checkedPlan('planner-adr-model-eshop-ev108.json');

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.adrModelRequests()).toHaveLength(1);
    const [request] = h.providers.adrModelRequests();
    expect(request?.context).toMatchObject({ role: 'planner', agentTaskId: 'planner-adr-model' });
    const metered = h.providers.ledger.entries.filter(
      (entry) => entry.agentTaskId === 'planner-adr-model',
    );
    expect(metered).toHaveLength(1);
    expect(metered[0]).toMatchObject({ role: 'planner', inputTokens: 1840, outputTokens: 212 });
    const manifest = await h.manifestOf(run);
    expect(Object.keys(manifest.promptVersions)).toContain('planner/adr-model.v1.md');
  });

  it('RF-623 P9-15 checks.md names the structures and the run still completes', async () => {
    const h = await checkedPlan('planner-adr-model-eshop-ev108.json');

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const checks = plain((await h.handoffOf(run))['checks.md']);
    const section = checks.split('## Data model against the decisions')[1] ?? '';
    expect(section).toContain('ADR-001 (Hi-lo ids generated in the application): catalog_hilo');
  });

  it('RF-623 P9-15 an unreadable answer: the check could not run and the run completes', async () => {
    const h = await checkedPlan('planner-adr-model-unreadable.json');

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const checks = plain((await h.handoffOf(run))['checks.md']);
    expect(checks).toContain('could not run: the answer could not be read');
  });

  it('RF-623 P9-15 a plan whose records name no stored structure makes no call', async () => {
    const h = await seededUxPlan(temp.path);

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.adrModelRequests()).toHaveLength(0);
    expect((await h.handoffOf(run))['checks.md']).not.toContain('against the decisions');
  });
});
