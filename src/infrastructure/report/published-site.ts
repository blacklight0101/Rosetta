// Stub: the behaviour is written in the next commit (test first, ADR-010).
export type ReportSiteAssets = Readonly<Record<'report.css' | 'replay.js', string>>;

export type IndexCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export function buildSiteFiles(...args: unknown[]): Readonly<Record<string, string>> {
  throw new Error(`not implemented (${String(args.length)} arguments)`);
}

export function checkPublishedIndex(...args: unknown[]): IndexCheck {
  throw new Error(`not implemented (${String(args.length)} arguments)`);
}
