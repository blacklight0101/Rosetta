// Stub: the behaviour is written in the next commit (test first, ADR-010).
export type IndexCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export function checkPublishedIndex(...args: unknown[]): IndexCheck {
  throw new Error(`not implemented (${String(args.length)} arguments)`);
}
