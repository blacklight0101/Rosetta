import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { lineBreaksOf, maskOrphanKeyEnds } from './private-key-pieces.js';
import { escapedQuoteRules } from './secret-escaped-quote-rules.js';
import { extraRules } from './secret-extra-rules.js';
import {
  notContinuation,
  optionStart,
  optionValue,
  tokenBlank,
  tokenProse,
  tokenScheme,
  tokenValue,
} from './secret-option-pieces.js';
import { caseless, identifierValue, notMasked, placeholderValue } from './secret-value-pieces.js';

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

// RF-141: anchored on a keyword or a delimiter (no open-ended prefix) so no pattern rescans the
// input from every position. A prefix is bounded; a secret value runs to a delimiter its own class
// excludes (whitespace, a quote, `/`, `;`, `<`), so a value has no length limit and is still read
// once, and it ends where the next anchor could start.
const passwordName = '(?:password|passwd|pwd)';
const passwordKey = String.raw`${passwordName}["']?[ \t]{0,16}(?::=|[:=])${tokenBlank}{0,16}${notContinuation}`;
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
const mysqlRedirect = String.raw`[0-9]?(?:&>>?|>\||>&|<|>>?)[ \t]{0,16}`;
// `>&-` closes a descriptor and has no word after it.
const mysqlWord = String.raw`[ \t]+(?:(?:${mysqlRedirect})?(?:${mysqlQuoted}|[^\s\-,;"'<>|&=][^\s,;"'<>|&]*)|[0-9]?[<>]&-)(?=[ \t])`;
// At most three positional words, each followed by at most 16 options, anywhere before `-p`.
const mysqlArguments = String.raw`(?:${mysqlOption('first')}){0,16}(?:${mysqlWord}(?:${mysqlOption('later')}){0,16}){0,3}`;
// A quoted part runs to its closing quote (or the end of the line), spaces included; the token goes
// on to the next space, so `-p"abc"def` is masked whole. The alternatives start differently.
const mysqlPassword = String.raw`(?:"[^"\r\n]*"?|'[^'\r\n]*'?|[^\s"'])+`;
// The start of the value of an XML element whose name ends in a password name, with an optional
// prefix and attributes, and blanks before the value.
const xmlPasswordOpen = String.raw`<[\w.:-]{0,32}?${passwordName}(?:[ \t][^<>\r\n]{0,256})?>[ \t]{0,16}`;
const cdataOpen = String.raw`<!\[CDATA\[`;

// The detection patterns (README section 5.1 allows secret-like literals here). The order matters:
// whole private key blocks first, then self-identifying keys and tokens, then key=value settings.
const baseRules: readonly MaskRule[] = [
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
    // A key setting whose value holds punctuation (`api_key=ab:cd-ef!gh12345`), with a name before
    // it or not (`x-api-key:`). Values under 8 characters, placeholders and code are left alone.
    kind: 'api-key',
    pattern: new RegExp(
      String.raw`(?<keep>${keyStart}${caseless('api')}[_-]?${caseless('key')}["']?[ \t]{0,16}(?::=|[:=])[ \t]{0,16}["']?)${notMasked}(?![="'])(?!${placeholderValue}|${identifierValue})[^\s"',;&]{8,}`,
      'g',
    ),
  },
  {
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>\bBearer[ \t\u00a0]{1,16})${notMasked}[A-Za-z0-9._~+/=-]{20,}`,
      'gi',
    ),
  },
  {
    // A short value in an Authorization header (`Authorization: Bearer abc.def-ghi!jkl`): the
    // header names it, so it needs no minimum length and may hold any character up to a blank or
    // quote. A comma or semicolon belongs to the value when a value character follows it; a
    // placeholder or prose word is left alone (P2-40).
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>\b${caseless('Authorization')}["']?[ \t]{0,16}[:=][ \t]{0,16}["']?${caseless('Bearer')}[ \t\u00a0]{1,16})${notMasked}(?!${placeholderValue})(?:[^\s"',;]|[,;](?=[^\s"',;])){4,}`,
      'g',
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
    // An escaped quote in front of the value stays visible, and an empty escaped value is no value
    // (P3-128).
    pattern: new RegExp(
      String.raw`(?<keep>${passwordKey}(?:\\{1,4}["'])?)${notMasked}(?![="'])(?!\\{1,4}["'])[^\s;,&"']+`,
      'gi',
    ),
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
      String.raw`(?<keep>${optionStart}${passwordName}${tokenBlank}{1,16}${notContinuation})${notMasked}${optionValue}`,
      'gi',
    ),
  },
  {
    // `--token <value>` and `--token=<value>` on a command line, but not "the --token= flag" (P2-40).
    kind: 'bearer-token',
    pattern: new RegExp(
      String.raw`(?<keep>${optionStart}token(?:${tokenBlank}{1,16}|=(?! ${tokenProse})${tokenBlank}{0,16})${notContinuation}${tokenScheme})${notMasked}${tokenValue}`,
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

// The escaped-quote rules come first: the rules below would take the backslash for the value (P3-128).
const defaultRules: readonly MaskRule[] = [...escapedQuoteRules, ...baseRules, ...extraRules];

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

/** The text a masked secret of a kind is replaced with; it starts with `[MASKED:<kind>]`. */
export type ReplacementOf = (kind: SecretKind) => string;

/** RF-141: the bare marker, the replacement unless the masker is given the text of a prompt file. */
const bareMarker: ReplacementOf = (kind) => `[MASKED:${kind}]`;

function applyRule(
  text: string,
  rule: MaskRule,
  replacement: ReplacementOf,
): { readonly text: string; readonly count: number } {
  let masked = '';
  let position = 0;
  let count = 0;
  for (const match of text.matchAll(rule.pattern)) {
    const keep = match.groups?.['keep'] ?? '';
    const secret = match[0].slice(keep.length);
    masked += text.slice(position, match.index) + keep;
    masked += `${replacement(rule.kind)}${lineBreaksOf(secret)}`;
    position = match.index + match[0].length;
    count += 1;
  }
  return { text: masked + text.slice(position), count };
}

// RF-141, RNF-003: replaces secrets with [MASKED:<kind>] and keeps every line where it was, so
// citations stay valid. Any internal failure is thrown as RST-2101 and callers fail closed (DEC-57).
export class SecretMasker implements TextMasker {
  private readonly rules: readonly MaskRule[];
  private readonly replacement: ReplacementOf;

  /**
   * P5-34: `replacement` is the text a masked value gets; the egress masker gets the note of the
   * prompt file (it tells the model a plain-text value is written there), the rest the bare marker.
   */
  constructor(rules: readonly MaskRule[] = defaultRules, replacement: ReplacementOf = bareMarker) {
    this.rules = rules;
    this.replacement = replacement;
  }

  mask(text: string): MaskResult {
    try {
      const counts = emptyCounts();
      let masked = text;
      for (const rule of this.rules) {
        const result = applyRule(masked, rule, this.replacement);
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
