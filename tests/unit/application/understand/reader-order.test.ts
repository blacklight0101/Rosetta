import { describe, expect, it } from 'vitest';
import { planReaderTasks } from '../../../../src/application/understand/reader-tasks.js';
import type { Area } from '../../../../src/domain/code-map/area.js';

// RF-210 (P7-03, DEC-195, EV-68, EV-76): reader tasks take the application's own code first, then
// tests, then deployment and infrastructure, configuration and generated folders, then libraries.
// Within a kind the code map's order is kept, so a run is reproducible against its recordings.

function area(name: string, estimatedTokens: number): Area {
  return { name, files: [`${name}/a.cs`], estimatedTokens, mapLevel: 'coarse', origin: 'folder' };
}

// An eShopModernizing-shaped code map, in the code map's order (code units: capitals first).
const eShop: readonly Area[] = [
  area('(root)', 2_000),
  area('.kube', 30_000),
  area('ACI', 5_000),
  area('Docker', 8_000),
  area('Kubernetes/eShopModernizedSQL-K8s', 12_000),
  area('Scripts#8', 48_625),
  area('ServiceFabric', 9_000),
  area('Setup', 4_000),
  area('eShopModernizedMVC', 60_000),
  area('eShopModernizedWebForms', 90_000),
  area('eShopPorted', 20_000),
];
const library = new Set(['Scripts#8']);
const names = (areas: readonly Area[], requested?: readonly string[]): readonly string[] => {
  const planned = planReaderTasks(areas, requested, library);
  return planned.ok ? planned.value.map((task) => task.area.name) : [];
};

describe('RF-210 reader order', () => {
  it('RF-210 plans the MVC and WebForms areas before Kubernetes, .kube and Docker', () => {
    const order = names(
      eShop,
      eShop.map((each) => each.name),
    );

    for (const app of ['eShopModernizedMVC', 'eShopModernizedWebForms']) {
      for (const deployment of ['.kube', 'Docker', 'Kubernetes/eShopModernizedSQL-K8s']) {
        expect(order.indexOf(app)).toBeLessThan(order.indexOf(deployment));
      }
    }
  });

  it('RF-210 orders by kind: own code, tests, deployment, configuration, libraries', () => {
    const mixed = [
      area('Config', 1_000),
      area('Docker', 8_000),
      area('Scripts#8', 48_625),
      area('Shop.Tests', 70_000),
      area('obj', 500),
      area('Catalog', 3_000),
      area('Orders', 9_000),
      area('helm/charts', 7_000),
    ];

    expect(
      names(
        mixed,
        mixed.map((each) => each.name),
      ),
    ).toEqual([
      'Catalog',
      'Orders',
      'Shop.Tests',
      'Docker',
      'helm/charts',
      'Config',
      'obj',
      'Scripts#8',
    ]);
  });
});

describe('RF-210 reader order folder names', () => {
  it('RF-210 counts a Setup, VM or Azure folder as own code, as the eShop WebForms Setup is', () => {
    const folders = ['.github/workflows', 'Setup', 'VM', 'Azure', 'Pipelines', 'Shop'];
    const order = names(
      folders.map((name) => area(name, 10)),
      folders,
    );

    expect(order).toEqual(['Setup', 'VM', 'Azure', 'Shop', '.github/workflows', 'Pipelines']);
  });
});

describe('RF-210 reader order ties', () => {
  it('RF-210 keeps the code map order within a kind, whatever the sizes', () => {
    const sized = [area('b', 10), area('a', 900), area('c', 50)];

    expect(names(sized, ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('RF-210 numbers the tasks in the new order, so card ids follow it', () => {
    const planned = planReaderTasks(eShop, undefined, library);

    expect(
      planned.ok && planned.value.slice(0, 2).map((task) => [task.agentTaskId, task.area.name]),
    ).toEqual([
      ['reader-001', '(root)'],
      ['reader-002', 'ACI'],
    ]);
  });
});
