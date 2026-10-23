import { elementRules, explicitRules } from './secret-setting-forms.js';
import { caseless, notMasked, placeholderValue } from './secret-value-pieces.js';
import {
  inside,
  lt,
  type SettingRule,
  wordEnd,
  apiKeyWords,
  nonSecretWord,
} from './secret-setting-pieces.js';

// P3-116 (RF-141, RNF-003): the value of a key/value setting whose key names a secret, in the XML
// forms of .NET configuration: `<add key="SmtpPassword" value="..."/>`, the same with `name=` or with
// `value=` first, with blanks around `=` or none between the attributes, in any case of the attribute
// names, quotes escaped inside a JSON string (`\"`) or written as entities in HTML (`&quot;`, with
// `&lt;` and `&gt;`), and a `<setting name="...">` whose `<value>` element holds the secret. The key
// decides the kind: a token, an API key or a password. A boolean is never a secret, and a number is
// not one under a token, secret, pass or API key name. Every rule is anchored on `<` and its repeats
// are bounded, so none rescans the input from every position (RF-141 time budget).

const strictPasswordWords = String.raw`(?:${caseless('password')}|${caseless('passwd')}|${caseless('pwd')})`;
const weakPasswordWords = String.raw`(?:${wordEnd('pass', 'Pass')}|${wordEnd('secret', 'Secret')}(?:[_-]?${caseless('key')})?)`;
const plainKeyWords = caseless('key');

const eq = String.raw`[ \t]{0,8}=[ \t]{0,8}`;
const open = String.raw`${lt}[A-Za-z][\w:.-]{0,31}[ \t\r\n](?:${inside}{0,96}?[ \t\r\n])??`;
const gap = String.raw`(?:${inside}{0,96}?[ \t\r\n])?`;
const quote = String.raw`(?<quote>\\?["']|&quot;|&#0*39;|&#x27;|&apos;)`;
const nameAttr = (words: string, q: string = quote): string =>
  String.raw`(?:${caseless('key')}|${caseless('name')})${eq}${q}[\w.:-]{0,64}?${words}\k<quote>`;
const valueAttr = String.raw`${caseless('value')}${eq}`;
const valueText = String.raw`(?:(?!\k<quote>)[^<>\r\n])+`;
// A plain `Key` setting is a secret only when its value looks like one: 8 or more characters with a
// digit or a symbol, no brackets, `$` or `<>`, not a placeholder, a path or a URL.
const chars = String.raw`[^\s"',;&\\<>]`;
const strongValue = String.raw`(?=${chars}{8})(?!${placeholderValue}|[/.~]|https?:|[A-Za-z]:\\)(?!${chars}{0,256}?[()\[\]{}$])(?=${chars}{0,256}?[0-9+=!@#%^*~])${chars}+(?=\k<quote>)`;
const valueElement = String.raw`${lt}value(?:>|&gt;)`;
const elementText = String.raw`(?:(?!&lt;/)[^<\r\n])*`;
const number = String.raw`\d+(?:\.\d+)?`;

interface Group {
  readonly kind: SettingRule['kind'];
  readonly words: string;
  readonly strong: boolean;
  /** A number is a possible value (a password), not a count or a lifetime. */
  readonly numbers: boolean;
}

function rulesFor({ kind, words, strong, numbers }: Group): SettingRule[] {
  const skip = String.raw`(?!(?:${nonSecretWord}${numbers ? '' : `|${number}`})\k<quote>)`;
  const value = `${skip}${strong ? strongValue : valueText}`;
  const name = nameAttr(words);
  const rules: SettingRule[] = [
    {
      kind,
      pattern: new RegExp(
        String.raw`(?<keep>${open}${name}${gap}${valueAttr}\k<quote>)${notMasked}${value}`,
        'g',
      ),
    },
    {
      kind,
      pattern: new RegExp(
        String.raw`(?<keep>${open}${valueAttr}${quote})${notMasked}(?=${valueText}\k<quote>${gap}${nameAttr(words, String.raw`\k<quote>`)})${value}`,
        'g',
      ),
    },
  ];
  // A `<value>` element holds any text, so a plain key setting (which needs a secret-like value) has none.
  if (!strong) {
    const elementSkip = String.raw`(?!(?:${nonSecretWord}${numbers ? '' : `|${number}`})${lt})`;
    rules.push({
      kind,
      pattern: new RegExp(
        String.raw`(?<keep>${lt}(?:setting|data)[ \t\r\n](?:${inside}{0,96}?[ \t\r\n])??${name}${inside}{0,96}(?:>|&gt;)\s{0,32}${valueElement})${notMasked}${elementSkip}[^<\s&]${elementText}(?=${lt}/value)`,
        'g',
      ),
    });
  }
  return rules;
}

export const settingRules: readonly SettingRule[] = [
  ...rulesFor({ kind: 'password', words: strictPasswordWords, strong: false, numbers: true }),
  ...rulesFor({ kind: 'password', words: weakPasswordWords, strong: false, numbers: false }),
  ...rulesFor({ kind: 'bearer-token', words: caseless('token'), strong: false, numbers: false }),
  ...rulesFor({ kind: 'api-key', words: apiKeyWords, strong: false, numbers: false }),
  ...rulesFor({ kind: 'api-key', words: plainKeyWords, strong: true, numbers: false }),
  ...elementRules,
  ...explicitRules,
];
