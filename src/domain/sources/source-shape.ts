import type { SourceKind } from './source-kind.js';

// RF-130, RF-152, RFC-004 section 4.1: what a project's address fields hold, per kind. A GitHub
// project has the normalised address and its optional ref and subpath; an upload and a workbook
// project have none of the three, because the whole archive or the whole set of workbooks is the
// project. The `projects` table enforces the same rule (migrations 0014 and 0016).

/** True when `source` is a possible address, ref and subpath for a project of `kind`. */
export function hasValidSourceShape(
  kind: SourceKind,
  source: { readonly sourceUrl: string; readonly ref: string; readonly subpath: string },
): boolean {
  if (kind === 'github') return true;
  return source.sourceUrl === '' && source.ref === '' && source.subpath === '';
}
