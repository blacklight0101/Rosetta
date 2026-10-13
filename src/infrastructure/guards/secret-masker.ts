import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { lineBreaksOf, maskOrphanKeyEnds } from './private-key-pieces.js';

export type SecretKind =
  'api-key' | 'bearer-token' | 'connection-string' | 'password' | 'private-key';

export interface MaskResult {
  readonly text: string;
  /** How many secrets of each kind were replaced. */
  readonly counts: Readonly<Record<SecretKind, number>>;
}

/** What callers of the masker depend on, so a test can hand them a failing one. */
export interface TextMasker {
  mask(text: string): MaskResult;
}

/**
 * One detection pattern. It must carry the `g` flag. The optional named group `keep` is a prefix of
 * the match that stays visible (for example `Password=`); the rest of the match is the secret.
 */
export interface MaskRule {
  readonly kind: SecretKind;
  readonly pattern: RegExp;
}

// A value that an earlier rule already replaced is never masked again.
const notMasked = String.raw`(?!\[MASKED:)`;
// RF-141: anchored on a keyword or a delimiter (no open-ended prefix) so no pattern rescans the
// input from every position. A prefix is bounded; a secret value runs to a delimiter its own class
// excludes (whitespace, a quote, `/`, `;`, `<`), so a value has no length limit and is still read
// once, and it ends where the next anchor could start.
const passwordName = '(?:password|passwd|pwd)';
const passwordKey = String.raw`${passwordName}["']?[ \t]{0,16}(?::=|[:=])[ \t]{0,16}`;
// Not preceded by a letter or digit: an underscore before the key is allowed (`prod_sk-...`).
const keyStart = '(?<![A-Za-z0-9])';

// The pieces of a `mysql` command line. An option is a word that starts with `-`, with at most one
// bare or quoted value; it is atomic (a lookahead capture, then a back reference), so a value never
// turns into a positional word on a retry and the scan stays linear. A positional word (a database
// or table name, a file) is any word that does not start with `-` and holds no comma, semicolon,
// quote or shell operator, so prose with a comma or many words is not read as a command.
const mysqlValue = String.raw`(?:"[^"\r\n]{0,256}"|'[^'\r\n]{0,256}'|[^\s"'-]\S*)`;
const mysqlOption = (name: string): string =>
  String.raw`(?=(?<${name}>[ \t]+-\S+(?:[ \t]+${mysqlValue})?))\k<${name}>`;
// A positional word may be quoted (`"my db"`) or be a redirect with its file (`> out.sql`, `2> err`,
// `&> all`, `>| force`).
const mysqlQuoted = String.raw`"[^"\r\n]{0,256}"|'[^'\r\n]{0,256}'`;
const mysqlRedirect = String.raw`[0-9]?(?:&>>?|>\||<|>>?)[ \t]{0,16}`;
const mysqlWord = String.raw`[ \t]+(?:${mysqlRedirect})?(?:${mysqlQuoted}|[^\s\-,;"'<>|&=][^\s,;"'<>|&]*)(?=[ \t])`;
// At most three positional words, each followed by at most 16 options, anywhere before `-p`.
const mysqlArguments = String.raw`(?:${mysqlOption('first')}){0,16}(?:${mysqlWord}(?:${mysqlOption('later')}){0,16}){0,3}`;
// The value of a long option such as `--password <value>`: one quoted value (to its closing quote or
// the end of the line) or a bare word that does not start with `-`, a quote or a shell operator.
const optionValue = String.raw`(?:"[^"\r\n]*"?|'[^'\r\n]*'?|[^\s\-"'<>|&;][^\s"'<>|&;]*)`;
// A scheme word before the value of `--token` stays visible: `--token Bearer <value>`.
// Without one, a scheme word in front of an already masked value is not taken for the value.
const tokenSchemeWord = '(?:bearer|basic|token|digest)';
const tokenScheme = String.raw`(?:${tokenSchemeWord}[ \t]{1,16}(?=\S)|(?!${tokenSchemeWord}[ \t]{1,16}\[MASKED:))`;
// Not preceded by a letter, digit or dash, so `x--token` and `---token` are left alone.
const optionStart = '(?<![A-Za-z0-9-])--';
// A quoted part runs to its closing quote (or the end of the line), spaces included; the token goes
// on to the next space, so `-p"abc"def` is masked whole. The alternatives start differently.
const mysqlPassword = String.raw`(?:"[^"\r\n]*"?|'[^'\r\n]*'?|[^\s"'])+`;
// The start of the value of an XML element whose name ends in a password name, with an optional
// prefix and attributes, and blanks before the value.
const xmlPasswordOpen = String.raw`<[\w.:-]{0,32}?${passwordName}(?:[ \t][^<>\r\n]{0,256})?>[ \t]{0,16}`;
const cdataOpen = String.raw`<!\[CDATA\[`;

// The detection patterns (README section 5.1 allows secret-like literals here). The order matters:
// whole private key blocks first, then self-identifying keys and tokens, then key=value settings.
const defaultRules: readonly MaskRule[] = [
  {
    kind: 'private-key',
    pattern:
      /-----BEGIN (?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----(?:[\s\S]*?-----END (?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----|[\s\S]*$)/g,
  },
  {
    kind: 'api-key',
    pattern:
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}|(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Za-z0-9]))/g,
  },
  {
    // OpenAI and Anthropic keys, and Stripe-style secret and restricted keys (`sk_live_`, `rk_test_`).
    kind: 'api-key',
    pattern: new RegExp(
      String.raw`${keyStart}(?:sk-[A-Za-z0-9_-]{20,}|[rs]k_(?:live|test)_[A-Za-z0-9]{16,})`,
      'g',
    ),
  },
  {
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>\bBearer[ \t]{1,16})${notMasked}[A-Za-z0-9._~+/=-]{20,}`,
      'gi',
    ),
  },
  {
    // The Basic and token schemes of an Authorization header (`Authorization: Basic <base64>`).
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>\bAuthorization["']?[ \t]{0,16}[:=][ \t]{0,16}["']?(?:Basic|token)[ \t]{1,16})${notMasked}[A-Za-z0-9._~+/=-]{4,}`,
      'gi',
    ),
  },
  {
    // The user may be empty (`redis://:secret@host`); the password runs to the last `@` of the
    // authority, so a password that contains `@` is masked whole.
    kind: 'connection-string',
    pattern: new RegExp(
      String.raw`(?<keep>\b[A-Za-z][A-Za-z0-9+.-]{0,31}://[^\s:/@"'[\]]{0,256}:)${notMasked}[^\s/"']+(?=@)`,
      'g',
    ),
  },
  {
    kind: 'connection-string',
    pattern: new RegExp(
      String.raw`(?<keep>;[ \t]{0,16}(?:password|pwd)[ \t]{0,16}=[ \t]{0,16})${notMasked}[^;"'\s][^;"'\r\n]*`,
      'gi',
    ),
  },
  {
    // A quoted value ends at its closing quote; a backslash escape such as \" belongs to it.
    kind: 'password',
    pattern: new RegExp(
      String.raw`(?<keep>${passwordKey}(?<quote>["']))${notMasked}(?:\\[^\r\n]|(?!\k<quote>)[^\r\n\\])+`,
      'gi',
    ),
  },
  {
    kind: 'password',
    pattern: new RegExp(String.raw`(?<keep>${passwordKey})${notMasked}(?![="'])[^\s;,&"']+`, 'gi'),
  },
  {
    // A CDATA section in such an element: the value runs to `]]>`, or to the end of the line when
    // the section is not closed there, so a secret that holds `<` is masked whole.
    kind: 'password',
    pattern: new RegExp(
      String.raw`(?<keep>${xmlPasswordOpen}${cdataOpen})${notMasked}(?:[^\]\r\n]|\](?!\]>))+`,
      'gi',
    ),
  },
  {
    // Such an element without CDATA: the value runs to its closing tag on the same line, so a
    // `<password>` placeholder in prose is left alone.
    kind: 'password',
    pattern: new RegExp(
      String.raw`(?<keep>${xmlPasswordOpen})${notMasked}[^<\s][^<\r\n]*(?=</)`,
      'gi',
    ),
  },
  {
    // `--password <value>` on a command line; `--password=<value>` is masked by the rule above.
    kind: 'password',
    pattern: new RegExp(
      String.raw`(?<keep>${optionStart}${passwordName}[ \t]{1,16})${notMasked}${optionValue}`,
      'gi',
    ),
  },
  {
    // `--token <value>` and `--token=<value>` on a command line.
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>${optionStart}token(?:[ \t]{1,16}|=)${tokenScheme})${notMasked}${optionValue}`,
      'gi',
    ),
  },
  {
    // `mysql mydb -u root -p<password>` (case-sensitive: `-P` is the port); `-p` alone prompts and
    // is left alone; a quoted executable path ends with its quote. Command-line shape only (see mysqlArguments), so prose such as "mysql is used
    // in production -pretty much" is not read as a password.
    kind: 'password',
    pattern: new RegExp(
      String.raw`(?<keep>\bmysql(?:admin|dump)?(?:\.exe)?["']?${mysqlArguments}[ \t]+-p)${notMasked}${mysqlPassword}`,
      'g',
    ),
  },
];

/** Every kind, in name order. */
export const SECRET_KINDS: readonly SecretKind[] = [
  'api-key',
  'bearer-token',
  'connection-string',
  'password',
  'private-key',
];

/** A zero count for every kind, in name order. */
export function emptyCounts(): Record<SecretKind, number> {
  return {
    'api-key': 0,
    'bearer-token': 0,
    'connection-string': 0,
    password: 0,
    'private-key': 0,
  };
}

function applyRule(
  text: string,
  rule: MaskRule,
): { readonly text: string; readonly count: number } {
  let masked = '';
  let position = 0;
  let count = 0;
  for (const match of text.matchAll(rule.pattern)) {
    const keep = match.groups?.['keep'] ?? '';
    const secret = match[0].slice(keep.length);
    masked += text.slice(position, match.index) + keep;
    masked += `[MASKED:${rule.kind}]${lineBreaksOf(secret)}`;
    position = match.index + match[0].length;
    count += 1;
  }
  return { text: masked + text.slice(position), count };
}

// RF-141, RNF-003: replaces secrets with [MASKED:<kind>] and keeps every line where it was, so
// citations stay valid. Any internal failure is thrown as RST-2101 and callers fail closed (DEC-57).
export class SecretMasker implements TextMasker {
  private readonly rules: readonly MaskRule[];

  constructor(rules: readonly MaskRule[] = defaultRules) {
    this.rules = rules;
  }

  mask(text: string): MaskResult {
    try {
      const counts = emptyCounts();
      let masked = text;
      for (const rule of this.rules) {
        const result = applyRule(masked, rule);
        masked = result.text;
        counts[rule.kind] += result.count;
      }
      const tails = maskOrphanKeyEnds(masked);
      counts['private-key'] += tails.count;
      return { text: tails.text, counts };
    } catch (error) {
      throw new RosettaError(ERROR_CODES.secretMaskingFailed, undefined, { cause: error });
    }
  }
}
