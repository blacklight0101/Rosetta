import type { Area } from './area.js';
import type { FileEntry } from './file-entry.js';

// RF-104, RF-1001: which files and areas of the code map are third-party code (vendored libraries
// and minified bundles). The scan keeps them in the map; the start page leaves an area that
// consists only of them unticked and marks it. The rule is conservative, so own code is never
// hidden by it: a file is third-party only when its name, its folder or its shape says so.
//
// - a `*.min.js` or `*.min.css` file;
// - a file whose lines average more than 500 characters (about four characters per token, as the
//   scan counts them), which is what a bundle or a minified script looks like;
// - a file under a `vendor`, `node_modules` or `bower_components` folder;
// - a file named after a well-known library under a `lib`, `libs` or `Scripts` folder
//   (`jquery-3.4.1.js`, `bootstrap.js`, `MicrosoftAjax.js`, but not `respondents.js`);
// - a file under `Scripts/WebForms/`, and the Visual Studio `Scripts/_references.js`.

const MAX_AVERAGE_LINE = 500;
const CHARACTERS_PER_TOKEN = 4;

const MINIFIED = /\.min\.(?:js|css)$/iu;
const VENDOR_FOLDERS: ReadonlySet<string> = new Set(['vendor', 'node_modules', 'bower_components']);
const LIBRARY_FOLDERS: ReadonlySet<string> = new Set(['lib', 'libs', 'scripts']);
const LIBRARY_NAMES =
  /^(?:jquery|bootstrap|modernizr|respond|microsoftajax|microsoftmvc|popper|knockout|angular|lodash|underscore|moment|backbone|d3)/iu;

/** A name matches a library when no lower-case letter follows it: `respond.js`, not `respondents.js`. */
function isLibraryName(name: string): boolean {
  const match = LIBRARY_NAMES.exec(name);
  if (match === null) return false;
  const next = name.charAt(match[0].length);
  return !/^[a-z]$/u.test(next);
}

function averageLineIsLong(file: FileEntry): boolean {
  return (
    file.lines > 0 && file.estimatedTokens * CHARACTERS_PER_TOKEN > MAX_AVERAGE_LINE * file.lines
  );
}

function byFolder(folders: readonly string[], name: string): boolean {
  const lower = folders.map((folder) => folder.toLowerCase());
  if (lower.some((folder) => VENDOR_FOLDERS.has(folder))) return true;
  const scripts = lower.indexOf('scripts');
  if (scripts >= 0 && lower[scripts + 1] === 'webforms') return true;
  if (scripts >= 0 && name === '_references.js') return true;
  return lower.some((folder) => LIBRARY_FOLDERS.has(folder)) && isLibraryName(name);
}

/** RF-104: whether one listed file is a vendored library or a minified bundle. */
export function isThirdPartyFile(file: FileEntry): boolean {
  const segments = file.path.split('/');
  const name = segments.pop() ?? '';
  return MINIFIED.test(name) || averageLineIsLong(file) || byFolder(segments, name);
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
