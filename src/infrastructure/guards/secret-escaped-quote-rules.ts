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
const close = String.raw`${escaped}\k<q>`;
const valueChar = String.raw`(?:(?!${close})[^\r\n])`;

// What is never a secret as a whole value: a switch, or a placeholder (`<password>`, `{token}`,
// `${PASSWORD}`, `$PASSWORD`, `xxxx`).
const word = String.raw`[A-Za-z][A-Za-z_-]{0,29}`;
const notSecret = String.raw`(?:${nonSecretWord}|<${word}>|\{${word}\}|\[${word}\]|\$\{?[A-Z][A-Z0-9_]{0,40}\}?|[Xx]{4,})`;
const number = String.raw`\d+(?:\.\d+)?`;

const keyEnd = String.raw`(?:${escaped}["'])?["']?[ \t]{0,16}(?::=|[:=])[ \t]{0,16}${escaped}(?<q>["'])`;

function escapedRule(kind: SettingRule['kind'], name: string, password: boolean): SettingRule {
  // A `password` name masks any value, as the plain form does. Under any other name the value needs a
  // digit or a symbol and is not code,
  // as for the rules of a short value, so a word such as `string` stays.
  const skip = password ? '(?!)' : `${notSecret}|${number}`;
  const shape = password
    ? ''
    : String.raw`(?=${valueChar}{0,256}?[0-9+=!@#%^*~])(?!${valueChar}{0,256}?[()\[\]{}>$])`;
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
  escapedRule('password', passwordName, true),
  escapedRule('password', secretName, false),
  escapedRule('api-key', apiKeyName, false),
  escapedRule('bearer-token', tokenWords, false),
];
