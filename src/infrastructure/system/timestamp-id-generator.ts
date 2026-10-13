import { randomBytes, randomUUID } from 'node:crypto';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';

/** RF-145: 15 random bytes are 120 bits, exactly 24 base32 characters. */
const TAG_BYTES = 15;
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const BITS_PER_CHAR = 5;

/** The bytes as lower-case base32 (RFC 4648 alphabet), without padding. */
function base32(bytes: Uint8Array): string {
  let text = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= BITS_PER_CHAR) {
      bits -= BITS_PER_CHAR;
      text += BASE32.charAt((buffer >> bits) & 31);
    }
    buffer &= (1 << bits) - 1;
  }
  return text;
}

// RNF-004: run ids are yyyyMMdd-HHmmss-<stage> in UTC (data-model.md section 2).
export class TimestampIdGenerator implements IdGenerator {
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  runId(stage: string): string {
    // toISOString is "yyyy-MM-ddTHH:mm:ss.sssZ"
    const [date = '', time = ''] = this.clock.now().toISOString().split('T');
    const stamp = `${date.replaceAll('-', '')}-${time.slice(0, 8).replaceAll(':', '')}`;
    return `${stamp}-${stage}`;
  }

  uuid(): string {
    return randomUUID();
  }

  // RF-145
  dataBlockTag(): string {
    return base32(randomBytes(TAG_BYTES));
  }
}
