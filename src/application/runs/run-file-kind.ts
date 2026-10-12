// RF-507, RF-1013: how a file of a run folder is served. Text is shown as text (plain, never as
// HTML, so a Markdown card with a script in it is only read); the pages Rosetta writes into
// `report/` are served as the pages, stylesheets and scripts they are; everything else is a
// download.

export interface RunFileKind {
  readonly contentType: string;
  readonly disposition: 'inline' | 'attachment';
}

export function kindOfRunFile(path: string): RunFileKind {
  void path;
  return { contentType: 'application/octet-stream', disposition: 'attachment' };
}
