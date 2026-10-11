import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  checkWorkspacePath,
  projectPath,
  runPath,
  snapshotCacheRoot,
  workspaceRoot,
} from '../../../../src/infrastructure/files/workspace-paths.js';

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const projectId = '7d9e1f20-3a4b-4c5d-8e9f-0a1b2c3d4e5f';
const dataDir = join('data', 'rosetta');

describe('workspace path helpers', () => {
  it('RF-005 the workspace of a user is <data>/users/<userId>', () => {
    expect(workspaceRoot(dataDir, userId)).toBe(join(dataDir, 'users', userId));
  });

  it('RF-005 the snapshot cache is <data>/sources', () => {
    expect(snapshotCacheRoot(dataDir)).toBe(join(dataDir, 'sources'));
  });

  it('RF-005 project and run folders are built from ids, relative to the workspace', () => {
    expect(projectPath(projectId)).toBe(`projects/${projectId}`);
    expect(runPath(projectId, '20261010-140322-understand')).toBe(
      `projects/${projectId}/runs/20261010-140322-understand`,
    );
    expect(runPath(projectId, '20261010-140322-scan-2')).toBe(
      `projects/${projectId}/runs/20261010-140322-scan-2`,
    );
  });

  it.each(['', '..', '../sources', 'not-a-uuid', `${userId}/x`, userId.toUpperCase()])(
    'RF-005 refuses the user id %j',
    (badId) => {
      expect(() => workspaceRoot(dataDir, badId)).toThrow(
        expect.objectContaining({ code: ERROR_CODES.workspaceIdInvalid }),
      );
    },
  );

  it.each([
    [projectId, '../x'],
    [projectId, '2026-10-10-understand'],
    ['../sources', '20261010-140322-scan'],
  ])('RF-005 refuses the project id %j with the run id %j', (badProject, badRun) => {
    expect(() => runPath(badProject, badRun)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.workspaceIdInvalid }),
    );
  });
});

describe('workspace path check', () => {
  it.each(['manifest.json', `projects/${projectId}/runs/r/cards/BR/BR-001.md`, 'a_b-c.d'])(
    'RF-005 accepts %s',
    (path) => {
      expect(checkWorkspacePath(path)).toEqual({ ok: true, value: path });
    },
  );

  it.each(['../other/x.json', '/etc/x', 'C:/x', 'projects/../../x'])(
    'RF-005 refuses %s as outside the workspace',
    (path) => {
      expect(checkWorkspacePath(path)).toEqual({ ok: false, error: 'outside-workspace' });
    },
  );

  it.each(['', 'NUL', 'a/con.json', 'x.json:stream', '.hidden', 'a b.md', 'caf\u00E9.md', 'x.'])(
    'RF-005 refuses %j as an invalid path',
    (path) => {
      expect(checkWorkspacePath(path)).toEqual({ ok: false, error: 'invalid-path' });
    },
  );

  it('RF-005 a name of up to 100 characters in a path of up to 200 is accepted', () => {
    const name = `${'n'.repeat(95)}.json`;
    const path = `${'d'.repeat(98)}/${name}`;

    expect(checkWorkspacePath(path)).toEqual({ ok: true, value: path });
  });

  it.each([
    ['a name longer than 100 characters', `${'n'.repeat(101)}`],
    ['a path longer than 200 characters', `${'d'.repeat(100)}/${'e'.repeat(100)}`],
  ])('RF-005 refuses %s as an invalid path', (_label, path) => {
    expect(checkWorkspacePath(path)).toEqual({ ok: false, error: 'invalid-path' });
  });
});
