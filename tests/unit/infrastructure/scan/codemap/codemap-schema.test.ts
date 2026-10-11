import { describe, expect, it } from 'vitest';
import { createArea } from '../../../../../src/domain/code-map/area.js';
import { createCodeMap, type CodeMap } from '../../../../../src/domain/code-map/code-map.js';
import type { FileEntry } from '../../../../../src/domain/code-map/file-entry.js';
import {
  parseCodeMap,
  serialiseCodeMap,
} from '../../../../../src/infrastructure/scan/codemap/codemap-json.js';
import { entry, unhashed } from '../../../../support/code-map-builders.js';

const source = { owner: 'octo', repo: 'demo', commitSha: 'c'.repeat(40), subpath: 'src' };

const expectedJson = {
  schemaVersion: 1,
  source,
  files: [
    {
      path: 'Web/Home.aspx',
      language: 'aspx',
      lines: 4,
      estimatedTokens: 4,
      sha256: 'a'.repeat(64),
      artefactKinds: ['page'],
      mapLevel: 'symbols',
    },
    {
      path: 'Web/Home.aspx.cs',
      language: 'csharp',
      lines: 9,
      estimatedTokens: 9,
      sha256: 'a'.repeat(64),
      artefactKinds: [],
      mapLevel: 'symbols',
    },
    {
      path: 'huge.sql',
      language: 'sql',
      lines: 0,
      estimatedTokens: 0,
      artefactKinds: [],
      mapLevel: 'coarse',
      skipped: 'too-large',
    },
  ],
  areas: [
    {
      name: '(root)',
      files: ['huge.sql'],
      estimatedTokens: 0,
      mapLevel: 'coarse',
      origin: 'folder',
    },
    {
      name: 'Web',
      files: ['Web/Home.aspx', 'Web/Home.aspx.cs'],
      estimatedTokens: 13,
      mapLevel: 'symbols',
      origin: 'folder',
    },
  ],
  symbols: [{ path: 'Web/Home.aspx.cs', kind: 'class', name: 'Home', startLine: 3, endLine: 20 }],
  links: [
    {
      from: 'Web/Home.aspx',
      to: 'Web/Home.aspx.cs',
      kind: 'code-behind',
      symbol: 'Demo.Home',
    },
  ],
  sqlStatements: [{ path: 'Web/Home.aspx.cs', line: 8, verb: 'SELECT', text: 'SELECT 1' }],
  entities: [{ name: 'Items', path: 'Web/Home.aspx.cs', startLine: 5, source: 'Demo.Ctx.Items' }],
  languagePacks: [{ name: 'csharp', version: '1.0.0' }],
};

function sample(): CodeMap {
  const members: readonly FileEntry[] = [
    entry('Web/Home.aspx', 4, { language: 'aspx', artefactKinds: ['page'], mapLevel: 'symbols' }),
    entry('Web/Home.aspx.cs', 9, { language: 'csharp', mapLevel: 'symbols' }),
    unhashed('huge.sql', 0, { language: 'sql', skipped: 'too-large' }),
  ];
  const web = createArea({ name: 'Web', origin: 'folder', members: members.slice(0, 2) }, 100);
  const rest = createArea({ name: '(root)', origin: 'folder', members: members.slice(2) }, 100);
  if (!web.ok || !rest.ok) throw new Error('bad sample');
  const map = createCodeMap({
    source,
    files: members,
    areas: [web.value, rest.value],
    symbols: [{ path: 'Web/Home.aspx.cs', kind: 'class', name: 'Home', startLine: 3, endLine: 20 }],
    links: [
      { from: 'Web/Home.aspx', to: 'Web/Home.aspx.cs', kind: 'code-behind', symbol: 'Demo.Home' },
    ],
    sqlStatements: [{ path: 'Web/Home.aspx.cs', line: 8, verb: 'SELECT', text: 'SELECT 1' }],
    entities: [{ name: 'Items', path: 'Web/Home.aspx.cs', startLine: 5, source: 'Demo.Ctx.Items' }],
    languagePacks: [{ name: 'csharp', version: '1.0.0' }],
  });
  if (!map.ok) throw new Error(map.error);

  return map.value;
}

describe('codemap.json', () => {
  it('RF-105 writes the fields of data-model 3.4 and nothing that varies between runs', () => {
    const json: unknown = JSON.parse(serialiseCodeMap(sample()));

    expect(json).toEqual(expectedJson);
  });

  it('RF-106 is byte-identical for the same map, ends with one line break and has no time', () => {
    const first = serialiseCodeMap(sample());
    const second = serialiseCodeMap(sample());

    expect(second).toBe(first);
    expect(first.endsWith('}\n')).toBe(true);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('RF-105 validates against its schema and comes back as the same map', () => {
    const map = sample();

    expect(parseCodeMap(serialiseCodeMap(map))).toEqual({ ok: true, value: map });
  });

  it('RF-100 accepts a too-large file without sha256', () => {
    const text = serialiseCodeMap(sample());

    expect(text).toContain('"too-large"');
    expect(parseCodeMap(text).ok).toBe(true);
  });
});

describe('codemap.json (refusals)', () => {
  it.each([
    ['text that is not JSON', '{nope', 'invalid-json'],
    ['another schema version', '{"schemaVersion":2}', 'invalid-schema'],
    ['a missing section', '{"schemaVersion":1,"source":{}}', 'invalid-schema'],
  ])('RF-105 refuses %s', (_name, text, error) => {
    expect(parseCodeMap(text)).toEqual({ ok: false, error });
  });

  it('RF-105 refuses a field the schema does not know', () => {
    const text = serialiseCodeMap(sample()).replace(
      '"schemaVersion": 1,',
      '"schemaVersion": 1, "writtenAt": "now",',
    );

    expect(parseCodeMap(text)).toEqual({
      ok: false,
      error: 'invalid-schema',
    });
  });

  it('RF-105 refuses a file with an absolute path or an unknown map level', () => {
    const text = serialiseCodeMap(sample());

    expect(parseCodeMap(text.replace('"Web/Home.aspx"', '"/Web/Home.aspx"')).ok).toBe(false);
    expect(parseCodeMap(text.replaceAll('"symbols"', '"deep"')).ok).toBe(false);
  });

  it('RF-104 refuses a map whose areas do not cover its files exactly once', () => {
    const text = serialiseCodeMap(sample()).replace(
      '"files": [\n        "huge.sql"\n      ]',
      '"files": ["huge.sql", "Web/Home.aspx"]',
    );

    expect(parseCodeMap(text)).toEqual({ ok: false, error: 'file-in-two-areas' });
  });
});

describe('codemap.json (more refusals)', () => {
  it('RF-105 refuses a commit SHA that is not 40 lower-case hexadecimal characters', () => {
    const text = serialiseCodeMap(sample()).replace('c'.repeat(40), 'z'.repeat(40));

    expect(parseCodeMap(text)).toEqual({ ok: false, error: 'invalid-schema' });
  });

  it('RF-110 refuses a symbol whose end line is before its start line', () => {
    const text = serialiseCodeMap(sample()).replace('"endLine": 20', '"endLine": 2');

    expect(parseCodeMap(text)).toEqual({ ok: false, error: 'symbol-range-invalid' });
  });

  it('RF-106 refuses an area whose files are not sorted', () => {
    const text = serialiseCodeMap(sample()).replace(
      '"Web/Home.aspx",\n        "Web/Home.aspx.cs"',
      '"Web/Home.aspx.cs",\n        "Web/Home.aspx"',
    );

    expect(parseCodeMap(text)).toEqual({ ok: false, error: 'area-files-unsorted' });
  });
});
