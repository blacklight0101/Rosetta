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

    expect(found).toEqual({ modules: [], overCap: [] });
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
