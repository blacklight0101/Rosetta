// FAKE KEY PIECES ONLY (RNF-003): built at run time from harmless pieces, like secret-fixture.ts.

const pemBegin = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const pemEnd = ['-----END', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const pkcs8Begin = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
const pkcs8End = ['-----END', 'PRIVATE', 'KEY-----'].join(' ');

export interface SplitKeyCase {
  readonly name: string;
  /** What each read returned, in order: one read can end in the middle of a key block. */
  readonly pieces: readonly string[];
  /** The fake key lines that must never appear after masking. */
  readonly secrets: readonly string[];
}

/** Distinct fake key lines, so a test can tell which piece leaked. */
const splitLines = ['Ka', 'Kb', 'Kc', 'Kd'].map(
  (tag) => `${tag}${'FAKE0'.repeat(13).slice(0, 62)}`,
);
const [splitA = '', splitB = '', splitC = '', splitD = ''] = splitLines;

/** A string literal with an escaped line break, as source code writes one line of a key. */
const quoted = (line: string, quote = '"'): string => `${quote}${line}\\n${quote}`;

/** RF-141: keys written as string literals in source code, read in pieces. */
const literalCases: readonly SplitKeyCase[] = [
  {
    name: 'a C# key of concatenated literals read in two pieces',
    pieces: [
      [`var key = ${quoted(pkcs8Begin)} +`, `    ${quoted(splitA)} +`].join('\n'),
      [`    ${quoted(splitB)} +`, `    ${quoted(splitC)} +`, `    "${pkcs8End}";`].join('\n'),
    ],
    secrets: [splitA, splitB, splitC],
  },
  {
    name: 'a Java key joined with String.join read in two pieces',
    pieces: [
      ['String key = String.join("\\n",', `    "${pemBegin}",`, `    "${splitA}",`].join('\n'),
      [`    "${splitB}",`, `    "${splitC}",`, `    "${pemEnd}");`].join('\n'),
    ],
    secrets: [splitA, splitB, splitC],
  },
  {
    name: 'a Java key with leading + read in three pieces',
    pieces: [
      [`String key = ${quoted(pemBegin)}`, `    + ${quoted(splitA)}`].join('\n'),
      [`    + ${quoted(splitB)}`, `    + ${quoted(splitC)}`].join('\n'),
      [`    + ${quoted(splitD)}`, `    + "${pemEnd}";`].join('\n'),
    ],
    secrets: splitLines,
  },
  {
    name: 'a JavaScript key of concatenated literals read in three pieces',
    pieces: [
      [`const key = ${quoted(pkcs8Begin, "'")} +`, `  ${quoted(splitA, "'")} +`].join('\n'),
      [`  ${quoted(splitB, "'")} +`, `  ${quoted(splitC, "'")} +`].join('\n'),
      [`  ${quoted(splitD, "'")} +`, `  '${pkcs8End}';`].join('\n'),
    ],
    secrets: splitLines,
  },
  {
    name: 'a JavaScript key in a template literal read in two pieces',
    pieces: [
      [`const key = \`${pkcs8Begin}`, splitA, splitB].join('\n'),
      [splitC, `${pkcs8End}\`;`].join('\n'),
    ],
    secrets: [splitA, splitB, splitC],
  },
  {
    name: 'a Python key of implicitly concatenated literals read in two pieces',
    pieces: [
      [
        'KEY = (',
        `    ${quoted(pemBegin)}`,
        `    ${quoted(splitA)}`,
        `    b${quoted(splitB)}`,
      ].join('\n'),
      [`    ${quoted(splitC)}`, `    ${quoted(splitD)}`, `    ${quoted(pemEnd)}`, ')'].join('\n'),
    ],
    secrets: splitLines,
  },
];

/** RF-141: private keys read in pieces (a paged read_file, RF-144), so no piece holds the whole block. */
export const splitKeyCases: readonly SplitKeyCase[] = [
  {
    name: 'a key read in two pieces',
    pieces: [['config', pemBegin, splitA].join('\n'), [splitB, splitC, pemEnd, 'after'].join('\n')],
    secrets: [splitA, splitB, splitC],
  },
  {
    name: 'a key read in three pieces',
    pieces: [
      [pkcs8Begin, splitA].join('\n'),
      [splitB, splitC].join('\n'),
      [splitD, pkcs8End].join('\n'),
    ],
    secrets: splitLines,
  },
  {
    name: 'a key read in two pieces with CRLF line breaks',
    pieces: [[pemBegin, splitA, splitB].join('\r\n'), [splitC, splitD, pemEnd, ''].join('\r\n')],
    secrets: splitLines,
  },
  {
    name: 'the tail of a key read without its BEGIN line',
    pieces: [[splitB, splitC, pkcs8End, 'next line'].join('\n')],
    secrets: [splitB, splitC],
  },
  {
    name: 'the indented tail of a key in YAML',
    pieces: [
      ['key: |', `  ${pemBegin}`, `  ${splitA}`].join('\n'),
      [`  ${splitB}`, `  ${pemEnd}`].join('\n'),
    ],
    secrets: [splitA, splitB],
  },
  ...literalCases,
];
