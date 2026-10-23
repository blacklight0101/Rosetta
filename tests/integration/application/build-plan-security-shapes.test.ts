import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordingOf } from '../../support/fake-recordings.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { plain } from '../../support/plan-method-harness.js';
import { draftTask } from '../../support/task-card-fixtures.js';

// P5-24, P3-126, RF-601, RF-622: a recorded eShop-style answer whose two security controls carry the
// field shapes a small model sends (a null alternative, a list of strings, an over-long invariant)
// keeps both controls in the TRD and the task cards; a control with an unreadable approach is still
// left out and listed in checks.md. Synthetic recorded answers only (ADR-008).

const usage = {
  inputTokens: 10,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
} as const;

const reply = (text: string) => ({
  retried: [],
  response: { text, toolCalls: [], usage, finishReason: 'stop' as const },
});

const credentials = {
  name: 'Secrets outside the code',
  approach: 'other',
  description: 'Credentials come from the environment, never from source files.',
  invariant: null,
  alternative: null,
  sources: ['BR-001'],
  decision: null,
};
const exposure = {
  name: 'Database not exposed',
  approach: 'allowlist',
  description: 'Only the application host reaches the database.',
  invariant: ['The database accepts no outside connection.', 'Always.'],
  alternative: 'w'.repeat(5000),
  sources: ['BR-001'],
  decision: null,
};
const unreadable = {
  name: 'Mystery control',
  approach: 'trust me',
  description: 'No approach that exists.',
  sources: ['BR-001'],
};

const answer = JSON.stringify({
  summary: 'A web shop that replaces the legacy one.',
  requirements: [
    { title: 'Place an order', statement: 'A customer orders.', sources: ['FEAT-001'] },
  ],
  phases: [{ name: 'Orders', goal: 'Orders move.', exitCriteria: ['Orders run.'] }],
  tasks: [draftTask({ title: 'Orders' })],
  risks: [{ text: 'The shipping rule is read twice.', sources: ['BR-001'] }],
  technical: { security: [credentials, exposure, unreadable] },
});

let dataDir = '';
beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-security-shapes-'));
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function planned() {
  const recording = recordingOf(...[answer, 'No PRD.', 'No data model.', 'No flows.'].map(reply));
  const h = await createPlanHarness(dataDir, recording);
  await h.understandRun({ cards: planCards(), questions: planQuestions });
  await h.saveBrief({ architecture: { style: 'layered' }, migration: 'strangler-fig' });
  const run = await h.plan();
  return plain(Object.values(await h.handoffOf(run)).join('\n====\n'));
}

describe('BuildPlan: the security controls of a small model are kept', () => {
  it('P5-24 RF-622 both controls reach the TRD and the unreadable one is listed in checks.md', async () => {
    const all = await planned();

    expect(all).toContain('Secrets outside the code');
    expect(all).toContain('Database not exposed');
    expect(all).toContain('The database accepts no outside connection. Always.');
    expect(all).toContain('[cut]');
    expect(all).not.toContain('Mystery control');
    expect(all).toContain('technical.security, position 3: the field "approach"');
    expect(all).not.toContain('technical.security, position 1');
    expect(all).not.toContain('technical.security, position 2');
  });

  it('P5-24 both controls name their source card, which a task card shows', async () => {
    const all = await planned();
    const trd = all.slice(all.indexOf('## Security and data protection'));

    expect(trd).toContain('Source cards:');
    expect(trd).toContain('BR-001');
  });
});
