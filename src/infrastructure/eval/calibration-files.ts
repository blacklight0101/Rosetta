import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseCalibrationResults,
  type CalibrationOutput,
  type CalibrationResults,
} from '../../application/eval/calibration-results.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-305, RNF-015, RNF-003, data-model.md section 3.19: writes `calibration.json` into a new folder
// `eval-out/<id>/` of the Rosetta repository (git-ignored), never into a user's project. The folder
// must not exist yet, so a calibration never overwrites another. The file is checked against its
// schema before it is written and masked like every file Rosetta writes, because the disagreements
// hold the verifier's reasons, which are model output.

const folderName = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/u;

export interface FileCalibrationOutputOptions {
  /** The `eval-out/` folder. */
  readonly outputDir: string;
  readonly masker: TextMasker;
}

function refused(message: string): RosettaError {
  return new RosettaError(ERROR_CODES.unexpected, message);
}

// RF-305
export class FileCalibrationOutput implements CalibrationOutput {
  private readonly options: FileCalibrationOutputOptions;

  constructor(options: FileCalibrationOutputOptions) {
    this.options = options;
  }

  async write(results: CalibrationResults): Promise<string> {
    if (!folderName.test(results.id)) throw refused(`${results.id} is not a calibration id.`);
    const parsed = parseCalibrationResults(results);
    if (!parsed.ok) throw refused(`calibration.json: ${parsed.error.join('; ')}`);
    await mkdir(this.options.outputDir, { recursive: true });
    const folder = join(this.options.outputDir, results.id);
    await mkdir(folder);
    const text = `${JSON.stringify(parsed.value, null, 2)}\n`;
    await writeFile(join(folder, 'calibration.json'), this.options.masker.mask(text).text, {
      flag: 'wx',
    });
    return folder;
  }
}
