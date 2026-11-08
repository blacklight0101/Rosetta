import { describe, expect, it } from 'vitest';
import {
  CONSENT_LIFETIME_MS,
  consentHolds,
  type ConsentNeed,
  type ProjectConsent,
} from '../../../../src/domain/consent/project-consent.js';

// RF-143, DEC-209: a consent given on a project holds for 30 days, while it is not withdrawn and
// names every non-local provider and every kind a start needs; otherwise it is asked again.

const givenAt = 1_800_000_000_000;
const day = 24 * 60 * 60 * 1000;

const consent: ProjectConsent = {
  id: 'consent-1',
  userId: 'amy',
  projectId: 'project-1',
  providers: ['anthropic', 'openai'],
  kinds: ['cloud', 'private-code'],
  givenAt,
  withdrawnAt: null,
};

const anthropicCloud: ConsentNeed = { providers: ['anthropic'], kinds: ['cloud'] };

describe('consentHolds (RF-143, DEC-209)', () => {
  it('RF-143 a consent lasts 30 days', () => {
    expect(CONSENT_LIFETIME_MS).toBe(30 * day);
  });

  it('RF-143 a consent given today holds for the providers and kinds it names', () => {
    expect(consentHolds(consent, anthropicCloud, givenAt)).toBe(true);
    const both: ConsentNeed = {
      providers: ['openai', 'anthropic'],
      kinds: ['private-code', 'cloud'],
    };
    expect(consentHolds(consent, both, givenAt + day)).toBe(true);
  });

  it('RF-143 a consent still holds a moment before its 30 days are over', () => {
    expect(consentHolds(consent, anthropicCloud, givenAt + 30 * day - 1)).toBe(true);
  });

  it('RF-143 a consent no longer holds once 30 days have passed since it was given', () => {
    expect(consentHolds(consent, anthropicCloud, givenAt + 30 * day)).toBe(false);
    expect(consentHolds(consent, anthropicCloud, givenAt + 45 * day)).toBe(false);
  });

  it('RF-143 a withdrawn consent no longer holds', () => {
    const withdrawn = { ...consent, withdrawnAt: givenAt + day };

    expect(consentHolds(withdrawn, anthropicCloud, givenAt + 2 * day)).toBe(false);
  });

  it('RF-143 a consent does not hold for a provider it does not name (a role changed provider)', () => {
    const anthropicOnly = { ...consent, providers: ['anthropic'] as const };
    const openai: ConsentNeed = { providers: ['anthropic', 'openai'], kinds: ['cloud'] };

    expect(consentHolds(anthropicOnly, openai, givenAt + day)).toBe(false);
  });

  it('RF-132 a consent without the private-code kind does not hold for an uploaded project', () => {
    const cloudOnly = { ...consent, kinds: ['cloud'] as const };
    const upload: ConsentNeed = { providers: ['anthropic'], kinds: ['cloud', 'private-code'] };

    expect(consentHolds(cloudOnly, upload, givenAt + day)).toBe(false);
  });
});
