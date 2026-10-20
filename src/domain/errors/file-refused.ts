import type { ErrorCode } from './codes.js';
import { FieldProblemsError } from './field-problems.js';

// RF-150, RF-158: a refusal that names the file it is about. The page shows the file beside the code,
// the catalogue's plain message and its next step, as it shows the field of any other refusal.

export class FileRefusedError extends FieldProblemsError {
  readonly file: string;

  constructor(code: ErrorCode, file: string, options?: ErrorOptions) {
    super(code, [{ field: file, code }], options);
    this.file = file;
  }
}
