import { describe, expect, it } from 'vitest';
import { keyAdditionalData } from '../../../../src/domain/accounts/provider-keys.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixtureKey, hex } from '../../../support/provider-key-fixtures.js';
import {
  keyClient,
  providerKeyHarness,
  type ProviderKeyHarness,
} from '../../../support/provider-key-harness.js';

// RF-1104: a user saves a key per provider; it is stored encrypted with its last four characters,
// a later save replaces it (the old value is gone), a delete removes the row, and the list shows
// only provider, last four and update time. RF-1109: every change writes an audit row without the
// value.

const amysKey = fixtureKey('AmyOpenAi1');

function saveFor(test: ProviderKeyHarness, key = amysKey) {
  return test.save.execute({ actor: test.amy, provider: 'openai', key, ...keyClient });
}

function saveCompatible(test: ProviderKeyHarness, baseUrl: string | undefined) {
  return test.save.execute({
    actor: test.amy,
    provider: 'openai-compatible',
    key: amysKey,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...keyClient,
  });
}

async function auditText(test: ProviderKeyHarness): Promise<string> {
  return JSON.stringify(await test.audit.list({ since: 0 }));
}

describe('SaveProviderKey', () => {
  it('RF-1104 stores the key encrypted with its last four characters and answers only those', async () => {
    const test = providerKeyHarness();

    const outcome = await saveFor(test);

    expect(outcome).toEqual({
      ok: true,
      value: { provider: 'openai', last4: 'nAi1', updatedAt: test.clock.now() },
    });
    const stored = await test.keys.find(test.amy.userId, 'openai');
    expect(stored).toMatchObject({ last4: 'nAi1', baseUrl: null });
    expect(stored?.sealed.keyVersion).toBe(test.box.keyVersion);
    expect(Buffer.from(stored?.sealed.ciphertext ?? []).toString('latin1')).not.toContain(amysKey);
    const aad = keyAdditionalData(test.amy.userId, 'openai');
    expect(stored === undefined ? undefined : test.box.open(stored.sealed, aad)).toEqual({
      ok: true,
      value: amysKey,
    });
  });
});

describe('SaveProviderKey replacement', () => {
  it('RF-1104 replacing a key leaves only the new value and RF-1109 audits it without the value', async () => {
    const test = providerKeyHarness();
    await saveFor(test);
    const first = await test.keys.find(test.amy.userId, 'openai');
    test.clock.advance(60_000);
    const replacement = fixtureKey('AmyOpenAi2');

    const outcome = await saveFor(test, replacement);

    const stored = await test.keys.find(test.amy.userId, 'openai');
    expect(outcome).toMatchObject({ ok: true, value: { last4: 'nAi2' } });
    expect(hex(stored?.sealed.ciphertext ?? new Uint8Array())).not.toBe(
      hex(first?.sealed.ciphertext ?? new Uint8Array()),
    );
    expect(stored?.createdAt).toEqual(first?.createdAt);
    expect(stored?.updatedAt).toEqual(test.clock.now());
    const events = await test.audit.list({ since: 0, action: 'key.saved' });
    expect(events.map((event) => [event.outcome, event.detail])).toEqual([
      ['ok', { provider: 'openai', replaced: true }],
      ['ok', { provider: 'openai', replaced: false }],
    ]);
    expect(events[0]).toMatchObject({
      actorUserId: test.amy.userId,
      targetType: 'provider_key',
      targetId: 'openai',
      ip: keyClient.ip,
    });
    const text = `${await auditText(test)}${test.logger.text()}`;
    for (const key of [amysKey, replacement]) expect(text).not.toContain(key);
  });
});

describe('SaveProviderKey refusals', () => {
  it.each([
    ['too short', 'short-value'],
    ['with a space inside', 'fixture provider key value'],
  ])('RF-1104 refuses a key %s and stores nothing', async (_case, key) => {
    const test = providerKeyHarness();

    const outcome = await saveFor(test, key);

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.providerKeyInvalid });
    expect(await test.keys.listForUser(test.amy.userId)).toEqual([]);
  });

  it('RF-1104 a base URL belongs only to an OpenAI-compatible key', async () => {
    const test = providerKeyHarness();

    const outcome = await test.save.execute({
      actor: test.amy,
      provider: 'anthropic',
      key: amysKey,
      baseUrl: 'https://llm.example.com/v1',
      ...keyClient,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.requestInvalid });
  });
});

describe('SaveProviderKey base URL', () => {
  it('RF-1104 stores an https base URL whose host resolves only to public addresses', async () => {
    const test = providerKeyHarness();
    test.resolver.answer('llm.example.com', ['93.184.215.14']);

    const outcome = await saveCompatible(test, 'https://LLM.example.com/v1');

    expect(outcome).toMatchObject({ ok: true, value: { provider: 'openai-compatible' } });
    expect(await test.keys.find(test.amy.userId, 'openai-compatible')).toMatchObject({
      baseUrl: 'https://llm.example.com/v1',
    });
  });

  it.each([
    ['no base URL', undefined, []],
    ['an http URL', 'http://llm.example.com/v1', []],
    ['a private IP literal', 'https://192.168.1.20:8000/v1', []],
    [
      'a host that resolves to the metadata address',
      'https://meta.example.com/v1',
      ['meta.example.com'],
    ],
    ['a host that does not resolve', 'https://nowhere.example.com/v1', ['nowhere.example.com']],
  ])('RF-1104 refuses %s with RST-2304', async (_case, baseUrl, lookups) => {
    const test = providerKeyHarness();
    test.resolver.answer('meta.example.com', ['169.254.169.254']);

    const outcome = await saveCompatible(test, baseUrl);

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.baseUrlRejected });
    expect(test.resolver.lookups).toEqual(lookups);
    expect(await test.keys.listForUser(test.amy.userId)).toEqual([]);
  });
});

describe('SaveProviderKey refused base URL audit', () => {
  it('RF-1109 a refused base URL writes a refused audit row and a security event without the key', async () => {
    const test = providerKeyHarness();

    await saveCompatible(test, 'http://10.0.0.5/v1');

    const events = await test.audit.list({ since: 0 });
    expect(events.map((event) => [event.action, event.outcome, event.detail])).toEqual([
      [
        'key.saved',
        'refused',
        { provider: 'openai-compatible', code: ERROR_CODES.baseUrlRejected },
      ],
    ]);
    expect(test.logger.entries).toContainEqual(
      expect.objectContaining({ level: 'warn', logger: 'security', code: 'RST-2304' }),
    );
    expect(`${await auditText(test)}${test.logger.text()}`).not.toContain(amysKey);
  });
});

describe('DeleteProviderKey and ListProviderKeys', () => {
  it('RF-1104 deleting removes the row and RF-1109 writes an audit row', async () => {
    const test = providerKeyHarness();
    await saveFor(test);

    const outcome = await test.remove.execute({
      actor: test.amy,
      provider: 'openai',
      ...keyClient,
    });

    expect(outcome).toEqual({ ok: true, value: true });
    expect(await test.keys.find(test.amy.userId, 'openai')).toBeUndefined();
    const events = await test.audit.list({ since: 0, action: 'key.deleted' });
    expect(events.map((event) => [event.outcome, event.detail])).toEqual([
      ['ok', { provider: 'openai' }],
    ]);
  });

  it('RF-1105 deleting a key the user does not have answers not found, whoever has one', async () => {
    const test = providerKeyHarness();
    await saveFor(test);

    const outcome = await test.remove.execute({
      actor: test.bob,
      provider: 'openai',
      ...keyClient,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(await test.keys.find(test.amy.userId, 'openai')).toBeDefined();
  });

  it('RF-1104 lists only provider, last four and update time of the user own keys', async () => {
    const test = providerKeyHarness();
    await saveFor(test);
    await test.save.execute({
      actor: test.bob,
      provider: 'anthropic',
      key: fixtureKey('BobAnthropic'),
      ...keyClient,
    });

    const listed = await test.list.execute({ actor: test.amy });

    expect(listed).toEqual([{ provider: 'openai', last4: 'nAi1', updatedAt: test.clock.now() }]);
  });
});
