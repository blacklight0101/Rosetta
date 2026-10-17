import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readCitedLines,
  defaultEvidenceLimits,
} from '../../../../src/application/verifier/cited-lines.js';
import { loadCalibrationSet } from '../../../../src/infrastructure/eval/calibration-set-file.js';
import {
  openCalibrationSource,
  skipLookupOf,
} from '../../../../src/infrastructure/eval/calibration-source.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { evalFolder, repositoryRoot } from '../../../support/calibration-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-305, RF-005, DEC-57, DEC-03: the committed calibration set is about thirty claims labelled by
// hand over a repository fixture already in the repo; every cited range exists in that fixture; the
// loader reads only files inside `eval/` and the source only inside the repository, read-only.

const temp = useTempRoot('rosetta-calibration-');
const logger = () =>
  new MemoryLogger(new FixedClock('2026-10-17T09:30:00.000Z'), new SecretMasker());

async function committed() {
  const loaded = await loadCalibrationSet(evalFolder, 'calibration/webforms-shop.json');
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.value;
}

describe('the committed calibration set', () => {
  it('RF-305 holds about thirty hand-labelled claims, as many supported as not', async () => {
    const { set, sha256 } = await committed();
    const supported = set.claims.filter((claim) => claim.supported).length;

    expect(set.claims).toHaveLength(30);
    expect(supported).toBe(15);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(new Set(set.claims.map((claim) => claim.id)).size).toBe(30);
  });

  it('RF-305 cites only lines that exist in the fixture it is built from', async () => {
    const { set } = await committed();
    const source = await openCalibrationSource(repositoryRoot, set.source.folder, logger());
    if (!source.ok) throw new Error(source.error);
    const skip = await skipLookupOf(
      source.value,
      set.claims.flatMap((c) => c.citations.map((x) => x.path)),
      1_000_000,
    );

    for (const claim of set.claims) {
      const read = await readCitedLines(source.value, claim.citations, defaultEvidenceLimits, skip);
      expect(read.ok ? '' : `${claim.id}: ${read.error}`).toBe('');
    }
  });

  it('RF-305 builds on a fixture of this repository, never on an outside source', async () => {
    const { set } = await committed();

    expect(set.source.folder.startsWith('tests/fixtures/repos/')).toBe(true);
  });
});

describe('loadCalibrationSet', () => {
  it('RF-305 refuses a reference that leaves eval/', async () => {
    const loaded = await loadCalibrationSet(evalFolder, '../package.json');

    expect(loaded.ok).toBe(false);
  });

  it('RF-305 refuses a set that is not valid and names the problem', async () => {
    await mkdir(join(temp.path, 'calibration'));
    await writeFile(join(temp.path, 'calibration', 'bad.json'), '{"schemaVersion":1}');
    const loaded = await loadCalibrationSet(temp.path, 'calibration/bad.json');

    expect(loaded.ok ? '' : loaded.error).toContain('calibration/bad.json');
  });

  it('RF-305 refuses a file that is not JSON', async () => {
    await writeFile(join(temp.path, 'broken.json'), 'not json');
    const loaded = await loadCalibrationSet(temp.path, 'broken.json');

    expect(loaded.ok ? '' : loaded.error).toContain('broken.json');
  });
});

describe('openCalibrationSource', () => {
  it('RF-005 refuses a folder outside the repository', async () => {
    const source = await openCalibrationSource(repositoryRoot, '../outside', logger());

    expect(source.ok).toBe(false);
  });

  it('RF-005 refuses a folder that does not exist', async () => {
    const source = await openCalibrationSource(
      repositoryRoot,
      'tests/fixtures/repos/none',
      logger(),
    );

    expect(source.ok).toBe(false);
  });

  it('RF-005 refuses a folder that is a link out of the repository', async () => {
    const outside = join(temp.path, 'outside');
    await mkdir(outside);
    await mkdir(join(temp.path, 'repo'));
    await symlink(outside, join(temp.path, 'repo', 'link'), 'junction');
    const source = await openCalibrationSource(join(temp.path, 'repo'), 'link', logger());

    expect(source.ok).toBe(false);
  });

  it('RF-005 opens the fixture folder as a read-only source', async () => {
    const source = await openCalibrationSource(
      repositoryRoot,
      'tests/fixtures/repos/webforms-shop',
      logger(),
    );
    if (!source.ok) throw new Error(source.error);

    expect(await source.value.listFiles()).toContain('Default.aspx.cs');
  });
});
