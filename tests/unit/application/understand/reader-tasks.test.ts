import { describe, expect, it } from 'vitest';
import { planReaderTasks } from '../../../../src/application/understand/reader-tasks.js';
import type { Area } from '../../../../src/domain/code-map/area.js';

// RF-200, RF-203: one reader task per area, or per named area, always in the code map's order.

function area(name: string): Area {
  return {
    name,
    files: [`${name}/a.cs`],
    estimatedTokens: 10,
    mapLevel: 'coarse',
    origin: 'folder',
  };
}

const areas = [area('(root)'), area('Catalog'), area('Database'), area('Services')];

describe('reader tasks of an understand run', () => {
  it('RF-200 plans one reader task per area, in the order of the code map', () => {
    const planned = planReaderTasks(areas, undefined);

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.value.map((task) => [task.agentTaskId, task.area.name])).toEqual([
      ['reader-001', '(root)'],
      ['reader-002', 'Catalog'],
      ['reader-003', 'Database'],
      ['reader-004', 'Services'],
    ]);
  });

  it('RF-200 plans only the named areas, in code-map order whatever order they were named in', () => {
    const planned = planReaderTasks(areas, ['Services', 'Catalog']);

    expect(planned.ok && planned.value.map((task) => [task.agentTaskId, task.area.name])).toEqual([
      ['reader-001', 'Catalog'],
      ['reader-002', 'Services'],
    ]);
  });

  it('RF-200 a name the code map does not have is refused with every valid name, in order', () => {
    const planned = planReaderTasks(areas, ['Catalog', 'Billing', 'catalog']);

    expect(planned).toEqual({
      ok: false,
      error: {
        unknown: ['Billing', 'catalog'],
        valid: ['(root)', 'Catalog', 'Database', 'Services'],
      },
    });
  });

  it('RF-200 an area named twice gets one task', () => {
    const planned = planReaderTasks(areas, ['Database', 'Database']);

    expect(planned.ok && planned.value.map((task) => task.area.name)).toEqual(['Database']);
  });

  it('RF-200 an empty list of names means every area', () => {
    const planned = planReaderTasks(areas, []);

    expect(planned.ok && planned.value).toHaveLength(4);
  });
});
