import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  hasIdRange,
  isPermittedLink,
  linksIn,
  matrixRows,
  normalize,
  requirementIds,
  section,
} from '../../support/release-docs.js';

// DEC-29, RF-801, P1-52: the v0.1.0 release notes, honest against the milestone matrix, and the version
// bump. A missing file reads as empty so the checks fail on their assertions.
const read = (name: string): Promise<string> =>
  readFile(new URL(`../../../${name}`, import.meta.url), 'utf8').catch(() => '');

const releases = normalize(await read('docs/releases.md'));
const matrix = await read('docs/verification/m1-matrix.md');
const rows = matrixRows(matrix);
const isGap = (state: string): boolean => /\bGap\b/u.test(state);
const gapIds = rows.filter((row) => isGap(row.state)).map((row) => row.id);
const pendingIds = rows
  .filter((row) => row.state.includes('manual check pending'))
  .map((r) => r.id);
const deliveredIds = rows.filter((row) => !isGap(row.state)).map((row) => row.id);
const majorIds = [...matrix.matchAll(/^\| (F-\d+) \| MAJOR \|/gmu)].map((match) => match[1] ?? '');

const delivered = section(releases, '### What v0.1.0 delivers');
const gaps = section(releases, '### Known gaps');
const pending = section(releases, '### Pending owner checks');
const links = section(releases, '### Links');

const manifest = z.object({ version: z.string() });
const lockfile = z.object({
  version: z.string(),
  packages: z.object({ '': z.object({ version: z.string() }) }),
});

type Area = readonly [name: string, pattern: RegExp];
const AREAS: readonly Area[] = [
  ['Projects, configuration and runs', /^RF-0\d\d$/u],
  ['Scan and file access', /^RF-1\d\d$/u],
  ['Understand', /^RF-2\d\d$/u],
  ['Verifier', /^RF-3\d\d$/u],
  ['Providers and cost control', /^RF-4\d\d$/u],
  ['Report', /^RF-5\d\d$/u],
  ['Hand-in artefacts', /^RF-8\d\d$/u],
  ['Web UI', /^RF-10\d\d$/u],
  ['Accounts, sessions and keys', /^RF-11\d\d$/u],
  ['Landing page', /^RF-12\d\d$/u],
  ['Container and deployment', /^RF-13\d\d$/u],
  ['Non-functional', /^RNF-\d+$/u],
];

// Prettier pads table cells to the column width; collapse the padding so a row is matched by its cell text.
const rowFor = (name: string): string =>
  delivered
    .split('\n')
    .map((line) => line.replace(/ {2,}/gu, ' '))
    .find((line) => line.startsWith(`| ${name} |`)) ?? '';

describe('version bump', () => {
  it('DEC-29 package.json, both package-lock.json root entries and the newest release agree', async () => {
    const pkg = manifest.parse(JSON.parse(await read('package.json')));
    const lock = lockfile.parse(JSON.parse(await read('package-lock.json')));
    const newest = /^## v(\d+\.\d+\.\d+)\b/mu.exec(releases)?.[1];

    expect(newest).toBeDefined();
    expect(pkg.version).toBe(newest);
    expect(lock.version).toBe(newest);
    expect(lock.packages[''].version).toBe(newest);
  });

  it('DEC-29 the notes have a section for the milestone release v0.1.0', () => {
    expect(releases).toMatch(/^## v0\.1\.0\b/mu);
  });

  it('DEC-29 the notes say the tag is not created yet and that the owner creates it', () => {
    const head = releases.slice(releases.indexOf('## v0.1.0'));

    expect(head).toMatch(/not tagged/iu);
    expect(head).toMatch(/owner creates the tag/iu);
  });
});

describe('what v0.1.0 delivers', () => {
  it.each(AREAS)('RF-801 has a row for the area %s', (name) => {
    expect(rowFor(name)).not.toBe('');
  });

  it.each(AREAS)('RF-801 the row %s lists only ids of its own area', (name, pattern) => {
    const ids = requirementIds(rowFor(name));

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !pattern.test(id))).toEqual([]);
  });

  it('RF-801 names ids one by one, never as a range that hides the ones between', () => {
    expect(hasIdRange(delivered)).toBe(false);
  });

  it('RF-801 lists every requirement the matrix does not mark as a gap, and no other', () => {
    expect([...requirementIds(delivered)].sort()).toEqual([...deliveredIds].sort());
  });

  it('RF-801 reads the matrix (guards the test itself)', () => {
    expect(rows.length).toBeGreaterThan(100);
    expect(gapIds).toContain('RF-801');
    expect(pendingIds).toContain('RF-402');
    expect(majorIds).toContain('F-01');
  });
});

describe('known gaps and pending owner checks', () => {
  it('RF-801 names every requirement the matrix marks as a gap', () => {
    const named = requirementIds(gaps);

    expect(gapIds.filter((id) => !named.includes(id))).toEqual([]);
  });

  it('RF-801 names every requirement whose manual check is pending, and no other', () => {
    expect([...requirementIds(pending)].sort()).toEqual([...pendingIds].sort());
  });

  it('RF-801 names each finding the matrix ranks MAJOR and the cards that close the open ones', () => {
    expect(majorIds.filter((id) => !gaps.includes(id))).toEqual([]);
    expect(gaps).toContain('P1-157');
    expect(gaps).toContain('P1-158');
  });

  it('RF-801 says the quick start walk-through is recorded in the pull request, not yet in the matrix', () => {
    expect(gaps).toMatch(/walk-through[^.]*pull request/iu);
  });
});

describe('links', () => {
  const allowed = {
    hosts: ['github.com', 'blacklight0101.github.io'],
    prefixes: [
      'https://github.com/blacklight0101/rosetta',
      'https://blacklight0101.github.io/rosetta',
      'http://127.0.0.1:8080',
    ],
  };

  it('RF-801 carries no link except the repository, the sample report and the local address', () => {
    expect(linksIn(releases).filter((link) => !isPermittedLink(link, allowed))).toEqual([]);
  });

  it.each(['Hosted application', 'Slides', 'Video'])(
    'RF-801 marks the %s URL as pending, with no address',
    (label) => {
      const line = links.split('\n').find((text) => text.includes(label)) ?? '';

      expect(line).toContain('[PENDIENTE');
      expect(linksIn(line)).toEqual([]);
    },
  );
});

describe('README status and links', () => {
  it('RF-801 the status names v0.1.0 and links the notes', async () => {
    const readme = await read('README.md');
    const status = readme.slice(readme.indexOf('**Status:'), readme.indexOf('## Quick start'));

    expect(status).toContain('v0.1.0');
    expect(status).toContain('docs/releases.md');
    expect(status).not.toMatch(/in progress/iu);
  });

  it('RF-801 the milestone hand-in list links the release notes and says who creates the tag', async () => {
    const readme = await read('README.md');
    const line = readme.split('\n').find((text) => text.startsWith('- Release notes:'));

    expect(line).toContain('(docs/releases.md)');
    expect(line).toMatch(/owner creates the tag/u);
  });

  it('RF-801 the README holds the hosted URL placeholder without an address', async () => {
    const readme = await read('README.md');
    const line = readme.split('\n').find((text) => text.startsWith('- Hosted application URL:'));

    expect(line).toContain('[PENDIENTE');
    expect(linksIn(line ?? '')).toEqual([]);
  });

  it('RF-801 the docs index lists docs/releases.md and no longer plans it', async () => {
    const index = await read('docs/README.md');
    const planned = section(index, '## Planned documents (not written yet)');

    expect(index).toMatch(/^\| \[releases\.md\]\(releases\.md\) +\|/mu);
    expect(planned).not.toContain('docs/releases.md');
  });
});
