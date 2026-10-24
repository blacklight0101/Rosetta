import { createHash } from 'node:crypto';
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { loadCatalogue } from '../../../../src/infrastructure/prompts/catalogue-files.js';
import { failureOf } from '../../../support/failure-of.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-609, RNF-004: the stack technologies and the stack rules are catalogue files: versioned by
// their name, read by the catalogue loader and covered by the catalogue SHA-256 the run manifest
// records.

describe('the stack files of the shipped catalogue', () => {
  it('RF-609 are read with the rules version of the file name', async () => {
    const shipped = await loadCatalogue('prompts');

    expect(shipped.stack.rulesVersion).toBe(1);
    expect(shipped.stack.rules.map((rule) => rule.id)).toEqual([
      'server-rendered-front-end-with-api-back-end',
      'api-back-end-without-contract',
    ]);
    expect(shipped.stack.technologies.length).toBeGreaterThan(10);
  });

  it('RF-609 RNF-004 are part of the hashed catalogue folder', async () => {
    const shipped = await loadCatalogue('prompts');
    const names = (await readdir('prompts/catalogue')).sort();
    expect(names).toContain('stack-rules.v1.yaml');
    expect(names).toContain('stack-technologies.v1.yaml');
    const hash = createHash('sha256');
    for (const name of names) {
      hash.update(`${name}\n`).update(await readFile(join('prompts/catalogue', name)));
    }

    expect(shipped.sha256).toBe(hash.digest('hex'));
  });
});

describe('loadCatalogue and the stack files', () => {
  const temp = useTempRoot('rst-catalogue-stack-');
  const folder = (): string => join(temp.path, 'catalogue');

  async function copyCatalogue(): Promise<void> {
    await cp('prompts/catalogue', folder(), { recursive: true });
  }

  it('RF-609 RNF-004 a changed rule changes the catalogue SHA-256', async () => {
    const before = await loadCatalogue('prompts');
    await copyCatalogue();
    const path = join(folder(), 'stack-rules.v1.yaml');
    await writeFile(path, (await readFile(path, 'utf8')).replace('only serves', 'merely serves'));

    const after = await loadCatalogue(temp.path);

    expect(after.sha256).not.toBe(before.sha256);
  });
});

describe('loadCatalogue refuses broken stack files', () => {
  const temp = useTempRoot('rst-catalogue-stack-bad-');
  const folder = (): string => join(temp.path, 'catalogue');

  async function copyCatalogue(): Promise<void> {
    await cp('prompts/catalogue', folder(), { recursive: true });
  }

  it('RF-609 refuses a catalogue without its rules file', async () => {
    await copyCatalogue();
    await rm(join(folder(), 'stack-rules.v1.yaml'));

    expect(await failureOf(loadCatalogue(temp.path))).toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });
  });

  it('RF-609 refuses a rule whose default does not keep the legacy behaviour', async () => {
    await copyCatalogue();
    const path = join(folder(), 'stack-rules.v1.yaml');
    const text = await readFile(path, 'utf8');
    await writeFile(
      path,
      text.replaceAll('Keep the legacy behaviour exactly', 'Change it exactly'),
    );

    expect(await failureOf(loadCatalogue(temp.path))).toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });
  });

  it('RF-609 refuses a technology of an unknown layer', async () => {
    await copyCatalogue();
    const path = join(folder(), 'stack-technologies.v1.yaml');
    await writeFile(path, (await readFile(path, 'utf8')).replace('layer: hosting', 'layer: cloud'));

    expect(await failureOf(loadCatalogue(temp.path))).toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });
  });
});
