import { describe, expect, it } from 'vitest';
import type { RunExecution, RunExecutor } from '../../../src/application/ports/run-executor.js';
import { RunEventPublisher } from '../../../src/application/runs/run-event-publisher.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { MemoryProjectRepository } from '../../../src/infrastructure/db/memory-project-repository.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { withPrivateCodeRecheck } from '../../../src/presentation/compose-recheck.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { settingsFor } from '../../support/provider-factory-harness.js';
import { createRunHarness, userAmy } from '../../support/run-harness.js';
import { heldZip } from '../../support/upload-run-fixtures.js';

// RF-132, DEC-118, DEC-151: the composition wraps the understand and plan executors, each with the
// roles its stage calls, and hands the server's Ollama host to the check.

const readerCloud = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });
const plannerOnOllama = settingsFor({ planner: { provider: 'ollama', model: 'gemma4:e4b' } });

async function executionOf(settings: typeof readerCloud, stage: 'understand' | 'plan') {
  const harness = createRunHarness();
  const project = sampleProject({
    userId: userAmy.userId,
    settings,
    sourceKind: 'upload',
    sourceUrl: '',
    upload: heldZip,
  });
  const submitted = await harness.submit.execute({ actor: userAmy, project, stage, options: {} });
  if (!submitted.ok) throw new Error('The run was not accepted');
  const manifest = await harness.manifests.read(harness.scopeOf(submitted.value.run));
  if (manifest === undefined) throw new Error('No manifest');
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(project);
  return { harness, project, projects, run: submitted.value.run, manifest };
}

const passing: RunExecutor = { execute: () => Promise.resolve({ endState: 'Completed' }) };

async function outcomes(
  settings: typeof readerCloud,
  stage: 'understand' | 'plan',
  ollamaUrl?: string,
  options: { readonly projectGone?: boolean } = {},
) {
  const found = await executionOf(settings, stage);
  const { harness, run, manifest } = found;
  const projects = options.projectGone === true ? new MemoryProjectRepository() : found.projects;
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
  const wrapped = withPrivateCodeRecheck(
    { understand: passing, plan: passing },
    { projects, logger, ollamaUrl },
  );
  const events = await RunEventPublisher.open({
    ...{ scope: harness.scopeOf(run), sink: harness.events, history: harness.events },
    clock: harness.clock,
  });
  const execution: RunExecution = {
    run,
    manifest,
    events,
    signal: new AbortController().signal,
    stop: () => undefined,
    recordSource: () => Promise.resolve(),
  };
  return wrapped[stage].execute(execution);
}

describe('withPrivateCodeRecheck', () => {
  it('RF-132 a run whose project is gone is left to its own executor, which reports it', async () => {
    const outcome = await outcomes(readerCloud, 'understand', undefined, { projectGone: true });

    expect(outcome).toEqual({ endState: 'Completed' });
  });

  it('RF-132 an understand run is refused when a reader is in the cloud and nothing was confirmed', async () => {
    const outcome = await outcomes(readerCloud, 'understand');

    expect(outcome).toEqual({ endState: 'Failed', errorCode: ERROR_CODES.privateCodeNotConfirmed });
  });

  it('RF-132 a plan run looks at the planner only, so a cloud reader does not stop it', async () => {
    const outcome = await outcomes(readerCloud, 'plan');

    expect(outcome).toEqual({ endState: 'Completed' });
  });

  it('RF-132 DEC-118 the host of the configured Ollama is handed on: another host stops a plan run', async () => {
    const other = await outcomes(plannerOnOllama, 'plan', 'http://gpu.example.net:11434');
    const here = await outcomes(plannerOnOllama, 'plan', 'http://localhost:11434');

    expect(other).toEqual({ endState: 'Failed', errorCode: ERROR_CODES.privateCodeNotConfirmed });
    expect(here).toEqual({ endState: 'Completed' });
  });
});
