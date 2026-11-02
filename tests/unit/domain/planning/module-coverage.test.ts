import { describe, expect, it } from 'vitest';
import {
  DEPLOYMENT_ITEM,
  isModuleItem,
  moduleItems,
  sourcesWithModules,
} from '../../../../src/domain/planning/module-coverage.js';
import { checkedPlan } from '../../../../src/application/plan/plan-coverage.js';
import { coverageOf } from '../../../../src/domain/planning/plan-coverage.js';
import type { SourceModules } from '../../../../src/domain/planning/source-modules.js';
import { coverageDocuments, planOf } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P8-06, RF-601, RF-627: the modules of the source and its deployment material as coverage items,
// covered only by a card that builds them by id.

const modules: SourceModules = {
  modules: [
    {
      ...{ path: 'src/Orders', manifests: ['Orders.csproj'], languages: ['csharp'], files: 4 },
      cards: ['ENT-001'],
    },
    {
      ...{ path: 'src/Desk', manifests: ['Desk.csproj'], languages: [], files: 1 },
      cards: [],
    },
  ],
  overCap: [],
  deployment: { paths: ['deploy', 'src/Orders/Dockerfile'], files: 3, cards: ['FEAT-009'] },
};

describe('moduleItems', () => {
  it('RF-601 a module is `module:<folder>` and the deployment material is one item', () => {
    expect(moduleItems(modules)).toEqual([
      {
        id: 'module:src/Orders',
        kind: 'module',
        name: 'src/Orders',
        detail: 'Project files: Orders.csproj; languages: csharp; 4 files',
      },
      {
        id: 'module:src/Desk',
        kind: 'module',
        name: 'src/Desk',
        detail: 'Project files: Desk.csproj; languages: none known; 1 file',
      },
      {
        id: DEPLOYMENT_ITEM,
        kind: 'deployment',
        name: 'Deployment material',
        detail: 'deploy, src/Orders/Dockerfile; 3 files',
      },
    ]);
    expect(moduleItems(undefined)).toEqual([]);
  });

  it('RF-627 a module no card touches is reported apart from the items of the documents', () => {
    const report = coverageOf(moduleItems(modules), planOf([planTask({ id: 'T-001' })]).tasks);

    expect(report.uncovered).toEqual([]);
    expect(report.modules.map((each) => each.id)).toEqual([
      'module:src/Desk',
      'module:src/Orders',
      DEPLOYMENT_ITEM,
    ]);
    expect(isModuleItem('module:src/Desk')).toBe(true);
    expect(isModuleItem('feature:F-001')).toBe(false);
  });
});

describe('coverage of the modules and the deployment by the planner link only', () => {
  const documents = { ...coverageDocuments(), modules };

  function openAfterCheck(tasks: Parameters<typeof planOf>[0]): string[] {
    const checked = checkedPlan(planOf(tasks), documents);
    return coverageOf(moduleItems(modules), checked.tasks).modules.map((each) => each.id);
  }

  it('RF-601 a requirement citing a source card of a module is no proof: the module stays open', () => {
    const open = openAfterCheck([planTask({ id: 'T-001', requirements: ['REQ-001'], builds: [] })]);

    expect(open).toContain('module:src/Orders');
  });

  it('RF-601 a card that only writes the new CI file and Dockerfile does not cover the legacy deployment', () => {
    const files = ['Dockerfile', '.github/workflows/ci.yml', 'deploy/k8s/app.yaml'];

    const open = openAfterCheck([planTask({ id: 'T-001', files, builds: [] })]);

    expect(open).toContain(DEPLOYMENT_ITEM);
  });

  it('RF-601 a card that builds the deployment item by its id covers it', () => {
    const open = openAfterCheck([planTask({ id: 'T-001', builds: [DEPLOYMENT_ITEM] })]);

    expect(open).not.toContain(DEPLOYMENT_ITEM);
  });

  it('RF-607 the sources of the items hold the cards behind each module', () => {
    const sources = sourcesWithModules(documents);

    expect([...(sources.get('module:src/Orders') ?? [])]).toEqual(['ENT-001']);
    expect([...(sources.get('module:src/Desk') ?? [])]).toEqual([]);
    expect(sources.has('feature:F-001')).toBe(true);
  });
});
