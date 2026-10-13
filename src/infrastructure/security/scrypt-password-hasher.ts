import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { PasswordHasher } from '../../application/ports/password-hasher.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { Semaphore } from './semaphore.js';

// ADR-015, RF-1100: scrypt from node:crypto, no native addon. Stored as
// `scrypt$N$r$p$salt$hash` with base64 salt and key, so the parameters can be raised later;
// verification derives with the stored parameters and compares in constant time. DEC-112: maxmem
// 256 MiB and at most two derivations at a time.

export interface ScryptParameters {
  /** N, a power of two. */
  readonly cost: number;
  /** r. */
  readonly blockSize: number;
  /** p. */
  readonly parallelization: number;
}

/** What the hasher needs of the key derivation, so a test can watch it. */
export type DeriveKey = (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions & { readonly maxmem: number },
) => Promise<Buffer>;

export interface ScryptPasswordHasherOptions {
  /** The parameters of new hashes; ADR-015's by default. */
  readonly parameters?: ScryptParameters;
  readonly derive?: DeriveKey;
}

const ADR_015_PARAMETERS: ScryptParameters = { cost: 2 ** 17, blockSize: 8, parallelization: 1 };
const SALT_BYTES = 16;
const KEY_BYTES = 64;
// P1-77: the bounds of a stored hash, so a tampered row cannot make verification costly or throw.
// P1-101: the highest cost is the ADR-015 N, so raising N there moves the bound with it.
const MIN_COST = 2 ** 10;
const MAX_COST = ADR_015_PARAMETERS.cost;
const MAX_BLOCK_SIZE = 16;
const MAX_PARALLELIZATION = 4;
const MIN_SALT_BYTES = 16;
const MAX_SALT_BYTES = 64;
const MIN_KEY_BYTES = 16;
const MAX_KEY_BYTES = 64;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;
const MAX_CONCURRENT_HASHES = 2;
const BASE64 = '[A-Za-z0-9+/]+={0,2}';
const STORED_FORM = new RegExp(
  `^scrypt\\$(\\d{1,8})\\$(\\d{1,3})\\$(\\d{1,3})\\$(${BASE64})\\$(${BASE64})$`,
);

function deriveWithScrypt(
  ...[password, salt, keyLength, options]: Parameters<DeriveKey>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error === null) resolve(key);
      else reject(error);
    });
  });
}

function isPowerOfTwo(value: number): boolean {
  return value > 1 && (value & (value - 1)) === 0;
}

function isWithin(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/** Within the bounds and within maxmem: scrypt needs about 128 * N * r * p bytes. */
function isAllowed({ cost, blockSize, parallelization }: ScryptParameters): boolean {
  return (
    isPowerOfTwo(cost) &&
    isWithin(cost, MIN_COST, MAX_COST) &&
    isWithin(blockSize, 1, MAX_BLOCK_SIZE) &&
    isWithin(parallelization, 1, MAX_PARALLELIZATION) &&
    128 * cost * blockSize * parallelization < MAX_MEMORY_BYTES
  );
}

interface StoredHash {
  readonly parameters: ScryptParameters;
  readonly salt: Buffer;
  readonly key: Buffer;
}

function hashInvalid(cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.passwordHashInvalid,
    undefined,
    cause === undefined ? undefined : { cause },
  );
}

/** The parts of a stored hash; RST-2209 when it is not a hash this hasher can verify. */
function parseStored(stored: string): StoredHash {
  const match = STORED_FORM.exec(stored);
  if (match === null) throw hashInvalid();
  const [, cost = '', blockSize = '', parallelization = '', salt = '', key = ''] = match;
  const parameters = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
  };
  const saltBytes = Buffer.from(salt, 'base64');
  const keyBytes = Buffer.from(key, 'base64');
  if (
    !isAllowed(parameters) ||
    !isWithin(saltBytes.length, MIN_SALT_BYTES, MAX_SALT_BYTES) ||
    !isWithin(keyBytes.length, MIN_KEY_BYTES, MAX_KEY_BYTES)
  ) {
    throw hashInvalid();
  }
  return { parameters, salt: saltBytes, key: keyBytes };
}

export class ScryptPasswordHasher implements PasswordHasher {
  private readonly parameters: ScryptParameters;
  private readonly derive: DeriveKey;
  private readonly slots = new Semaphore(MAX_CONCURRENT_HASHES);

  constructor(options: ScryptPasswordHasherOptions = {}) {
    this.parameters = options.parameters ?? ADR_015_PARAMETERS;
    this.derive = options.derive ?? deriveWithScrypt;
  }

  // RF-1100
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await this.deriveKey(password, salt, KEY_BYTES, this.parameters);
    const { cost, blockSize, parallelization } = this.parameters;
    return [
      'scrypt',
      cost,
      blockSize,
      parallelization,
      salt.toString('base64'),
      key.toString('base64'),
    ]
      .map(String)
      .join('$');
  }

  // RF-1100
  async verify(password: string, passwordHash: string): Promise<boolean> {
    const stored = parseStored(passwordHash);
    let key: Buffer;
    try {
      key = await this.deriveKey(password, stored.salt, stored.key.length, stored.parameters);
    } catch (error) {
      // P1-77: a RangeError or any other scrypt failure on a stored hash is RST-2209.
      throw hashInvalid(error);
    }
    if (key.length !== stored.key.length) throw hashInvalid();
    return timingSafeEqual(key, stored.key);
  }

  private deriveKey(
    password: string,
    salt: Buffer,
    keyLength: number,
    parameters: ScryptParameters,
  ): Promise<Buffer> {
    const options = {
      N: parameters.cost,
      r: parameters.blockSize,
      p: parameters.parallelization,
      maxmem: MAX_MEMORY_BYTES,
    };
    return this.slots.run(() => this.derive(password, salt, keyLength, options));
  }
}
