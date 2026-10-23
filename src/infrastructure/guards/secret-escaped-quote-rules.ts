import {
  apiKeyWords,
  nonSecretWord,
  type SettingRule,
  tokenWords,
} from './secret-setting-pieces.js';
import { caseless, notMasked } from './secret-value-pieces.js';

// P3-128 (RF-141, RNF-003): a setting whose value sits between backslash-escaped quotes, as raw text
// quoted from a JSON string or a YAML double-quoted string (`Password=\"FAKE-pw\" and \"x\"`). The
// rules that read a plain or JSON-quoted value take the backslash for the value and stop, which left
// the secret in the text. Here the value starts after the escaped quote and runs to the matching
// escaped quote on the same line, and only that is masked: the backslashes and quotes stay.
//
// The escape is one to four backslashes (`\"` raw, `\\\"` after a second round of escaping), at most
// four so the check at each position of the value reads a bounded run, never the rest of a long run
// of backslashes (RF-141 time budget). A rule is anchored on its key word, and the value is read once.

const escaped = String.raw`\\{1,4}`;
// The value ends at an escaped quote of the same kind with the same number of backslashes as the one
// that opened it, and not inside a longer run, so a deeper-escaped quote in the value (`\\\"inner`)
// does not end it and the tail is not left visible.
const close = String.raw`(?<!\\)\k<e>\k<q>`;
const valueChar = String.raw`(?:(?!${close})[^\r\n])`;

// What is never a secret as a whole value: a switch, a placeholder (`<password>`, `{token}`,
// `${PASSWORD}`, `$PASSWORD`, `xxxx`), a constant (`YOUR_API_KEY`) or a name under a known root of
// the configuration (`config.secret`, `process.env.KEY`).
const word = String.raw`[A-Za-z][A-Za-z_-]{0,29}`;
const knownRoot = String.raw`(?:process\.env|import\.meta\.env|os\.environ|env|config|settings|options|opts|props|args|params|vars|secrets|this|self)\.[A-Za-z_]\w{0,63}`;
const notSecret = String.raw`(?:${nonSecretWord}|<${word}>|\{${word}\}|\[${word}\]|\$\{?[A-Z][A-Z0-9_]{0,40}\}?|[Xx]{4,}|[A-Z]+(?:_[A-Z]+)+|${knownRoot})`;
const number = String.raw`\d+(?:\.\d+)?`;
const code = String.raw`(?!${valueChar}{0,256}?[()\[\]{}>$])`;

const keyEnd = String.raw`(?:${escaped}["'])?["']?[ \t]{0,16}(?::=|[:=])[ \t]{0,16}(?<e>${escaped})(?<q>["'])`;

// How much of P3-116 precision a name applies to its value:
//  - `any`: a password name masks any value, as the plain form does;
//  - `named`: an API key or secret name masks a value that is not a switch, number, placeholder,
//    constant or code, with or without a digit, as the plain form does;
//  - `strict`: a token name also needs a digit or a symbol (a word such as `string` is a type).
type Precision = 'any' | 'named' | 'strict';

function escapedRule(kind: SettingRule['kind'], name: string, precision: Precision): SettingRule {
  const skip = precision === 'any' ? '(?!)' : `${notSecret}|${number}`;
  const shape =
    precision === 'any'
      ? ''
      : precision === 'named'
        ? code
        : `(?=${valueChar}{0,256}?[0-9+=!@#%^*~])${code}`;
  return {
    kind,
    pattern: new RegExp(
      String.raw`(?<keep>${name}${keyEnd})${notMasked}(?!(?:${skip})${close})${shape}${valueChar}+(?=${close})`,
      'g',
    ),
  };
}

const passwordName = String.raw`(?:${caseless('password')}|${caseless('passwd')}|${caseless('pwd')})`;
const secretName = String.raw`(?:(?<![A-Za-z0-9])${caseless('secret')}|(?<=[A-Za-z0-9])Secret)`;
const apiKeyName = String.raw`(?:(?<![A-Za-z0-9])${apiKeyWords}|(?<=[A-Za-z0-9])Api[_-]?Key)`;

export const escapedQuoteRules: readonly SettingRule[] = [
  escapedRule('password', passwordName, 'any'),
  escapedRule('password', secretName, 'named'),
  escapedRule('api-key', apiKeyName, 'named'),
  escapedRule('bearer-token', tokenWords, 'strict'),
];
