import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-128, RF-150, RF-010 (P8-134): the one rule for a project name the user types, when a zip or a
// workbook project is created and when any project is renamed: the spaces around it are removed,
// and an empty name, one longer than 200 characters or one with a control character is refused
// with RST-2000.

const MAX_NAME = 200;
// eslint-disable-next-line no-control-regex -- a control character in a name is what is refused
const CONTROL = /[\u0000-\u001f\u007f]/u;

/** The name to store, or RST-2000 when the typed name breaks the rule. */
export function parseProjectName(typed: string): Result<string, typeof ERROR_CODES.requestInvalid> {
  const name = typed.trim();
  if (name === '' || name.length > MAX_NAME || CONTROL.test(name)) {
    return err(ERROR_CODES.requestInvalid);
  }
  return ok(name);
}
