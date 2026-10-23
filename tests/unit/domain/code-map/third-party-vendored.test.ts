import { describe, expect, it } from 'vitest';
import type { Area } from '../../../../src/domain/code-map/area.js';
import type { FileEntry } from '../../../../src/domain/code-map/file-entry.js';
import {
  isThirdPartyFile,
  thirdPartyAreaNames,
} from '../../../../src/domain/code-map/third-party.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-104, RF-1001 (P3-112, EV-28): vendored libraries count as third-party code even when they are
// not minified: library files under the well-known folders, generated schema JSON, and any file
// the scan flagged `vendored` from its header or its `$schema`. A project's own file in the same
// folder stays first-party.

const libraries = [
  'Scripts/jquery-3.4.1.js',
  'Scripts/jquery-ui-1.12.1.js',
  'Scripts/bootstrap.js',
  'Content/bootstrap.css',
  'Content/bootstrap-theme.css',
  'Content/font-awesome.css',
  'Content/font-awesome.min.css',
  'Content/font-awesome/css/font-awesome.css',
  'Content/fontawesome-all.css',
  'Content/jquery-ui.css',
  'wwwroot/lib/bootstrap/dist/css/bootstrap.css',
  'wwwroot/lib/jquery-validation/dist/jquery.validate.js',
  '.kube/schema/v1.18.0-standalone/deployment.json',
  'deploy/.kube/schema/all.json',
];

const own = [
  'Scripts/app.js',
  'Scripts/site.js',
  'Content/Site.css',
  'Content/font-awesome-picker.js',
  'Content/app.css',
  'wwwroot/lib/site-helpers.js',
  'k8s/schema/orders.json',
  'schema/deployment.json',
  'Models/Schema.cs',
];

describe('P3-112 vendored library paths', () => {
  it.each(libraries)('%s is third-party', (path) => {
    expect(isThirdPartyFile(entry(path))).toBe(true);
  });

  it.each(own)('%s stays first-party', (path) => {
    expect(isThirdPartyFile(entry(path))).toBe(false);
  });

  it('a file the scan flagged vendored is third-party wherever it lives', () => {
    expect(isThirdPartyFile(entry('Assets/js/odd-name.js', 10, { vendored: true }))).toBe(true);
    expect(isThirdPartyFile(entry('Assets/js/odd-name.js', 10))).toBe(false);
  });
});

// A synthetic scan shaped like eShopModernizing: unminified jQuery and Bootstrap under Scripts/
// and Content/, Font Awesome, twenty large Kubernetes schema files, and a few own files.
function eShopShaped(): { files: FileEntry[]; areas: Area[] } {
  const library = [
    entry('src/Web/Scripts/jquery-3.4.1.js', 70_000),
    entry('src/Web/Scripts/jquery-ui-1.12.1.js', 120_000),
    entry('src/Web/Scripts/bootstrap.js', 17_000),
    entry('src/Web/Content/bootstrap.css', 37_000),
    entry('src/Web/Content/font-awesome.css', 9_000),
    entry('src/Web/Content/font-awesome.min.css', 7_000),
  ];
  const kube = Array.from({ length: 20 }, (_, index) =>
    entry(`.kube/schema/v1.18/resource-${String(index)}.json`, 50_000 + index * 6_000),
  );
  const ownFiles = [
    entry('src/Web/Scripts/app.js', 1_200),
    entry('src/Web/Controllers/CatalogController.cs', 3_000),
    entry('src/Web/Models/CatalogItem.cs', 800),
    entry('src/Web/Content/Site.css', 600),
  ];
  const files = [...library, ...kube, ...ownFiles];
  const folderOf = (path: string): string => path.split('/').slice(0, -1).join('/');
  const byFolder = new Map<string, string[]>();
  for (const file of files) {
    byFolder.set(folderOf(file.path), [...(byFolder.get(folderOf(file.path)) ?? []), file.path]);
  }
  const tokens = new Map(files.map((file) => [file.path, file.estimatedTokens]));
  const areas: Area[] = [...byFolder].map(([name, paths]) => ({
    name,
    files: paths,
    estimatedTokens: paths.reduce((sum, path) => sum + (tokens.get(path) ?? 0), 0),
    mapLevel: 'coarse',
    origin: 'folder',
  }));
  return { files, areas };
}

describe('P3-112 the eShop-shaped scan', () => {
  it('"Own code only" keeps under one million tokens', () => {
    const map = eShopShaped();
    const thirdParty = thirdPartyAreaNames(map);
    const ownTokens = map.areas
      .filter((area) => !thirdParty.has(area.name))
      .reduce((sum, area) => sum + area.estimatedTokens, 0);

    expect(ownTokens).toBeLessThan(1_000_000);
    expect([...thirdParty]).toContain('.kube/schema/v1.18');
  });

  it('the own Scripts/app.js is still listed and first-party, so its area stays offered', () => {
    const map = eShopShaped();
    const app = map.files.find((file) => file.path === 'src/Web/Scripts/app.js');

    expect(app !== undefined && isThirdPartyFile(app)).toBe(false);
    expect(thirdPartyAreaNames(map).has('src/Web/Scripts')).toBe(false);
    expect(map.files.map((file) => file.path)).toContain('src/Web/Scripts/app.js');
  });
});
