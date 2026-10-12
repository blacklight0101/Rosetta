import { codePointLength } from './code-points.js';
import { ERROR_CODES } from '../errors/codes.js';
import { err, ok, type Result } from '../errors/result.js';

// RF-1102, data-model.md section 4: user names have 3..40 characters [a-z0-9._-] and are unique
// case-insensitively, so a name is kept in lower case; display names have 1..80 characters.

const USER_NAME = /^[a-z0-9._-]{3,40}$/;
const DISPLAY_NAME_MAX = 80;

export type UserNameProblem = typeof ERROR_CODES.userNameInvalid;
export type DisplayNameProblem = typeof ERROR_CODES.displayNameInvalid;

/** The user name trimmed and in lower case, or RST-2206. */
// RF-1102
export function parseUserName(input: string): Result<string, UserNameProblem> {
  const name = input.trim().toLowerCase();
  return USER_NAME.test(name) ? ok(name) : err(ERROR_CODES.userNameInvalid);
}

/** The display name trimmed, 1..80 characters (code points, as `char_length`), or RST-2207. */
// RF-1102
export function parseDisplayName(input: string): Result<string, DisplayNameProblem> {
  const name = input.trim();
  const length = codePointLength(name);
  return length >= 1 && length <= DISPLAY_NAME_MAX ? ok(name) : err(ERROR_CODES.displayNameInvalid);
}
