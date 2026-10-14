import { describe, expect, it } from 'vitest';
import { RecordRefusedRequest } from '../../../../src/application/use-cases/record-refused-request.js';
import { ResolveSession } from '../../../../src/application/use-cases/resolve-session.js';
import { SignOut } from '../../../../src/application/use-cases/sign-out.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryAuditLog } from '../../../../src/infrastructure/db/memory-audit-log.js';
import { MemorySessionStore } from '../../../../src/infrastructure/db/memory-session-store.js';
import { MemoryUserRepository } from '../../../../src/infrastructure/db/memory-user-repository.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { fixtureNow, sampleAccount } from '../../../support/account-fixtures.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { sequenceSessionIds } from '../../../support/session-fixtures.js';

// RF-1101: sign-out deletes the session; a session expires after 8 idle hours; when an account is
// disabled, all its sessions end at its next request. RF-1009, RF-1109: a refused request is
// audited and logged as a security event.

const hourMs = 3_600_000;

function harness() {
  const users = new MemoryUserRepository();
  const sessions = new MemorySessionStore({ newId: sequenceSessionIds() });
  const auditLog = new MemoryAuditLog(new SecretMasker());
  const logger = new RecordingLogger();
  const clock = new FixedClock('2026-10-11T09:00:00.000Z');
  return {
    users,
    sessions,
    auditLog,
    logger,
    clock,
    resolve: new ResolveSession({ sessions, users, logger, clock }),
    signOut: new SignOut({ sessions, auditLog, logger, clock }),
    refusals: new RecordRefusedRequest({ auditLog, logger, clock }),
  };
}

async function sessionFor(parts: ReturnType<typeof harness>, account = sampleAccount()) {
  await parts.users.insert(account);
  const { id } = await parts.sessions.create({
    userId: account.id,
    ip: '',
    userAgent: '',
    now: new Date(fixtureNow),
  });
  return { account, id };
}

describe('ResolveSession', () => {
  it('RF-1009 a live session resolves to its actor and user', async () => {
    const parts = harness();
    const { account, id } = await sessionFor(parts, sampleAccount({ role: 'admin' }));

    const resolved = await parts.resolve.execute(id);

    expect(resolved).toEqual({
      sessionId: id,
      actor: { userId: account.id, role: 'admin' },
      user: {
        id: account.id,
        userName: account.userName,
        displayName: 'Sample User',
        role: 'admin',
        state: 'Active',
      },
      // RF-1101, P1-160: 8 hours after this request (an open stream ends then).
      expiresAt: new Date('2026-10-11T17:00:00.000Z'),
    });
  });

  it('RF-1101 a session idle for 8 hours resolves to nothing', async () => {
    const parts = harness();
    const { id } = await sessionFor(parts);

    parts.clock.advance(8 * hourMs);

    expect(await parts.resolve.execute(id)).toBeUndefined();
  });

  it('RF-1101 a disabled account is signed out of every session at its next request', async () => {
    const parts = harness();
    const { account, id } = await sessionFor(parts);
    await parts.sessions.create({
      userId: account.id,
      ip: '',
      userAgent: '',
      now: new Date(fixtureNow),
    });
    await parts.users.update({ ...account, state: 'Disabled' });

    const resolved = await parts.resolve.execute(id);

    expect(resolved).toBeUndefined();
    expect(parts.sessions.storedKeys()).toEqual([]);
  });
});

describe('SignOut', () => {
  it('RF-1101 signing out deletes the session and is audited', async () => {
    const parts = harness();
    const { account, id } = await sessionFor(parts);

    await parts.signOut.execute({
      actor: { userId: account.id, role: 'user' },
      sessionId: id,
      ip: '203.0.113.7',
    });

    expect(parts.sessions.storedKeys()).toEqual([]);
    const [audited] = await parts.auditLog.list({ since: 0 });
    expect(audited).toMatchObject({
      action: 'auth.sign_out',
      outcome: 'ok',
      actorUserId: account.id,
    });
  });
});

describe('RecordRefusedRequest', () => {
  it.each([
    ['origin', ERROR_CODES.originRefused],
    ['csrf', ERROR_CODES.csrfTokenInvalid],
    ['role', ERROR_CODES.notAllowed],
  ] as const)(
    'RF-1009 a request refused for its %s is audited and logged as %s',
    async (reason, code) => {
      const parts = harness();

      await parts.refusals.execute({
        actor: { userId: '00000000-0000-4000-9000-00000000a001', role: 'user' },
        reason,
        method: 'DELETE',
        path: '/api/session',
        ip: '203.0.113.7',
      });

      const [audited] = await parts.auditLog.list({ since: 0 });
      expect(audited).toMatchObject({
        action: 'request.refused',
        outcome: 'refused',
        actorUserId: '00000000-0000-4000-9000-00000000a001',
        targetId: 'DELETE /api/session',
        ip: '203.0.113.7',
        detail: { reason },
      });
      expect(parts.logger.records).toEqual([
        expect.objectContaining({ level: 'warn', logger: 'security', code }),
      ]);
    },
  );
});
