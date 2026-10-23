import type { Area } from './area.js';
import type { FileEntry } from './file-entry.js';

// RF-104, RF-1001: which files and areas of the code map are third-party code (vendored libraries
// and minified bundles). The scan keeps them in the map; the start page leaves an area that
// consists only of them unticked and marks it. The rule is conservative, so own code is never
// hidden by it: a file is third-party only when its name, its folder or its shape says so, and
// only a script, style sheet or source map can be a library file.
//
// - a `*.min.js` or `*.min.css` file;
// - a file whose lines average more than 500 characters (about four characters per token, as the
//   scan counts them), which is what a bundle or a minified script looks like;
// - a `.js` or `.css` file under a `vendor`, `node_modules` or `bower_components` folder;
// - a `.js`, `.css` or `.map` file under a `lib`, `libs` or `Scripts` folder whose whole name is a
//   well-known library, optionally followed by versions and variants: `jquery-3.4.1.js`,
//   `jquery.validate.min.js`, `bootstrap.bundle.js`, `popper-utils.js`, but not `angularApp.js`,
//   `d3-charts.js` or `moment-helpers.js`;
// - the Microsoft Web Forms scripts of `Scripts/WebForms/` (`MSAjax/`, `WebForms.js`, ...), and
//   the Visual Studio `Scripts/_references.js`;
// - (P3-112) the same library names under a `Content` folder, Font Awesome included, and the
//   generated JSON of a `.kube/schema` folder;
// - a file the scan flagged `vendored` after reading it: a header that names a known library with
//   a version and a licence, or a large JSON file with a `$schema` (see vendor-content.ts).

const MAX_AVERAGE_LINE = 500;
const CHARACTERS_PER_TOKEN = 4;

const MINIFIED = /\.min\.(?:js|css)$/iu;
const SCRIPT_OR_STYLE = /\.(?:js|css)$/iu;
const LIBRARY_FILE = /\.(?:js|css|map)$/iu;
const VENDOR_FOLDERS: ReadonlySet<string> = new Set(['vendor', 'node_modules', 'bower_components']);
const LIBRARY_FOLDERS: ReadonlySet<string> = new Set(['lib', 'libs', 'scripts', 'content']);
const LIBRARIES: ReadonlySet<string> = new Set([
  ...[
    'jquery',
    'bootstrap',
    'fontawesome',
    'modernizr',
    'respond',
    'popper',
    'knockout',
    'angular',
    'lodash',
  ],
  ...['underscore', 'moment', 'backbone', 'd3', 'microsoftajax', 'microsoftmvcajax'],
  ...['microsoftmvcvalidation', 'microsoftajaxwebforms'],
]);
/** What may follow a library name: `min`, `bundle`, `slim`, `validate`, `intellisense`, ... */
const VARIANTS: ReadonlySet<string> = new Set([
  ...['min', 'map', 'js', 'css', 'bundle', 'slim', 'validate', 'unobtrusive', 'intellisense'],
  ...['vsdoc', 'utils', 'debug', 'esm', 'umd', 'matchmedia', 'addlistener', 'migrate'],
  ...['ui', 'theme', 'all'],
]);
const VERSION_PART = /^\d+$/u;

/** The Microsoft Web Forms scripts directly under `Scripts/WebForms/`; `MSAjax/` holds more. */
const WEB_FORMS_FILES: ReadonlySet<string> = new Set([
  ...['webforms.js', 'webuivalidation.js', 'menustandards.js', 'menu.js', 'focus.js'],
  ...['gridview.js', 'detailsview.js', 'treeview.js', 'smartnav.js', 'webparts.js'],
]);

/** `jquery-3.4.1.min.js` is a library file; `jquery-helpers.js` and `angularApp.js` are not. */
function isLibraryName(name: string): boolean {
  if (!LIBRARY_FILE.test(name)) return false;
  const [library = '', ...rest] = name
    .toLowerCase()
    .replace('font-awesome', 'fontawesome')
    .split(/[-.]/u);
  return (
    LIBRARIES.has(library) && rest.every((part) => VERSION_PART.test(part) || VARIANTS.has(part))
  );
}

function isWebFormsScript(folders: readonly string[], name: string): boolean {
  const index = folders.indexOf('scripts');
  if (index < 0 || folders[index + 1] !== 'webforms') return false;
  const below = folders.slice(index + 2);
  return below[0] === 'msajax' || (below.length === 0 && WEB_FORMS_FILES.has(name.toLowerCase()));
}

function averageLineIsLong(file: FileEntry): boolean {
  return (
    file.lines > 0 && file.estimatedTokens * CHARACTERS_PER_TOKEN > MAX_AVERAGE_LINE * file.lines
  );
}

/** A generated schema: any `.json` file under a `.kube/schema` folder. */
function isKubeSchema(folders: readonly string[], name: string): boolean {
  const index = folders.indexOf('.kube');
  return index >= 0 && folders[index + 1] === 'schema' && /.json$/iu.test(name);
}

function byFolder(path: readonly string[], name: string): boolean {
  const folders = path.map((folder) => folder.toLowerCase());
  if (folders.some((folder) => VENDOR_FOLDERS.has(folder)) && SCRIPT_OR_STYLE.test(name)) {
    return true;
  }
  if (isWebFormsScript(folders, name) || isKubeSchema(folders, name)) return true;
  if (folders.includes('scripts') && name === '_references.js') return true;
  return folders.some((folder) => LIBRARY_FOLDERS.has(folder)) && isLibraryName(name);
}

/**
 * RF-104: whether a path alone says the file is a vendored library or a minified bundle (its name
 * or its folder); the grep reads such files last (P1-160).
 */
export function isThirdPartyPath(path: string): boolean {
  const segments = path.split('/');
  const name = segments.pop() ?? '';
  return MINIFIED.test(name) || byFolder(segments, name);
}

/** RF-104: whether one listed file is a vendored library or a minified bundle. */
export function isThirdPartyFile(file: FileEntry): boolean {
  return file.vendored === true || isThirdPartyPath(file.path) || averageLineIsLong(file);
}

/** RF-1001: the names of the areas whose every file is third-party. */
export function thirdPartyAreaNames(map: {
  readonly files: readonly FileEntry[];
  readonly areas: readonly Area[];
}): ReadonlySet<string> {
  const thirdParty = new Set(map.files.filter(isThirdPartyFile).map((file) => file.path));
  const names = map.areas
    .filter((area) => area.files.length > 0 && area.files.every((path) => thirdParty.has(path)))
    .map((area) => area.name);
  return new Set(names);
}
