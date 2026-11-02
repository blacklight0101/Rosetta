import { describe, expect, it } from 'vitest';
import {
  DEPLOYMENT_ITEM,
  isModuleItem,
  moduleItems,
  sourcesWithModules,
  withModuleLinks,
} from '../../../../src/domain/planning/module-coverage.js';
import { coverageOf, withMigrationCard } from '../../../../src/domain/planning/plan-coverage.js';
import type { SourceModules } from '../../../../src/domain/planning/source-modules.js';
import { coverageDocuments, planOf } from '../../../support/coverage-fixtures.js';
import { targetModel } from '../../../support/data-model-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P8-06, RF-601, RF-627: the modules of the source and its deployment material as coverage items,
// and the cards that touch them by code.

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

describe('withModuleLinks', () => {
  it('RF-601 a requirement citing a source card of a module is no proof: only the planner links a module', () => {
    const plan = planOf([planTask({ id: 'T-001', requirements: ['REQ-001'], builds: [] })]);

    const linked = withModuleLinks(plan, modules);

    expect(linked).toBe(plan);
  });

  it('RF-601 a card touches the deployment material only by the deployment files it changes', () => {
    const plan = planOf([
      planTask({ id: 'T-001', requirements: ['REQ-002'], files: ['src/mail/'] }),
      planTask({
        id: 'T-002',
        requirements: [],
        files: ['Dockerfile', '.github/workflows/ci.yml'],
      }),
    ]);

    const linked = withModuleLinks(plan, modules);

    expect(linked.tasks[0]?.builds).toEqual([]);
    expect(linked.tasks[1]?.builds).toEqual([DEPLOYMENT_ITEM]);
  });

  it('RF-601 the migrations card touches no module, and a plan with nothing new is the same plan', () => {
    const plan = planOf([planTask({ id: 'T-001', requirements: [] })]);
    const migrated = withMigrationCard(plan, targetModel().tables);
    expect(migrated.tasks[0]?.requirements).toContain('REQ-001');

    const linked = withModuleLinks(migrated, modules);

    expect(linked).toBe(migrated);
    expect(withModuleLinks(plan, undefined)).toBe(plan);
  });

  it('RF-607 the sources of the items hold the cards behind each module', () => {
    const sources = sourcesWithModules({ ...coverageDocuments(), modules });

    expect([...(sources.get('module:src/Orders') ?? [])]).toEqual(['ENT-001']);
    expect([...(sources.get('module:src/Desk') ?? [])]).toEqual([]);
    expect(sources.has('feature:F-001')).toBe(true);
  });
});
