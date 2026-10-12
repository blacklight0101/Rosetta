import { describe, expect, it } from 'vitest';
import {
  cutUserAgent,
  isSessionExpired,
  sessionExpiresAt,
} from '../../../../src/domain/accounts/session-rules.js';
import { fixtureNow } from '../../../support/account-fixtures.js';

// RF-1101: given 8 hours without activity or 7 days since sign-in, when the next request arrives,
// then the session is ended: expires_at = min(last_seen_at + 8 h, created_at + 7 days).

const hourMs = 3_600_000;

describe('session rules', () => {
  it('RF-1101 a fresh session expires 8 hours after it was last seen', () => {
    expect(sessionExpiresAt(fixtureNow, fixtureNow)).toBe(fixtureNow + 8 * hourMs);
    expect(sessionExpiresAt(fixtureNow, fixtureNow + 30 * hourMs)).toBe(fixtureNow + 38 * hourMs);
  });

  it('RF-1101 a session never outlives 7 days after sign-in', () => {
    const lastSeen = fixtureNow + (7 * 24 - 2) * hourMs;

    expect(sessionExpiresAt(fixtureNow, lastSeen)).toBe(fixtureNow + 7 * 24 * hourMs);
  });

  it('RF-1101 a session is expired from its expiry instant on', () => {
    const expiresAt = fixtureNow + 8 * hourMs;

    expect(isSessionExpired(expiresAt, expiresAt - 1)).toBe(false);
    expect(isSessionExpired(expiresAt, expiresAt)).toBe(true);
  });

  it('RF-1101 the user agent is cut to 200 characters, counting code points', () => {
    expect(cutUserAgent('🙂'.repeat(201))).toBe('🙂'.repeat(200));
    expect(cutUserAgent('Browser/1.0')).toBe('Browser/1.0');
  });
});
