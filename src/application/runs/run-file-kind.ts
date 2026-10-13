// RF-507, RF-1013: how a file of a run folder is served. Text is shown as text (plain, never as
// HTML, so a Markdown card with a script in it is only read); the pages Rosetta writes into
// `report/` are served as the pages, stylesheets and scripts they are; everything else is a
// download. A page, script or style anywhere else in a run folder is a download, because only
// `report/` is written by Rosetta from its own templates.

export interface RunFileKind {
  readonly contentType: string;
  readonly disposition: 'inline' | 'attachment';
}

const TEXT = 'text/plain; charset=utf-8';

/** Shown inline as text, by extension. */
const TEXT_TYPES: Readonly<Record<string, string>> = {
  md: TEXT,
  txt: TEXT,
  log: TEXT,
  jsonl: TEXT,
  json: 'application/json; charset=utf-8',
};

/** Shown as what they are, by extension, but only as direct files of `report/`. */
const REPORT_TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
};

const REPORT_FILE = /^report\/[^/]+$/u;

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

// RF-507, RF-1013
export function kindOfRunFile(path: string): RunFileKind {
  const extension = extensionOf(path);
  const page = REPORT_FILE.test(path) ? REPORT_TYPES[extension] : undefined;
  const contentType = page ?? TEXT_TYPES[extension];
  return contentType === undefined
    ? { contentType: 'application/octet-stream', disposition: 'attachment' }
    : { contentType, disposition: 'inline' };
}
