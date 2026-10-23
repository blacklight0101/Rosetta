import {
  apiKeyWords,
  inside,
  lt,
  nonSecretWord,
  secretWords,
  type SettingRule,
  tokenWords,
} from './secret-setting-pieces.js';
import { caseless, identifierValue, notMasked, placeholderValue } from './secret-value-pieces.js';

// P3-116 (RF-141, RNF-003): two more forms of a setting whose key names a secret. The anchors and
// the bounded repeats follow secret-setting-rules.ts, so no rule rescans the input from every position.

const number = String.raw`\d+(?:\.\d+)?`;

// An element named after the secret (`<ApiToken>x</ApiToken>`, `<Vendor.ApiKey type="text">x</...>`),
// like the `<Password>` element the first rules mask: the value runs to the closing tag on the same
// line, so a `<token>` placeholder in prose is left alone. Switches and numbers are not secrets.
const elementRule = (kind: SettingRule['kind'], words: string): SettingRule => ({
  kind,
  pattern: new RegExp(
    String.raw`(?<keep>${lt}[\w.:-]{0,32}?${words}(?:[ \t]${inside}{0,256})?(?:>|&gt;)[ \t]{0,16})${notMasked}(?!(?:${nonSecretWord}|${number})${lt})(?!${placeholderValue})[^<\s&](?:(?!&lt;/)[^<\r\n])*(?=${lt}/)`,
    'g',
  ),
});

export const elementRules: readonly SettingRule[] = [
  elementRule('bearer-token', tokenWords),
  elementRule('password', secretWords),
  elementRule('api-key', apiKeyWords),
];

// A short value under a key that names its secret outright (`api_token`, `AppSecret`, `apiToken`,
// `client_secret`): a word in front of `token`, `secret` or `api key`, so the 8-character minimum of
// the bare keys (`token`, `secret`) does not apply. The value still needs a digit or a symbol (a
// word such as `string` is a type), is not code, a switch, a number, a placeholder, a path or a URL,
// and ends at a blank, a quote, a delimiter or a raw `<`.
const assign = String.raw`["']?[ \t]{0,16}(?::=|[:=])[ \t]{0,16}["']?`;
const chars = String.raw`[^\s"',;&<]`;
const shortValue = String.raw`${notMasked}(?![="'])(?!${placeholderValue}|${identifierValue}|[/.~]|https?:|[A-Za-z]:\\)(?!(?:${nonSecretWord}|${number})(?!${chars}))(?!${chars}{0,256}?[()\[\]{}>$])(?=${chars}{0,256}?[0-9+=!@#%^*~])${chars}+`;
const explicit = (word: string, capitalised: string): string =>
  String.raw`(?:(?<=[A-Za-z0-9][_.-])${caseless(word)}|(?<=[A-Za-z0-9])${capitalised})`;
const explicitRule = (kind: SettingRule['kind'], name: string): SettingRule => ({
  kind,
  pattern: new RegExp(String.raw`(?<keep>${name}${assign})${shortValue}`, 'g'),
});

export const explicitRules: readonly SettingRule[] = [
  explicitRule('bearer-token', explicit('token', 'Token')),
  explicitRule('password', explicit('secret', 'Secret')),
  explicitRule(
    'api-key',
    // P5-19: also the bare name (`api_key`, `API_KEY`, `apiKey`), not preceded by a letter or digit.
    String.raw`(?:(?<![A-Za-z0-9])${apiKeyWords}|(?<=[A-Za-z0-9])Api[_-]?Key)`,
  ),
];
