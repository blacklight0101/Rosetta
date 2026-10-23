import { caseless, notMasked, placeholderValue } from './secret-value-pieces.js';

// P3-116 (RF-141, RNF-003): the value of a key/value setting whose key names a secret, in the XML
// forms of .NET configuration: `<add key="SmtpPassword" value="..."/>`, the same with `name=` or with
// `value=` first, quotes escaped inside a JSON string (`\"`) or written as entities in HTML
// (`&quot;`, with `&lt;` and `&gt;`), and a `<setting name="...">` whose `<value>` element holds the
// secret. The key decides the kind: a token, an API key or a password. Every rule is anchored on `<`
// and its repeats are bounded, so none rescans the input from every position (RF-141 time budget).

interface SettingRule {
  readonly kind: 'api-key' | 'bearer-token' | 'password';
  readonly pattern: RegExp;
}

// The last word of a key may follow a delimiter in any case (`smtp_pass`, `x-token`) or start with a
// capital after a letter or digit (`MailPass`, `AuthToken`); `Compass` and `Bypass` do not end in a
// word `pass`.
const wordEnd = (lower: string, capitalised: string): string =>
  String.raw`(?:(?<![A-Za-z0-9])${caseless(lower)}|(?<=[A-Za-z0-9])${capitalised})`;
const passwordWords = String.raw`(?:${caseless('password')}|${caseless('passwd')}|${caseless('pwd')}|${wordEnd('pass', 'Pass')}|${wordEnd('secret', 'Secret')}(?:[_-]?${caseless('key')})?)`;
const tokenWords = caseless('token');
const apiKeyWords = String.raw`${caseless('api')}[_-]?${caseless('key')}`;
const plainKeyWords = caseless('key');

// Text rendered into HTML holds `&lt;`, `&gt;` and `&quot;` for `<`, `>` and `"`.
const lt = String.raw`(?:<|&lt;)`;
const inside = String.raw`(?:(?!&gt;)[^<>])`;
const open = String.raw`${lt}[A-Za-z][\w:.-]{0,31}[ \t\r\n](?:${inside}{0,96}?[ \t\r\n])??`;
const gap = String.raw`${inside}{0,96}?[ \t\r\n]`;
const quote = String.raw`(?<quote>\\?["']|&quot;|&#0*39;|&#x27;|&apos;)`;
const nameAttr = (words: string, q: string = quote): string =>
  String.raw`(?:key|name)=${q}[\w.:-]{0,64}?${words}\k<quote>`;
const valueText = String.raw`(?:(?!\k<quote>)[^<>\r\n])+`;
// A plain `Key` setting is a secret only when its value looks like one: 8 or more characters with a
// digit or a symbol, no brackets, `$` or `<>`, not a placeholder, a path or a URL.
const chars = String.raw`[^\s"',;&\\<>]`;
const strongValue = String.raw`(?=${chars}{8})(?!${placeholderValue}|[/.~]|https?:|[A-Za-z]:\\)(?!${chars}{0,256}?[()\[\]{}$])(?=${chars}{0,256}?[0-9+=!@#%^*~])${chars}+(?=\k<quote>)`;
const valueElement = String.raw`${lt}value(?:>|&gt;)`;
const elementText = String.raw`(?:(?!&lt;/)[^<\r\n])*[^<\s]`;

function rulesFor(kind: SettingRule['kind'], words: string, strong: boolean): SettingRule[] {
  const value = strong ? strongValue : valueText;
  const name = nameAttr(words);
  const rules: SettingRule[] = [
    {
      kind,
      pattern: new RegExp(
        String.raw`(?<keep>${open}${name}${gap}value=\k<quote>)${notMasked}${value}`,
        'g',
      ),
    },
    {
      kind,
      pattern: new RegExp(
        String.raw`(?<keep>${open}value=${quote})${notMasked}(?=${valueText}\k<quote>${gap}${nameAttr(words, String.raw`\k<quote>`)})${value}`,
        'g',
      ),
    },
  ];
  // A `<value>` element holds any text, so a plain key setting (which needs a secret-like value) has none.
  if (!strong) {
    rules.push({
      kind,
      pattern: new RegExp(
        String.raw`(?<keep>${lt}(?:setting|data)[ \t\r\n](?:${inside}{0,96}?[ \t\r\n])??${name}${inside}{0,96}(?:>|&gt;)\s{0,32}${valueElement})${notMasked}[^<\s&]${elementText}?(?=${lt}/value)`,
        'g',
      ),
    });
  }
  return rules;
}

export const settingRules: readonly SettingRule[] = [
  ...rulesFor('password', passwordWords, false),
  ...rulesFor('bearer-token', tokenWords, false),
  ...rulesFor('api-key', apiKeyWords, false),
  ...rulesFor('api-key', plainKeyWords, true),
];
