import { describe, expect, it } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { LanguagePackRegistry } from '../../../../../src/infrastructure/scan/packs/pack-registry.js';
import { TestLanguagePack } from '../../../../support/test-language-pack.js';

describe('language pack registry', () => {
  it('RF-110 finds the pack that claims the extension of a path, ignoring case', () => {
    const pack = new TestLanguagePack({ extensions: ['.tst', '.tsx2'] });
    const registry = new LanguagePackRegistry([pack]);

    expect(registry.packFor('src/a.tst')).toBe(pack);
    expect(registry.packFor('src/Deep/B.TSX2')).toBe(pack);
    expect(registry.packFor('Default.aspx.tst')).toBe(pack);
  });

  it('RF-112 answers undefined for a language with no pack and for names without an extension', () => {
    const registry = new LanguagePackRegistry([new TestLanguagePack()]);

    expect(registry.packFor('main.cbl')).toBeUndefined();
    expect(registry.packFor('Makefile')).toBeUndefined();
    expect(registry.packFor('.tst')).toBeUndefined();
    expect(registry.packFor('dir.tst/readme')).toBeUndefined();
  });

  it('RF-110 refuses two packs that claim the same extension with RST-1201', () => {
    const build = (): LanguagePackRegistry =>
      new LanguagePackRegistry([
        new TestLanguagePack({ name: 'one' }),
        new TestLanguagePack({ name: 'two' }),
      ]);

    expect(build).toThrow(RosettaError);
    expect(build).toThrow(expect.objectContaining({ code: 'RST-1201' }));
  });

  it('RF-110 refuses an extension that is not lower case with a dot', () => {
    const build = (): LanguagePackRegistry =>
      new LanguagePackRegistry([new TestLanguagePack({ extensions: ['TST'] })]);

    expect(build).toThrow(expect.objectContaining({ code: 'RST-1201' }));
  });

  it('RF-110 lists the packs sorted by name', () => {
    const registry = new LanguagePackRegistry([
      new TestLanguagePack({ name: 'zeta', extensions: ['.z'] }),
      new TestLanguagePack({ name: 'alpha', extensions: ['.a'] }),
    ]);

    expect(registry.packs.map((pack) => pack.name)).toEqual(['alpha', 'zeta']);
  });
});
