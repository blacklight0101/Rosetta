import type { ManifestSource } from '../../domain/runs/manifest-source.js';
import type { ResolvedSource } from '../ports/run-executor.js';

// RF-156, RF-126: what a run on Excel workbooks takes over from the source of the scan it reads.

/** The facts a workbook source adds to a resolved source; nothing for a zip or a GitHub source. */
export function workbookFactsOf(
  source: Pick<ManifestSource, 'workbooks' | 'rendererVersion' | 'uploadedAt'>,
): Pick<ResolvedSource, 'workbooks' | 'rendererVersion' | 'uploadedAt'> {
  return source.workbooks === undefined ? {} : { workbooks: source.workbooks };
}
