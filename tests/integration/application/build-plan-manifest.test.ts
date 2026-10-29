import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { shippedCatalogue } from '../../support/planning-brief-harness.js';

// RF-604, RNF-004: the run manifest of a plan run over a seeded understand run, the planner
// replaying tests/recordings/fake/planner-package.json.

const briefAnswers = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
} as const;

let dataDir: string;
let h: PlanHarness;

async function seeded(): Promise<void> {
  const run = await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.answer(run, [{ cardId: 'OQ-001', answer: 'Only a manager may cancel a paid order.' }]);
  await h.saveBrief(briefAnswers);
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-manifest-'));
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  h = await createPlanHarness(dataDir, recording);
});

afterEach(() => rm(dataDir, { recursive: true, force: true }));

describe('BuildPlan: the run manifest', () => {
  it('RF-604 RNF-004 the manifest records the brief, the catalogue version and sha and the prompt versions', async () => {
    await seeded();

    const manifest = await h.manifestOf(await h.plan());
    expect(manifest.brief).toMatchObject({ ...briefAnswers, savedAt: '2026-10-12T09:30:00.000Z' });
    const { version, sha256 } = shippedCatalogue;
    expect(manifest.catalogue).toEqual({ version, sha256 });
    const sha = async (name: string): Promise<string> =>
      createHash('sha256')
        .update(await readFile(`prompts/planner/${name}`))
        .digest('hex');
    expect(manifest.promptVersions).toEqual({
      'planner/package.v10.md': { version: 'v10', sha256: await sha('package.v10.md') },
      'planner/continue.v1.md': { version: 'v1', sha256: await sha('continue.v1.md') },
      'planner/prd.v4.md': { version: 'v4', sha256: await sha('prd.v4.md') },
      'planner/data-model.v4.md': { version: 'v4', sha256: await sha('data-model.v4.md') },
      'planner/flows.v2.md': { version: 'v2', sha256: await sha('flows.v2.md') },
      'planner/api-contract.v1.md': { version: 'v1', sha256: await sha('api-contract.v1.md') },
      'planner/ux.v1.md': { version: 'v1', sha256: await sha('ux.v1.md') },
      'planner/coverage.v1.md': { version: 'v1', sha256: await sha('coverage.v1.md') },
      'planner/gap.v3.md': { version: 'v3', sha256: await sha('gap.v3.md') },
      'planner/gap-repair.v3.md': { version: 'v3', sha256: await sha('gap-repair.v3.md') },
      'planner/plan-repair.v1.md': { version: 'v1', sha256: await sha('plan-repair.v1.md') },
      'shared/secret-risk.v1.md': {
        version: 'v1',
        sha256: await sha('../shared/secret-risk.v1.md'),
      },
    });
    expect(manifest.roles['planner']?.modelVersion).toBe('fake-model-2026-10-01');
    expect(manifest.source.commitSha).toBe('3f786850e387550fdab836ed7e6dc881de23001b');
    expect(manifest.codemapHash).toBe(`sha256:${'ab'.repeat(32)}`);
  });
});
