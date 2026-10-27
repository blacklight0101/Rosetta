import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  loadEvaluationConfig,
  loadGoldenSet,
} from '../../../../src/infrastructure/eval/golden-set-file.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RNF-006, RNF-015, DEC-57: the golden set and the evaluation settings are files under `eval/`. The
// loader reads only files inside that folder, refuses a file that is too large or not JSON, and
// hands the data to the schema; the shipped set and settings must pass it.

const evalFolder = fileURLToPath(new URL('../../../../eval/', import.meta.url));
const temp = useTempRoot('rosetta-golden-');

describe('the shipped golden set', () => {
  it('RNF-006 DEC-57 reads, with features, rules, entities and "not in the code" cases', async () => {
    const loaded = await loadGoldenSet(evalFolder, 'golden/eshop-webforms.json');

    expect(loaded.ok ? '' : loaded.error).toBe('');
    if (!loaded.ok) return;
    const { set, sha256 } = loaded.value;
    expect(sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(set.source).toMatchObject({
      owner: 'dotnet-architecture',
      repo: 'eShopModernizing',
      commit: '63bc9ec4414d7e281dc9f9d7bdcf70030950457d',
    });
    const findings = set.cases.flatMap((entry) => entry.findings);
    const kinds = new Set(findings.map((finding) => finding.kind));
    expect([...kinds].sort()).toEqual(['entity', 'feature', 'relation', 'rule']);
    expect(findings.filter((finding) => finding.kind === 'rule').length).toBeGreaterThanOrEqual(10);
    expect(set.cases.flatMap((entry) => entry.absences).length).toBeGreaterThanOrEqual(5);
  });

  it('RNF-015 reads the shipped settings: at least three repetitions and a cap on the total', async () => {
    const config = await loadEvaluationConfig(evalFolder, 'config.json');

    expect(config.ok ? '' : config.error).toBe('');
    if (!config.ok) return;
    expect(config.value.repetitions).toBeGreaterThanOrEqual(3);
    expect(config.value.totalCapMicros).toBeGreaterThan(0);
    expect(config.value.goldenSet).toBe('golden/eshop-webforms.json');
  });
});

describe('reading golden set files', () => {
  it.each([
    ['a parent folder', '../package.json'],
    ['an absolute path', '/etc/passwd'],
    ['a backslash', 'golden\\eshop-webforms.json'],
    ['a file that is not JSON by name', 'golden/notes.txt'],
  ])('RNF-006 refuses a reference with %s', async (_name, reference) => {
    const loaded = await loadGoldenSet(evalFolder, reference);

    expect(loaded).toMatchObject({ ok: false });
  });

  it('RNF-006 refuses a file over the size limit without parsing it', async () => {
    await mkdir(join(temp.path, 'golden'));
    await writeFile(join(temp.path, 'golden', 'huge.json'), `"${'x'.repeat(2 * 1024 * 1024)}"`);

    const loaded = await loadGoldenSet(temp.path, 'golden/huge.json');

    expect(loaded.ok ? '' : loaded.error).toContain('larger');
  });
});

describe('reading evaluation files: content', () => {
  it('RNF-006 refuses a file that is not JSON, and a missing file, with a message', async () => {
    await writeFile(join(temp.path, 'broken.json'), '{ "schemaVersion": ');

    const broken = await loadGoldenSet(temp.path, 'broken.json');
    const missing = await loadGoldenSet(temp.path, 'missing.json');

    expect(broken.ok ? '' : broken.error).toContain('JSON');
    expect(missing.ok ? '' : missing.error).toContain('missing.json');
  });

  it('RNF-006 names every problem of a set the schema refuses', async () => {
    await writeFile(join(temp.path, 'bad.json'), JSON.stringify({ schemaVersion: 1 }));

    const loaded = await loadGoldenSet(temp.path, 'bad.json');

    expect(loaded.ok ? '' : loaded.error).toContain('version');
  });

  it('RNF-015 refuses settings with fewer than three repetitions', async () => {
    const settings = {
      schemaVersion: 1,
      goldenSet: 'golden/eshop-webforms.json',
      repetitions: 2,
      roles: { reader: { provider: 'openai', model: 'gpt-5-nano' } },
      runCapMicros: 1_000_000,
      totalCapMicros: 3_000_000,
    };
    await writeFile(join(temp.path, 'config.json'), JSON.stringify(settings));

    const loaded = await loadEvaluationConfig(temp.path, 'config.json');

    expect(loaded.ok ? '' : loaded.error).toContain('repetitions');
  });
});
