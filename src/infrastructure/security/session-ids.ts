import { createHash, randomBytes } from 'node:crypto';

// RF-1101, ADR-015: a session id is 256 random bits from node:crypto, written as base64url (43
// characters) in the cookie. Only its SHA-256 is stored (data-model.md section 4, `sessions.id_hash`),
// so a database dump cannot be replayed as a cookie. A cookie value of any other form names no
// session and is never looked up.

const SESSION_ID_BYTES = 32;
const SESSION_ID_FORM = /^[A-Za-z0-9_-]{43}$/;

/** A new random session id. */
// RF-1101
export function newSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString('base64url');
}

/** True for the form of an id made by `newSessionId`. */
// RF-1101
export function isSessionIdForm(id: string): boolean {
  return SESSION_ID_FORM.test(id);
}

/** The 32-byte SHA-256 of the id's text, the only form that is stored. */
// RF-1101
export function hashSessionId(id: string): Buffer {
  return createHash('sha256').update(id, 'utf8').digest();
}
