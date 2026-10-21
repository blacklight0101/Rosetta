import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-401, Q-48: the manifest records the grown Ollama context size and the source auto-grown.

const temp = useTempRoot('rosetta-understand-grown-');

const ollamaMetrics = {
  loadDurationMs: 1,
  promptEvalDurationMs: 1,
  evalDurationMs: 1,
  tokensPerSecond: 1,
};

describe('an understand run: the grown Ollama context of the reader', () => {
  it(
    'RF-401 Q-48 records the grown size and the source auto-grown from a later answer',
    UNDERSTAND_TIMEOUT,
    async () => {
      const h = await createUnderstandHarness({
        dataDir: temp.path,
        recording: 'understand-csharp-full.json',
        decorateAnswer: (call, response) => ({
          ...response,
          metrics: {
            ollama:
              call === 1
                ? { ...ollamaMetrics, contextTokens: 16_384, contextSource: 'auto-fit' }
                : { ...ollamaMetrics, contextTokens: 32_768, contextSource: 'auto-grown' },
          },
        }),
      });
      await h.scan();
      const run = await h.understand();

      expect((await h.manifestOf(run)).roles['reader']).toMatchObject({
        contextTokens: 32_768,
        contextSource: 'auto-grown',
      });
    },
  );
});
