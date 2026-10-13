import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT, useSharedFullRun } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-401, DEC-114: the Ollama context size of the reader in the run manifest. An answer that carries
// Ollama metrics records the size and how it was chosen; an answer without them leaves both null.

const temp = useTempRoot('rosetta-understand-context-');
const full = useSharedFullRun('rosetta-understand-context-shared-');

const ollamaMetrics = {
  loadDurationMs: 1,
  promptEvalDurationMs: 1,
  evalDurationMs: 1,
  tokensPerSecond: 1,
};

describe('an understand run: the Ollama context of the reader', () => {
  it(
    'RF-401 records the context size and how it was chosen from the first answer, and keeps them',
    UNDERSTAND_TIMEOUT,
    async () => {
      const h = await createUnderstandHarness({
        dataDir: temp.path,
        recording: 'understand-csharp-full.json',
        decorateAnswer: (call, response) =>
          call === 1
            ? {
                ...response,
                metrics: {
                  ollama: { ...ollamaMetrics, contextTokens: 16_384, contextSource: 'auto-fit' },
                },
              }
            : response,
      });
      await h.scan();
      const run = await h.understand();

      expect((await h.manifestOf(run)).roles['reader']).toMatchObject({
        contextTokens: 16_384,
        contextSource: 'auto-fit',
      });
    },
  );

  it('RF-401 leaves the context size null when no answer carries Ollama metrics', async () => {
    const { h, run } = full.current();

    expect((await h.manifestOf(run)).roles['reader']).toMatchObject({
      contextTokens: null,
      contextSource: null,
    });
  });
});
