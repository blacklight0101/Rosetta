import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  formatLogEntry,
  isAtLeast,
  securityRecord,
  toJsonLine,
} from '../../../../src/infrastructure/system/log-entry.js';
import { FailingMasker } from '../../../support/failing-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { secretCases } from '../../../support/secret-fixture.js';

const at = new FixedClock('2026-10-11T09:05:03.007Z').now();
const masker = new SecretMasker();
const allCases = secretCases.map((secretCase) => secretCase.text).join('\n');

describe('log entry formatter', () => {
  it('RF-009 writes the fields in a stable order with the schema version and an ISO time', () => {
    const entry = formatLogEntry(
      {
        data: { step: 'read' },
        userId: 'user-1',
        callId: 'call-1',
        agentTaskId: 'task-1',
        runId: 'run-1',
        code: ERROR_CODES.providerTimeout,
        message: 'Timed out.',
        logger: 'providers',
        level: 'error',
      },
      at,
      masker,
    );

    expect(Object.keys(entry)).toEqual([
      'schemaVersion',
      'at',
      'level',
      'logger',
      'message',
      'code',
      'runId',
      'agentTaskId',
      'callId',
      'userId',
      'data',
    ]);
    expect(entry.at).toBe('2026-10-11T09:05:03.007Z');
  });
});

describe('log entry masking', () => {
  it('RF-009 masks the message and every string nested in data, keeping other values', () => {
    const entry = formatLogEntry(
      {
        level: 'info',
        logger: 'scan',
        message: allCases,
        data: { list: [allCases, 3, false, null], nested: { deep: { text: allCases } } },
      },
      at,
      masker,
    );

    const line = toJsonLine(entry);
    for (const secret of secretCases.flatMap((secretCase) => secretCase.secrets)) {
      expect(line).not.toContain(secret);
    }
    expect(entry.message).toBe(masker.mask(allCases).text);
    expect(entry.data?.['list']).toEqual([masker.mask(allCases).text, 3, false, null]);
  });

  it('RF-009 keeps the line count of a masked multi-line message', () => {
    const entry = formatLogEntry({ level: 'info', logger: 'scan', message: allCases }, at, masker);

    expect(entry.message.split('\n')).toHaveLength(allCases.split('\n').length);
  });

  it('RF-141 replaces the entry with a security warning when the masker fails', () => {
    const entry = formatLogEntry(
      { level: 'debug', logger: 'scan', message: allCases, callId: 'call-9', data: { a: 'b' } },
      at,
      new FailingMasker(),
    );

    expect(entry).toEqual({
      schemaVersion: 1,
      at: '2026-10-11T09:05:03.007Z',
      level: 'warn',
      logger: 'security',
      message: 'Log entry withheld because secret masking failed.',
      code: 'RST-2101',
      callId: 'call-9',
    });
  });
});

describe('log entry lines, security records and levels', () => {
  it('RF-009 serialises one entry as exactly one JSON line ending in a line feed', () => {
    const entry = formatLogEntry({ level: 'info', logger: 'scan', message: 'a\nb' }, at, masker);

    const line = toJsonLine(entry);

    expect(line.endsWith('\n')).toBe(true);
    expect(line.slice(0, -1)).not.toContain('\n');
    expect(JSON.parse(line)).toEqual(entry);
  });

  it('RF-009 builds a security event as a warn record with logger security', () => {
    expect(
      securityRecord(ERROR_CODES.baseUrlRejected, { message: 'Refused.', userId: 'user-1' }),
    ).toEqual({
      level: 'warn',
      logger: 'security',
      message: 'Refused.',
      code: 'RST-2304',
      userId: 'user-1',
    });
  });

  it.each([
    ['debug', 'debug', true],
    ['info', 'debug', true],
    ['debug', 'info', false],
    ['warn', 'info', true],
    ['info', 'warn', false],
    ['error', 'warn', true],
    ['warn', 'error', false],
  ] as const)('RF-009 level %s passes a minimum of %s: %s', (level, minimum, expected) => {
    expect(isAtLeast(level, minimum)).toBe(expected);
  });
});
