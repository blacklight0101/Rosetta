import { describe, expect, it } from 'vitest';
import { entry } from '../../../support/code-map-builders.js';
import { citingCard, eshopScanFiles } from '../../../support/eshop-modules-fixtures.js';
import { MAX_MODULES, sourceModules } from '../../../../src/domain/planning/source-modules.js';

// P8-06, RF-601, EV-32: the modules of a scan (folders with a project or package manifest) and its
// deployment material, from the scan of eShopModernizing.

const webForms = 'eShopLegacyWebFormsSolution/src/eShopLegacyWebForms';
const winForms = 'eShopLegacyNTier/src/eShopWinForms';

describe('sourceModules on the eShopModernizing scan', () => {
  it('RF-601 every project folder is a module, with its manifests, languages and files', async () => {
    const { modules } = sourceModules(await eshopScanFiles(), []);

    expect(modules.map((each) => each.path)).toEqual([
      'eShopLegacyMVCSolution/eShopLegacy.Utilities',
      'eShopLegacyMVCSolution/eShopPorted',
      'eShopLegacyMVCSolution/src/eShopLegacyMVC',
      'eShopLegacyNTier/src/eShopWCFService',
      winForms,
      webForms,
      'eShopModernizedMVCSolution/src/eShopModernizedMVC',
      'eShopModernizedNTier/src/eShopWCFService',
      'eShopModernizedNTier/src/eShopWinForms',
      'eShopModernizedWebFormsSolution/src/eShopModernizedWebForms',
    ]);
    const forms = modules.find((each) => each.path === webForms);
    expect(forms?.manifests).toEqual(['eShopLegacyWebForms.csproj', 'packages.config']);
    expect(forms?.languages).toContain('csharp');
    expect(forms?.files).toBeGreaterThan(100);
  });

  it('RF-601 Kubernetes, Service Fabric, Dockerfiles, compose and publish files are one deployment whole', async () => {
    const { modules, deployment } = sourceModules(await eshopScanFiles(), []);

    expect(deployment?.paths).toEqual(
      expect.arrayContaining([
        'Kubernetes',
        'Kubernetes-DockerForWindows',
        'ServiceFabric',
        'docker-compose.yml',
        'eShopModernizedMVCSolution/src/eShopModernizedMVC/Dockerfile',
        'eShopModernizedMVCSolution/src/eShopModernizedMVC/Properties/PublishProfiles/FolderProfile.pubxml',
      ]),
    );
    expect(deployment?.paths).not.toContain('ServiceFabric/eShopModernizedMVC-ServiceFabricApp');
    expect(modules.some((each) => each.path.startsWith('ServiceFabric/'))).toBe(false);
    expect(deployment?.files).toBeGreaterThan(50);
  });
});

describe('sourceModules: the cards behind a module', () => {
  it('RF-601 a module lists its own cards: Supported claims that cite its files and no other module', async () => {
    const cards = [
      citingCard('FEAT-001', [`${webForms}/Default.aspx.cs`, 'README.md']),
      citingCard('FEAT-002', [`${winForms}/Program.cs`]),
      citingCard('FEAT-003', [`${webForms}/Default.aspx.cs`], 'Rejected'),
      citingCard('FEAT-004', ['Kubernetes/eShopModernizedMVC-K8s/x.yaml']),
      citingCard('BR-001', [`${webForms}/Web.config`, `${winForms}/App.config`]),
    ];

    const found = sourceModules(await eshopScanFiles(), cards);

    expect(found.modules.find((each) => each.path === webForms)?.cards).toEqual(['FEAT-001']);
    expect(found.modules.find((each) => each.path === winForms)?.cards).toEqual(['FEAT-002']);
    expect(found.deployment?.cards).toEqual(['FEAT-004']);
  });
});

describe('sourceModules: edge cases', () => {
  it('RF-601 a scan with no manifest and no deployment file has no module', () => {
    const found = sourceModules([entry('src/a.cs', 10)], []);

    expect(found).toMatchObject({ modules: [], overCap: [], notModules: [], ciFiles: [] });
    expect(found.deployment).toBeUndefined();
    expect(found.deploymentLike ?? []).toEqual([]);
  });

  it('RF-601 a manifest at the root is the module `.`, and a nested one takes its own files', () => {
    const files = [
      entry('package.json', 1, { artefactKinds: ['manifest'] }),
      entry('index.js', 1),
      entry('tools/cli/package.json', 1, { artefactKinds: ['manifest'] }),
      entry('tools/cli/main.js', 1),
    ];

    const { modules } = sourceModules(files, []);

    expect(modules.map((each) => [each.path, each.files])).toEqual([
      ['.', 2],
      ['tools/cli', 2],
    ]);
  });

  it('RF-601 over the cap the largest modules are sent and the rest are kept apart', () => {
    const files = Array.from({ length: MAX_MODULES + 1 }, (_, at) => {
      const folder = `m${String(at).padStart(3, '0')}`;
      const extra = at === MAX_MODULES ? [] : [entry(`${folder}/b.js`, 1)];
      return [entry(`${folder}/package.json`, 1, { artefactKinds: ['manifest'] }), ...extra];
    }).flat();

    const found = sourceModules(files, []);

    expect(found.modules).toHaveLength(MAX_MODULES);
    expect(found.overCap.map((each) => each.path)).toEqual([
      `m${String(MAX_MODULES).padStart(3, '0')}`,
    ]);
  });
});

describe('sourceModules: what is not a module (P8-06 verifier counter-examples)', () => {
  const manifest = { artefactKinds: ['manifest' as const] };

  it('RF-601 test projects and vendored manifests are no modules and are named with the reason', () => {
    const files = [
      entry('App/App.csproj', 1, manifest),
      entry('App/Program.cs', 1),
      entry('App.Tests/App.Tests.csproj', 1, manifest),
      entry('src/Shop/Shop.UnitTests.csproj', 1, manifest),
      entry('tests/unit/package.json', 1, manifest),
      entry('vendor/x/composer.json', 1, manifest),
      entry('wwwroot/lib/jquery/package.json', 1, manifest),
      entry('third/pkg/package.json', 1, { ...manifest, vendored: true }),
    ];

    const found = sourceModules(files, []);

    expect(found.modules.map((each) => each.path)).toEqual(['App']);
    expect(found.notModules).toEqual([
      { path: 'App.Tests', reason: 'test' },
      { path: 'src/Shop', reason: 'test' },
      { path: 'tests/unit', reason: 'test' },
      { path: 'third/pkg', reason: 'vendored' },
      { path: 'vendor/x', reason: 'vendored' },
      { path: 'wwwroot/lib/jquery', reason: 'vendored' },
    ]);
  });

  it('RF-601 a module named like a deployment word stays a module with its files', () => {
    const files = [
      entry('HelmetService/HelmetService.csproj', 1, manifest),
      entry('HelmetService/Helmet.cs', 1),
      entry('KubernetesClient/KubernetesClient.csproj', 1, manifest),
      entry('Foo.ServiceFabric/Foo.csproj', 1, manifest),
      entry('Foo.ServiceFabric/Service.cs', 1),
      entry('Foo.ServiceFabric/Models/Deployment/Plan.cs', 1),
    ];

    const found = sourceModules(files, []);

    expect(found.modules.map((each) => [each.path, each.files])).toEqual([
      ['Foo.ServiceFabric', 3],
      ['HelmetService', 2],
      ['KubernetesClient', 1],
    ]);
    expect(found.deployment).toBeUndefined();
  });
});

describe('sourceModules: CI files', () => {
  const manifest = { artefactKinds: ['manifest' as const] };

  it('RF-601 a CI workflow that may only run tests is no deployment and is named apart', () => {
    const files = [entry('App/App.csproj', 1, manifest), entry('.github/workflows/test.yml', 1)];

    const found = sourceModules(files, []);

    expect(found.deployment).toBeUndefined();
    expect(found.ciFiles).toEqual(['.github/workflows/test.yml']);
  });
});

describe('sourceModules: one-word test projects (P8-06 delta verifier)', () => {
  const manifest = { artefactKinds: ['manifest' as const] };

  it('RF-601 a test project named by a test word or a CamelCase Tests suffix is no module', () => {
    const files = [
      entry('IntegrationTests/IntegrationTests.csproj', 1, manifest),
      entry('UnitTests/UnitTests.csproj', 1, manifest),
      entry('OrderServiceTests/OrderServiceTests.csproj', 1, manifest),
      entry('src/Api/ApiSpecs.csproj', 1, manifest),
      entry('Contest.Web/Contest.Web.csproj', 1, manifest),
      entry('Attestation/Attestation.csproj', 1, manifest),
      entry('TestHarness.App/TestHarness.App.csproj', 1, manifest),
    ];

    const found = sourceModules(files, []);

    expect(found.modules.map((each) => each.path)).toEqual([
      'Attestation',
      'Contest.Web',
      'TestHarness.App',
    ]);
    expect(found.notModules?.map((each) => each.path)).toEqual([
      'IntegrationTests',
      'OrderServiceTests',
      'UnitTests',
      'src/Api',
    ]);
  });
});

describe('sourceModules: Helm charts and deploy folders (P8-06 delta verifier)', () => {
  const manifest = { artefactKinds: ['manifest' as const] };

  it('RF-601 a Helm chart is deployment by its Chart.yaml, whatever its folder is called', () => {
    const files = [
      entry('mychart/Chart.yaml', 1),
      entry('mychart/values.yaml', 1),
      entry('mychart/templates/d.yaml', 1),
      entry('charts/web/Chart.yaml', 1),
      entry('charts/web/templates/d.yaml', 1),
    ];

    const found = sourceModules(files, []);

    expect(found.deployment?.paths).toEqual(['charts/web', 'mychart']);
    expect(found.deployment?.files).toBe(5);
    expect(found.deploymentLike).toEqual([]);
  });

  it('RF-601 a deploy folder with a package.json and no code is deployment, with code a named module', () => {
    const scripts = [entry('deploy/package.json', 1, manifest), entry('deploy/run.sh', 1)];
    const coded = [entry('deployment/package.json', 1, manifest), entry('deployment/index.js', 1)];

    const plain = sourceModules(scripts, []);
    const withCode = sourceModules(coded, []);

    expect(plain.modules).toEqual([]);
    expect(plain.deployment?.paths).toEqual(['deploy']);
    expect(withCode.modules.map((each) => each.path)).toEqual(['deployment']);
    expect(withCode.deployModules).toEqual(['deployment']);
  });

  it('RF-601 a deployment-like file counted nowhere is named, never lost in silence', () => {
    const files = [
      entry('App/App.csproj', 1, manifest),
      entry('App/deploy/settings.yaml', 1),
      entry('infra/main.tf', 1),
      entry('App/Program.cs', 1),
    ];

    const found = sourceModules(files, []);

    expect(found.deploymentLike).toEqual(['App/deploy/settings.yaml', 'infra/main.tf']);
  });
});
