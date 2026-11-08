import type { EpochMs } from '../accounts/user.js';

// RF-143, RF-132, RF-157, DEC-209: a consent to send code to non-local providers, given on a
// project. `cloud` is the provider notice of RF-143; `private-code` the second confirmation for an
// uploaded project (RF-132, RF-157). A withdrawn consent keeps its row and gains the time it was
// withdrawn, so a run can still name the consent it ran under (RF-142).

/** The providers a consent can name: every provider that may be non-local (DEC-118). */
export type ConsentProvider = 'anthropic' | 'openai' | 'openai-compatible' | 'ollama';

export type ConsentKind = 'cloud' | 'private-code';

export interface ProjectConsent {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  /** The non-local providers the consent names, at least one. */
  readonly providers: readonly ConsentProvider[];
  /** What the user agreed to, at least one kind. */
  readonly kinds: readonly ConsentKind[];
  readonly givenAt: EpochMs;
  /** When the user withdrew it; null while it was not withdrawn. */
  readonly withdrawnAt: EpochMs | null;
}

/** RF-143, DEC-209: what a start needs a consent for: the non-local providers of its roles, its kinds. */
export interface ConsentNeed {
  readonly providers: readonly ConsentProvider[];
  readonly kinds: readonly ConsentKind[];
}

/** DEC-209: a consent given on a project lasts 30 days. */
export const CONSENT_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * RF-143, DEC-209: whether a consent covers a start at `now`: it is not withdrawn, it was given less
 * than 30 days ago, and it names every provider and has every kind the start needs. A role whose
 * provider changed to one it does not name makes it ask again.
 */
// RF-143
export function consentHolds(consent: ProjectConsent, need: ConsentNeed, now: EpochMs): boolean {
  if (consent.withdrawnAt !== null || now - consent.givenAt >= CONSENT_LIFETIME_MS) return false;
  const named = need.providers.every((provider) => consent.providers.includes(provider));
  return named && need.kinds.every((kind) => consent.kinds.includes(kind));
}
