import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { shippedCatalogue } from '../../support/planning-brief-harness.js';
import { plain } from '../../support/plan-method-harness.js';

// RF-637, RF-638, RF-606, ADR-018, DEC-135: a plan run over a seeded understand run names, for each
// open question, the cards that wait on it, marks them in the roadmap, writes the measures of the
// build into AGENTS.md and records the catalogue version of the lessons in the run manifest.

let dataDir: string;
let h: PlanHarness;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-questions-'));
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  h = await createPlanHarness(dataDir, recording);
  await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.saveBrief({ buildMethod: { aiAssisted: true } });
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('BuildPlan: open questions linked to the cards they block', () => {
  it('RF-637 every question of the package names a card or says none', async () => {
    const files = await h.handoffOf(await h.plan());

    const text = plain(files['open-questions.md']);
    const [asked = '', rest = ''] = text.split('## Questions from the analysis');
    const rows = asked
      .split('\n')
      .filter((line) => line.startsWith('| ') && !/^\| (Question|Id) \|/u.test(line));
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) {
      expect(row).toMatch(/\| (none|(\[T-\d+\]\(tasks\.md#t-\d+\)(, )?)+) \|$/u);
    }
    const analysis = rest.split('\n').filter((line) => line.startsWith('- OQ-'));
    expect(analysis).toHaveLength(2);
    for (const line of analysis) {
      expect(line).toMatch(/Cards waiting: (none|(\[T-\d+\]\(tasks\.md#t-\d+\)(, )?)+)$/u);
    }
  });

  it('RF-637 the roadmap marks the cards that wait on a question', async () => {
    const files = await h.handoffOf(await h.plan());

    const roadmap = plain(files['roadmap.md']);
    expect(roadmap).toContain('Waiting on open questions:');
    expect(roadmap).toMatch(/- \[T-001\]\(tasks\.md#t-001\): .*OQ-002/u);
    expect(roadmap).toMatch(/- \[T-002\]\(tasks\.md#t-002\): .*OQ-002/u);
  });
});

describe('BuildPlan: the measures of the build and the catalogue version', () => {
  it('RF-638 AGENTS.md names the measures of the build', async () => {
    const files = await h.handoffOf(await h.plan());

    const agents = plain(files['AGENTS.md']);
    expect(agents).toContain('## Build metrics');
    expect(agents).toContain('escaped defects found after merge');
  });

  it('RF-606 DEC-135 the manifest records the catalogue version that carries the lessons', async () => {
    const manifest = await h.manifestOf(await h.plan());

    expect(shippedCatalogue.version).toBe(2);
    expect(manifest.catalogue).toEqual({ version: 2, sha256: shippedCatalogue.sha256 });
  });
});
