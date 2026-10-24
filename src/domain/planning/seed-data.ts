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
// word (a part of a longer word counts, so `PasswordHash` does), and, for an insert into a table
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

/** A secret word or a part of a longer word (`PasswordHash`, `ApiKeyValue`). */
const SECRET_WORD =
  /(?:password|passwd|pwd|passphrase|hash|secret|token|api[ _-]?key|key|salt|credential)\w*/iu;
const INSERT_TARGET = /\binsert\s+(?:into\s+)?([^(\n;]{1,160})/iu;
const SECRET_TABLE = /user|login|account|credential|member/iu;
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

/** Where the text is cut: the end of the first secret word or of the `values` of a secret insert. */
function cutOf(text: string): number | undefined {
  const word = SECRET_WORD.exec(text);
  const wordEnd = word === null ? undefined : word.index + word[0].length;
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
  return { text: `${kept} ${MASK}`, masked: true };
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
