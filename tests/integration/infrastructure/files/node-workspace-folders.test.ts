import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FolderTarget } from '../../../../src/application/ports/workspace-folders.js';
import { NodeWorkspaceFolders } from '../../../../src/infrastructure/files/node-workspace-folders.js';
import {
  folderProject,
  folderUser,
  workspaceFoldersContract,
  type FoldersUnderTest,
} from '../../../contracts/workspace-folders.contract.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1012, RF-005, RF-1105: NodeWorkspaceFolders measures and removes folders of the data folder,
// built from ids, and never follows a link out of the user's workspace.

const data = useTempRoot('rosetta-folders-');

function pathOf(target: FolderTarget): string {
  const project = join(data.path, 'users', target.userId, 'projects', target.projectId);
  return target.runKey === undefined ? project : join(project, 'runs', target.runKey);
}

async function write(folder: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), content);
  }
}

function fresh(): Promise<FoldersUnderTest> {
  return Promise.resolve({
    folders: new NodeWorkspaceFolders(data.path),
    seed: (target, files) => write(pathOf(target), files),
  });
}

describe('NodeWorkspaceFolders', () => {
  workspaceFoldersContract('NodeWorkspaceFolders', fresh);

  const run = { userId: folderUser, projectId: folderProject, runKey: '20261012-100000-scan' };

  it('RF-005 does not follow a link inside a run folder when it sizes or removes it', async () => {
    const outside = join(data.path, 'outside');
    await write(outside, { 'secret.txt': 'x'.repeat(1000) });
    await write(pathOf(run), { 'manifest.json': '12345' });
    await symlink(outside, join(pathOf(run), 'linked'), 'junction');
    const { folders } = await fresh();

    expect(await folders.size(run)).toBe(5);
    await folders.remove(run);

    expect(await folders.size(run)).toBe(0);
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toHaveLength(1000);
  });

  it('RF-005 refuses to touch a run folder reached through a link in the workspace', async () => {
    const outside = join(data.path, 'outside', 'runs', run.runKey);
    await write(outside, { 'manifest.json': '12345' });
    const project = pathOf({ userId: run.userId, projectId: run.projectId });
    await mkdir(project, { recursive: true });
    await symlink(join(data.path, 'outside', 'runs'), join(project, 'runs'), 'junction');
    const { folders } = await fresh();

    expect(await folders.size(run)).toBe(0);
    await folders.remove(run);

    expect(await readFile(join(outside, 'manifest.json'), 'utf8')).toBe('12345');
  });

  it('RF-005 treats an id that is not an id as a folder that does not exist', async () => {
    const { folders } = await fresh();
    const hostile = { userId: '../..', projectId: folderProject };

    expect(await folders.size(hostile)).toBe(0);
    await expect(folders.remove(hostile)).resolves.toBeUndefined();
    expect(await folders.size({ ...run, runKey: '../../escape' })).toBe(0);
  });

  it('RF-1012 sizes and removes when the data folder itself does not exist yet', async () => {
    const folders = new NodeWorkspaceFolders(join(data.path, 'not-created'));

    expect(await folders.size(run)).toBe(0);
    await expect(folders.remove(run)).resolves.toBeUndefined();
  });
});
