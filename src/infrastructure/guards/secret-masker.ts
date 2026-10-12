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
    // An XML element whose name ends in a password name, with an optional prefix and attributes;
    // the value runs to its closing tag on the same line, so a `<password>` placeholder in prose
    // is left alone.
    kind: 'password',
    pattern: new RegExp(
      String.raw`(?<keep><[\w.:-]{0,32}?${passwordName}(?:[ \t][^<>\r\n]{0,256})?>)${notMasked}[^<\s][^<\r\n]*(?=</)`,
      'gi',
    ),
  },
  {
    // `mysql -p<password>` (case-sensitive: `-P` is the port); `-p` alone prompts and is left alone.
    // The options before `-p` are bounded to 128 characters, so a `mysql` is never followed further.
    kind: 'password',
    pattern: new RegExp(
      String.raw`(?<keep>\bmysql(?:admin|dump)?[ \t][^\r\n]{0,128}?[ \t]-p)${notMasked}[^\s]+`,
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
