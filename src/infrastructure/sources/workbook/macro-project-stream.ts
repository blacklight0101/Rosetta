import type { MacroModuleKind } from './macro-model.js';

// RF-154, MS-OVBA sections 2.3.1 and 2.4.3: the `PROJECT` stream is text. Its `Module=`, `Class=`,
// `Document=` and `BaseClass=` lines tell the kinds of module the `dir` stream cannot tell apart,
// and `CMG` holds the protection state, obfuscated; a project the author locked for viewing is
// skipped (Q-40). Nothing here is a password check: the state is read, not the password.

export interface ProjectStream {
  /** Lower-case module name to its kind, for the modules the `dir` stream calls non-procedural. */
  readonly kinds: ReadonlyMap<string, MacroModuleKind>;
  readonly locked: boolean;
}

const KEY_KINDS: Readonly<Record<string, MacroModuleKind>> = {
  module: 'standard',
  class: 'class',
  document: 'document',
  baseclass: 'form',
};

const ENCRYPTION_VERSION = 2;
const PROTECTION_BITS = 0b111;

/** Section 2.4.3.3: undoes the obfuscation of an Encrypted Data Structure; undefined when it is malformed. */
function decryptData(encrypted: Uint8Array): Uint8Array | undefined {
  const [seed = 0, versionEnc = 0, keyEnc = 0] = encrypted;
  if ((seed ^ versionEnc) !== ENCRYPTION_VERSION) return undefined;
  let unencrypted1 = seed ^ keyEnc;
  let encrypted1 = keyEnc;
  let encrypted2 = versionEnc;
  const plain: number[] = [];
  for (const cipher of encrypted.subarray(3)) {
    const byte = cipher ^ ((encrypted2 + unencrypted1) & 0xff);
    plain.push(byte);
    encrypted2 = encrypted1;
    encrypted1 = cipher;
    unencrypted1 = byte;
  }
  const ignored = (seed & 6) >> 1;
  const lengthBytes = plain.slice(ignored, ignored + 4);
  const length = lengthBytes.reduce((sum, byte, index) => sum + byte * 256 ** index, 0);
  const data = plain.slice(ignored + 4);
  return lengthBytes.length === 4 && length === data.length ? Uint8Array.from(data) : undefined;
}

/** Whether the protection state of `CMG="hex"` is clear; one that cannot be decoded is not. */
function isClear(hex: string): boolean {
  if (!/^(?:[0-9a-fA-F]{2}){4,40}$/.test(hex)) return false;
  const data = decryptData(Buffer.from(hex, 'hex'));
  return data !== undefined && data.length >= 1 && ((data[0] ?? 0) & PROTECTION_BITS) === 0;
}

export function parseProjectStream(text: string): ProjectStream {
  const kinds = new Map<string, MacroModuleKind>();
  const protections: boolean[] = [];
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf('=');
    if (at < 0) continue;
    const key = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    const kind = KEY_KINDS[key];
    if (kind !== undefined) kinds.set(value.split('/')[0]?.toLowerCase() ?? '', kind);
    if (key === 'cmg') protections.push(isClear(value.replace(/^"|"$/g, '')));
  }
  // Fail closed: a second CMG line or one that cannot be decoded counts as a lock (Q-40).
  return { kinds, locked: protections.length > 1 || protections.includes(false) };
}
