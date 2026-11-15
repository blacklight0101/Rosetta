import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadRecording,
  type Recording,
} from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { customerCard, planCards, planQuestions } from '../../support/plan-cards.js';

// RF-623, RF-603, ADR-008: a data model answer with no table and a reason for each dropped claim (the
// cards describe no stored data) from a plan run over a seeded understand run with two ENT cards.
// The run does not ask again, keeps its rule that the model is never empty, and says nothing false.

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');
const briefAnswers = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
} as const;
const reasoned = JSON.stringify({
  tables: [],
  dropped: [
    { claim: 'ENT-001.c1', field: 'Order', reason: 'It describes a container, not stored data.' },
    { claim: 'ENT-002.c2', field: 'Tier', reason: 'It names a connection string, no field.' },
  ],
});

let dataDir: string;

async function withModelAnswer(text: string): Promise<Recording> {
  const base = await loadRecording(recordingPath);
  const [first, second, third] = base.calls;
  const attempt = third?.attempts[0];
  if (first === undefined || second === undefined || attempt === undefined) {
    throw new Error('The recording has three calls');
  }
  if (!('response' in attempt)) throw new Error('The third call has a response');
  const answer = { attempts: [{ response: { ...attempt.response, text } }] };
  return { ...base, calls: [first, second, answer] };
}

async function planned(): Promise<{ h: PlanHarness; files: Record<string, string> }> {
  const h = await createPlanHarness(dataDir, await withModelAnswer(reasoned), {});
  await h.understandRun({ cards: [...planCards(), customerCard()], questions: planQuestions });
  await h.saveBrief(briefAnswers);
  const run = await h.plan();
  expect(run.endState).toBe('Completed');
  return { h, files: await h.handoffOf(run) };
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-nostore-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('BuildPlan: a data model answer with no table and a reason for each claim', () => {
  it('RF-623 is not asked again and the model keeps one table for each ENT card to confirm', async () => {
    const { h, files } = await planned();

    expect(h.providers.requests()).toHaveLength(3);
    const model = (files['data-model.md'] ?? '').replaceAll(String.fromCharCode(92), '');
    expect(model.match(/^### /gmu)).toHaveLength(2);
    expect(model).toContain('found no stored data');
    expect(model).toContain('It describes a container, not stored data.');
  });

  it('RF-623 says nowhere that an answer failed or was asked again', async () => {
    const { h, files } = await planned();

    const texts = [files['data-model.md'], files['checks.md']].join('\n');
    expect(texts).not.toContain('failed after a retry');
    expect(texts).not.toContain('answer for it failed');
    expect(texts).toContain('found no stored data');
    const warned = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    const messages = warned.map((entry) => entry.message).join(' ');
    expect(messages).not.toContain('failed after a retry');
    expect(messages).toContain('found no stored data');
  });
});
