import { describe, expect, it } from 'vitest';
import { planReaderTasks } from '../../../../src/application/understand/reader-tasks.js';
import type { Area } from '../../../../src/domain/code-map/area.js';

// P3-123 (HB-01): own code is read before library areas, and by default instead of them.

function area(name: string): Area {
  return {
    name,
    files: [`${name}/a.cs`],
    estimatedTokens: 10,
    mapLevel: 'coarse',
    origin: 'folder',
  };
}

// P3-123 (HB-01): an eShop-shaped project: the library areas sort first by name.
const eShop = [
  '.kube',
  'Content',
  'Scripts',
  'eShopModernizedMVC',
  'eShopModernizedWebForms',
  'eShopLegacy.Core',
].map(area);
const library = new Set(['.kube', 'Content', 'Scripts']);

describe('reader tasks and library areas', () => {
  it('RF-200 plans every first-party area before any library area, each in code-map order', () => {
    const planned = planReaderTasks(
      eShop,
      ['Scripts', 'Content', ...eShop.slice(3).map((a) => a.name)],
      library,
    );

    expect(planned.ok && planned.value.map((task) => [task.agentTaskId, task.area.name])).toEqual([
      ['reader-001', 'eShopModernizedMVC'],
      ['reader-002', 'eShopModernizedWebForms'],
      ['reader-003', 'eShopLegacy.Core'],
      ['reader-004', 'Content'],
      ['reader-005', 'Scripts'],
    ]);
  });
});

describe('reader tasks without names and library areas', () => {
  it('RF-200 without names a project with library areas reads its own code only', () => {
    const planned = planReaderTasks(eShop, undefined, library);

    expect(planned.ok && planned.value.map((task) => task.area.name)).toEqual([
      'eShopModernizedMVC',
      'eShopModernizedWebForms',
      'eShopLegacy.Core',
    ]);
  });

  it('RF-200 without names a project made only of library areas reads them all', () => {
    const planned = planReaderTasks(eShop.slice(0, 3), [], library);

    expect(planned.ok && planned.value.map((task) => task.area.name)).toEqual([
      '.kube',
      'Content',
      'Scripts',
    ]);
  });

  it('RF-200 a library area named in the request is still read, after the own code', () => {
    const planned = planReaderTasks(eShop, ['Content', 'eShopLegacy.Core'], library);

    expect(planned.ok && planned.value.map((task) => task.area.name)).toEqual([
      'eShopLegacy.Core',
      'Content',
    ]);
  });
});
