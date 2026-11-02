import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { factoryHarness, settingsFor } from '../../../support/provider-factory-harness.js';

// RF-433, RF-427, RF-143, P8-04: the provider factory prices an Ollama role by the host of
// ROSETTA_OLLAMA_URL. On this machine the role is free; on another server it is priced like a cloud
// role, and a model with no price is refused before the run's first call, with a plain message.

const ollama = { provider: 'ollama', model: 'gemma4:e4b' };

async function built(ollamaUrl: string) {
  const harness = factoryHarness({ ollamaUrl });
  const settings = settingsFor({ reader: ollama });
  return harness.factory.build(
    harness.request({ settings, roles: ['reader'], cloudConsent: true }),
  );
}

describe('RF-433 an Ollama role by the host of the server', () => {
  it('RF-433 builds a role on Ollama at this machine, priced at zero', async () => {
    const result = await built('http://127.0.0.1:11434');

    expect(result.ok).toBe(true);
  });

  it('RF-433 refuses a role on Ollama at another server that has no price', async () => {
    const result = await built('https://ollama.example.org:11434');

    expect(result.ok).toBe(false);
    const refusals = result.ok ? [] : result.error;
    expect(refusals[0]).toMatchObject({ code: ERROR_CODES.modelUnpriced });
    expect(JSON.stringify(refusals)).toContain('not on this machine');
  });
});
