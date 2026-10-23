import { describe, expect, it } from 'vitest';
import { inferComponent } from '../../../../src/domain/planning/flow-step-components.js';

// RF-625: a step the planner left unplaced is given a component only when the files it cites
// say so, by a folder a placed step shares or by the words of the path; a tie maps nothing.

const components = [
  { name: 'Catalog data access', responsibility: 'Reads the catalog database.' },
  { name: 'Order service', responsibility: 'Takes and stores orders.' },
];

describe('inferComponent', () => {
  it('RF-625 takes the component of a placed step that cites a file in the same folder', () => {
    const placed = [{ files: ['src/Data/A.cs'], component: 'Order service' }];

    const step = { files: ['src/Data/B.cs'], component: null };
    expect(inferComponent(step, placed, components)).toBe('Order service');
  });

  it('RF-625 placed steps of two components in one folder decide nothing by folder', () => {
    const placed = [
      { files: ['src/Misc/A.cs'], component: 'Order service' },
      { files: ['src/Misc/C.cs'], component: 'Catalog data access' },
    ];

    const step = { files: ['src/Misc/B.cs'], component: null };
    expect(inferComponent(step, placed, components)).toBeNull();
  });

  it('RF-625 reads the words of the path against the component name', () => {
    const step = { files: ['src/Web/CatalogDataContext.cs'], component: null };

    expect(inferComponent(step, [], components)).toBe('Catalog data access');
  });

  it('RF-625 a file no component covers maps nothing', () => {
    expect(inferComponent({ files: ['src/Web/Program.cs'], component: null }, [], components)).toBe(
      null,
    );
    expect(inferComponent({ files: [], component: null }, [], components)).toBeNull();
  });
});
