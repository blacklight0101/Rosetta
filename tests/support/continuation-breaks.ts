// FAKE SECRETS ONLY (RNF-003). Shell line continuations written with every line terminator the
// masker must read (P2-42): LF, CRLF, a lone CR, U+2028 and U+2029; the option names are built at
// run time from harmless pieces.

import { fakeValue } from './fake-value.js';

export const passwordOption = ['-', '-', 'password'].join('');
export const tokenOption = ['-', '-', 'token'].join('');
export const backslash = String.fromCharCode(92);
export const fakePassword = `Pw${fakeValue(10)}`;
export const fakeToken = `Tk${fakeValue(20)}`;

export const lineTerminators = [
  { name: 'LF', value: '\n' },
  { name: 'CRLF', value: '\r\n' },
  { name: 'a lone CR', value: '\r' },
  { name: 'U+2028', value: '\u2028' },
  { name: 'U+2029', value: '\u2029' },
] as const;
