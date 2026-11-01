import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { loadCatalogue } from '../../../../src/infrastructure/prompts/catalogue-files.js';
import { failureOf } from '../../../support/failure-of.js';
import { useTempRoot } from '../../../support/temp-root.js';

// P6-28, RF-640, RNF-004, DEC-190: the per-language grep patterns and the aliases that map a stack
// answer to a language are a catalogue file, versioned by its name, hashed with the folder and
// refused with RST-1000 when it breaks its shape.

const file = 'grep-rules.v1.yaml';

describe('the grep rules file of the catalogue', () => {
  it('RF-640 RNF-004 is read with the version of its file name', async () => {
    const shipped = await loadCatalogue('prompts');
    const ids = shipped.grepRules.languages.map((each) => each.id);

    expect(shipped.grepRules.version).toBe(1);
    expect(ids).toEqual(['javascript', 'dotnet', 'java', 'python', 'php']);
    expect(shipped.grepRules.rules.length).toBeGreaterThan(5);
    expect(await readdir('prompts/catalogue')).toContain(file);
  });

  it('DEC-190 the aliases include dotnet and jvm', async () => {
    const { languages } = (await loadCatalogue('prompts')).grepRules;
    const aliasesOf = (id: string): readonly string[] =>
      languages.find((each) => each.id === id)?.aliases ?? [];

    expect(aliasesOf('dotnet')).toContain('dotnet');
    expect(aliasesOf('java')).toContain('jvm');
  });

  it('RF-640 every language-runtime alias of the stack technologies names a language', async () => {
    const shipped = await loadCatalogue('prompts');
    const named = shipped.grepRules.languages.flatMap((each) => each.aliases);
    const aliases = shipped.stack.technologies
      .filter((each) => each.layer === 'language-runtime')
      .flatMap((each) => each.aliases);

    expect(aliases.length).toBeGreaterThan(5);
    expect(aliases.filter((alias) => !named.includes(alias))).toEqual([]);
  });
});

describe('a changed grep rules file', () => {
  const temp = useTempRoot('rst-catalogue-greps-');
  const path = (): string => join(temp.path, 'catalogue', file);

  it('RNF-004 a changed pattern changes the catalogue SHA-256', async () => {
    const before = await loadCatalogue('prompts');
    await cp('prompts/catalogue', join(temp.path, 'catalogue'), { recursive: true });
    await writeFile(path(), (await readFile(path(), 'utf8')).replace('innerHTML', 'innerHtml'));

    expect((await loadCatalogue(temp.path)).sha256).not.toBe(before.sha256);
  });

  it('RF-640 a missing grep rules file is refused with RST-1000', async () => {
    await cp('prompts/catalogue', join(temp.path, 'catalogue'), { recursive: true });
    await rm(path());

    expect(await failureOf(loadCatalogue(temp.path))).toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });
  });
});

describe('a broken grep rules file', () => {
  const temp = useTempRoot('rst-catalogue-greps-');

  it.each([
    ['a principle that is not in the catalogue', 'owasp-top-10', 'no-such-principle'],
    ['a pattern with a backtick', 'innerHTML', 'inner`HTML'],
    ['a pattern with a pipe', 'innerHTML', 'inner|HTML'],
    ['a pattern with a format character', 'innerHTML', 'inner​HTML'],
    ['a pattern for a language that is not declared', 'dotnet:', 'cobol:'],
    ['a repeated language', 'id: python', 'id: php'],
    ['a risk class that does not exist', 'security boundary', 'war'],
  ])('RF-640 %s is refused with RST-1000', async (_name, from, to) => {
    await cp('prompts/catalogue', join(temp.path, 'catalogue'), { recursive: true });
    const path = join(temp.path, 'catalogue', file);
    const text = await readFile(path, 'utf8');
    expect(text).toContain(from);
    await writeFile(path, text.replace(from, to));

    expect(await failureOf(loadCatalogue(temp.path))).toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });
  });
});
