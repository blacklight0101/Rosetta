import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { SourceModules } from '../../../../src/domain/planning/source-modules.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// P8-06, RF-601, EV-32: checks.md names every module of the source and the deployment material
// that no task card touches, with the reason; when each has a card it says so.

const masker = new SecretMasker();

const modules: SourceModules = {
  modules: [
    {
      ...{ path: 'src/Shop.WebForms', manifests: ['Shop.WebForms.csproj'], files: 12 },
      ...{ languages: ['csharp', 'aspx'], cards: [] },
    },
  ],
  overCap: [{ path: 'tools/x', manifests: ['package.json'], languages: [], files: 1, cards: [] }],
  deployment: { paths: ['k8s', 'src/Shop.WebForms/Dockerfile'], files: 4, cards: [] },
};

function checksOf(extra: Partial<HandoffPackage>): string {
  return renderHandoff(handoffOf('Plain text.', undefined, extra), masker)['checks.md'] ?? '';
}

function section(checks: string): string {
  return checks.split(/^## /mu).find((part) => part.startsWith('Modules')) ?? '';
}

describe('checks.md: the modules of the source', () => {
  it('RF-601 names each untouched module and the deployment material with the reason', () => {
    const moduleReasons = [{ id: 'module:src/Shop.WebForms', reason: 'Reason one.' }];

    const found = section(checksOf({ modules, moduleReasons }));

    expect(found).toMatch(/^Modules with no task card/u);
    expect(found).toContain('| src/Shop.WebForms | csharp, aspx | 12 | Reason one. |');
    expect(found).toContain('| tools/x |  | 1 | No task card touches it. |');
    expect(found).toContain('Deployment material: k8s, src/Shop.WebForms/Dockerfile');
  });

  it('RF-601 says that every module has a card when each is touched', () => {
    const plain = checksOf({});
    const base = handoffOf('Plain text.');
    const builds = ['module:src/Shop.WebForms', 'deployment:source'];
    const tasks = base.content.tasks.map((task, at) => (at === 0 ? { ...task, builds } : task));
    const touched = { ...modules, overCap: [] };

    const found = section(checksOf({ modules: touched, content: { ...base.content, tasks } }));

    expect(found).toContain(
      'Every module of the source (1) and its deployment material is touched by at least one task card.',
    );
    expect(section(plain)).toBe('');
  });
});
