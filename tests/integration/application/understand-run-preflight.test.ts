import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { ERROR_CODES, type ErrorCode } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { parseCallLine } from '../../../src/infrastructure/providers/call-record-schema.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-401 (scenario 2), RF-205: an understand run whose reader uses Ollama makes one tiny call to
// that Ollama before any agent task starts. A stopped server or a model that is not pulled ends the
// run there, with the error code of the call and the fix in its log; a stop of the run during the
// check ends it as interrupted; a check that answers lets the run go on, and its call is logged at
// no cost.

const temp = useTempRoot('rosetta-understand-preflight-');

function ollamaReader(): ProjectSettings {
  return understandSettings((settings) => ({
    ...settings,
    providers: {
      ...settings.providers,
      ollama: {
        kind: 'ollama',
        keySource: 'user',
        toolMode: 'native',
        timeoutSeconds: 10,
        maxRetries: 0,
      },
    },
    roles: { ...settings.roles, reader: { ...settings.roles.reader, provider: 'ollama' } },
  }));
}

/** An Ollama that answers the first call with the code, as the adapter does when it cannot answer. */
async function runWithOllamaAnswering(code: ErrorCode) {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-csharp-full.json',
    settings: ollamaReader(),
    beforeCall: (call) => {
      if (call === 1) throw new RosettaError(code);
      return Promise.resolve();
    },
  });
  await h.scan();
  const run = await h.understand();
  return { h, run };
}

/** The log entries of the run that carry this error code. */
function logEntriesWith(h: UnderstandHarness, code: ErrorCode) {
  return h.logger.entries.filter((entry) => entry.code === code);
}

/** The next step the run log gives for the one entry of this code. */
function nextStepOf(h: UnderstandHarness, code: ErrorCode): string {
  const entries = logEntriesWith(h, code);
  expect(entries).toHaveLength(1);
  const next = entries[0]?.data?.['nextStep'];
  return typeof next === 'string' ? next : '';
}

describe('an understand run whose Ollama is not ready', UNDERSTAND_TIMEOUT, () => {
  it('RF-401 a stopped Ollama ends the run before its first agent task with RST-1507', async () => {
    const { h, run } = await runWithOllamaAnswering(ERROR_CODES.ollamaUnreachable);

    expect(run.endState).toBe('Failed');
    expect((await h.manifestOf(run)).agentTasks).toEqual([]);
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.ollamaUnreachable,
    });
  });

  it('RF-401 a model that is not pulled ends the run before its first agent task with RST-1508', async () => {
    const { h, run } = await runWithOllamaAnswering(ERROR_CODES.ollamaModelMissing);

    expect(run.endState).toBe('Failed');
    expect((await h.manifestOf(run)).agentTasks).toEqual([]);
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.ollamaModelMissing,
    });
  });
});

describe('the start check of an Ollama reader: its log', UNDERSTAND_TIMEOUT, () => {
  it('RF-401 the run log holds the fix command of RST-1507: ollama serve', async () => {
    const { h } = await runWithOllamaAnswering(ERROR_CODES.ollamaUnreachable);

    expect(nextStepOf(h, ERROR_CODES.ollamaUnreachable)).toContain('ollama serve');
  });

  it('RF-401 the run log holds the fix command of RST-1508: ollama pull with the model', async () => {
    const { h } = await runWithOllamaAnswering(ERROR_CODES.ollamaModelMissing);

    expect(nextStepOf(h, ERROR_CODES.ollamaModelMissing)).toContain('ollama pull');
  });
});

describe('the start check of an Ollama reader: stops and success', UNDERSTAND_TIMEOUT, () => {
  it('RF-401 a stop of the run during the check ends the run as interrupted, with no agent task', async () => {
    // The Ollama is slow to answer: the stop comes while the check's call is in flight, and the
    // call honours the signal it was given, as the adapter does.
    let sawStop = false;
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-csharp-full.json',
      settings: ollamaReader(),
      beforeCall: async (call, harness, signal) => {
        if (call !== 1) return;
        await harness.stopRunning();
        sawStop = signal.aborted;
        if (signal.aborted) throw new RosettaError(ERROR_CODES.providerCallCancelled);
      },
    });
    await h.scan();

    const run = await h.understand();

    expect(sawStop, 'the check call carries the stop of the run').toBe(true);
    expect(run.endState).toBe('Interrupted');
    expect((await h.manifestOf(run)).agentTasks).toEqual([]);
    expect(logEntriesWith(h, ERROR_CODES.providerCallCancelled)).toEqual([]);
  });

  it('RF-401 a check that answers lets the run go on, and its call is logged at no cost', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-csharp-full.json',
      settings: ollamaReader(),
    });
    await h.scan();

    const run = await h.understand();

    expect((await h.manifestOf(run)).agentTasks.length).toBeGreaterThan(0);
    const lines = (await readFile(join(h.runFolder(run), 'provider-calls.jsonl'), 'utf8'))
      .split('\n')
      .filter((line) => line.length > 0);
    const calls = lines.map((line) => parseCallLine(JSON.parse(line)));
    const checks = calls.filter((stored) => stored?.agentTaskId === 'ollama-preflight');
    expect(checks.map((stored) => [stored?.kind, stored?.costMicros, stored?.status])).toEqual([
      ['ollama', 0, 'ok'],
    ]);
  });
});
