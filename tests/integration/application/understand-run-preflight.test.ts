import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { ERROR_CODES, type ErrorCode } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-401 (scenario 2), RF-205: an understand run whose reader uses Ollama makes one tiny call to
// that Ollama before any agent task starts. A stopped server or a model that is not pulled ends the
// run there, with the error code of the call, and no agent task is ever started.

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
