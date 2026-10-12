import { codePointLength } from './code-points.js';
import { ERROR_CODES } from '../errors/codes.js';
import { err, ok, type Result } from '../errors/result.js';

// RF-1103, ADR-015: a new password has at least 12 characters, does not contain the user name and
// is not on the list of the 10,000 most common passwords. The list is loaded by infrastructure
// and handed in; its entries are in lower case, so the check ignores case.

const MIN_PASSWORD_LENGTH = 12;

/** The common-passwords list: `has` receives the candidate in lower case. */
export interface CommonPasswordList {
  has(lowerCasePassword: string): boolean;
}

export type PasswordProblem =
  | typeof ERROR_CODES.passwordTooShort
  | typeof ERROR_CODES.passwordTooCommon
  | typeof ERROR_CODES.passwordContainsUserName;

/** The password when it meets every rule, otherwise the first rule it breaks. */
// RF-1103
export function checkNewPassword(
  password: string,
  userName: string,
  commonPasswords: CommonPasswordList,
): Result<string, PasswordProblem> {
  if (codePointLength(password) < MIN_PASSWORD_LENGTH) return err(ERROR_CODES.passwordTooShort);
  const lower = password.toLowerCase();
  if (lower.includes(userName.toLowerCase())) return err(ERROR_CODES.passwordContainsUserName);
  if (commonPasswords.has(lower)) return err(ERROR_CODES.passwordTooCommon);
  return ok(password);
}
