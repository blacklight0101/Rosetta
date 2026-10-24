import type { Citation } from '../cards/citation.js';
import type { SourceCard } from './plan-sources.js';

// P5-42, RF-632, ADR-013: the seed data and the test data the cards state, the rows a test of the
// new system must start from. A seed is a supported claim that tells of inserts in a schema script
// or seed code, or of initial or default rows; a test datum is one that tells of test data,
// fixtures or sample data. Nothing is measured from the files of the repository.
//
// A claim that may tell of a secret fails safe: it is cut where the secret could start, and what
// follows is replaced by `***`, whatever the form of the value (quoted, number, hex, a word) and
// whatever joins it to the word before it. A claim is cut at the first of: the end of a secret
// word (an identifier is split at `_`, `-`, digits and camelCase: short words such as pin, pass, key, salt, hash count as whole tokens, long ones such as password count inside a token too), and, for an insert into a table
// whose last name part holds user, login, account, credential or member, the `values` keyword (or
// the table name when there is none). Quoted values before the cut are masked too. Every pattern is
// linear in the text.

export type SeedKind = 'seed' | 'test';

export interface StatedSeed {
  readonly kind: SeedKind;
  readonly cardId: string;
  readonly claimId: string;
  /** The claim text, cut and masked where it may tell of a secret. */
  readonly text: string;
  /** True only when the text was cut or masked; no value of such a claim is left after the cut. */
  readonly masked: boolean;
  readonly citations: readonly Citation[];
}

const SEED =
  /\binsert\s+into\b|\bseed(?:s|ed|ing)?\b|\binitial\s+(?:rows?|data|records?|values?)\b|\bdefault\s+(?:rows?|records?)\b|\bpre-?loaded\b/iu;
const TEST = /\b(?:test|sample|demo)\s+(?:data|users?|accounts?|records?|rows?)\b|\bfixtures?\b/iu;

/** An identifier-like word: letters, digits, `_`, `-` and `@` (`p@ssword`). */
const WORD = /[\p{L}\p{N}_@-]+/gu;
/** Short secret words count only as a whole token of an identifier. */
const SHORT_SECRETS: ReadonlySet<string> = new Set([
  ...['pin', 'pass', 'pwd', 'key', 'salt', 'hash', 'otp', 'cvv'],
]);
/** Long secret words count inside a token too (`userpassword`, `passwordhash`). */
const LONG_SECRETS = [
  ...['password', 'passwd', 'passcode', 'passphrase', 'secret', 'token', 'credential'],
  ...['apikey', 'clave', 'senha', 'contrase'],
];
const INSERT_TARGET = /\binsert\s+(?:into\s+)?([^(\n;]{1,160})/iu;
const SECRET_TABLE = /user|login|account|credential|member|usuari|admin|operador/iu;
const VALUES = /\bvalues\b/iu;
/** A quoted value of any length; an unterminated one runs to the end of the text. */
const QUOTED = /'(?:[^']|'')*(?:'|$)|"[^"]*(?:"|$)/gu;

const MASK = '***';

/** The last name part of an insert target: `[dbo].[Users]` is `Users`; quotes and brackets removed. */
function lastNamePart(target: string): string {
  const named = target.replaceAll(/[[\]"`]/gu, '').trim();
  const parts = named.split('.');
  return parts.at(-1) ?? named;
}

/** The tokens of an identifier: split at `_`, `-`, digits and camelCase; lower case; `@` as `a`. */
function tokensOf(word: string): string[] {
  return word
    .replaceAll('@', 'a')
    .replaceAll(/([a-z])([A-Z])/gu, '$1 $2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .split(/[^\p{L}]+/u)
    .map((token) => token.toLowerCase())
    .filter((token) => token !== '');
}

function isSecretToken(token: string): boolean {
  return SHORT_SECRETS.has(token) || LONG_SECRETS.some((long) => token.includes(long));
}

/** The end of the first identifier that holds a secret word, if any. */
function secretWordEnd(text: string): number | undefined {
  for (const match of text.matchAll(WORD)) {
    if (tokensOf(match[0]).some((token) => isSecretToken(token))) {
      return match.index + match[0].length;
    }
  }
  return undefined;
}

/** Where the text is cut: the end of the first secret word or of the `values` of a secret insert. */
function cutOf(text: string): number | undefined {
  const wordEnd = secretWordEnd(text);
  const target = INSERT_TARGET.exec(text);
  const secretInsert =
    target !== null && SECRET_TABLE.test(lastNamePart(target[1] ?? '')) ? target : null;
  if (secretInsert === null) return wordEnd;
  const after = secretInsert.index + secretInsert[0].length;
  const values = VALUES.exec(text.slice(after));
  const tableEnd = values === null ? after : after + values.index + values[0].length;
  return wordEnd === undefined ? tableEnd : Math.min(wordEnd, tableEnd);
}

/** The text cut where a secret could start, quoted values before the cut masked. */
function masked(text: string): { readonly text: string; readonly masked: boolean } {
  const cut = cutOf(text);
  if (cut === undefined) return { text, masked: false };
  const kept = text.slice(0, cut).replaceAll(QUOTED, `'${MASK}'`);
  return { text: `${kept.trimEnd()} ${MASK}`, masked: true };
}

function kindOf(text: string): SeedKind | undefined {
  if (SEED.test(text)) return 'seed';
  return TEST.test(text) ? 'test' : undefined;
}

/** The supported claims that state seed data or test data, in card order. */
// P5-42, RF-632
export function statedSeeds(sources: readonly SourceCard[]): StatedSeed[] {
  return sources.flatMap((card) =>
    card.claims.flatMap((claim) => {
      const kind = claim.status === 'Supported' ? kindOf(claim.text) : undefined;
      if (kind === undefined) return [];
      const { claimId, citations } = claim;
      return [{ kind, cardId: card.id, claimId, citations, ...masked(claim.text) }];
    }),
  );
}
