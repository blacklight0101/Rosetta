import { describe, expect, it } from 'vitest';
import { planReaderTasks } from '../../../../src/application/understand/reader-tasks.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import type { ReadingPriority } from '../../../../src/domain/code-map/reading-priority.js';

// RF-210 (P8-94, DEC-216, UX-23, EV-76, EV-97): within the application's own code the readers take
// the areas with an entry point first, then the larger first-party token count, with the code map's
// order as the tie-break. The folders of the real eShopModernizing code map are the fixture: the
// root, ACI, Docs, Setup and VM come before the apps in the code map's order and hold no app code.

function area(name: string): Area {
  return {
    name,
    files: [`${name}/a.cs`],
    estimatedTokens: 1,
    mapLevel: 'coarse',
    origin: 'folder',
  };
}

function priority(rows: Readonly<Record<string, readonly [boolean, number]>>): ReadingPriority {
  return new Map(
    Object.entries(rows).map(([name, [entryPoint, firstPartyTokens]]) => [
      name,
      { entryPoint, firstPartyTokens },
    ]),
  );
}

// In the code map's order (code units: capitals first), as the scan writes it.
const eShop: readonly string[] = [
  '(root)',
  'ACI',
  'Docs',
  'Setup',
  'VM',
  'Kubernetes/eShopModernizedMVC-K8s',
  'eShopLegacyMVCSolution/src/eShopLegacyMVC',
  'eShopModernizedNTier',
  'eShopModernizedWebFormsSolution/src/eShopModernizedWebForms',
];
const eShopPriority = priority({
  '(root)': [false, 900],
  ACI: [false, 300],
  Docs: [false, 1_200],
  Setup: [false, 700],
  VM: [false, 400],
  'Kubernetes/eShopModernizedMVC-K8s': [true, 5_000],
  'eShopLegacyMVCSolution/src/eShopLegacyMVC': [true, 60_000],
  eShopModernizedNTier: [true, 40_000],
  'eShopModernizedWebFormsSolution/src/eShopModernizedWebForms': [true, 90_000],
});

function order(
  names: readonly string[],
  ranks?: ReadingPriority,
  requested?: readonly string[],
): readonly string[] {
  const planned = planReaderTasks(names.map(area), requested, new Set(), ranks);
  return planned.ok ? planned.value.map((task) => task.area.name) : [];
}

describe('RF-210 reader order inside own code (DEC-216)', () => {
  it('RF-210 reads the app folders before (root), ACI, Docs, Setup and VM', () => {
    const planned = order(eShop, eShopPriority);

    expect(planned).toEqual([
      'eShopModernizedWebFormsSolution/src/eShopModernizedWebForms',
      'eShopLegacyMVCSolution/src/eShopLegacyMVC',
      'eShopModernizedNTier',
      'Docs',
      '(root)',
      'Setup',
      'VM',
      'ACI',
      'Kubernetes/eShopModernizedMVC-K8s',
    ]);
  });
});

describe('RF-210 reader order classes and ties (DEC-216)', () => {
  it('RF-210 puts an area with an entry point before a larger area with none', () => {
    const ranks = priority({ Big: [false, 90_000], Small: [true, 10] });

    expect(order(['Big', 'Small'], ranks)).toEqual(['Small', 'Big']);
  });

  it('RF-210 orders areas of the same entry-point class by first-party tokens, largest first', () => {
    const ranks = priority({ A: [true, 10], B: [true, 300], C: [true, 50] });

    expect(order(['A', 'B', 'C'], ranks)).toEqual(['B', 'C', 'A']);
  });

  it('RF-210 breaks a tie on entry point and size by the code map order', () => {
    const ranks = priority({ A: [true, 50], B: [true, 50], C: [true, 50] });

    expect(order(['B', 'A', 'C'], ranks)).toEqual(['B', 'A', 'C']);
  });

  it('RF-210 treats an area the priorities do not list as having no entry point and no tokens', () => {
    const ranks = priority({ Known: [false, 5] });

    expect(order(['Unknown', 'Known'], ranks)).toEqual(['Known', 'Unknown']);
  });

  it('RF-210 numbers the reader tasks in the new order, so card ids follow it', () => {
    const planned = planReaderTasks(eShop.map(area), undefined, new Set(), eShopPriority);

    expect(
      planned.ok && planned.value.slice(0, 2).map((task) => [task.agentTaskId, task.area.name]),
    ).toEqual([
      ['reader-001', 'eShopModernizedWebFormsSolution/src/eShopModernizedWebForms'],
      ['reader-002', 'eShopLegacyMVCSolution/src/eShopLegacyMVC'],
    ]);
  });

  it('RF-210 keeps a deployment area after own code even when it has entry points and size', () => {
    const ranks = priority({ Docker: [true, 99_000], Shop: [false, 1] });

    expect(order(['Docker', 'Shop'], ranks)).toEqual(['Shop', 'Docker']);
  });
});
