import { describe, expect, it } from 'vitest';
import type { LogValue } from '../../../../src/application/ports/logger.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { formatLogEntry, toJsonLine } from '../../../../src/infrastructure/system/log-entry.js';
import { fakeValue } from '../../../support/fake-value.js';
import { FixedClock } from '../../../support/fixed-clock.js';

const at = new FixedClock('2026-10-11T09:05:03.007Z').now();
const masker = new SecretMasker();
// FAKE SECRETS ONLY (RNF-003): plain words the text masker alone would not recognise.
const fakeSecret = `Plain ${fakeValue(14)} words`;

function loggedData(data: Readonly<Record<string, LogValue>>): Record<string, LogValue> {
  return (
    formatLogEntry({ level: 'info', logger: 'test', message: 'm', data }, at, masker).data ?? {}
  );
}

describe('log entry masking by data key name', () => {
  it.each([
    ['password', '[MASKED:password]'],
    ['passwd', '[MASKED:password]'],
    ['pwd', '[MASKED:password]'],
    ['SmtpPassword', '[MASKED:password]'],
    ['secret', '[MASKED:password]'],
    ['clientSecret', '[MASKED:password]'],
    ['token', '[MASKED:bearer-token]'],
    ['accessToken', '[MASKED:bearer-token]'],
    ['apiKey', '[MASKED:api-key]'],
    ['api_key', '[MASKED:api-key]'],
    ['X-Api-Key', '[MASKED:api-key]'],
  ])('RF-009 replaces the whole value of the data key %s with %s', (key, marker) => {
    expect(loggedData({ [key]: fakeSecret })).toEqual({ [key]: marker });
  });
});

describe('log entry masking by data key name, for every value type and depth', () => {
  it('RF-009 replaces a number, a list and an object under a secret key whole', () => {
    const data = loggedData({
      password: 73915820,
      tokens: [fakeSecret, 'second'],
      apiKey: { value: fakeSecret, version: 2 },
      secret: null,
    });

    expect(data).toEqual({
      password: '[MASKED:password]',
      tokens: '[MASKED:bearer-token]',
      apiKey: '[MASKED:api-key]',
      secret: '[MASKED:password]',
    });
  });

  it('RF-009 masks a secret key at any depth and leaves other keys as they were', () => {
    const data = loggedData({
      user: 'app',
      attempt: 2,
      db: { host: 'db', connection: { Password: fakeSecret } },
      accounts: [{ name: 'smtp', smtpPwd: fakeSecret }],
    });

    expect(data).toEqual({
      user: 'app',
      attempt: 2,
      db: { host: 'db', connection: { Password: '[MASKED:password]' } },
      accounts: [{ name: 'smtp', smtpPwd: '[MASKED:password]' }],
    });
  });

  it('RNF-003 never writes the value of a secret key in the JSON line', () => {
    const entry = formatLogEntry(
      { level: 'warn', logger: 'test', message: 'm', data: { nested: { password: fakeSecret } } },
      at,
      masker,
    );

    expect(toJsonLine(entry)).not.toContain(fakeValue(14));
  });
});
