import { describe, expect, it } from 'vitest';
import { createArea } from '../../../../../src/domain/code-map/area.js';
import { createCodeMap, type CodeMap } from '../../../../../src/domain/code-map/code-map.js';
import { renderScanSummary } from '../../../../../src/infrastructure/scan/codemap/scan-summary.js';
import { entry, unhashed } from '../../../../support/code-map-builders.js';

function sample(): CodeMap {
  const web = [
    entry('Web/Home.aspx', 40, { language: 'aspx', artefactKinds: ['page'], mapLevel: 'symbols' }),
    entry('Web/Home.aspx.cs', 90, { language: 'csharp', artefactKinds: [], mapLevel: 'symbols' }),
    entry('Web/Web.config', 20, { language: 'xml', artefactKinds: ['configuration'] }),
  ];
  const rest = [
    entry('logo.dat', 0, { language: 'unknown', skipped: 'binary' }),
    unhashed('huge.sql', 0, { language: 'sql', skipped: 'too-large' }),
    entry('run.cbl', 30, { language: 'cobol', artefactKinds: ['entry-point'] }),
  ];
  const areas = [
    createArea({ name: 'Web', origin: 'folder', members: web }, 1000),
    createArea({ name: '(root)', origin: 'folder', members: rest }, 1000),
  ].map((made) => {
    if (!made.ok) throw new Error(made.error);
    return made.value;
  });
  const map = createCodeMap({
    source: { owner: 'octo', repo: 'demo', commitSha: 'c'.repeat(40), subpath: '' },
    files: [...web, ...rest],
    areas,
    symbols: [{ path: 'Web/Home.aspx.cs', kind: 'class', name: 'Home', startLine: 1, endLine: 9 }],
    links: [{ from: 'Web/Home.aspx', to: 'Web/Home.aspx.cs', kind: 'code-behind' }],
    sqlStatements: [{ path: 'Web/Home.aspx.cs', line: 3, verb: 'SELECT', text: 'SELECT 1' }],
    entities: [],
    languagePacks: [{ name: 'csharp', version: '1.0.0' }],
  });
  if (!map.ok) throw new Error(map.error);
  return map.value;
}

const expected = `# Scan summary

- Source: octo/demo (whole repository)
- Commit: ${'c'.repeat(40)}
- Scan duration: 1.2 s
- Files: 6 (1 skipped as too large, 1 skipped as binary)
- Estimated tokens: 180
- Symbols: 1, links: 1, SQL statements: 1, candidate entities: 0
- Language packs: csharp 1.0.0

## Languages

| Language | Files | Lines | Estimated tokens |
| --- | ---: | ---: | ---: |
| aspx | 1 | 40 | 40 |
| cobol | 1 | 30 | 30 |
| csharp | 1 | 90 | 90 |
| sql | 1 | 0 | 0 |
| unknown | 1 | 0 | 0 |
| xml | 1 | 20 | 20 |

## Artefacts

| Kind | Files |
| --- | ---: |
| configuration | 1 |
| entry-point | 1 |
| page | 1 |

## Areas

| Area | Files | Estimated tokens | Map level | Origin |
| --- | ---: | ---: | --- | --- |
| (root) | 3 | 30 | coarse | folder |
| Web | 3 | 150 | symbols | folder |
`;

describe('scan-summary.md', () => {
  it('RF-105 lists the source, languages, artefact counts and the areas with files, tokens and map level', () => {
    expect(renderScanSummary({ codeMap: sample(), durationMs: 1234 })).toBe(expected);
  });

  it('RF-112 states the map level of every area, coarse when no pack mapped the area', () => {
    const text = renderScanSummary({ codeMap: sample(), durationMs: 5 });

    expect(text).toContain('| (root) | 3 | 30 | coarse | folder |');
    expect(text).toContain('| Web | 3 | 150 | symbols | folder |');
  });

  it('RNF-007 states the scan duration, in milliseconds when under a second', () => {
    expect(renderScanSummary({ codeMap: sample(), durationMs: 480 })).toContain(
      '- Scan duration: 480 ms\n',
    );
    expect(renderScanSummary({ codeMap: sample(), durationMs: 61_500 })).toContain(
      '- Scan duration: 61.5 s\n',
    );
  });

  it('RF-106 renders the same text twice for the same map and duration', () => {
    const first = renderScanSummary({ codeMap: sample(), durationMs: 10 });

    expect(renderScanSummary({ codeMap: sample(), durationMs: 10 })).toBe(first);
  });
});

describe('scan-summary.md (details)', () => {
  it('RF-105 says so when no language pack mapped anything and when the subpath is set', () => {
    const base = sample();
    const text = renderScanSummary({
      codeMap: {
        ...base,
        languagePacks: [],
        source: { ...base.source, subpath: 'src/Web' },
      },
      durationMs: 10,
    });

    expect(text).toContain('- Source: octo/demo (src/Web)\n');
    expect(text).toContain('- Language packs: none\n');
  });

  it('RF-105 escapes a table separator in a name so a path cannot break the table', () => {
    const base = sample();
    const text = renderScanSummary({
      codeMap: {
        ...base,
        areas: base.areas.map((area) => (area.name === 'Web' ? { ...area, name: 'We|b' } : area)),
      },
      durationMs: 10,
    });

    expect(text).toContain('| We\\|b | 3 | 150 |');
  });

  it('RF-110 counts the files past the parse budget on the files line, like skipped files', () => {
    const text = renderScanSummary({ codeMap: sample(), durationMs: 10, overParseBudget: 2 });

    expect(text).toContain(
      '- Files: 6 (1 skipped as too large, 1 skipped as binary, 2 not analysed: parse budget reached)\n',
    );
  });

  it('RF-110 leaves the files line unchanged when no file was past the parse budget', () => {
    const text = renderScanSummary({ codeMap: sample(), durationMs: 10, overParseBudget: 0 });

    expect(text).toContain('- Files: 6 (1 skipped as too large, 1 skipped as binary)\n');
  });
});
