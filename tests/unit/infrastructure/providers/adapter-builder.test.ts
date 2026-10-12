import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { realAdapters } from '../../../../src/infrastructure/providers/adapter-builder.js';
import type { AdapterSpec } from '../../../../src/infrastructure/providers/adapter-spec.js';
import { OllamaProvider } from '../../../../src/infrastructure/providers/ollama/ollama-provider.js';
import { OpenAiProvider } from '../../../../src/infrastructure/providers/openai/openai-provider.js';
import { contractRequest } from '../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../support/failure-of.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';

// RF-401, RF-402, ADR-003, RNF-005: the one place that constructs the adapters of this release.

const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), new SecretMasker());
const build = realAdapters({ testMode: true, textProtocolPrompt: 'protocol {{tools}}', logger });

const spec = (change: Partial<AdapterSpec>): AdapterSpec => ({
  name: 'main',
  kind: 'ollama',
  baseUrl: 'http://localhost:11434',
  apiKey: undefined,
  timeoutSeconds: 30,
  maxRetries: 1,
  toolMode: 'native',
  contextTokens: 'auto',
  ...change,
});

describe('realAdapters', () => {
  it('RF-401 builds the Ollama adapter for kind ollama', () => {
    expect(build(spec({ kind: 'ollama' }))).toBeInstanceOf(OllamaProvider);
  });

  it('RF-402 builds the OpenAI adapter for kind openai with its key', () => {
    const adapter = build(
      spec({ kind: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'k'.repeat(20) }),
    );

    expect(adapter).toBeInstanceOf(OpenAiProvider);
  });

  it.each(['anthropic', 'openai-compatible', 'fake'] as const)(
    'RF-400 builds no adapter for kind %s in this release',
    (kind) => {
      expect(build(spec({ kind, apiKey: 'k'.repeat(20) }))).toBeUndefined();
    },
  );

  it('RF-402 builds no OpenAI adapter without a key', () => {
    expect(build(spec({ kind: 'openai', apiKey: undefined }))).toBeUndefined();
  });

  it('RNF-005 an adapter built in test mode refuses a real host before it leaves the process', async () => {
    const adapter = build(
      spec({ kind: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'k'.repeat(20) }),
    );

    const failure = await failureOf(adapter?.complete(contractRequest()) ?? Promise.resolve());

    expect(failure).toMatchObject({ code: ERROR_CODES.realProviderRefusedInTests });
  });
});
