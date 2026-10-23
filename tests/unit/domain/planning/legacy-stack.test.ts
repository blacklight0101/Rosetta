import { describe, expect, it } from 'vitest';
import { legacyStackOf } from '../../../../src/domain/planning/legacy-stack.js';
import { entry } from '../../../support/code-map-builders.js';
import { codeMapOf } from '../../../support/plan-options-fixtures.js';

// RF-609, DEC-78: the legacy stack the options are pre-filled from is what the scan found, not what a
// model remembers: languages by lines, the language packs used, and the files that name a version or
// a technology (manifests, configuration, database scripts).

describe('the legacy stack of the code map', () => {
  it('RF-609 lists the languages by lines, the packs and the marker files', () => {
    const map = codeMapOf(
      [
        entry('Default.aspx.cs', 120, { language: 'csharp' }),
        entry('Models/Item.cs', 80, { language: 'csharp' }),
        entry('Site.master', 30, { language: 'aspx' }),
        entry('Web.config', 20, { language: 'xml', artefactKinds: ['configuration'] }),
        entry('shop.csproj', 10, { language: 'xml', artefactKinds: ['manifest'] }),
        entry('db/schema.sql', 40, { language: 'sql', artefactKinds: ['database-script'] }),
      ],
      ['csharp-webforms'],
    );

    const stack = legacyStackOf(map);

    expect(stack.languages).toEqual([
      { language: 'csharp', files: 2, lines: 200 },
      { language: 'sql', files: 1, lines: 40 },
      { language: 'aspx', files: 1, lines: 30 },
      { language: 'xml', files: 2, lines: 30 },
    ]);
    expect(stack.packs).toEqual(['csharp-webforms']);
    expect(stack.markers).toEqual([
      { path: 'Web.config', kind: 'configuration' },
      { path: 'db/schema.sql', kind: 'database-script' },
      { path: 'shop.csproj', kind: 'manifest' },
    ]);
    expect(stack.areas).toEqual(['(root)']);
  });
});

describe('the legacy stack markers under the cap', () => {
  it('RF-609 keeps the configuration, database and manifest markers when deployment files fill the cap', () => {
    const deployment = Array.from({ length: 45 }, (_, index) =>
      entry(`a/Profile${String(index).padStart(2, '0')}.pubxml`, 5, {
        language: 'xml',
        artefactKinds: ['deployment'],
      }),
    );
    const map = codeMapOf([
      ...deployment,
      entry('z/Web.config', 20, { language: 'xml', artefactKinds: ['configuration'] }),
      entry('z/shop.csproj', 10, { language: 'xml', artefactKinds: ['deployment', 'manifest'] }),
    ]);

    const { markers } = legacyStackOf(map);

    expect(markers).toHaveLength(40);
    expect(markers.slice(0, 2)).toEqual([
      { path: 'z/Web.config', kind: 'configuration' },
      { path: 'z/shop.csproj', kind: 'manifest' },
    ]);
  });

  it('RF-609 leaves out skipped files and files of an unknown language', () => {
    const map = codeMapOf([
      entry('a.cs', 10, { language: 'csharp' }),
      entry('logo.bin', 0, { language: 'unknown', skipped: 'binary', lines: 0 }),
      entry('notes.txt', 5, { language: 'unknown' }),
    ]);

    expect(legacyStackOf(map).languages).toEqual([{ language: 'csharp', files: 1, lines: 10 }]);
  });
});
