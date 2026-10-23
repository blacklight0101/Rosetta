// RF-104 (P3-112, EV-28): what the head of a file says about it. The scan flags a file as vendored
// when its header names a known library with a version and a licence (a script or style sheet
// only), or when it is a large JSON file declaring a `$schema` (generated schema). Own code that
// merely mentions a library has no version next to the name and is not flagged.

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
/** The library name, then a dotted version on the same line: `jQuery JavaScript Library v3.4.1`. */
const NAME_AND_VERSION = new RegExp(
  `\\b(?:${LIBRARY_NAMES})\\b[^\\n]{0,60}?\\bv?\\d+\\.\\d+`,
  'iu',
);
const LICENCE = /\b(?:MIT|Apache|BSD|GPL|LGPL|MPL|SIL OFL|ISC)\b|licen[cs]e/iu;
const COMMENT_START = /^\s*(?:\/\*|\/\/|@charset)/u;
const SCHEMA_KEY = /"\$schema"\s*:/u;

function hasLibraryHeader(head: string): boolean {
  const header = head.slice(0, HEADER_CHARACTERS);
  return COMMENT_START.test(header) && NAME_AND_VERSION.test(header) && LICENCE.test(header);
}

/** Whether the head of a file (its first characters) says it is third-party. */
export function isVendoredContent(path: string, head: string, tokens: number): boolean {
  if (SCRIPT_OR_STYLE.test(path)) return hasLibraryHeader(head);
  return JSON_FILE.test(path) && tokens >= SCHEMA_MIN_TOKENS && SCHEMA_KEY.test(head);
}
