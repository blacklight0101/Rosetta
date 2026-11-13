import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listLabTargets } from '../../../src/presentation/lab/lab-targets.js';

// RF-1406: the runbook lists every live prompt id with its target state, and the list agrees with
// the prompts folder and with the targets the lab has.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const FOLDERS = ['cards', 'planner', 'reader', 'shared', 'summariser', 'verifier'];

async function sourceText(folder: string): Promise<string> {
  const entries = await readdir(folder, { withFileTypes: true });
  const parts = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sourceText(join(folder, entry.name))
        : entry.name.endsWith('.ts')
          ? readFile(join(folder, entry.name), 'utf8')
          : Promise.resolve(''),
    ),
  );
  return parts.join('\n');
}

/** The newest version file of each family of a prompts folder, by family name. */
async function newestFiles(folder: string): Promise<Map<string, string>> {
  const newest = new Map<string, { version: number; file: string }>();
  for (const file of await readdir(join(root, 'prompts', folder))) {
    const [, stem, version] = /^(.+)\.v(\d+)\.(?:md|yaml)$/u.exec(file) ?? [];
    if (stem !== undefined && Number(version) > (newest.get(stem)?.version ?? 0)) {
      newest.set(stem, { version: Number(version), file });
    }
  }
  return new Map([...newest].map(([stem, { file }]) => [stem, file]));
}

/** A family is live when the run's code names the file of its newest version. */
async function liveFamilies(): Promise<string[]> {
  const code = await sourceText(join(root, 'src'));
  const live: string[] = [];
  for (const folder of FOLDERS) {
    for (const [stem, file] of await newestFiles(folder)) {
      if (code.includes(`${folder}/${file}`)) live.push(`${folder}/${stem}`);
    }
  }
  return live.sort();
}

async function runbookRows(): Promise<Map<string, string>> {
  const text = await readFile(join(root, 'docs', 'runbooks', 'prompt-lab.md'), 'utf8');
  const section = text.slice(text.indexOf('## 7. Every live prompt id'));
  const rows = new Map<string, string>();
  const row = /^\| `([a-z0-9/-]+)`\s*\| (wired|not yet|no call)\s*\|/gmu;
  for (const match of section.matchAll(row)) {
    rows.set(match[1] ?? '', match[2] ?? '');
  }
  return rows;
}

describe('the runbook list of prompt ids', () => {
  it('RF-1406 lists every live prompt family, once', async () => {
    const rows = await runbookRows();

    expect([...rows.keys()].sort()).toEqual(await liveFamilies());
  });

  it('RF-1406 says wired exactly for the prompt ids the lab has a target for', async () => {
    const rows = await runbookRows();
    const targets = (await listLabTargets(join(root, 'prompts'))).map((each) => each.id).sort();

    const wired = [...rows]
      .filter(([, state]) => state === 'wired')
      .map(([id]) => id)
      .sort();

    expect(wired).toEqual(targets);
  });

  it('RF-1406 says in section 1 how many prompt ids are wired, and that secret-risk has no call', async () => {
    const rows = await runbookRows();
    const text = await readFile(join(root, 'docs', 'runbooks', 'prompt-lab.md'), 'utf8');
    const wired = [...rows.values()].filter((state) => state === 'wired').length;

    expect(text).toContain(`(${String(wired)} are wired:`);
    const unwired = [...rows].filter(([, state]) => state === 'no call').map(([id]) => id);
    expect(unwired).toEqual(['shared/secret-risk']);
  });
});
