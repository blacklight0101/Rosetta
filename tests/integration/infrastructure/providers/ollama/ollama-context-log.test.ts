import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { formatLogEntry } from '../../../../../src/infrastructure/system/log-entry.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { FixedClock } from '../../../../support/fixed-clock.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';

// RF-009, RF-401: the context size the resolver warns about is a number, so it must reach the log.

const start = useFakeOllama();
const at = new FixedClock('2026-10-11T09:05:03.007Z').now();

describe('the resolver warnings as they are written to the log', () => {
  it('RF-009 a warning at the floor shows the context size, not a masked marker', async () => {
    const { provider, logger } = await start('context-floor-spill');
    await provider.complete(contractRequest());

    const [warning] = logger.records.filter((record) => record.level === 'warn');
    const written = formatLogEntry(
      warning ?? { level: 'warn', logger: '', message: '' },
      at,
      new SecretMasker(),
    );

    expect(written.data).toMatchObject({ contextSize: 4_096 });
    expect(JSON.stringify(written)).not.toContain('[MASKED:');
  });

  it('RF-009 a fixed-size warning shows the context size', async () => {
    const { provider, logger } = await start('context-fixed-spill', { contextTokens: 32_768 });
    await provider.complete(contractRequest());

    const [warning] = logger.records.filter((record) => record.level === 'warn');
    const written = formatLogEntry(
      warning ?? { level: 'warn', logger: '', message: '' },
      at,
      new SecretMasker(),
    );

    expect(written.data).toMatchObject({ contextSize: 32_768 });
  });
});
