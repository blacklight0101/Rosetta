import { describe, expect, it } from 'vitest';
import { createArea } from '../../../../../src/domain/code-map/area.js';
import { createCodeMap } from '../../../../../src/domain/code-map/code-map.js';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import {
  parseCodeMap,
  serialiseCodeMap,
} from '../../../../../src/infrastructure/scan/codemap/codemap-json.js';
import { maskCodeMap } from '../../../../../src/infrastructure/scan/codemap/mask-code-map.js';
import { buildCodeMap } from '../../../../../src/infrastructure/scan/codemap/build-code-map.js';
import { entry } from '../../../../support/code-map-builders.js';

const source = { owner: 'octo', repo: 'demo', commitSha: 'c'.repeat(40), subpath: '' };

function mapWith(scannerVersion?: number) {
  const files = [entry('a.cs', 3)];
  const area = createArea({ name: '(root)', origin: 'folder', members: files }, 100);
  if (!area.ok) throw new Error('bad sample');
  const base = {
    source,
    files,
    areas: [area.value],
    symbols: [],
    links: [],
    sqlStatements: [],
    entities: [],
    languagePacks: [],
  };
  const made = createCodeMap(scannerVersion === undefined ? base : { ...base, scannerVersion });
  if (!made.ok) throw new Error(made.error);
  return made.value;
}

describe('the scanner version of a code map', () => {
  it.each([0, 1, 2])(
    'RF-113 keeps scanner version %s through serialise, parse and masking',
    (version) => {
      const text = serialiseCodeMap(mapWith(version));
      expect(JSON.parse(text)).toMatchObject({ scannerVersion: version });
      const parsed = parseCodeMap(text);
      expect(parsed.ok && parsed.value.scannerVersion).toBe(version);
      const masked = maskCodeMap(mapWith(version), new SecretMasker());
      expect(masked.ok && masked.value.scannerVersion).toBe(version);
    },
  );

  it('RF-113 a map without a version stays without one when written, read and masked', () => {
    const text = serialiseCodeMap(mapWith());
    expect(JSON.parse(text)).not.toHaveProperty('scannerVersion');
    const parsed = parseCodeMap(text);
    expect(parsed.ok && 'scannerVersion' in parsed.value).toBe(false);
    const masked = maskCodeMap(mapWith(), new SecretMasker());
    expect(masked.ok && 'scannerVersion' in masked.value).toBe(false);
  });

  it.each([-1, 1.5, '1'])('RF-113 refuses the scanner version %j', (version) => {
    const text = serialiseCodeMap(mapWith(1)).replace(
      '"scannerVersion": 1',
      `"scannerVersion": ${JSON.stringify(version)}`,
    );
    expect(parseCodeMap(text).ok).toBe(false);
  });

  it('RF-113 a new scan records the current scanner version', () => {
    const built = buildCodeMap({
      source,
      scan: { files: [], sqlStatements: [] },
      packs: { fileLevels: [], symbols: [], links: [], entities: [], languagePacks: [] },
      areaTokenBudget: 60_000,
      configuredAreas: [],
      masker: new SecretMasker(),
    });
    expect(built.ok && built.value.scannerVersion).toBe(4);
  });
});
