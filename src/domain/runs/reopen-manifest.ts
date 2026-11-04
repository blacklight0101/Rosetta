import { err, ok, type Result } from '../errors/result.js';
import type { ManifestCaps, RunManifest } from './run-manifest.js';

/**
 * RF-006: the manifest of a resumed run: not ended again, with the caps now in force; everything
 * the run recorded so far stays, its first start included (P8-88).
 */
// RF-006
export function reopenManifest(
  manifest: RunManifest,
  caps: ManifestCaps,
): Result<RunManifest, 'not-ended'> {
  if (manifest.endState === null) return err('not-ended');
  return ok({ ...manifest, endedAt: null, endState: null, caps });
}
