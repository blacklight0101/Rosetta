import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../../src/application/ports/logger.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FanOutLogger } from '../../../../src/infrastructure/system/fan-out-logger.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';

const failure = new RosettaError(ERROR_CODES.logFileFailed);

const brokenSink: Logger = {
  log: () => Promise.reject(failure),
  securityEvent: () => Promise.reject(failure),
};

function memorySink(): MemoryLogger {
  return new MemoryLogger(new FixedClock('2026-10-11T09:05:03.007Z'), new SecretMasker());
}

describe('FanOutLogger', () => {
  it('RF-009 still writes to the healthy sinks when one fails, then reports the failure', async () => {
    const healthy = memorySink();
    const logger = new FanOutLogger([brokenSink, healthy]);

    await expect(logger.log({ level: 'info', logger: 'scan', message: 'kept' })).rejects.toBe(
      failure,
    );
    expect(healthy.entries.map((entry) => entry.message)).toEqual(['kept']);
  });

  it('RF-009 forwards security events to every sink and reports a failing one', async () => {
    const healthy = memorySink();
    const logger = new FanOutLogger([healthy, brokenSink]);

    await expect(
      logger.securityEvent(ERROR_CODES.baseUrlRejected, { message: 'Refused.' }),
    ).rejects.toBe(failure);
    expect(healthy.entries.map((entry) => entry.logger)).toEqual(['security']);
  });
});
