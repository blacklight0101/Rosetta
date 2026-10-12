import type { EpochMs } from './user.js';

// RF-1101, ADR-015: a session ends after 8 hours without activity or 7 days after sign-in,
// whichever comes first: expires_at = min(last_seen_at + 8 h, created_at + 7 days) (data-model.md
// section 4, `sessions`). The user agent kept for the administrator's view is cut to 200
// characters (code points, as PostgreSQL's char_length counts them).

export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60_000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60_000;
const USER_AGENT_MAX = 200;

/** The instant the session ends unless it is used again before. */
// RF-1101
export function sessionExpiresAt(createdAt: EpochMs, lastSeenAt: EpochMs): EpochMs {
  return Math.min(lastSeenAt + SESSION_IDLE_TIMEOUT_MS, createdAt + SESSION_ABSOLUTE_TIMEOUT_MS);
}

/** True from the expiry instant on. */
// RF-1101
export function isSessionExpired(expiresAt: EpochMs, now: EpochMs): boolean {
  return now >= expiresAt;
}

/** The first 200 characters of the user agent. */
// RF-1101
export function cutUserAgent(userAgent: string): string {
  return Array.from(userAgent).slice(0, USER_AGENT_MAX).join('');
}
