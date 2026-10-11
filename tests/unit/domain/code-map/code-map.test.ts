import { describe, expect, it } from 'vitest';
import { createArea, type Area } from '../../../../src/domain/code-map/area.js';
import { createCodeMap, type CodeMapInput } from '../../../../src/domain/code-map/code-map.js';
import type { FileEntry } from '../../../../src/domain/code-map/file-entry.js';
import { entry } from '../../../support/code-map-builders.js';

const source = { owner: 'octo', repo: 'demo', commitSha: 'c'.repeat(40), subpath: '' };

function area(name: string, members: readonly FileEntry[]): Area {
  const made = createArea({ name, origin: 'folder', members }, 1000);
  if (!made.ok) throw new Error(made.error);
  return made.value;
}

function input(files: readonly FileEntry[], areas: readonly Area[]): CodeMapInput {
  return {
    source,
    files,
    areas,
    symbols: [],
    links: [],
    sqlStatements: [],
    entities: [],
    languagePacks: [],
  };
}

const a = entry('a.cs');
const b = entry('b.cs');

describe('CodeMap', () => {
  it('RF-105 sorts every list in a fixed order so the same input gives the same map', () => {
    const files = [b, a];
    const areas = [area('Z', [b]), area('A', [a])];
    const map = createCodeMap({
      ...input(files, areas),
      symbols: [
        { path: 'b.cs', kind: 'class', name: 'B', startLine: 1, endLine: 2 },
        { path: 'a.cs', kind: 'method', name: 'M', startLine: 9, endLine: 9 },
        { path: 'a.cs', kind: 'class', name: 'A', startLine: 1, endLine: 20 },
      ],
      links: [
        { from: 'b.cs', to: 'a.cs', kind: 'import' },
        { from: 'a.cs', to: 'b.cs', kind: 'import' },
      ],
      sqlStatements: [
        { path: 'b.cs', line: 1, verb: 'SELECT', text: 'SELECT 1' },
        { path: 'a.cs', line: 5, verb: 'SELECT', text: 'SELECT 2' },
      ],
      entities: [
        { name: 'Z', path: 'b.cs', startLine: 1, source: 'x' },
        { name: 'Y', path: 'a.cs', startLine: 1, source: 'x' },
      ],
      languagePacks: [
        { name: 'zed', version: '1' },
        { name: 'alpha', version: '1' },
      ],
    });

    expect(map.ok).toBe(true);
    if (!map.ok) return;
    expect(map.value.schemaVersion).toBe(1);
    expect(map.value.files.map((f) => f.path)).toEqual(['a.cs', 'b.cs']);
    expect(map.value.areas.map((x) => x.name)).toEqual(['A', 'Z']);
    expect(map.value.symbols.map((s) => s.name)).toEqual(['A', 'M', 'B']);
    expect(map.value.links.map((l) => l.from)).toEqual(['a.cs', 'b.cs']);
    expect(map.value.sqlStatements.map((s) => s.path)).toEqual(['a.cs', 'b.cs']);
    expect(map.value.entities.map((e) => e.name)).toEqual(['Y', 'Z']);
    expect(map.value.languagePacks.map((p) => p.name)).toEqual(['alpha', 'zed']);
  });

  it('RF-106 the order of the input never changes the map', () => {
    const forward = createCodeMap(input([a, b], [area('A', [a]), area('B', [b])]));
    const backward = createCodeMap(input([b, a], [area('B', [b]), area('A', [a])]));

    expect(backward).toEqual(forward);
  });
});

describe('CodeMap (area rules)', () => {
  it('RF-105 refuses a path that is listed twice', () => {
    expect(createCodeMap(input([a, a], [area('A', [a])]))).toEqual({
      ok: false,
      error: 'duplicate-file',
    });
  });

  it('RF-104 refuses a file that is in no area', () => {
    expect(createCodeMap(input([a, b], [area('A', [a])]))).toEqual({
      ok: false,
      error: 'file-in-no-area',
    });
  });

  it('RF-104 refuses a file that is in two areas', () => {
    expect(createCodeMap(input([a], [area('A', [a]), area('B', [a])]))).toEqual({
      ok: false,
      error: 'file-in-two-areas',
    });
  });

  it('RF-104 refuses an area that names a file the map does not list', () => {
    expect(createCodeMap(input([a], [area('A', [a, b])]))).toEqual({
      ok: false,
      error: 'area-names-unknown-file',
    });
  });

  it('RF-104 refuses two areas with one name', () => {
    expect(createCodeMap(input([a, b], [area('A', [a]), area('A', [b])]))).toEqual({
      ok: false,
      error: 'duplicate-area-name',
    });
  });

  it('RF-104 refuses an area whose token total does not match its files', () => {
    const wrong: Area = { ...area('A', [a]), estimatedTokens: 999 };

    expect(createCodeMap(input([a], [wrong]))).toEqual({
      ok: false,
      error: 'area-tokens-mismatch',
    });
  });
});

describe('CodeMap (references)', () => {
  it('RF-111 refuses a link, symbol, statement or entity that points at an unscanned file', () => {
    const base = input([a], [area('A', [a])]);

    expect(
      createCodeMap({ ...base, links: [{ from: 'a.cs', to: 'gone.cs', kind: 'import' }] }),
    ).toEqual({ ok: false, error: 'reference-to-unknown-file' });
    expect(
      createCodeMap({
        ...base,
        symbols: [{ path: 'gone.cs', kind: 'class', name: 'X', startLine: 1, endLine: 1 }],
      }),
    ).toEqual({ ok: false, error: 'reference-to-unknown-file' });
    expect(
      createCodeMap({
        ...base,
        sqlStatements: [{ path: 'gone.cs', line: 1, verb: 'SELECT', text: 'SELECT 1' }],
      }),
    ).toEqual({ ok: false, error: 'reference-to-unknown-file' });
    expect(
      createCodeMap({
        ...base,
        entities: [{ name: 'E', path: 'gone.cs', startLine: 1, source: 's' }],
      }),
    ).toEqual({ ok: false, error: 'reference-to-unknown-file' });
  });

  it('RF-111 keeps the optional symbol of a link', () => {
    const base = input([a, b], [area('A', [a, b])]);
    const map = createCodeMap({
      ...base,
      links: [{ from: 'a.cs', to: 'b.cs', kind: 'code-behind', symbol: 'Demo.B' }],
    });

    expect(map.ok && map.value.links[0]?.symbol).toBe('Demo.B');
  });

  it('RF-105 does not keep the caller’s arrays, so a later change cannot alter the map', () => {
    const files = [a];
    const map = createCodeMap(input(files, [area('A', [a])]));
    files.push(b);

    expect(map.ok && map.value.files).toHaveLength(1);
  });
});
