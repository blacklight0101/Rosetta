import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { userKeyText } from '../../support/provider-factory-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-427, P2-24: an understand run on the user's own Anthropic key whose model has a price override
// without a cache-write price. The run stops before its first call, and the log entry of the reader
// names the override and the missing cache-write price (not "no price in the price table").

const temp = useTempRoot('rosetta-understand-override-');

const settings = understandSettings((base) => ({
  ...base,
  roles: {
    ...base.roles,
    reader: { ...base.roles.reader, provider: 'anthropic', model: 'claude-test' },
    summariser: { ...base.roles.summariser, provider: 'anthropic', model: 'claude-test' },
  },
  budget: {
    ...base.budget,
    prices: [
      {
        provider: 'anthropic',
        model: 'claude-test',
        inputPerMillionMicros: 3_000_000,
        outputPerMillionMicros: 15_000_000,
        cachedInputPerMillionMicros: 300_000,
      },
    ],
  },
}));

describe('an understand run with an Anthropic override missing its cache-write price', () => {
  it(
    'RF-427 fails with RST-1601 before any call and logs the override by name',
    UNDERSTAND_TIMEOUT,
    async () => {
      const h = await createUnderstandHarness({
        dataDir: temp.path,
        recording: 'understand-cap.json',
        settings,
        anthropicKey: userKeyText,
      });
      await h.scan();

      const run = await h.understand({ areas: ['Catalog'], cloudConsent: true });

      expect(run.endState).toBe('Failed');
      expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
        errorCode: ERROR_CODES.modelUnpriced,
      });
      expect(h.providers.requests()).toEqual([]);
      const entry = h.logger.entries.find((each) => each.code === ERROR_CODES.modelUnpriced);
      expect(entry?.message).toMatch(/price override.*claude-test.*cache-write/);
    },
  );
});
