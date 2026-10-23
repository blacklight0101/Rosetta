// RF-104 (P3-112, EV-28): what the head of a file says about it. The scan flags a file as vendored
// when the leading comment of a script or style sheet is a library banner, or when it is a large
// JSON file declaring a `$schema` (generated schema).
//
// A banner needs all of: a known library name opening the comment, immediately followed by a full `x.y.z` version
// (`jQuery JavaScript Library v3.4.1`, `Bootstrap v3.3.7`, `lodash 4.17.21`), a recognised
// open-source licence in the same comment, and no `proprietary`, `internal` or `company` wording.
// The library name opens the comment (P5-19), so a header that merely mentions a library after
// other words is own code. Own code that mentions a library is not flagged.

const SCRIPT_OR_STYLE = /\.(?:js|css|scss|less)$/iu;
const JSON_FILE = /\.json$/iu;
/** A generated schema is large; a small `$schema` line is a config file's editor hint. */
const SCHEMA_MIN_TOKENS = 20_000;
const HEADER_CHARACTERS = 1200;

const LIBRARY_NAMES = [
  'jquery(?:[ -]ui|[ -]validation)?',
  'bootstrap',
  'font ?awesome',
  'modernizr',
  'respond\\.js',
  'popper(?:\\.js)?',
  'knockout(?:\\.js)?',
  'lodash',
  'underscore(?:\\.js)?',
  'moment(?:\\.js)?',
  'backbone(?:\\.js)?',
  'angularjs',
  'angular',
  'd3',
  'chart\\.js',
  'select2',
  'datatables',
  'highcharts',
  'leaflet',
  'swiper',
  'animate\\.css',
  'normalize\\.css',
].join('|');
// P5-19: the library name opens the comment, after the comment marker and an optional `@license` or
// `@preserve` tag, as real banners do (`/*! jQuery v3.6.0`, ` * Bootstrap v3.3.7`).
const BANNER_START = String.raw`^(?:\/\*+|\/\/+)?[\s*!/]*(?:@(?:license|preserve)[\s*]*)?`;
const NAME_AND_VERSION = new RegExp(
  String.raw`${BANNER_START}(?:${LIBRARY_NAMES})(?:\s+(?:JavaScript|CSS|Library|Framework|Plugin))*\s+v?\d+\.\d+\.\d+`,
  'iu',
);
/** A recognised open-source licence. */
const LICENCE = /\b(?:MIT|Apache|BSD|ISC|GPL|LGPL|MPL|SIL OFL)\b/iu;
const NOT_OPEN_SOURCE = /\b(?:proprietary|internal|company|confidential)\b/iu;
/** The leading comment block (a block comment or consecutive line comments), where a banner lives. */
const LEADING_BLOCK = /^\s*(?:\/\*[\s\S]*?\*\/|(?:\/\/[^\n]*\n?)+)/u;
const SCHEMA_KEY = /"\$schema"\s*:/u;

function hasLibraryBanner(head: string): boolean {
  const block = LEADING_BLOCK.exec(head.slice(0, HEADER_CHARACTERS))?.[0] ?? '';
  if (!NAME_AND_VERSION.test(block)) return false;
  return LICENCE.test(block) && !NOT_OPEN_SOURCE.test(block);
}

/** Whether the head of a file (its first characters) says it is third-party. */
export function isVendoredContent(path: string, head: string, tokens: number): boolean {
  if (SCRIPT_OR_STYLE.test(path)) return hasLibraryBanner(head);
  return JSON_FILE.test(path) && tokens >= SCHEMA_MIN_TOKENS && SCHEMA_KEY.test(head);
}
