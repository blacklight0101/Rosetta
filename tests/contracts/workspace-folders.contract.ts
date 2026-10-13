import { expect, it } from 'vitest';
import type {
  FolderTarget,
  WorkspaceFolders,
} from '../../src/application/ports/workspace-folders.js';

// Architecture section 7: every WorkspaceFolders adapter (NodeWorkspaceFolders, the memory fake of
// tests/support) passes this suite. RF-1012: the size is what the folder holds, a removal takes the
// folder and what is inside it, and a folder that is not there has size 0 and removes without error.

export const folderUser = '00000000-0000-4000-9000-0000000000a1';
export const folderProject = '00000000-0000-4000-a000-0000000000a1';
const otherProject = '00000000-0000-4000-a000-0000000000a2';
const firstRun = '20261012-100000-scan';
const secondRun = '20261012-100100-understand';

const projectTarget: FolderTarget = { userId: folderUser, projectId: folderProject };
const runTarget = (runKey: string): FolderTarget => ({ ...projectTarget, runKey });

/** An adapter with a way to put files into one of its folders (a test cannot use the port to write). */
export interface FoldersUnderTest {
  readonly folders: WorkspaceFolders;
  readonly seed: (target: FolderTarget, files: Readonly<Record<string, string>>) => Promise<void>;
}

export type FreshFolders = () => Promise<FoldersUnderTest>;

function sizingTests(name: string, fresh: FreshFolders): void {
  it(`RF-1012 ${name} sizes a run folder by its files, nested ones included`, async () => {
    const { folders, seed } = await fresh();
    await seed(runTarget(firstRun), { 'manifest.json': '12345', 'cards/FEAT/FEAT-001.md': '123' });

    expect(await folders.size(runTarget(firstRun))).toBe(8);
  });

  it(`RF-1012 ${name} sizes a project folder with the run folders inside it`, async () => {
    const { folders, seed } = await fresh();
    await seed(projectTarget, { 'codemap.json': '12' });
    await seed(runTarget(firstRun), { 'manifest.json': '12345' });
    await seed(runTarget(secondRun), { 'events.jsonl': '1234567' });

    expect(await folders.size(projectTarget)).toBe(14);
    expect(await folders.size(runTarget(secondRun))).toBe(7);
  });
}

function removalTests(name: string, fresh: FreshFolders): void {
  it(`RF-1012 ${name} removes a run folder and leaves its siblings and its project`, async () => {
    const { folders, seed } = await fresh();
    await seed(projectTarget, { 'codemap.json': '12' });
    await seed(runTarget(firstRun), { 'manifest.json': '12345' });
    await seed(runTarget(secondRun), { 'events.jsonl': '1234567' });

    await folders.remove(runTarget(firstRun));

    expect(await folders.size(runTarget(firstRun))).toBe(0);
    expect(await folders.size(runTarget(secondRun))).toBe(7);
    expect(await folders.size(projectTarget)).toBe(9);
  });

  it(`RF-1012 ${name} removes a project folder with its runs and leaves another project`, async () => {
    const { folders, seed } = await fresh();
    await seed(runTarget(firstRun), { 'manifest.json': '12345' });
    const other = { ...projectTarget, projectId: otherProject };
    await seed(other, { 'codemap.json': '123' });

    await folders.remove(projectTarget);

    expect(await folders.size(projectTarget)).toBe(0);
    expect(await folders.size(runTarget(firstRun))).toBe(0);
    expect(await folders.size(other)).toBe(3);
  });

  it(`RF-1012 ${name} sizes a missing folder as 0 and removes it without an error`, async () => {
    const { folders } = await fresh();

    expect(await folders.size(runTarget(firstRun))).toBe(0);
    await expect(folders.remove(runTarget(firstRun))).resolves.toBeUndefined();
    await expect(folders.remove(projectTarget)).resolves.toBeUndefined();
  });
}

export function workspaceFoldersContract(name: string, fresh: FreshFolders): void {
  sizingTests(name, fresh);
  removalTests(name, fresh);
}
