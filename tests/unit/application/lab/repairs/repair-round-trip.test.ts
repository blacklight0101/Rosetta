import { describe, expect, it } from 'vitest';
import { captureInput } from '../../../../../src/application/lab/capture/capture-rules.js';
import type { TranscriptTask } from '../../../../../src/application/lab/capture/capture-types.js';
import { repairTargets } from '../../../../../src/application/lab/targets/repair-targets.js';
import type { PlannerCall } from '../../../../../src/application/plan/ask-planner.js';
import { gapMessage } from '../../../../../src/application/plan/gap-message.js';
import { gapRepairMessage } from '../../../../../src/application/plan/gap-repair-message.js';
import { planMessage } from '../../../../../src/application/plan/plan-message.js';
import { repairPlan } from '../../../../../src/application/plan/plan-repair.js';
import type { LlmRequest } from '../../../../../src/application/ports/llm-provider.js';
import { ManifestUpdates } from '../../../../../src/application/runs/manifest-updates.js';
import { buildBrief } from '../../../../../src/domain/planning/planning-brief.js';
import { MemoryRunManifestStore } from '../../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { fakeResponse } from '../../../../support/fake-recordings.js';
import { draftFile, environment } from '../../../../support/lab-target-env.js';
import { shippedCatalogue } from '../../../../support/planning-brief-harness.js';
import { scopeFor } from '../../../../support/run-event-fixtures.js';
import { sampleRun } from '../../../../support/run-fixtures.js';
import { SequenceIdGenerator } from '../../../../support/sequence-id-generator.js';
import { entity, feature } from '../plan-docs/plan-doc-fixtures.js';

// RF-1404, RF-1406: the input of a repair case is the input of its call as the capture reads it, with
// the problem lines added; the lab target renders the very message the run's repair sends.

const tags = (): (() => string) => {
  const ids = new SequenceIdGenerator();
  return () => ids.dataBlockTag();
};
const repairFile = draftFile('planner/x-repair.v9.md', 'Fix the cards below.\n');
const gapPrompt = draftFile('planner/gap.v6.md', 'GAP');
const packagePrompt = draftFile('planner/package.v12.md', 'PACKAGE');
const targets = repairTargets({ gap: gapPrompt, plan: packagePrompt });

const taskOf = (name: string, user: string): TranscriptTask => ({
  name,
  messages: [
    { role: 'system', content: 'The prompt of the run.' },
    { role: 'user', content: user },
    { role: 'assistant', content: '{"marker":"ANSWER-MARKER"}' },
  ],
});

async function labMessage(id: string, input: unknown): Promise<LlmRequest | undefined> {
  const parsed = targets.find((each) => each.id === id)?.parseInput(input);
  if (parsed?.ok !== true) throw new Error(JSON.stringify(parsed));
  const { env, requests } = environment([{ text: '{}' }]);
  await parsed.value.run(env, repairFile);
  return requests[0];
}

const gapInput = {
  items: [
    { id: 'feature:F-007', kind: 'feature', name: 'Serve pictures', detail: 'Returns a file.' },
  ],
  content: {
    phases: [{ number: 1, name: 'Base', goal: 'Run the catalogue.' }],
    requirements: [{ title: 'List the catalogue' }],
    tasks: [{ id: 'T-001', title: 'Port the catalogue list' }],
  },
};
const gapProblems = [
  { position: 1, field: 'builds', reason: 'names no item that is still built by no task card' },
  { position: 3, field: 'phase', reason: 'is above its maximum' },
];

function plannerCall(requests: LlmRequest[]): PlannerCall {
  const run = sampleRun({ stage: 'plan' });
  let count = 0;
  return {
    run,
    planner: {
      ...{ name: 'fake', kind: 'fake', model: 'm', maxOutputTokens: 4000, keySource: 'user' },
      provider: {
        complete: (request) => {
          requests.push(request);
          return Promise.resolve(
            fakeResponse({
              ...{ text: 'No plan.', toolCalls: [], finishReason: 'stop' },
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                cachedInputTokens: 0,
                usageSource: 'reported',
              },
            }),
          );
        },
      },
    },
    ...{ prompt: packagePrompt, continuePrompt: draftFile('planner/continue.v1.md', 'Go on.') },
    agentTaskId: 'planner-package',
    updates: new ManifestUpdates(new MemoryRunManifestStore(), scopeFor()),
    tags: tags(),
    callId: () => `${run.runKey}#${String((count += 1))}`,
    signal: new AbortController().signal,
  };
}

const planInput = {
  cards: [feature, entity],
  brief: {
    ...buildBrief(
      { stack: [{ layer: 'database', choice: 'SQL Server 2022', custom: false }] },
      shippedCatalogue,
    ),
    savedAt: '2026-10-12T09:30:00.000Z',
  },
  catalogue: shippedCatalogue,
  answered: [],
};
const planProblems = [
  { list: 'requirements', position: 2, field: 'sources', reason: 'No card id.' },
  { list: 'technical.security', field: 'security' },
];

describe('a repair message captured and rendered again', () => {
  it('RF-1406 sends the gap repair message of the run, under the gap prompt', async () => {
    const run = gapRepairMessage(
      gapInput,
      { prompt: repairFile, problems: gapProblems.map((each) => ({ ...each, builds: [] })) },
      tags(),
    );
    const captured = captureInput(
      'planner/gap',
      taskOf('planner-gap', gapMessage(gapInput, tags())),
      { maxTurns: 9 },
    );

    const request = await labMessage('planner/gap-repair', {
      ...(captured as object),
      problems: gapProblems,
    });

    expect(request?.messages[0]?.content).toBe(run);
    expect(request?.system).toBe('GAP');
  });

  it('RF-1406 sends the plan repair message of the run, under the package prompt', async () => {
    const sent: LlmRequest[] = [];
    await repairPlan(plannerCall(sent), planInput, { prompt: repairFile, problems: planProblems });
    const captured = captureInput(
      'planner/package',
      taskOf('planner-package', planMessage(planInput, tags())),
      { maxTurns: 9 },
    );

    const request = await labMessage('planner/plan-repair', {
      ...(captured as object),
      problems: planProblems,
    });

    expect(request?.messages[0]?.content).toBe(sent[0]?.messages[0]?.content);
    expect(request?.system).toBe(sent[0]?.system);
    expect(JSON.stringify(captured)).not.toContain('ANSWER-MARKER');
  });
});
