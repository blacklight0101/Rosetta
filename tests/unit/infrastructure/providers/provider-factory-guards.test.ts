import { describe, expect, it } from 'vitest';
import type { RoleProvider } from '../../../../src/application/providers/provider-set.js';
import type { ProviderSetRequest } from '../../../../src/application/ports/provider-set-factory.js';
import type { LlmRequest, LlmResponse } from '../../../../src/application/ports/llm-provider.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { reservationLifetimeMs } from '../../../../src/infrastructure/providers/reservation-lifetime.js';
import { failureOf } from '../../../support/failure-of.js';
import {
  callFor,
  factoryAccount,
  factoryHarness,
  serverKeyText,
  settingsFor,
  testRun,
  userKeyText,
  type FactoryHarness,
  type FactoryHarnessOptions,
} from '../../../support/provider-factory-harness.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';

// ADR-003, ADR-006, ADR-007, RF-143, DEC-118, RF-422: a provider the factory builds is always
// BudgetGuard(EgressGuard(ObservedProvider(adapter))). No adapter is reachable except through it.

const openAiSettings = settingsFor({ reader: { provider: 'openai', model: 'contract-model' } });
const ollamaSettings = settingsFor({ reader: { provider: 'ollama', model: 'gemma4:e4b' } });
const withServerKey: FactoryHarnessOptions = { serverKeys: { openai: serverKeyText } };

interface ReaderSetup {
  readonly harness: FactoryHarness;
  readonly reader: RoleProvider;
}

/** A harness and the reader of its set; the request is the harness's, changed as asked. */
async function setUp(
  options: FactoryHarnessOptions,
  change: Partial<ProviderSetRequest> = {},
): Promise<ReaderSetup> {
  const harness = factoryHarness(options);
  const settings: ProjectSettings = change.settings ?? openAiSettings;
  const built = await harness.factory.build(harness.request({ roles: ['reader'], ...change, settings }));
  const reader = built.ok ? built.value.get('reader') : undefined;
  if (reader === undefined) throw new Error('The reader was not built.');
  return { harness, reader };
}

const complete = (reader: RoleProvider, request: LlmRequest): Promise<LlmResponse> =>
  reader.provider.complete(request);

describe('no adapter without both guards', () => {
  it('RF-141 the adapter receives a request only after the egress guard masked its secret', async () => {
    const { harness, reader } = await setUp(withServerKey, { cloudConsent: true });
    const request = callFor('reader', 'contract-model');

    await complete(reader, {
      ...request,
      messages: [{ role: 'user', content: `The key is ${fakeOpenAiKey} in the file.` }],
    });

    const received = harness.fakes.get('openai')?.requests[0];
    expect(received).toBeDefined();
    expect(JSON.stringify(received?.messages)).not.toContain(fakeOpenAiKey);
    expect(await harness.egressLines()).toHaveLength(1);
  });

  it('RF-421 an answered call leaves one ledger row, one call record and one egress line', async () => {
    const { harness, reader } = await setUp(withServerKey, { cloudConsent: true });

    await complete(reader, callFor('reader', 'contract-model'));

    expect(harness.ledger.entries).toHaveLength(1);
    expect(harness.calls.records()).toHaveLength(1);
    expect(await harness.egressLines()).toHaveLength(1);
    expect(harness.metered).toHaveLength(1);
  });

  it('RF-422 a call over a cap never reaches the adapter', async () => {
    const caps = { runMicros: 1n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n };
    const { harness, reader } = await setUp({ ...withServerKey, caps }, { cloudConsent: true });

    const failure = await failureOf(complete(reader, callFor('reader', 'contract-model')));

    expect(failure).toMatchObject({ code: ERROR_CODES.budgetCapReached });
    expect(harness.fakes.get('openai')?.requests).toEqual([]);
    expect(harness.stops.map((reason) => reason.code)).toEqual([ERROR_CODES.budgetCapReached]);
  });

  it('RF-420 a model missing from the price table is refused on a server key (RST-1601)', async () => {
    const settings = settingsFor({ reader: { provider: 'openai', model: 'not-in-the-table' } });
    const { harness, reader } = await setUp(withServerKey, { settings, cloudConsent: true });

    const failure = await failureOf(complete(reader, callFor('reader', 'not-in-the-table')));

    expect(failure).toMatchObject({ code: ERROR_CODES.modelUnpriced });
    expect(harness.fakes.get('openai')?.requests).toEqual([]);
  });
});

describe('cloud consent and the one parsed URL', () => {
  it('RF-143 refuses an OpenAI call without the run consent and sends nothing', async () => {
    const { harness, reader } = await setUp(withServerKey);

    const failure = await failureOf(complete(reader, callFor('reader', 'contract-model')));

    expect(failure).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
    expect(harness.fakes.get('openai')?.requests).toEqual([]);
    expect(harness.ledger.entries).toEqual([]);
    expect(harness.ledger.released).toHaveLength(1);
  });

  it('RF-143 lets a call through with the consent the run recorded', async () => {
    const { harness, reader } = await setUp(withServerKey, { cloudConsent: true });

    await complete(reader, callFor('reader', 'contract-model'));

    expect(harness.fakes.get('openai')?.requests).toHaveLength(1);
  });

  it.each(['http://host.docker.internal:11434', 'http://127.0.0.1:11434', 'http://[::1]:11434'])(
    'DEC-118 an Ollama server at %s is local: no consent needed',
    async (ollamaUrl) => {
      const { harness, reader } = await setUp({ ollamaUrl }, { settings: ollamaSettings });

      await complete(reader, callFor('reader', 'gemma4:e4b'));

      expect(harness.fakes.get('ollama')?.requests).toHaveLength(1);
    },
  );

  it('DEC-118 an Ollama server on another host needs the consent like a cloud provider', async () => {
    const ollamaUrl = 'http://gpu-box.example:11434';
    const { harness, reader } = await setUp({ ollamaUrl }, { settings: ollamaSettings });

    const failure = await failureOf(complete(reader, callFor('reader', 'gemma4:e4b')));

    expect(failure).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
    expect(harness.fakes.get('ollama')?.requests).toEqual([]);
  });

  it('RF-143 http://localhost@evil.example connects to evil.example and is judged as evil.example', async () => {
    const ollamaUrl = 'http://localhost@evil.example:11434';
    const { harness, reader } = await setUp({ ollamaUrl }, { settings: ollamaSettings });

    const failure = await failureOf(complete(reader, callFor('reader', 'gemma4:e4b')));

    expect(harness.built[0]?.baseUrl).toBe('http://evil.example:11434');
    expect(failure).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
    expect(harness.fakes.get('ollama')?.requests).toEqual([]);
  });

  it('RF-408 the call log names the host the adapter connects to', async () => {
    const ollamaUrl = 'http://localhost@evil.example:11434';
    const { harness, reader } = await setUp(
      { ollamaUrl },
      { settings: ollamaSettings, cloudConsent: true },
    );

    await complete(reader, callFor('reader', 'gemma4:e4b'));

    expect(harness.calls.records()).toMatchObject([{ endpointHost: 'evil.example' }]);
  });

  it('RF-143 an unparsable ROSETTA_OLLAMA_URL makes Ollama unavailable instead of local', async () => {
    const harness = factoryHarness({ ollamaUrl: 'not a url' });

    const built = await harness.factory.build(
      harness.request({ settings: ollamaSettings, roles: ['reader'] }),
    );

    expect(built).toEqual({
      ok: false,
      error: [{ role: 'reader', provider: 'ollama', code: ERROR_CODES.providerUnavailable }],
    });
  });
});

describe('caps and reservations', () => {
  it('RF-422 a reservation lasts the longest the call can run, plus a margin', async () => {
    const { harness, reader } = await setUp(withServerKey, { cloudConsent: true });

    await complete(reader, callFor('reader', 'contract-model'));

    const held = harness.ledger.reservations[0];
    const lifetime = reservationLifetimeMs({ kind: 'openai', timeoutSeconds: 120, maxRetries: 3 });
    expect(held?.reservation.expiresAt.getTime()).toBe((held?.at.getTime() ?? 0) + lifetime);
  });

  it('RF-1106 a server key is held to the administrator caps, a user key is not', async () => {
    const caps = { runMicros: 50_000_000n, userDayMicros: 1_000_000n, serverMonthMicros: 1n };
    const server = await setUp({ ...withServerKey, caps }, { cloudConsent: true });
    const own = factoryHarness({ caps });
    await own.storeKey(factoryAccount.id, 'openai', userKeyText);
    const built = await own.factory.build(
      own.request({ settings: openAiSettings, cloudConsent: true }),
    );
    const ownReader = built.ok ? built.value.get('reader') : undefined;
    if (ownReader === undefined) throw new Error('The reader was not built.');

    const refused = await failureOf(complete(server.reader, callFor('reader', 'contract-model')));
    await complete(ownReader, callFor('reader', 'contract-model'));

    expect(refused).toMatchObject({ code: ERROR_CODES.budgetCapReached });
    expect(own.ledger.entries).toHaveLength(1);
  });

  it('RF-407 a provider test belongs to no run: no run cap applies and the row has no run', async () => {
    const settings: ProjectSettings = {
      ...openAiSettings,
      budget: { ...openAiSettings.budget, run: { maxCostMicros: 0, maxTokens: 0 } },
    };
    const { harness, reader } = await setUp(withServerKey, {
      settings,
      run: testRun,
      cloudConsent: true,
    });

    await complete(reader, callFor('reader', 'contract-model'));

    const held = harness.ledger.reservations[0];
    expect(held?.reservation.runId).toBeNull();
    expect(held?.caps.map((cap) => cap.kind)).toEqual(['user-day', 'server-month']);
    expect(harness.ledger.entries[0]).toMatchObject({
      runId: null,
      projectId: null,
      agentTaskId: null,
      stage: 'provider-test',
      keySource: 'server',
    });
  });
});
