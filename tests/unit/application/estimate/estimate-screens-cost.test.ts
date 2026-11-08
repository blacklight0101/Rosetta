import { describe, expect, it } from 'vitest';
import { screensOf } from '../../../../src/application/estimate/estimate-areas.js';
import type { CodeMap } from '../../../../src/domain/code-map/code-map.js';
import { agentCodeMap } from '../../../support/agent-fixtures.js';
import { entry } from '../../../support/code-map-builders.js';
import { areaOf } from '../../../support/estimate-harness.js';

// RF-210 (P8-124, P8-133): the surface of the areas is read from one index of the code map, so the
// screens the estimate counts cost the files of the map, not areas times files; the count is unchanged.

const AREA_COUNT = 50;

const many = Array.from({ length: AREA_COUNT }, (_, index) => {
  const name = `Area${String(index)}`;
  return { ...areaOf(name, 10), files: [`${name}/Page.aspx`, `${name}/Order.cs`] };
});

const listed = many.flatMap((area) => [
  entry(`${area.name}/Page.aspx`, 5, { artefactKinds: ['page'] }),
  entry(`${area.name}/Order.cs`, 5),
]);

describe('RF-210 screens of the estimate cost', () => {
  it('RF-210 counts one screen for each page file of the areas', () => {
    expect(screensOf(many, { ...agentCodeMap, files: listed, symbols: [] })).toBe(AREA_COUNT);
  });

  it('RF-210 reads the files and symbols of the code map once, however many areas it counts', () => {
    const reads = { files: 0, symbols: 0 };
    const map: CodeMap = {
      ...agentCodeMap,
      get files() {
        reads.files += 1;
        return listed;
      },
      get symbols() {
        reads.symbols += 1;
        return [];
      },
    };

    const screens = screensOf(many, map);

    expect(screens).toBe(AREA_COUNT);
    expect(reads.files).toBeLessThanOrEqual(2);
    expect(reads.symbols).toBeLessThanOrEqual(1);
  });
});
