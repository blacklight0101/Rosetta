import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { loadCatalogue } from '../../../../src/infrastructure/prompts/catalogue-files.js';
import { failureOf } from '../../../support/failure-of.js';
import { useTempRoot } from '../../../support/temp-root.js';

// P5-43, RF-602, RNF-004: the pairs of contradicting verbs are a catalogue file, versioned by its
// name, hashed with the folder and refused with RST-1000 when it breaks its shape.

describe('the claim verbs file of the catalogue', () => {
  const temp = useTempRoot('rst-catalogue-verbs-');
  const path = (): string => join(temp.path, 'catalogue', 'claim-verbs.v1.yaml');

  it('RF-602 RNF-004 is read with the version of its file name', async () => {
    const shipped = await loadCatalogue('prompts');

    expect(shipped.claimVerbs.version).toBe(1);
    expect(shipped.claimVerbs.families.map((family) => family.id)).toContain('remove-or-mark');
    expect(await readdir('prompts/catalogue')).toContain('claim-verbs.v1.yaml');
  });

  it('RF-602 RNF-004 a changed verb changes the catalogue SHA-256', async () => {
    const before = await loadCatalogue('prompts');
    await cp('prompts/catalogue', join(temp.path, 'catalogue'), { recursive: true });
    await writeFile(path(), (await readFile(path(), 'utf8')).replace('purg,', 'purge,'));

    expect((await loadCatalogue(temp.path)).sha256).not.toBe(before.sha256);
  });

  it('RF-602 a family with one side is refused with RST-1000', async () => {
    await cp('prompts/catalogue', join(temp.path, 'catalogue'), { recursive: true });
    await writeFile(
      path(),
      [
        'families:',
        '  - id: one',
        '    sides:',
        '      - label: only side',
        '        terms: [delet]',
        'documentation:',
        '  extensions: [md]',
        '  names: [readme]',
        'stopWords: []',
      ].join('\n'),
    );

    expect(await failureOf(loadCatalogue(temp.path))).toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });
  });
});
