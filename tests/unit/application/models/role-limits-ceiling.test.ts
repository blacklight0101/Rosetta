import { describe, expect, it } from 'vitest';
import type { ModelList } from '../../../../src/application/models/model-list.js';
import { roleLimits } from '../../../../src/application/models/role-limits.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';

// RF-402, DEC-163, P3-100: a stored output limit above the maximum the model lists runs at that
// maximum (32,768 when the list gives none); the stored number itself is never changed.

const list: ModelList = {
  version: '2026-10-22',
  models: [
    { provider: 'anthropic', model: 'claude-small', label: 'Small', maxOutputTokens: 3_000 },
    { provider: 'anthropic', model: 'claude-bare', label: 'No numbers' },
  ],
};

function withLimit(model: string, limit: number) {
  const base = settingsFor({ reader: { provider: 'anthropic', model } });
  const reader = { ...base.roles.reader, maxOutputTokens: limit };
  return { ...base, roles: { ...base.roles, reader } };
}

describe('the output limit a role runs with, against its model maximum', () => {
  it('RF-402 DEC-163 a stored limit above the model maximum runs at the maximum', () => {
    expect(roleLimits(withLimit('claude-small', 9_000), 'reader', list).maxOutputTokens).toBe(
      3_000,
    );
  });

  it('RF-402 DEC-163 a stored limit below the maximum is used as it is', () => {
    expect(roleLimits(withLimit('claude-small', 2_000), 'reader', list).maxOutputTokens).toBe(
      2_000,
    );
  });

  it('RF-402 DEC-163 a stored limit above 32,768 runs at 32,768 when the list gives no maximum', () => {
    expect(roleLimits(withLimit('claude-bare', 50_000), 'reader', list).maxOutputTokens).toBe(
      32_768,
    );
  });
});
