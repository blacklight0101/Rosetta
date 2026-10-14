// FAKE SECRETS ONLY (RNF-003). The `--token` shapes added by P1-154 (RF-141, RF-408), built at run
// time from harmless pieces like those of secret-fixture.ts, which joins them to its cases, innocent
// texts and hostile pieces: a shell line continuation after the scheme word, a value that starts
// with a dash, and a quoted value after a word that starts with a scheme word.

import type { SecretKind } from '../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from './fake-value.js';

interface ShapeCase {
  readonly name: string;
  readonly kind: SecretKind;
  readonly text: string;
  readonly masked: string;
  readonly secrets: readonly string[];
}

const token = `Tk${fakeValue(20)}`;
const shortToken = `Tk${fakeValue(8)}`;
const tokenOption = ['-', '-', 'token'].join('');
const backslash = String.fromCharCode(92);
const caret = '^';
const backtick = String.fromCharCode(96);

/** The line continuation of a shell: its mark at the end of the line, then the next line, indented. */
const continued = (mark: string, lineBreak: string): string => `${mark}${lineBreak}    `;

/** One case per shape of P1-154, in the order of the card. */
export const continuationSecretCases: readonly ShapeCase[] = [
  {
    name: 'a --token value on the line after a backslash continuation',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer ${continued(backslash, '\n')}${token} --verbose`,
    masked: `tool ${tokenOption} Bearer ${continued(backslash, '\n')}[MASKED:bearer-token] --verbose`,
    secrets: [token],
  },
  {
    name: 'a --token value on the line after a caret continuation with CRLF',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer ${continued(caret, '\r\n')}${token}`,
    masked: `tool ${tokenOption} Bearer ${continued(caret, '\r\n')}[MASKED:bearer-token]`,
    secrets: [token],
  },
  {
    name: 'a --token value on the line after a backtick continuation',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer${continued(backtick, '\n')}${shortToken}`,
    masked: `tool ${tokenOption} Bearer${continued(backtick, '\n')}[MASKED:bearer-token]`,
    secrets: [shortToken],
  },
  {
    name: 'a --token value on the line after a continuation that follows a repeated scheme word',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer Bearer ${continued(backslash, '\n')}${token}`,
    masked: `tool ${tokenOption} Bearer Bearer ${continued(backslash, '\n')}[MASKED:bearer-token]`,
    secrets: [token],
  },
  {
    name: 'a --token value that starts with a dash after the scheme word',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer -${shortToken} --verbose`,
    masked: `tool ${tokenOption} Bearer [MASKED:bearer-token] --verbose`,
    secrets: [shortToken],
  },
  {
    name: 'a --token value that starts with a dash after a continuation',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer ${continued(backslash, '\n')}-${token}`,
    masked: `tool ${tokenOption} Bearer ${continued(backslash, '\n')}[MASKED:bearer-token]`,
    secrets: [token],
  },
  {
    name: 'a --token double-quoted value after a word that starts with a scheme word and a dash',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer-x "${token} ${shortToken}" --verbose`,
    masked: `tool ${tokenOption} [MASKED:bearer-token] --verbose`,
    secrets: ['Bearer-x', token, shortToken],
  },
  {
    name: 'a --token single-quoted value after a word that starts with a scheme word',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearerx '${shortToken}'`,
    masked: `tool ${tokenOption} [MASKED:bearer-token]`,
    secrets: ['Bearerx', shortToken],
  },
  {
    name: 'a --token value on the line after a continuation that follows a word with a scheme prefix',
    kind: 'bearer-token',
    text: `tool ${tokenOption} Bearer-x ${continued(backslash, '\n')}${token}`,
    masked: `tool ${tokenOption} [MASKED:bearer-token]\n`,
    secrets: ['Bearer-x', token],
  },
];

/** Text close to the new shapes that is not a secret. */
export const continuationInnocentTexts: readonly string[] = [
  `tool ${tokenOption}-file ${continued(backslash, '\n')}token.txt`,
];

/** Hostile pieces for the new patterns (RF-141 linear time), built from pieces like the cases. */
export const continuationAdversarialPieces: readonly string[] = [
  `${tokenOption} Bearer ${backslash}\n`,
  `${tokenOption} Bearer ${caret}\r\n`,
  `${tokenOption} Bearer ${backtick}  \n  `,
  `${tokenOption} Bearer ${backslash}\n${backslash}\n`,
  `${tokenOption} Bearer -`,
  `${tokenOption} Bearer-x "`,
  `${tokenOption} Bearer-x ${backslash}\n`,
];
