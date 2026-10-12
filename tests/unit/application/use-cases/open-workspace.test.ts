import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { amy, bob, projectHarness, root } from '../../../support/project-harness.js';

// RF-1105, RF-1109 (P1-80): a refused or unknown-id workspace open is answered as before and also
// writes an `admin.workspace_opened` audit row with the outcome `refused` and the refusal's code.

async function withAmy(): Promise<ReturnType<typeof projectHarness>> {
  const test = projectHarness();
  await test.users.insert(sampleAccount({ id: amy.userId, userName: 'amy', displayName: 'Amy' }));
  await test.createProject.execute({ actor: amy, url: 'https://github.com/owner/repo' });
  return test;
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
    expect(await test.audit.list({ since: 0 })).toMatchObject([
      { actorUserId: bob.userId, action: 'admin.workspace_opened', targetType: 'user' },
    ]);
    expect(await test.audit.list({ since: 0 })).toMatchObject([
      {
        targetId: amy.userId,
        ip: '203.0.113.9',
        outcome: 'refused',
        detail: { code: ERROR_CODES.notAllowed },
      },
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
    expect(await test.audit.list({ since: 0 })).toMatchObject([
      { actorUserId: root.userId, action: 'admin.workspace_opened', targetId: unknown },
    ]);
    expect(await test.audit.list({ since: 0 })).toMatchObject([
      { outcome: 'refused', detail: { code: ERROR_CODES.notFound } },
    ]);
  });
});
