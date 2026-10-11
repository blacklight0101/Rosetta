import { describe, expect, it } from 'vitest';
import {
  SecretMasker,
  type TextMasker,
} from '../../../../src/infrastructure/guards/secret-masker.js';
import { StdoutJsonLogger } from '../../../../src/infrastructure/system/stdout-json-logger.js';
import { FailingMasker } from '../../../support/failing-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';

function loggerAt(
  minLevel: 'debug' | 'info' | 'warn' | 'error',
  masker: TextMasker = new SecretMasker(),
): {
  readonly logger: StdoutJsonLogger;
  readonly chunks: string[];
} {
  const chunks: string[] = [];
  const logger = new StdoutJsonLogger({
    output: { write: (chunk: string) => chunks.push(chunk) },
    clock: new FixedClock('2026-10-11T09:05:03.007Z'),
    masker,
    minLevel,
  });
  return { logger, chunks };
}

describe('StdoutJsonLogger', () => {
  it('RF-009 writes ROSETTA_LOG_LEVEL and above to standard output and drops the rest', async () => {
    const { logger, chunks } = loggerAt('info');

    await logger.log({ level: 'debug', logger: 'scan', message: 'hidden' });
    await logger.log({ level: 'info', logger: 'scan', message: 'shown' });
    await logger.log({ level: 'error', logger: 'scan', message: 'also shown' });

    expect(chunks.map((chunk): unknown => JSON.parse(chunk))).toEqual([
      expect.objectContaining({ level: 'info', message: 'shown' }),
      expect.objectContaining({ level: 'error', message: 'also shown' }),
    ]);
  });

  it('RF-009 writes one complete line per entry', async () => {
    const { logger, chunks } = loggerAt('debug');

    await logger.log({ level: 'info', logger: 'scan', message: 'two\nlines' });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.endsWith('\n')).toBe(true);
    expect(chunks[0]?.slice(0, -1)).not.toContain('\n');
  });

  it('RF-009 keeps security events at warn when the minimum level is warn', async () => {
    const { logger, chunks } = loggerAt('warn');

    await logger.securityEvent('RST-2304', { message: 'Refused.' });

    expect(chunks).toHaveLength(1);
  });

  it('RF-141 shows the withheld security warning of a debug entry at level info', async () => {
    const { logger, chunks } = loggerAt('info', new FailingMasker());

    await logger.log({ level: 'debug', logger: 'scan', message: 'unmaskable' });

    expect(chunks.map((chunk): unknown => JSON.parse(chunk))).toEqual([
      expect.objectContaining({ level: 'warn', logger: 'security', code: 'RST-2101' }),
    ]);
  });
});
