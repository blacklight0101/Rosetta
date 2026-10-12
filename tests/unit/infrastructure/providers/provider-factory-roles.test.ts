import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  callFor,
  factoryAccount,
  factoryHarness,
  serverKeyText,
  settingsFor,
  userKeyText,
  withKeySource,
} from '../../../support/provider-factory-harness.js';
import { sampleKeyRecord, sampleSealed } from '../../../support/provider-key-fixtures.js';

// RF-405, RF-1104, RF-002, ADR-015: the provider factory gives each role its own provider and
// model, picks the key (the user's own, else the server's where allowed), and stops before any call,
// naming the provider, when a role has no key it may use.

const openAiReader = settingsFor({ reader: { provider: 'openai', model: 'contract-model' } });
const unwrapped = <T>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) throw new Error('The set was not built.');
  return result.value;
};

describe('the provider set of a run: roles', () => {
  it('RF-405 gives each role the provider and model it is set to, and the cost report shows them apart', async () => {
    const harness = factoryHarness({
      ollamaUrl: 'http://host.docker.internal:11434',
      serverKeys: { openai: serverKeyText },
    });
    const settings = settingsFor({
      reader: { provider: 'openai', model: 'contract-model' },
      verifier: { provider: 'ollama', model: 'gemma4:e4b' },
      planner: { provider: 'fake', model: 'planner-model' },
      summariser: { provider: 'ollama', model: 'gemma4:e4b' },
    });

    const built = await harness.factory.build(
      harness.request({
        ...{ settings, cloudConsent: true },
        roles: ['reader', 'verifier', 'planner', 'summariser'],
      }),
    );
    const set = unwrapped(built);
    for (const role of ['reader', 'verifier', 'planner'] as const) {
      const chosen = set.get(role);
      await chosen?.provider.complete(callFor(role, chosen.model));
    }

    expect([...set.keys()]).toEqual(['reader', 'verifier', 'planner', 'summariser']);
    expect(set.get('reader')).toMatchObject({
      name: 'openai',
      kind: 'openai',
      model: 'contract-model',
    });
    expect(set.get('verifier')).toMatchObject({
      name: 'ollama',
      kind: 'ollama',
      model: 'gemma4:e4b',
    });
    expect(harness.ledger.entries.map((e) => [e.role, e.provider, e.model, e.keySource])).toEqual([
      ['reader', 'openai', 'contract-model', 'server'],
      ['verifier', 'ollama', 'gemma4:e4b', 'none'],
      ['planner', 'fake', 'planner-model', 'none'],
    ]);
    // One adapter per role, in the order of the roles; each received only its own role's call.
    expect(harness.built.map((spec) => spec.name)).toEqual(['openai', 'ollama', 'fake', 'ollama']);
    expect(harness.fakeList.map((fake) => fake.requests.length)).toEqual([1, 1, 1, 0]);
  });
});

describe('the provider set of a run: role settings', () => {
  it('RF-405 builds only the roles it is asked for', async () => {
    const harness = factoryHarness({ ollamaUrl: 'http://localhost:11434' });

    const set = unwrapped(await harness.factory.build(harness.request({ roles: ['verifier'] })));

    expect([...set.keys()]).toEqual(['verifier']);
    expect(harness.built.map((spec) => spec.name)).toEqual(['ollama']);
  });

  it('RF-405 hands the adapter the role settings: timeout, retries, tool mode and context', async () => {
    const harness = factoryHarness({ ollamaUrl: 'http://localhost:11434' });

    await harness.factory.build(harness.request({ roles: ['reader'] }));

    expect(harness.built).toEqual([
      {
        name: 'ollama',
        kind: 'ollama',
        baseUrl: 'http://localhost:11434',
        apiKey: undefined,
        timeoutSeconds: 120,
        maxRetries: 3,
        toolMode: 'native',
        contextTokens: 'auto',
      },
    ]);
  });
});

describe('the provider set of a run: key choice', () => {
  it('RF-1104 uses the user key when the user has one, and the ledger says so', async () => {
    const harness = factoryHarness({ serverKeys: { openai: serverKeyText } });
    await harness.storeKey(factoryAccount.id, 'openai', userKeyText);

    const set = unwrapped(
      await harness.factory.build(harness.request({ settings: openAiReader, cloudConsent: true })),
    );
    await set.get('reader')?.provider.complete(callFor('reader', 'contract-model'));

    expect(harness.built[0]?.apiKey).toBe(userKeyText);
    expect(harness.ledger.entries.map((entry) => entry.keySource)).toEqual(['user']);
  });

  it('RF-1104 uses the server key when the user has none and the account may use it', async () => {
    const harness = factoryHarness({ serverKeys: { openai: serverKeyText } });

    const set = unwrapped(
      await harness.factory.build(harness.request({ settings: openAiReader, cloudConsent: true })),
    );
    await set.get('reader')?.provider.complete(callFor('reader', 'contract-model'));

    expect(harness.built[0]?.apiKey).toBe(serverKeyText);
    expect(harness.ledger.entries.map((entry) => entry.keySource)).toEqual(['server']);
  });

  it("RF-1104 never uses another user's key", async () => {
    const harness = factoryHarness();
    await harness.storeKey('00000000-0000-4000-9000-0000000000ff', 'openai', userKeyText);

    const built = await harness.factory.build(
      harness.request({ settings: openAiReader, cloudConsent: true }),
    );

    expect(built.ok).toBe(false);
    expect(harness.built).toEqual([]);
  });
});

describe('the provider set of a run: missing keys', () => {
  it('RF-002 stops before any call, naming the provider, when there is no key and no server key is allowed', async () => {
    const harness = factoryHarness({ serverKeys: { openai: serverKeyText } });
    const account = { ...factoryAccount, serverKeysAllowed: false };

    const built = await harness.factory.build(harness.request({ account, settings: openAiReader }));

    expect(built).toEqual({
      ok: false,
      error: [{ role: 'reader', provider: 'openai', code: ERROR_CODES.providerKeyMissing }],
    });
    expect(harness.built).toEqual([]);
    expect(harness.ledger.reservations).toEqual([]);
  });

  it('RF-002 names every provider that lacks a key, one problem per role', async () => {
    const harness = factoryHarness({ ollamaUrl: 'http://localhost:11434' });
    const settings = settingsFor({
      reader: { provider: 'openai', model: 'contract-model' },
      verifier: { provider: 'ollama', model: 'gemma4:e4b' },
      planner: { provider: 'anthropic', model: 'a-model' },
    });

    const built = await harness.factory.build(
      harness.request({ settings, roles: ['reader', 'verifier', 'planner'] }),
    );

    expect(built).toEqual({
      ok: false,
      error: [
        { role: 'reader', provider: 'openai', code: ERROR_CODES.providerKeyMissing },
        { role: 'planner', provider: 'anthropic', code: ERROR_CODES.providerKeyMissing },
      ],
    });
  });

  it('RF-1104 a provider set to user keys only never falls back to the server key', async () => {
    const harness = factoryHarness({ serverKeys: { openai: serverKeyText } });
    const settings = withKeySource(openAiReader, 'openai', 'user');

    const built = await harness.factory.build(harness.request({ settings }));

    expect(built.ok).toBe(false);
    expect(harness.built).toEqual([]);
  });
});

describe('the provider set of a run: stored keys', () => {
  it('RF-1104 a stored key the server secret cannot open stops the role with RST-2300', async () => {
    const harness = factoryHarness({ serverKeys: { openai: serverKeyText } });
    const sealed = sampleSealed(7, 'unknown-version');
    await harness.keys.upsert(sampleKeyRecord(factoryAccount.id, 'openai', { sealed }));

    const built = await harness.factory.build(
      harness.request({ settings: openAiReader, cloudConsent: true }),
    );

    expect(built).toEqual({
      ok: false,
      error: [{ role: 'reader', provider: 'openai', code: ERROR_CODES.providerKeyUnreadable }],
    });
    expect(harness.built).toEqual([]);
  });

  it('RF-1104 the key is in no log entry, ledger row, call record or set value', async () => {
    const harness = factoryHarness();
    await harness.storeKey(factoryAccount.id, 'openai', userKeyText);

    const set = unwrapped(
      await harness.factory.build(harness.request({ settings: openAiReader, cloudConsent: true })),
    );
    await set.get('reader')?.provider.complete(callFor('reader', 'contract-model'));

    const everything = JSON.stringify([
      harness.logger.entries,
      harness.ledger.entries.map((e) => ({ ...e, costMicros: e.costMicros.toString() })),
      harness.calls.records(),
      [...set.values()].map(({ name, kind, model, keySource }) => ({
        name,
        kind,
        model,
        keySource,
      })),
    ]);
    expect(everything).not.toContain(userKeyText);
    expect(everything).not.toContain(userKeyText.slice(0, 20));
  });
});

describe('the provider set of a run: providers this release cannot reach', () => {
  it('RF-1104 Ollama is offered only when ROSETTA_OLLAMA_URL is set (RST-1517)', async () => {
    const harness = factoryHarness({ ollamaUrl: undefined });

    const built = await harness.factory.build(harness.request({ roles: ['verifier'] }));

    expect(built).toEqual({
      ok: false,
      error: [{ role: 'verifier', provider: 'ollama', code: ERROR_CODES.providerUnavailable }],
    });
    expect(harness.built).toEqual([]);
  });

  it('RF-1104 a kind without an adapter yet is RST-1517, not a missing key', async () => {
    const harness = factoryHarness({ adapters: () => undefined });
    await harness.storeKey(factoryAccount.id, 'anthropic', userKeyText);
    const settings = settingsFor({ reader: { provider: 'anthropic', model: 'a-model' } });

    const built = await harness.factory.build(harness.request({ settings }));

    expect(built).toEqual({
      ok: false,
      error: [{ role: 'reader', provider: 'anthropic', code: ERROR_CODES.providerUnavailable }],
    });
  });

  it('RF-1104 an OpenAI-compatible role connects to the base URL stored with its key', async () => {
    const harness = factoryHarness();
    await harness.storeKey(
      factoryAccount.id,
      'openai-compatible',
      userKeyText,
      'https://llm.example.com/v1',
    );
    const settings = settingsFor({ reader: { provider: 'openai-compatible', model: 'm' } });

    await harness.factory.build(harness.request({ settings }));

    expect(harness.built[0]).toMatchObject({
      kind: 'openai-compatible',
      baseUrl: 'https://llm.example.com/v1',
      apiKey: userKeyText,
    });
  });
});
