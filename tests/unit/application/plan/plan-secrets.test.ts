import { describe, expect, it } from 'vitest';
import { maskedSecretSites } from '../../../../src/application/plan/plan-secrets.js';
import { MaskedLineFinder } from '../../../../src/infrastructure/guards/masked-line-finder.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  configLine,
  configPath,
  configText,
  fakePassword,
} from '../../../support/masked-secret-fixtures.js';
import { scanOf } from '../../../support/scan-shape-fixtures.js';

// P5-34, RF-141, ADR-013: the files of a scan that hold a masked secret, with their lines, found
// by code in the files the reader of the snapshot allows. Binary and too-large files are not read.

const finder = new MaskedLineFinder(new SecretMasker());

describe('the files that hold a masked secret', () => {
  it('P5-34 lists the path and the line of the password, never the value', async () => {
    const scan = scanOf({ [configPath]: configText, 'School/Program.cs': 'class Program { }' });

    const sites = await maskedSecretSites(scan, finder);

    expect(sites).toEqual([{ path: configPath, lines: [configLine] }]);
    expect(JSON.stringify(sites)).not.toContain(fakePassword);
  });

  it('P5-34 skips a binary file, a file too large to read and a file the reader refuses', async () => {
    const scan = scanOf(
      {
        'a.bin': Uint8Array.from([0, 1, 2, 3]),
        'big.config': { size: 50_000_000 },
        'gone.config': configText,
        'ok.config': configText,
      },
      { unreadable: ['gone.config'] },
    );

    const sites = await maskedSecretSites(scan, finder);

    expect(sites.map((site) => site.path)).toEqual(['ok.config']);
  });

  it('P5-34 reads no file larger than the limit it is given', async () => {
    const scan = scanOf({ 'a.config': configText });

    expect(await maskedSecretSites(scan, finder, { perFile: 10, total: 1000 })).toEqual([]);
  });

  it('P5-34 stops reading when the total limit is spent', async () => {
    const scan = scanOf({ 'a.config': configText, 'b.config': configText });

    const sites = await maskedSecretSites(scan, finder, { perFile: 100_000, total: 1 });

    expect(sites.map((site) => site.path)).toEqual(['a.config']);
  });
});
