import { describe, expect, it } from 'vitest';
import { planReaderTasks } from '../../../../src/application/understand/reader-tasks.js';
import type { Area } from '../../../../src/domain/code-map/area.js';

// RF-210 (P7-03, DEC-195, EV-68): the kind of an area comes from the parts of its folder names.
// Clear deployment names count at any depth, ambiguous ones only as the top folder, and a test
// folder is a whole part or a `Tests` suffix, never `contest` or `latest`.

function area(name: string): Area {
  return {
    name,
    files: [`${name}/a.cs`],
    estimatedTokens: 10,
    mapLevel: 'coarse',
    origin: 'folder',
  };
}

/** The area names in the order the readers take them, every area named. */
function order(input: readonly string[]): readonly string[] {
  const planned = planReaderTasks(input.map(area), input);
  return planned.ok ? planned.value.map((task) => task.area.name) : [];
}

// The folder names of the real eShopModernizing code map, in the code map's order.
const apps = [
  '(root)',
  'ACI',
  'Docs',
  'Setup',
  'VM',
  'eShopLegacyMVCSolution/src/eShopLegacyMVC',
  'eShopLegacyNTier',
  'eShopModernizedMVCSolution/src/eShopModernizedMVC',
  'eShopModernizedNTier',
  'eShopModernizedWebFormsSolution/src/eShopModernizedWebForms',
];
const deployments = [
  'Kubernetes-DockerForWindows/RabbitMQ-Linux-K8s',
  'Kubernetes-DockerForWindows/eShopModernizedMVC-K8s',
  'Kubernetes/eShopModernizedMVC-K8s/ServiceDeployments',
  'ServiceFabric',
  'ServiceFabric/ServiceFabric-ARM-Templates-Scripts',
  'ServiceFabric/eShopModernizedSQL_ServiceFabricApp',
];

describe('RF-210 the eShop folder names', () => {
  it('RF-210 reads every app area before every deployment area', () => {
    const planned = order([
      ...deployments.slice(0, 3),
      ...apps.slice(0, 5),
      ...deployments.slice(3),
      ...apps.slice(5),
    ]);

    const lastApp = Math.max(...apps.map((name) => planned.indexOf(name)));
    const firstDeployment = Math.min(...deployments.map((name) => planned.indexOf(name)));
    expect(lastApp).toBeLessThan(firstDeployment);
  });

  it('RF-210 splits a folder name on dashes, underscores, dots and case changes', () => {
    expect(
      order(['Kubernetes-DockerForWindows', 'ServiceFabric-ARM', 'My_K8s_Tools', 'Shop']),
    ).toEqual(['Shop', 'Kubernetes-DockerForWindows', 'ServiceFabric-ARM', 'My_K8s_Tools']);
  });
});

describe('RF-210 nested and ambiguous names', () => {
  it('RF-210 a deployment folder below the top folder still counts', () => {
    expect(order(['src/deploy/k8s', 'src/Web', 'app/Terraform', 'app/Core'])).toEqual([
      'src/Web',
      'app/Core',
      'src/deploy/k8s',
      'app/Terraform',
    ]);
  });

  it('RF-210 infra, charts, pipelines, github and config count only as the top folder', () => {
    const code = ['src/infrastructure/github', 'src/infra/charts', 'src/config', 'src/pipelines'];

    expect(order([...code, 'github', 'Config', 'Shop'])).toEqual([
      ...code,
      'Shop',
      'github',
      'Config',
    ]);
  });
});

describe('RF-210 test folders', () => {
  it('RF-210 matches a whole part or a Tests suffix, never contest or latest', () => {
    const input = ['Catalog.Tests', 'CatalogTests', 'contest', 'latest', 'e2e', 'Specs', 'App'];

    expect(order(input)).toEqual([
      'contest',
      'latest',
      'App',
      'Catalog.Tests',
      'CatalogTests',
      'e2e',
      'Specs',
    ]);
  });
});
