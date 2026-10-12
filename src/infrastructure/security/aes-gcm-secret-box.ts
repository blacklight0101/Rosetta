import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import type {
  SealedSecret,
  SecretBox,
  SecretUnreadable,
} from '../../application/ports/secret-box.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-1104, ADR-015, DEC-112: provider keys sealed with AES-256-GCM. The AES key is derived from
// ROSETTA_SECRET_KEY (32 bytes, base64) with HKDF-SHA256, an empty salt and the info
// `rosetta/provider-keys/v1`; its version is the first 16 hexadecimal characters of the SHA-256 of
// the derived key, a fingerprint from which neither key can be recovered. Each value gets a random
// 96-bit IV and a 128-bit tag; the additional data binds it to its row. During a rotation the box
// also holds the key derived from ROSETTA_SECRET_KEY_PREVIOUS, only to open older values.

const ALGORITHM = 'aes-256-gcm';
const HKDF_INFO = 'rosetta/provider-keys/v1';
const SECRET_BYTES = 32;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION_CHARACTERS = 16;

export interface SecretBoxSecrets {
  /** ROSETTA_SECRET_KEY: 32 bytes as base64. */
  readonly current: string;
  /** ROSETTA_SECRET_KEY_PREVIOUS during a rotation. */
  readonly previous?: string | undefined;
}

interface DerivedKey {
  readonly key: Buffer;
  readonly version: string;
}

function derive(secret: string, variable: string): DerivedKey {
  const material = Buffer.from(secret, 'base64');
  if (material.length !== SECRET_BYTES) {
    // The message names the variable, never its value (RF-1305).
    throw new RosettaError(
      ERROR_CODES.configurationInvalid,
      `${variable} must be 32 random bytes encoded as base64.`,
    );
  }
  // eslint-disable-next-line n/no-sync -- one 32-byte derivation per secret at start-up, no I/O; the box is built before the server listens.
  const key = Buffer.from(hkdfSync('sha256', material, Buffer.alloc(0), HKDF_INFO, KEY_BYTES));
  const version = createHash('sha256').update(key).digest('hex').slice(0, VERSION_CHARACTERS);
  return { key, version };
}

function unreadable(): Result<never, SecretUnreadable> {
  return err(ERROR_CODES.providerKeyUnreadable);
}

export class AesGcmSecretBox implements SecretBox {
  readonly keyVersion: string;
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(secrets: SecretBoxSecrets) {
    const current = derive(secrets.current, 'ROSETTA_SECRET_KEY');
    const keys = new Map<string, Buffer>();
    if (secrets.previous !== undefined) {
      const previous = derive(secrets.previous, 'ROSETTA_SECRET_KEY_PREVIOUS');
      keys.set(previous.version, previous.key);
    }
    keys.set(current.version, current.key);
    this.keyVersion = current.version;
    this.keys = keys;
  }

  knows(keyVersion: string): boolean {
    return this.keys.has(keyVersion);
  }

  seal(plaintext: string, additionalData: string): SealedSecret {
    const key = this.keys.get(this.keyVersion);
    if (key === undefined) throw new Error('The current key of the secret box is missing.');
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(additionalData, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: this.keyVersion };
  }

  open(sealed: SealedSecret, additionalData: string): Result<string, SecretUnreadable> {
    const key = this.keys.get(sealed.keyVersion);
    const shaped = sealed.iv.length === IV_BYTES && sealed.authTag.length === TAG_BYTES;
    if (key === undefined || !shaped) return unreadable();
    try {
      const decipher = createDecipheriv(ALGORITHM, key, sealed.iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(Buffer.from(additionalData, 'utf8'));
      decipher.setAuthTag(sealed.authTag);
      const plaintext = Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
      return ok(plaintext.toString('utf8'));
    } catch {
      // GCM refuses a changed byte or other additional data in final(); that is the expected
      // outcome of tampering, reported as RST-2300 without any detail of the value.
      return unreadable();
    }
  }
}
