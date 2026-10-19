import type { SourceKind } from '../sources/source-kind.js';

// Data-model.md section 3.6, RF-126, RF-130, RF-131, RF-152: the `source` of a run manifest, what the run
// analysed. A GitHub run names the repository and the commit; an upload run adds `kind: upload`, leaves
// the repository fields empty and names the zip and the instant it was uploaded; a workbook run adds `kind: workbook`, the instant and the
// renderer version, with no zip name. A field that is not
// known yet is `null`.

export interface ManifestSource {
  readonly kind?: SourceKind | undefined; // RF-130, RF-152: an upload or workbook run only; absent is github
  readonly url: string;
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
  readonly commitSha: string | null;
  readonly subpath: string;
  readonly snapshotHash: string | null;
  readonly fileName?: string | undefined; // RF-131: an upload run only; the zip as sent
  readonly uploadedAt?: string | undefined; // RF-131, RF-152: an upload or workbook run only; ISO 8601, UTC
  readonly rendererVersion?: string | undefined; // RF-152: a workbook run only; the renderer that wrote the tree
}
