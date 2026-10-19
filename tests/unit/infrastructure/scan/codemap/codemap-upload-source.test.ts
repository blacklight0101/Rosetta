import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createArea } from '../../../../../src/domain/code-map/area.js';
import { createCodeMap, type CodeMap } from '../../../../../src/domain/code-map/code-map.js';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import {
  parseCodeMap,
  serialiseCodeMap,
} from '../../../../../src/infrastructure/scan/codemap/codemap-json.js';
import { maskCodeMap } from '../../../../../src/infrastructure/scan/codemap/mask-code-map.js';
import { renderScanSummary } from '../../../../../src/infrastructure/scan/codemap/scan-summary.js';
import { entry } from '../../../../support/code-map-builders.js';

// RF-130, RF-105: the code map of an uploaded zip names the zip and the hash of its tree, with no
// repository and no commit; it is written, read, masked and summarised like any other map.

const source = {
  kind: 'upload',
  fileName: 'OrderDesk.zip',
  snapshotHash: `sha256:${'cd'.repeat(32)}`,
  subpath: '',
} as const;

function uploadMap(): CodeMap {
  const files = [entry('a.cs', 3)];
  const area = createArea({ name: '(root)', origin: 'folder', members: files }, 100);
  if (!area.ok) throw new Error('bad sample');
  const made = createCodeMap({
    source,
    files,
    areas: [area.value],
    ...{ symbols: [], links: [], sqlStatements: [], entities: [], languagePacks: [] },
  });
  if (!made.ok) throw new Error(made.error);
  return made.value;
}

describe('the code map of an uploaded zip', () => {
  it('RF-130 writes the zip and the hash, and no repository or commit', () => {
    const json = z
      .object({ source: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(serialiseCodeMap(uploadMap())));

    expect(json.source).toEqual(source);
  });

  it('RF-130 reads back what it wrote, also after masking', () => {
    const parsed = parseCodeMap(serialiseCodeMap(uploadMap()));
    const masked = maskCodeMap(uploadMap(), new SecretMasker());

    expect(parsed.ok && parsed.value.source).toEqual(source);
    expect(masked.ok && masked.value.source).toEqual(source);
  });

  it.each([
    ['a hash that is not sha256', { ...source, snapshotHash: 'abc' }],
    ['a subpath', { ...source, subpath: 'src' }],
    ['a commit beside the zip', { ...source, commitSha: 'c'.repeat(40) }],
    ['no file name', { kind: 'upload', snapshotHash: source.snapshotHash, subpath: '' }],
  ])('RF-130 refuses a source with %s', (_what, bad) => {
    const json = z.record(z.string(), z.unknown()).parse(JSON.parse(serialiseCodeMap(uploadMap())));

    const parsed = parseCodeMap(JSON.stringify({ ...json, source: bad }));

    expect(parsed.ok).toBe(false);
  });

  it('RF-105 names the zip and its hash in the scan summary instead of a repository', () => {
    const text = renderScanSummary({ codeMap: uploadMap(), durationMs: 1200 });

    expect(text).toContain('- Source: uploaded zip OrderDesk.zip');
    expect(text).toContain(`- Snapshot: ${source.snapshotHash}`);
    expect(text).not.toContain('Commit:');
  });
});
