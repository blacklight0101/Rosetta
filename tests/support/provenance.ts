import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// RNF-009, DEC-03, P1-49 F-25: every folder of test fixtures and of recordings says where its
// content comes from, in a README.md that cites the licence rule (RNF-009) and states that nothing
// comes from the owner's employer (DEC-03).

const MIN_LENGTH = 200;
const REQUIRED: readonly RegExp[] = [/RNF-009/u, /DEC-03/u];

/** The folders directly under `root` whose README.md is missing, too short or lacks a required citation. */
export async function foldersWithoutProvenance(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const missing: string[] = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const note = await readFile(join(root, entry.name, 'README.md'), 'utf8').catch(() => '');
    const complete = note.length >= MIN_LENGTH && REQUIRED.every((citation) => citation.test(note));
    if (!complete) missing.push(entry.name);
  }
  return missing.sort();
}
