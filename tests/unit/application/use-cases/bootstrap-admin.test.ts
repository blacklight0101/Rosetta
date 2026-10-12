import { describe, expect, it } from 'vitest';
import { BootstrapAdmin } from '../../../../src/application/use-cases/bootstrap-admin.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryAuditLog } from '../../../../src/infrastructure/db/memory-audit-log.js';
import { MemoryUserRepository } from '../../../../src/infrastructure/db/memory-user-repository.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  FakePasswordHasher,
  fixturePassword,
  sampleAccount,
} from '../../../support/account-fixtures.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-1102: given the first start of an empty database, when ROSETTA_ADMIN_USER and
// ROSETTA_ADMIN_PASSWORD are set, then that administrator account is created once and the
// password must be changed at first sign-in; the values are never logged. RF-1109: the account
// change is audited, without the values.

const adminName = ['boot', 'admin'].join('');
const common: ReadonlySet<string> = new Set([['pass', 'word', '1234', '5678'].join('')]);

function harness(): {
  readonly users: MemoryUserRepository;
  readonly audit: MemoryAuditLog;
  readonly logger: RecordingLogger;
  readonly hasher: FakePasswordHasher;
  readonly bootstrap: BootstrapAdmin;
} {
  const users = new MemoryUserRepository();
  const audit = new MemoryAuditLog(new SecretMasker());
  const logger = new RecordingLogger();
  const hasher = new FakePasswordHasher();
  const bootstrap = new BootstrapAdmin({
    users,
    hasher,
    auditLog: audit,
    logger,
    clock: new FixedClock('2026-10-11T09:00:00.000Z'),
    ids: new SequenceIdGenerator(),
    commonPasswords: common,
  });
  return { users, audit, logger, hasher, bootstrap };
}

describe('BootstrapAdmin', () => {
  it('RF-1102 creates the administrator once on an empty users table, in MustChangePassword', async () => {
    const { users, hasher, bootstrap } = harness();
    const password = fixturePassword('Boot');

    const outcome = await bootstrap.execute({ userName: adminName, password });
    const [admin] = await users.list();
    const stored = await users.findByUserName(adminName);

    expect(outcome).toEqual({ ok: true, value: 'created' });
    expect(admin).toMatchObject({
      userName: adminName,
      role: 'admin',
      state: 'MustChangePassword',
      createdAt: Date.UTC(2026, 9, 11, 9),
    });
    expect(stored && (await hasher.verify(password, stored.passwordHash))).toBe(true);
  });

  it('RF-1102 a second start with the variables set creates no second account', async () => {
    const { users, hasher, bootstrap } = harness();
    await bootstrap.execute({ userName: adminName, password: fixturePassword('Boot') });

    const second = await bootstrap.execute({
      userName: 'another.admin',
      password: fixturePassword('Again'),
    });

    expect(second).toEqual({ ok: true, value: 'accounts-exist' });
    expect(await users.list()).toHaveLength(1);
    expect(hasher.hashes).toBe(1);
  });

  it('RF-1102 creates nothing when accounts exist, even with weak variables', async () => {
    const { users, bootstrap } = harness();
    await users.insert(sampleAccount());

    const outcome = await bootstrap.execute({ userName: adminName, password: 'short' });

    expect(outcome).toEqual({ ok: true, value: 'accounts-exist' });
    expect(await users.list()).toHaveLength(1);
  });

  it('RF-1102 never logs or audits the user name or the password', async () => {
    const { audit, logger, bootstrap } = harness();
    const password = fixturePassword('Secret');

    await bootstrap.execute({ userName: adminName, password });
    await bootstrap.execute({ userName: adminName, password });
    const rows = await audit.list({ since: new FixedClock('2026-10-11T00:00:00.000Z').now() });

    expect(logger.records.length).toBeGreaterThan(0);
    expect(logger.text()).not.toContain(password);
    expect(logger.text()).not.toContain(adminName);
    expect(JSON.stringify(rows)).not.toContain(password);
    expect(JSON.stringify(rows)).not.toContain(adminName);
  });

  it('RF-1109 audits the creation of the administrator', async () => {
    const { users, audit, bootstrap } = harness();

    await bootstrap.execute({ userName: adminName, password: fixturePassword('Audit') });
    const [admin] = await users.list();
    const rows = await audit.list({ since: new FixedClock('2026-10-11T00:00:00.000Z').now() });

    expect(rows).toEqual([
      {
        id: expect.any(String),
        at: new FixedClock('2026-10-11T09:00:00.000Z').now(),
        actorUserId: null,
        action: 'user.created',
        targetType: 'user',
        targetId: admin?.id,
        ip: 'start-up',
        outcome: 'ok',
        detail: { role: 'admin', source: 'environment' },
      },
    ]);
  });

  it.each([
    ['the user name', { password: fixturePassword('Only') }],
    ['the password', { userName: adminName }],
    ['both variables', {}],
  ])(
    'RF-1102 creates nothing and warns when %s is not set on an empty table',
    async (_c, request) => {
      const { users, logger, bootstrap } = harness();

      const outcome = await bootstrap.execute(request);

      expect(outcome).toEqual({ ok: true, value: 'not-configured' });
      expect(await users.hasUsers()).toBe(false);
      expect(logger.records.map((record) => record.level)).toEqual(['warn']);
    },
  );

  it.each([
    ['too short', ['Ab1', 'Cd2'].join('-'), ERROR_CODES.passwordTooShort],
    [
      'on the common list',
      ['Pass', 'word', '1234', '5678'].join(''),
      ERROR_CODES.passwordTooCommon,
    ],
    [
      'containing the user name',
      `${adminName}-${fixturePassword('X')}`,
      ERROR_CODES.passwordContainsUserName,
    ],
  ])('RF-1103 refuses a bootstrap password %s and creates nothing', async (_c, password, code) => {
    const { users, logger, bootstrap } = harness();

    const outcome = await bootstrap.execute({ userName: adminName, password });

    expect(outcome).toEqual({ ok: false, error: code });
    expect(await users.hasUsers()).toBe(false);
    expect(logger.text()).not.toContain(password);
  });

  it('RF-1102 refuses an invalid bootstrap user name and creates nothing', async () => {
    const { users, bootstrap } = harness();

    const outcome = await bootstrap.execute({ userName: 'a b', password: fixturePassword('N') });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.userNameInvalid });
    expect(await users.hasUsers()).toBe(false);
  });
});
