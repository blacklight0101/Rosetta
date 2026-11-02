// P8-06, RF-601, EV-32: the manifest folders that are not modules of the system: test projects
// (`App.Tests/App.Tests.csproj`, `tests/unit/package.json`) and vendored third-party code
// (`vendor/x/composer.json`, `wwwroot/lib/jquery/package.json`, or a file the scan marked vendored).
// The rules look at whole folder names, whole words of a name and a CamelCase last word
// (`OrderServiceTests`), never at a substring (`Contest.Web`, `Attestation` stay modules), and a
// folder they keep out is not dropped in silence: checks.md names it with the reason.

export type NotModuleReason = 'test' | 'vendored';

/** A manifest folder kept out of the modules, and why. */
export interface NotModule {
  readonly path: string;
  readonly reason: NotModuleReason;
}

const testNames: ReadonlySet<string> = new Set([
  'test',
  'tests',
  'spec',
  'specs',
  '__tests__',
  'testing',
]);

/** The last word of a project name that makes it a test project (`Shop.UnitTests`, `api-tests`). */
const testWords: ReadonlySet<string> = new Set([
  'test',
  'tests',
  'spec',
  'specs',
  'unittests',
  'integrationtests',
  'functionaltests',
  'e2e',
]);

const vendorNames: ReadonlySet<string> = new Set([
  'vendor',
  'vendors',
  'node_modules',
  'bower_components',
  'third_party',
  'thirdparty',
  'third-party',
  'external',
  'externals',
]);

/** A `lib` or `libs` folder holds bundled libraries only under one of these web asset folders. */
const assetNames: ReadonlySet<string> = new Set([
  'wwwroot',
  'static',
  'public',
  'assets',
  'scripts',
  'content',
]);

/** `OrderServiceTests`, `ApiSpecs`: a CamelCase name whose last word is a test word. */
const camelTestSuffix = /[a-z0-9](?:Tests?|Specs?)$/u;

function isTestSegment(segment: string): boolean {
  const name = segment.toLowerCase();
  if (testNames.has(name) || testWords.has(name)) return true;
  const words = name.split(/[-_.\s]+/u);
  const last = segment.split(/[-_.\s]+/u).at(-1) ?? '';
  if (words.length > 1 && testWords.has(words.at(-1) ?? '')) return true;
  return camelTestSuffix.test(last);
}

function isVendorSegment(segment: string, parent: string | undefined): boolean {
  const name = segment.toLowerCase();
  if (vendorNames.has(name)) return true;
  return (name === 'lib' || name === 'libs') && assetNames.has((parent ?? '').toLowerCase());
}

/** Why a manifest folder is no module, or undefined when it is one. */
// P8-06, RF-601
export function notModuleReason(folder: string, vendored: boolean): NotModuleReason | undefined {
  if (vendored) return 'vendored';
  const segments = folder === '.' ? [] : folder.split('/');
  if (segments.some((segment, at) => isVendorSegment(segment, segments[at - 1]))) {
    return 'vendored';
  }
  return segments.some(isTestSegment) ? 'test' : undefined;
}

/** True for a project file named as a test project (`App.Tests.csproj`), whatever its folder. */
// P8-06, RF-601
export function isTestManifest(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return isTestSegment(stem);
}
