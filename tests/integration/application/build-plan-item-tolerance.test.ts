import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordingOf } from '../../support/fake-recordings.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { plain } from '../../support/plan-method-harness.js';
import { draftTask } from '../../support/task-card-fixtures.js';

// P3-126, RF-601, RF-622, RF-627, ADR-008, ADR-013: one item of the planner's answer that does not
// read no longer fails the plan. Synthetic recorded answers only: a security control without its
// description and an environment without its purpose, as a small model writes them.

const usage = {
  inputTokens: 10,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
} as const;
const sentinel = 'sentinel-title-0451';

const reply = (text: string) => ({
  retried: [],
  response: { text, toolCalls: [], usage, finishReason: 'stop' as const },
});

const control = { name: 'Input check', approach: 'allowlist', description: 'Checks the input.' };
const answer = (overrides: Record<string, unknown> = {}) => ({
  summary: 'A web shop that replaces the legacy one.',
  requirements: [
    { title: 'Place an order', statement: 'A customer orders.', sources: ['FEAT-001'] },
  ],
  phases: [{ name: 'Orders', goal: 'Orders move.', exitCriteria: ['Orders run.'] }],
  tasks: [draftTask({ title: 'Orders' })],
  risks: [{ text: 'The shipping rule is read twice.', sources: ['BR-001'] }],
  ...overrides,
});
const withBadTechnical = JSON.stringify(
  answer({
    technical: {
      security: [
        { name: sentinel, approach: 'allowlist' },
        control,
        { name: 'Second', approach: 'denylist' },
      ],
      environments: [{ name: `${sentinel}-env` }, { name: 'Staging' }],
    },
  }),
);
const noRequirement = JSON.stringify(answer({ requirements: [{ title: sentinel }] }));

let dataDir = '';
beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-items-'));
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function planned(...answers: string[]) {
  const recording = recordingOf(
    ...[...answers, 'No PRD.', 'No data model.', 'No flows.'].map(reply),
  );
  const h = await createPlanHarness(dataDir, recording);
  await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.saveBrief({ architecture: { style: 'layered' }, migration: 'strangler-fig' });
  const run = await h.plan();
  return { h, run };
}

const planRequests = (h: Awaited<ReturnType<typeof planned>>['h']) =>
  h.providers.requests().filter((each) => each.context.agentTaskId === 'planner-package');

describe('BuildPlan: an item of the plan answer that does not read', () => {
  it('P3-126 RF-622 two bad security items and two bad environment items write a package and are listed in checks.md', async () => {
    const { h, run } = await planned(withBadTechnical);

    const files = await h.handoffOf(run);
    const checks = plain(files['checks.md']);
    expect(checks).toContain('## Left out');
    for (const item of [
      'technical.security, position 1: the field "description"',
      'technical.security, position 3: the field "description"',
      'technical.environments, position 1: the field "purpose"',
    ]) {
      expect(checks).toContain(item);
    }
    expect(planRequests(h)).toHaveLength(1);
    expect(plain(Object.values(files).join('\n'))).not.toContain(sentinel);
    expect(plain(files['tasks.md'])).toContain('Orders');
  });

  it('P3-126 ADR-013 the log names the list and position of each item, never a word of the answer', async () => {
    const { h } = await planned(withBadTechnical);

    const warned = h.s.logger.entries
      .filter((entry) => entry.level === 'warn')
      .map((entry) => entry.message);
    expect(warned).toContainEqual(
      expect.stringMatching(/technical\.security.*position 1.*field "description"/u),
    );
    expect(JSON.stringify(h.s.logger.entries)).not.toContain(sentinel);
  });
});

describe('BuildPlan: an answer with no requirement that reads', () => {
  it('P3-126 gets one repair call that names the failing paths, and its answer is used', async () => {
    const { h, run } = await planned(noRequirement, withBadTechnical);

    expect(run.endState).not.toBe('Interrupted');
    const requests = planRequests(h);
    expect(requests).toHaveLength(2);
    const text = requests[1]?.messages.map((each) => each.content).join('\n') ?? '';
    expect(text).toContain('requirements, position 1: the field "statement"');
    expect(text).not.toContain(sentinel);
    const repairPrompt = await readFile('prompts/planner/plan-repair.v1.md', 'utf8');
    expect(text).toContain(repairPrompt.trim().split('\n')[0]);
    expect(requests[1]?.system).toBe(requests[0]?.system);
    expect(plain((await h.handoffOf(run))['tasks.md'])).toContain('Orders');
    expect((await h.manifestOf(run)).promptVersions).toHaveProperty('planner/plan-repair.v1.md');
  });

  it('P3-126 RST-1803 a repair that still has no requirement fails the run, with no third call', async () => {
    const { h, run } = await planned(noRequirement, 'Sorry, I cannot.');

    expect(run.endState).toBe('Failed');
    expect(planRequests(h)).toHaveLength(2);
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1803' }));
    expect(JSON.stringify(h.s.logger.entries)).not.toContain(sentinel);
  });

  it('P3-126 an answer with a readable requirement is not repaired', async () => {
    const { h } = await planned(withBadTechnical);

    expect(planRequests(h)).toHaveLength(1);
  });
});
