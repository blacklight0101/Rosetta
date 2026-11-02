import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { SourceModules } from '../../../../src/domain/planning/source-modules.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { plain } from '../../../support/plan-method-harness.js';

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

  it('RF-601 names the test, vendored and CI paths it does not count, never dropping them in silence', () => {
    const notModules = [
      { path: 'App.Tests', reason: 'test' as const },
      { path: 'vendor/x', reason: 'vendored' as const },
    ];
    const listed = {
      modules: [],
      overCap: [],
      notModules,
      ciFiles: ['.github/workflows/test.yml'],
    };

    const checks = plain(checksOf({ modules: listed }));

    const found = checks.split(/^## /mu).find((part) => part.startsWith('Folders and files')) ?? '';
    expect(found).toContain('| App.Tests | A test project');
    expect(found).toContain('| vendor/x | Vendored third-party code');
    expect(found).toContain('| .github/workflows/test.yml | A CI file');
  });
});

describe('checks.md: the paths not counted, capped', () => {
  it('RF-601 lists 20 CI files and an "and N more" row, and names deployment-like files and deploy modules', () => {
    const ciFiles = Array.from({ length: 25 }, (_, at) => `.github/workflows/w${String(at)}.yml`);
    const listed = {
      ...{ modules: [], overCap: [], ciFiles },
      deploymentLike: ['infra/main.tf'],
      deployModules: ['deployment'],
    };

    const checks = plain(checksOf({ modules: listed }));

    const found = checks.split(/^## /mu).find((part) => part.startsWith('Folders and files')) ?? '';
    expect(found).toContain('| .github/workflows/w19.yml | A CI file');
    expect(found).not.toContain('w20.yml');
    expect(found).toContain('| and 5 more CI files | A CI file');
    expect(found).toContain('| infra/main.tf | It looks like deployment');
    expect(found).toContain('| deployment | A deploy folder with a package manifest and code');
  });

  it('RF-601 lists 20 test projects and an "and N more" row, and the vendored ones apart', () => {
    const tests = Array.from({ length: 31 }, (_, at) => ({
      path: `Shop${String(at).padStart(2, '0')}.Tests`,
      reason: 'test' as const,
    }));
    const notModules = [...tests, { path: 'vendor/x', reason: 'vendored' as const }];

    const checks = plain(checksOf({ modules: { modules: [], overCap: [], notModules } }));

    const found = checks.split(/^## /mu).find((part) => part.startsWith('Folders and files')) ?? '';
    const rows = found
      .split(/\n/u)
      .filter((line) => line.startsWith('| ') && !line.startsWith('| Path'));
    expect(rows).toHaveLength(22);
    expect(found).toContain('| Shop19.Tests | A test project');
    expect(found).not.toContain('Shop20.Tests');
    expect(found).toContain('| and 11 more test projects | A test project');
    expect(found).toContain('| vendor/x | Vendored third-party code');
  });
});
