import { readdir } from 'node:fs/promises';
import { relative, sep } from 'node:path';

// RF-145, RNF-004: the prompt files the prompt tests check, as forward-slash paths relative to a
// prompts root. Every file in every folder counts, so a new folder cannot escape the checks.

/** Folders whose files are fragments added to a role prompt; they need not state the rule. */
const fragmentFolders = new Set(['cards', 'shared']);

/** Every file under `root`, at any depth, sorted; dot files such as `.gitkeep` are not prompts. */
export async function listPromptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => relative(root, `${entry.parentPath}${sep}${entry.name}`).split(sep).join('/'))
    .sort();
}

/** Whether a prompt file is an agent prompt, which must state the data-block rule (RF-145). */
export function isAgentPrompt(path: string): boolean {
  return !fragmentFolders.has(path.split('/')[0] ?? '');
}
