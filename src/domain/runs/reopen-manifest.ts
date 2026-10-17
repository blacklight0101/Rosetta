import { err, ok, type Result } from '../errors/result.js';
import type { ManifestCaps, RunManifest } from './run-manifest.js';

/**
 * RF-006: the manifest of a resumed run: not started and not ended again, with the caps now in
 * force; everything the run recorded so far stays.
 */
// RF-006
export function reopenManifest(
  manifest: RunManifest,
  caps: ManifestCaps,
): Result<RunManifest, 'not-ended'> {
  if (manifest.endState === null) return err('not-ended');
  return ok({ ...manifest, startedAt: null, endedAt: null, endState: null, caps });
}
