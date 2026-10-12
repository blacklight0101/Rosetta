import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  hashSessionId,
  isSessionIdForm,
  newSessionId,
} from '../../../../src/infrastructure/security/session-ids.js';

// RF-1101: given a successful sign-in, when the session is created, then its id is new and random
// (256 bits from node:crypto) and only its SHA-256 is stored.
describe('session ids', () => {
  it('RF-1101 a new id is 256 random bits written as 43 base64url characters', () => {
    const ids = Array.from({ length: 200 }, () => newSessionId());

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(id, 'base64url')).toHaveLength(32);
      expect(isSessionIdForm(id)).toBe(true);
    }
  });

  it('RF-1101 the stored form is the 32-byte SHA-256 of the id', () => {
    const id = newSessionId();

    const hash = hashSessionId(id);

    expect(hash).toHaveLength(32);
    expect(hash.equals(createHash('sha256').update(id).digest())).toBe(true);
  });

  it.each(['', 'short', `${'a'.repeat(43)}=`, `${'a'.repeat(42)}+`, `${'a'.repeat(42)}/`])(
    'RF-1101 %j is not the form of a session id',
    (text) => {
      expect(isSessionIdForm(text)).toBe(false);
    },
  );
});
