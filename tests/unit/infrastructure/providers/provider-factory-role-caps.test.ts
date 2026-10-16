import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { failureOf } from '../../../support/failure-of.js';
import {
  callFor,
  factoryHarness,
  serverKeyText,
  settingsFor,
  testRun,
} from '../../../support/provider-factory-harness.js';

// RF-423, RF-422, RF-407, ADR-007: the caps a project sets per role (`budget.roles`) become caps of
// that role's guard only, and a reservation names the role of its call.

const base = settingsFor({
  reader: { provider: 'openai', model: 'contract-model' },
  verifier: { provider: 'ollama', model: 'gemma4:e4b' },
});

function withRoleCaps(roles: NonNullable<ProjectSettings['budget']['roles']>): ProjectSettings {
  return { ...base, budget: { ...base.budget, roles } };
}

async function setUp(settings: ProjectSettings, test = false) {
  const harness = factoryHarness({
    serverKeys: { openai: serverKeyText },
    ollamaUrl: 'http://localhost:11434',
  });
  const request = harness.request({ settings, roles: ['reader', 'verifier'], cloudConsent: true });
  const built = await harness.factory.build(test ? { ...request, run: testRun } : request);
  if (!built.ok) throw new Error('The set was not built.');
  const reader = built.value.get('reader')?.provider;
  const verifier = built.value.get('verifier')?.provider;
  if (reader === undefined || verifier === undefined) throw new Error('A role is missing.');
  return { harness, reader, verifier };
}

const kindsOf = (caps: readonly { readonly kind: string }[]): string[] =>
  caps.map((cap) => cap.kind).filter((kind) => kind.startsWith('role'));

describe('role caps of the provider factory', () => {
  it('RF-423 gives a role its own cost and token caps, and only that role', async () => {
    const settings = withRoleCaps({ reader: { maxCostMicros: 500_000, maxTokens: 9_000 } });
    const { harness, reader, verifier } = await setUp(settings);

    await reader.complete(callFor('reader', 'contract-model', 1));
    await verifier.complete(callFor('verifier', 'gemma4:e4b', 1));

    const [readerHeld, verifierHeld] = harness.ledger.reservations;
    expect(readerHeld?.reservation.role).toBe('reader');
    expect(readerHeld?.caps).toEqual(
      expect.arrayContaining([
        { kind: 'role-cost', limit: 500_000n },
        { kind: 'role-tokens', limit: 9_000n },
      ]),
    );
    expect(verifierHeld?.reservation.role).toBe('verifier');
    expect(kindsOf(verifierHeld?.caps ?? [])).toEqual([]);
  });

  it('RF-423 a role cap of zero stops that role before any call, and the other role still answers', async () => {
    const settings = withRoleCaps({ reader: { maxCostMicros: 0, maxTokens: 0 } });
    const { harness, reader, verifier } = await setUp(settings);

    const refused = await failureOf(reader.complete(callFor('reader', 'contract-model', 1)));
    const answered = await verifier.complete(callFor('verifier', 'gemma4:e4b', 1));

    expect(refused).toMatchObject({ code: ERROR_CODES.budgetCapReached });
    expect(harness.fakes.get('openai')?.requests).toEqual([]);
    expect(answered.text).not.toBe('');
    expect(harness.stops).toEqual([]);
  });

  it('RF-423 without role caps in the settings no role cap applies', async () => {
    const { harness, reader } = await setUp(base);

    await reader.complete(callFor('reader', 'contract-model', 1));

    expect(kindsOf(harness.ledger.reservations[0]?.caps ?? [])).toEqual([]);
  });

  it('RF-407 a provider test belongs to no run, so no role cap applies to it', async () => {
    const settings = withRoleCaps({ reader: { maxCostMicros: 0 } });
    const { harness, reader } = await setUp(settings, true);

    await reader.complete(callFor('reader', 'contract-model', 1));

    expect(kindsOf(harness.ledger.reservations[0]?.caps ?? [])).toEqual([]);
  });
});
