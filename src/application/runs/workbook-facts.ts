import type { ManifestSource } from '../../domain/runs/manifest-source.js';
import type { ResolvedSource } from '../ports/run-executor.js';

// RF-156, RF-126: what a run on Excel workbooks takes over from the source of the scan it reads, so
// the header of its report and package names the workbooks, the upload instant and the renderer.

/** The facts a workbook source adds to a resolved source; nothing for a zip or a GitHub source. */
// RF-156
export function workbookFactsOf(
  source: Pick<ManifestSource, 'workbooks' | 'rendererVersion' | 'uploadedAt'>,
): Pick<ResolvedSource, 'workbooks' | 'rendererVersion' | 'uploadedAt'> {
  const { workbooks, rendererVersion, uploadedAt } = source;
  if (workbooks === undefined) return {};
  return {
    workbooks,
    ...(rendererVersion === undefined ? {} : { rendererVersion }),
    ...(uploadedAt === undefined ? {} : { uploadedAt }),
  };
}
