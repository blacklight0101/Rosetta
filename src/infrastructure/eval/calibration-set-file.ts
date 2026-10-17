import { createHash } from 'node:crypto';
import {
  parseCalibrationSet,
  type CalibrationSet,
} from '../../application/eval/calibration-set-schema.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { jsonOf, readEvalFile } from './golden-set-file.js';

// RF-305, DEC-57: the calibration set is a JSON file under the `eval/` folder of the Rosetta
// repository, read like the golden set: a relative `.json` path resolved inside the folder (links
// followed), at most 1 MiB. Its SHA-256 is taken over its bytes, so the results name the exact file.

export interface LoadedCalibrationSet {
  readonly set: CalibrationSet;
  readonly sha256: string;
}

// RF-305
export async function loadCalibrationSet(
  folder: string,
  reference: string,
): Promise<Result<LoadedCalibrationSet, string>> {
  const bytes = await readEvalFile(folder, reference);
  if (!bytes.ok) return bytes;
  const data = jsonOf(bytes.value, reference);
  if (!data.ok) return data;
  const set = parseCalibrationSet(data.value);
  if (!set.ok) return err(`The calibration set ${reference} is invalid: ${set.error.join('; ')}`);
  const sha256 = createHash('sha256').update(bytes.value).digest('hex');
  return ok({ set: set.value, sha256 });
}
