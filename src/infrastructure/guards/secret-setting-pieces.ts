import { caseless } from './secret-value-pieces.js';

// P3-116 (RF-141): the pieces the key/value setting rules share.

export interface SettingRule {
  readonly kind: 'api-key' | 'bearer-token' | 'password';
  readonly pattern: RegExp;
}

// The last word of a key may follow a delimiter in any case (`smtp_pass`, `x-token`) or start with a
// capital after a letter or digit (`MailPass`, `AuthToken`); `Compass` and `Bypass` do not end in a
// word `pass`.
export const wordEnd = (lower: string, capitalised: string): string =>
  String.raw`(?:(?<![A-Za-z0-9])${caseless(lower)}|(?<=[A-Za-z0-9])${capitalised})`;
export const tokenWords = wordEnd('token', 'Token');
export const secretWords = wordEnd('secret', 'Secret');
export const apiKeyWords = String.raw`${caseless('api')}[_-]?${caseless('key')}`;

// Text rendered into HTML holds `&lt;`, `&gt;` and `&quot;` for `<`, `>` and `"`.
export const lt = String.raw`(?:<|&lt;)`;
export const inside = String.raw`(?:(?!&gt;)[^<>])`;

/** A word that is a switch, never a secret: a setting such as `EnableToken` holds `true`. */
export const nonSecretWord = ['true', 'false', 'yes', 'no', 'on', 'off', 'null', 'none']
  .map((word) => caseless(word))
  .join('|');
