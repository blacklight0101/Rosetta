import { describe, expect, it } from 'vitest';
import { needsCloudConsent } from '../../../../src/application/providers/cloud-consent.js';

// RF-143, DEC-16: a provider is local or not by its kind, never by guessing from its address.

describe('cloud consent', () => {
  it.each(['openai', 'openai-compatible', 'anthropic'] as const)(
    'RF-143 asks for consent before code goes to a %s provider',
    (kind) => {
      expect(needsCloudConsent(kind)).toBe(true);
    },
  );

  it.each(['ollama', 'fake'] as const)(
    'RF-143 needs no consent for a local %s provider',
    (kind) => {
      expect(needsCloudConsent(kind)).toBe(false);
    },
  );
});
