import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '../../../../src/application/ports/audit-log.js';
import type { LogRecord } from '../../../../src/application/ports/logger.js';
import { ERROR_CODES, type ErrorCode } from '../../../../src/domain/errors/codes.js';
import { fixtureNow, sampleAccount } from '../../../support/account-fixtures.js';
import { amy, bob, projectHarness, root } from '../../../support/project-harness.js';

// RF-1105, RF-1109 (P1-80): a refused or unknown-id workspace open is answered as before and also
// writes an `admin.workspace_opened` audit row with the outcome `refused` and the refusal's code.

async function withAmy(): Promise<ReturnType<typeof projectHarness>> {
  const test = projectHarness();
  await test.users.insert(sampleAccount({ id: amy.userId, userName: 'amy', displayName: 'Amy' }));
  await test.createProject.execute({ actor: amy, url: 'https://github.com/owner/repo' });
  return test;
}

interface Refusal {
  readonly actorUserId: string;
  readonly targetId: string;
  readonly code: ErrorCode;
}

/** The whole audit row of a refusal; the first row of a fresh log has the id "1". */
function refusedRow({ actorUserId, targetId, code }: Refusal): AuditEvent {
  return {
    id: '1',
    at: new Date(fixtureNow),
    actorUserId,
    action: 'admin.workspace_opened',
    targetType: 'user',
    targetId,
    ip: '203.0.113.9',
    outcome: 'refused',
    detail: { code },
  };
}

function refusedLog(userId: string, ownerId: string, code: ErrorCode): LogRecord {
  return {
    level: 'warn',
    logger: 'accounts',
    message: 'A workspace open was refused.',
    code,
    userId,
    data: { ownerId },
  };
}

describe('OpenWorkspace: refusals', () => {
  it('RF-1109 a user who is not an administrator is refused, nothing is read and a refused row is written', async () => {
    const test = await withAmy();

    const outcome = await test.openWorkspace.execute({
      actor: bob,
      ownerId: amy.userId,
      ip: '203.0.113.9',
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notAllowed });
    expect(await test.audit.list({ since: 0 })).toEqual([
      refusedRow({ actorUserId: bob.userId, targetId: amy.userId, code: ERROR_CODES.notAllowed }),
    ]);
    expect(test.logger.records).toEqual([
      refusedLog(bob.userId, amy.userId, ERROR_CODES.notAllowed),
    ]);
  });

  it('RF-1109 an unknown user id is not found and a refused row is written', async () => {
    const test = await withAmy();
    const unknown = '00000000-0000-4000-9000-00000000ffff';

    const outcome = await test.openWorkspace.execute({
      actor: root,
      ownerId: unknown,
      ip: '203.0.113.9',
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(await test.audit.list({ since: 0 })).toEqual([
      refusedRow({ actorUserId: root.userId, targetId: unknown, code: ERROR_CODES.notFound }),
    ]);
    expect(test.logger.records).toEqual([refusedLog(root.userId, unknown, ERROR_CODES.notFound)]);
  });
});
