import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EvaluationFiles, EvaluationOutput } from '../../application/eval/evaluation-ports.js';
import { parseExperiment, parseResults } from '../../application/eval/evaluation-schema.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RNF-015, data-model.md section 3.19, RNF-003: writes `experiment.json` and `results.json` into a
// new folder `eval-out/<id>/` of the Rosetta repository (git-ignored), never into a user's project.
// The folder must not exist yet, so an evaluation never overwrites another. Each file is checked
// against its schema before it is written and masked like every file Rosetta writes, because the
// results hold claim ids and finding ids that came through model output.

const folderName = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/u;

export interface FileEvaluationOutputOptions {
  /** The `eval-out/` folder. */
  readonly outputDir: string;
  readonly masker: TextMasker;
}

function refused(message: string): RosettaError {
  return new RosettaError(ERROR_CODES.unexpected, message);
}

// RNF-015
export class FileEvaluationOutput implements EvaluationOutput {
  private readonly options: FileEvaluationOutputOptions;

  constructor(options: FileEvaluationOutputOptions) {
    this.options = options;
  }

  async write(files: EvaluationFiles): Promise<string> {
    // P2-11 red step: removed by the feat commit.
    if (files.folder !== '') return '';
    if (!folderName.test(files.folder)) throw refused(`${files.folder} is not an evaluation id.`);
    const experiment = parseExperiment(files.experiment);
    const results = parseResults(files.results);
    if (!experiment.ok) throw refused(`experiment.json: ${experiment.error.join('; ')}`);
    if (!results.ok) throw refused(`results.json: ${results.error.join('; ')}`);
    await mkdir(this.options.outputDir, { recursive: true });
    const folder = join(this.options.outputDir, files.folder);
    await mkdir(folder);
    await this.writeJson(join(folder, 'experiment.json'), experiment.value);
    await this.writeJson(join(folder, 'results.json'), results.value);
    return folder;
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(path, this.options.masker.mask(text).text, { flag: 'wx' });
  }
}
