import { describe, expect, it, vi } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { PrivateCodeRecheck } from '../../../../src/application/runs/private-code-recheck.js';
import { UNDERSTAND_ROLES } from '../../../../src/application/understand/understand-options.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { RunStage } from '../../../../src/domain/runs/run-states.js';
import type { SourceKind } from '../../../../src/domain/sources/source-kind.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';
import { heldZip } from '../../../support/upload-run-fixtures.js';

// RF-132, RF-143, DEC-151: the private-code confirmation is checked again when a queued run starts,
// against the roles of the project at that moment. A run whose roles went to a cloud provider while
// it waited, and whose confirmation was never given for it, does not start.

const local = settingsFor({
  reader: { provider: 'fake', model: 'fake-model' },
  verifier: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
  planner: { provider: 'fake', model: 'fake-model' },
});
const cloud = settingsFor({
  reader: { provider: 'openai', model: 'gpt-5-mini' },
  verifier: { provider: 'openai', model: 'gpt-5-mini' },
  summariser: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  planner: { provider: 'openai', model: 'gpt-5-mini' },
});
const ollama = settingsFor({
  reader: { provider: 'ollama', model: 'gemma4:e4b' },
  verifier: { provider: 'ollama', model: 'gemma4:e4b' },
  summariser: { provider: 'ollama', model: 'gemma4:e4b' },
  planner: { provider: 'ollama', model: 'gemma4:e4b' },
});

interface Scenario {
  readonly queuedWith: ProjectSettings;
  readonly startsWith: ProjectSettings;
  readonly options: Readonly<Record<string, unknown>>;
  readonly kind?: SourceKind;
  readonly stage?: RunStage;
  readonly ollamaHost?: string;
}

/** Queues a run of Amy behind a running one, changes her settings, then lets the queue start it. */
async function runQueued(scenario: Scenario) {
  const projects = new MemoryProjectRepository();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
  const harness = createRunHarness({
    maxRunning: 1,
    logger,
    wrapExecutor: (inner, stage) => {
      if (stage !== 'understand' && stage !== 'plan') return inner;
      const roles = stage === 'plan' ? (['planner'] as const) : UNDERSTAND_ROLES;
      return new PrivateCodeRecheck({
        ...{ inner, projects, roles, logger },
        ...(scenario.ollamaHost === undefined ? {} : { ollamaHost: scenario.ollamaHost }),
      });
    },
  });
  const upload = { sourceKind: 'upload', sourceUrl: '', upload: heldZip } as const;
  const project = sampleProject({
    userId: userAmy.userId,
    settings: scenario.queuedWith,
    ...((scenario.kind ?? 'upload') === 'upload' ? upload : {}),
  });
  await projects.insertOrFind(project);
  const blocker = await harness.start(userBob);
  const submitted = await harness.submit.execute({
    ...{ actor: userAmy, project, stage: scenario.stage ?? 'understand' },
    options: scenario.options,
  });
  if (!submitted.ok) throw new Error('The run was not accepted');
  await projects.updateSettings({
    ...{ userId: userAmy.userId, projectId: project.id, settings: scenario.startsWith },
    updatedAt: project.updatedAt + 1,
    expectedVersion: undefined,
  });
  harness.executor.settle(blocker.id, { endState: 'Completed' });
  const ended = await waitForStartOrEnd(harness, submitted.value.run.id, submitted.value.run);
  return { harness, logger, ended };
}

async function waitForStartOrEnd(
  harness: ReturnType<typeof createRunHarness>,
  runId: string,
  run: Parameters<ReturnType<typeof createRunHarness>['ended']>[0],
) {
  // The run either starts (the controlled executor holds it) or ends at once (refused).
  await vi.waitFor(
    async () => {
      const latest = await harness.runs.find(run.userId, runId);
      if (latest?.queueState === 'Queued') throw new Error('The run is still queued');
    },
    { interval: 2, timeout: 30_000 },
  );
  const latest = await harness.runs.find(run.userId, runId);
  if (latest === undefined) throw new Error('The run vanished');
  return latest;
}

describe('a queued run starts only if the confirmation still holds (RF-132, DEC-151)', () => {
  it('RF-132 a queued run whose roles changed to a cloud provider does not start and says why', async () => {
    const { harness, logger, ended } = await runQueued({
      ...{ queuedWith: local, startsWith: cloud },
      options: { cloudConsent: true },
    });

    expect(ended.endState).toBe('Failed');
    expect(ended.errorCode).toBe(ERROR_CODES.privateCodeNotConfirmed);
    expect(harness.executor.startedKeys).toHaveLength(1);
    const entry = logger.entries.find((e) => e.code === ERROR_CODES.privateCodeNotConfirmed);
    expect(entry?.message).toMatch(/changed to a cloud provider/u);
    expect(entry?.message).toMatch(/confirm/u);
  });

  it('RF-132 a queued run with unchanged roles and its confirmation starts', async () => {
    const { harness, ended } = await runQueued({
      ...{ queuedWith: cloud, startsWith: cloud },
      options: { cloudConsent: true, privateCodeConfirmed: true },
    });

    expect(ended.queueState).toBe('Running');
    expect(harness.executor.startedKeys).toContain(ended.runKey);
  });

  it('RF-132 a queued run whose roles are all local starts without a confirmation', async () => {
    const { harness, ended } = await runQueued({
      ...{ queuedWith: local, startsWith: local },
      options: { cloudConsent: false },
    });

    expect(harness.executor.startedKeys).toContain(ended.runKey);
  });
});

describe('a queued run that is not blocked (RF-132, DEC-151)', () => {
  it('RF-132 a project that was cloud and changed back to local starts', async () => {
    const { harness, ended } = await runQueued({
      ...{ queuedWith: cloud, startsWith: local },
      options: { cloudConsent: true },
    });

    expect(harness.executor.startedKeys).toContain(ended.runKey);
  });

  it('RF-132 a GitHub project is never blocked, whatever its roles', async () => {
    const { harness, ended } = await runQueued({
      ...{ queuedWith: local, startsWith: cloud, kind: 'github' },
      options: { cloudConsent: true },
    });

    expect(harness.executor.startedKeys).toContain(ended.runKey);
  });
});

describe('a queued run and the host of Ollama, or the plan stage (RF-132, DEC-118)', () => {
  it('RF-132 DEC-118 roles moved to an Ollama of another host do not start unconfirmed', async () => {
    const { ended } = await runQueued({
      ...{ queuedWith: local, startsWith: ollama, ollamaHost: 'gpu.example.net' },
      options: { cloudConsent: true },
    });

    expect(ended.errorCode).toBe(ERROR_CODES.privateCodeNotConfirmed);
  });

  it('RF-132 roles moved to an Ollama on this machine start', async () => {
    const { harness, ended } = await runQueued({
      ...{ queuedWith: local, startsWith: ollama, ollamaHost: 'localhost' },
      options: {},
    });

    expect(harness.executor.startedKeys).toContain(ended.runKey);
  });

  it('RF-132 a queued plan run checks the planner only', async () => {
    const plannerCloud = settingsFor({ planner: { provider: 'openai', model: 'gpt-5-mini' } });
    const readerCloud = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });
    const refused = await runQueued({
      ...{ queuedWith: local, startsWith: plannerCloud, stage: 'plan' },
      options: { cloudConsent: true },
    });
    const allowed = await runQueued({
      ...{ queuedWith: local, startsWith: readerCloud, stage: 'plan' },
      options: {},
    });

    expect(refused.ended.errorCode).toBe(ERROR_CODES.privateCodeNotConfirmed);
    expect(allowed.harness.executor.startedKeys).toContain(allowed.ended.runKey);
  });
});
