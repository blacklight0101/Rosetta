import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/application/ports/clock.js';
import type { Logger } from '../../src/application/ports/logger.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { SecretMasker, type TextMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { FailingMasker } from '../support/failing-masker.js';
import { FixedClock } from '../support/fixed-clock.js';
import { secretCases } from '../support/secret-fixture.js';

export interface LoggerHarness {
  readonly logger: Logger;
  /** Everything the logger wrote, as JSON lines. */
  readonly written: () => Promise<string>;
}

export type LoggerFactory = (clock: Clock, masker: TextMasker) => Promise<LoggerHarness>;

const instant = '2026-10-11T09:05:03.007Z';

async function parsedLines(harness: LoggerHarness): Promise<unknown[]> {
  const text = await harness.written();
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

/** Contract of the Logger port (RF-009): every logger and the test fake must pass it. */
export function loggerContract(name: string, create: LoggerFactory): void {
  describe(`Logger contract: ${name}`, () => {
    const newHarness = (masker: TextMasker = new SecretMasker()): Promise<LoggerHarness> =>
      create(new FixedClock(instant), masker);

    it('RF-009 writes one JSON line with time, level, logger, message, code and ids', async () => {
      const harness = await newHarness();
      await harness.logger.log({
        level: 'error',
        logger: 'providers',
        message: 'The provider did not answer.',
        code: ERROR_CODES.providerTimeout,
        runId: '20261011-090503-understand',
        agentTaskId: 'task-7',
        callId: 'call-3',
        userId: 'user-1',
        data: { attempt: 2, retried: true, hosts: ['api.example.com'], extra: null },
      });

      expect(await parsedLines(harness)).toEqual([
        {
          schemaVersion: 1,
          at: instant,
          level: 'error',
          logger: 'providers',
          message: 'The provider did not answer.',
          code: 'RST-1505',
          runId: '20261011-090503-understand',
          agentTaskId: 'task-7',
          callId: 'call-3',
          userId: 'user-1',
          data: { attempt: 2, retried: true, hosts: ['api.example.com'], extra: null },
        },
      ]);
    });

    it('RF-009 leaves out the code and the ids that do not apply, and keeps the order', async () => {
      const harness = await newHarness();
      await harness.logger.log({ level: 'debug', logger: 'scan', message: 'first' });
      await harness.logger.log({ level: 'info', logger: 'scan', message: 'second' });

      expect(await parsedLines(harness)).toEqual([
        { schemaVersion: 1, at: instant, level: 'debug', logger: 'scan', message: 'first' },
        { schemaVersion: 1, at: instant, level: 'info', logger: 'scan', message: 'second' },
      ]);
    });

    it('RF-009 writes a security event as warn with logger security and the event code', async () => {
      const harness = await newHarness();
      await harness.logger.securityEvent(ERROR_CODES.baseUrlRejected, {
        message: 'A request was refused.',
        runId: 'run-1',
      });

      expect(await parsedLines(harness)).toEqual([
        {
          schemaVersion: 1,
          at: instant,
          level: 'warn',
          logger: 'security',
          message: 'A request was refused.',
          code: 'RST-2304',
          runId: 'run-1',
        },
      ]);
    });

    it('RF-009 never writes a fixture secret, in the message or nested in data', async () => {
      const harness = await newHarness();
      for (const secretCase of secretCases) {
        await harness.logger.log({
          level: 'warn',
          logger: 'fixture',
          message: secretCase.text,
          data: { nested: { content: secretCase.text, list: [secretCase.text] } },
        });
      }

      const written = await harness.written();
      expect(written).toContain('[MASKED:');
      for (const secret of secretCases.flatMap((secretCase) => secretCase.secrets)) {
        expect(written).not.toContain(secret);
      }
    });

    it('RF-141 fails closed: a failing masker withholds the entry and logs the failure', async () => {
      const harness = await newHarness(new FailingMasker());
      const [secretCase] = secretCases;
      await harness.logger.log({
        level: 'info',
        logger: 'fixture',
        message: secretCase?.text ?? '',
        runId: 'run-1',
      });

      const lines = await parsedLines(harness);
      expect(lines).toEqual([
        {
          schemaVersion: 1,
          at: instant,
          level: 'warn',
          logger: 'security',
          message: 'Log entry withheld because secret masking failed.',
          code: 'RST-2101',
          runId: 'run-1',
        },
      ]);
    });
  });
}
