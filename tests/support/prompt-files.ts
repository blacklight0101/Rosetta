import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

// RF-145, RNF-004: the prompt files the prompt tests check, as `<folder>/<name>` paths under a
// prompts root.

/** The folders of the agent roles (RF-405); `cards/` and `shared/` hold fragments added to them. */
const roleFolders = ['reader', 'verifier', 'planner', 'summariser'];
/** Folders whose files are fragments added to a role prompt; they need not state the rule. */
const fragmentFolders = new Set(['cards', 'shared']);

async function filesOf(root: string, folder: string): Promise<string[]> {
  const entries = await readdir(join(root, folder), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${folder}/${entry.name}`);
}

/** Every prompt file under `root`, sorted. */
export async function listPromptFiles(root: string): Promise<string[]> {
  const folders = [...roleFolders, ...fragmentFolders];
  return (await Promise.all(folders.map((folder) => filesOf(root, folder)))).flat().sort();
}

/** Whether a prompt file is an agent prompt, which must state the data-block rule (RF-145). */
export function isAgentPrompt(path: string): boolean {
  return !fragmentFolders.has(path.split('/')[0] ?? '');
}
