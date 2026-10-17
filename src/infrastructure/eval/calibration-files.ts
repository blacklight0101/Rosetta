import type {
  CalibrationOutput,
  CalibrationResults,
} from '../../application/eval/calibration-results.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-305, data-model.md section 3.19: stub, filled in by the next commit.

export interface FileCalibrationOutputOptions {
  /** The `eval-out/` folder. */
  readonly outputDir: string;
  readonly masker: TextMasker;
}

export class FileCalibrationOutput implements CalibrationOutput {
  private readonly options: FileCalibrationOutputOptions;

  constructor(options: FileCalibrationOutputOptions) {
    this.options = options;
  }

  write(results: CalibrationResults): Promise<string> {
    return Promise.resolve(`${this.options.outputDir}${results.id.slice(0, 0)}`);
  }
}
