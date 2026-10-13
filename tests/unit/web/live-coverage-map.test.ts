import { describe, expect, it } from 'vitest';
import { coverageOf, type CoverageNode } from '../../../web/src/lib/live-run/coverage-map.js';
import {
  agentStarted,
  ev,
  planned,
  stateAfter,
  toolCalled,
  toolResult,
} from './live-run-fixtures.js';
import type { RunEvent } from '../../../web/src/api/run-events.js';

// RF-1005, DEC-51 (P1-38): the coverage map of the live run page, folded from the `read_file`
// events of the run: per area the files read as a tree and the area's share of the files read.

/** A `read_file` call of the task and its answer. */
function read(seq: number, task: string, path: string, ok = true): readonly RunEvent[] {
  return [
    toolCalled(seq, task, { path, startLine: 1, endLine: 20 }),
    toolResult(seq + 1, task, ok),
  ];
}

/** The tree as `folder/` and `file` names, indented two spaces per level. */
function outline(nodes: readonly CoverageNode[], depth = 0): readonly string[] {
  return nodes.flatMap((node) => [
    `${' '.repeat(depth * 2)}${node.name}${node.kind === 'folder' ? '/' : ''}`,
    ...outline(node.children, depth + 1),
  ]);
}

describe('the areas of the coverage map', () => {
  it('RF-1005 lists every planned area in plan order, empty until its agent reads a file', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      planned(2, 'reader-002', 'Services'),
    );

    const map = coverageOf(state);

    expect(map.areas.map((area) => [area.area, area.filesRead, area.share])).toEqual([
      ['Catalog', 0, 0],
      ['Services', 0, 0],
    ]);
    expect(map.filesRead).toBe(0);
  });

  it('RF-1005 fills in an area as its files are read and gives each area its share of the reads', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      planned(2, 'reader-002', 'Services'),
      planned(3, 'reader-003', 'Models'),
      agentStarted(4, 'reader-001', 'Catalog'),
      agentStarted(5, 'reader-002', 'Services'),
      ...read(6, 'reader-001', 'Catalog/Edit.aspx.cs'),
      ...read(8, 'reader-001', 'Catalog/Details.aspx.cs'),
      ...read(10, 'reader-001', 'Catalog/Edit.aspx.cs'),
      ...read(12, 'reader-002', 'Services/CatalogService.cs'),
    );

    const map = coverageOf(state);

    expect(map.filesRead).toBe(3);
    expect(map.areas.map((area) => [area.area, area.filesRead, area.share])).toEqual([
      ['Catalog', 2, 67],
      ['Services', 1, 33],
      ['Models', 0, 0],
    ]);
  });
});

describe('the files of the coverage map', () => {
  it('RF-1005 shows the files of an area as a tree of folders, folders first, by name', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      ...read(2, 'reader-001', 'Catalog/Views/Index.aspx'),
      ...read(4, 'reader-001', 'Catalog/Edit.aspx.cs'),
      ...read(6, 'reader-001', 'Catalog/Details.aspx.cs'),
      ...read(8, 'reader-001', 'Global.asax.cs'),
    );

    const [catalog] = coverageOf(state).areas;

    expect(outline(catalog?.tree ?? [])).toEqual([
      'Catalog/',
      '  Views/',
      '    Index.aspx',
      '  Details.aspx.cs',
      '  Edit.aspx.cs',
      'Global.asax.cs',
    ]);
    expect(catalog?.tree[0]?.children[0]?.children[0]?.path).toBe('Catalog/Views/Index.aspx');
  });

  it('RF-1005 counts a file only once its read succeeded, and nothing but read_file', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      ...read(2, 'reader-001', 'Catalog/Missing.cs', false),
      toolCalled(4, 'reader-001', { path: 'Catalog/Edit.aspx.cs' }, 'list_area_files'),
      toolResult(5, 'reader-001', true, 'list_area_files'),
      toolCalled(6, 'reader-001', { path: 'Catalog/Details.aspx.cs' }),
    );

    expect(coverageOf(state).areas[0]?.filesRead).toBe(0);
  });
});

describe('the agents of the coverage map', () => {
  it('RF-1005 merges the agents of one area and leaves out agents that are not readers', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      planned(2, 'reader-002', 'Catalog'),
      ev(3, 'agent.planned', { area: 'verifier', role: 'verifier', model: 'm' }, 'verifier-001'),
      ...read(4, 'reader-001', 'Catalog/Edit.aspx.cs'),
      ...read(6, 'reader-002', 'Catalog/Edit.aspx.cs'),
      ...read(8, 'reader-002', 'Catalog/List.aspx.cs'),
      ...read(10, 'verifier-001', 'Catalog/Other.cs'),
    );

    const map = coverageOf(state);

    expect(map.areas.map((area) => [area.area, area.filesRead, area.share])).toEqual([
      ['Catalog', 2, 100],
    ]);
    expect(map.filesRead).toBe(2);
  });
});
