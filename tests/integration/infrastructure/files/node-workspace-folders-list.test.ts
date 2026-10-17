import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeWorkspaceFolders } from '../../../../src/infrastructure/files/node-workspace-folders.js';
import { useTempRoot } from '../../../support/temp-root.js';

// P1-152, RF-005: NodeWorkspaceFolders.list names the project and run folders of the data folder
// whose names are ids and lists no link, no file and no other name.

const data = useTempRoot('rosetta-folders-list-');
const userId = '00000000-0000-4000-9000-0000000000a1';
const otherUser = '00000000-0000-4000-9000-0000000000b2';
const projectId = '00000000-0000-4000-a000-0000000000a1';
const runKey = '20261012-100000-scan';
const project = { userId, projectId };
const run = { ...project, runKey };

const projectDir = (): string => join(data.path, 'users', userId, 'projects', projectId);

async function write(folder: string): Promise<void> {
  await mkdir(dirname(join(folder, 'file.txt')), { recursive: true });
  await writeFile(join(folder, 'file.txt'), '1');
}

async function targets(): Promise<unknown[]> {
  const listed = await new NodeWorkspaceFolders(data.path).list();
  return listed.map((entry) => entry.target);
}

describe('NodeWorkspaceFolders.list', () => {
  it('P1-152 lists only folders named by ids and no file or other name', async () => {
    await write(join(projectDir(), 'runs', runKey));
    await write(join(projectDir(), 'not-an-id'));
    await write(join(projectDir(), 'runs', 'notes'));
    await write(join(data.path, 'users', 'someone', 'projects', projectId));
    await write(join(data.path, 'sources', projectId));
    await writeFile(join(data.path, 'users', userId, 'projects', 'stray.txt'), '1');

    expect(await targets()).toEqual([project, run]);
  });

  it('P1-152 reports the change instant of the folder from the file system', async () => {
    await write(projectDir());
    const before = Date.now();

    const listed = await new NodeWorkspaceFolders(data.path).list();

    expect(listed.map((entry) => Math.abs(entry.modifiedAt - before) < 60_000)).toEqual([true]);
  });

  it('RF-005 does not list a project link, nor a user link, nor follow them out of the data folder', async () => {
    const outside = join(data.path, 'outside');
    await write(join(outside, 'projects', projectId, 'runs', runKey));
    await mkdir(join(data.path, 'users', userId, 'projects'), { recursive: true });
    await symlink(join(outside, 'projects', projectId), projectDir(), 'junction');
    await symlink(outside, join(data.path, 'users', otherUser), 'junction');

    expect(await targets()).toEqual([]);
  });

  it('RF-005 lists nothing behind a runs link or a projects link', async () => {
    const outside = join(data.path, 'outside');
    await write(join(outside, runKey));
    await mkdir(projectDir(), { recursive: true });
    await symlink(outside, join(projectDir(), 'runs'), 'junction');
    await mkdir(join(data.path, 'users', otherUser), { recursive: true });
    await symlink(outside, join(data.path, 'users', otherUser, 'projects'), 'junction');

    expect(await targets()).toEqual([project]);
  });

  it('P1-152 lists nothing when the data folder does not exist yet', async () => {
    const folders = new NodeWorkspaceFolders(join(data.path, 'not-created'));

    expect(await folders.list()).toEqual([]);
  });
});
