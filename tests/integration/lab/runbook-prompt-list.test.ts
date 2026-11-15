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

/**
 * DEC-246: the families whose run went back to an older version, with the version the loader wires.
 * Every other family is live only when the run's code names the file of its newest version.
 */
const ROLLED_BACK: Readonly<Record<string, string>> = { 'reader/read-more': 'v2' };

/** The file a family's run must name: its newest, or the rolled-back version (same extension). */
function wiredFile(family: string, stem: string, newest: string): string {
  const back = ROLLED_BACK[family];
  return back === undefined ? newest : `${stem}.${back}${newest.slice(newest.lastIndexOf('.'))}`;
}

/** Whether the code names the file a family's run must use (RF-1406, DEC-246). */
function isLive(code: string, folder: string, stem: string, newest: string): boolean {
  return code.includes(`${folder}/${wiredFile(`${folder}/${stem}`, stem, newest)}`);
}

async function liveFamilies(): Promise<string[]> {
  const code = await sourceText(join(root, 'src'));
  const live: string[] = [];
  for (const folder of FOLDERS) {
    for (const [stem, file] of await newestFiles(folder)) {
      if (isLive(code, folder, stem, file)) live.push(`${folder}/${stem}`);
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

describe('which prompt family is live', () => {
  const loader = 'reader: { readMore: "reader/read-more.v2.md", area: "reader/area.v12.md" }';

  it('RF-1406 counts a family live only when its newest version is wired, not an older one', () => {
    expect(isLive(loader, 'reader', 'area', 'area.v12.md')).toBe(true);
    expect(isLive('/** was reader/area.v2.md */', 'reader', 'area', 'area.v12.md')).toBe(false);
  });

  it('RF-1406 counts a rolled-back family live only when its rolled-back version is wired (DEC-246)', () => {
    expect(isLive(loader, 'reader', 'read-more', 'read-more.v3.md')).toBe(true);
    expect(isLive('reader/read-more.v3.md', 'reader', 'read-more', 'read-more.v3.md')).toBe(false);
  });

  it('RF-1406 names each rolled-back version in the loader, with a newer version in the folder (DEC-246)', async () => {
    const loaderText = await readFile(
      join(root, 'src', 'infrastructure', 'prompts', 'prompt-files.ts'),
      'utf8',
    );
    for (const [family, version] of Object.entries(ROLLED_BACK)) {
      const [folder = '', stem = ''] = family.split('/');
      const newest = (await newestFiles(folder)).get(stem);

      expect(loaderText).toContain(`'${family}.${version}.md'`);
      expect(newest).toBeDefined();
      expect(newest).not.toBe(`${stem}.${version}.md`);
    }
  });
});

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
