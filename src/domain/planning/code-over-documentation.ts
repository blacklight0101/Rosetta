import { clashBetween, topicsOf, type OverruledClaim } from './claim-meaning.js';
import { wordsOf } from './claim-text.js';
import type { ClaimVerbs } from './claim-verbs.js';
import { supportedCards, type SourceCard } from './plan-sources.js';

// P5-43, RF-602, ADR-005: when a claim that cites only documentation (a README) and a claim that
// cites other files say opposite things about one topic, the code claim wins: the documentation
// claim is not sent to the planner and not written to the package, and checks.md lists both. What
// counts as documentation, and which verbs oppose each other, are data of the catalogue. The
// claims are indexed by topic word, so the pass is linear in the claims and bounded per claim.

const MAX_CANDIDATES = 100;

type SourceClaim = SourceCard['claims'][number];

function isDocumentPath(path: string, verbs: ClaimVerbs): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = name.lastIndexOf('.');
  const stem = dot < 0 ? name : name.slice(0, dot);
  const extension = dot < 0 ? '' : name.slice(dot + 1);
  return verbs.documentNames.includes(stem) || verbs.documentExtensions.includes(extension);
}

function citesOnlyDocuments(claim: SourceClaim, verbs: ClaimVerbs): boolean {
  return (
    claim.citations.length > 0 &&
    claim.citations.every((citation) => isDocumentPath(citation.path, verbs))
  );
}

interface Read {
  readonly claim: SourceClaim;
  readonly words: readonly string[];
}

/** The documentation claims that a code claim of the package contradicts, with the code claim. */
function overruledBy(cards: readonly SourceCard[], verbs: ClaimVerbs): Map<string, OverruledClaim> {
  const claims = cards.flatMap((card) => card.claims);
  const code = claims.filter((claim) => !citesOnlyDocuments(claim, verbs));
  const documents = claims.filter((claim) => citesOnlyDocuments(claim, verbs));
  const byTopic = new Map<string, Read[]>();
  for (const claim of code) {
    const words = wordsOf(claim.text);
    for (const key of topicsOf(words, verbs)) {
      const list = byTopic.get(key) ?? [];
      if (list.length < MAX_CANDIDATES) list.push({ claim, words });
      byTopic.set(key, list);
    }
  }
  const found = new Map<string, OverruledClaim>();
  for (const document of documents) {
    const words = wordsOf(document.text);
    const candidates = new Set(
      [...topicsOf(words, verbs)].flatMap((key) => byTopic.get(key) ?? []),
    );
    for (const { claim, words: codeWords } of candidates) {
      const clash = clashBetween(
        words,
        { id: claim.claimId, text: claim.text, words: codeWords },
        verbs,
      );
      if (clash === undefined) continue;
      found.set(document.claimId, {
        documentClaimId: document.claimId,
        codeClaimId: claim.claimId,
        document: clash.first,
        code: clash.second,
      });
      break;
    }
  }
  return found;
}

/** The cards without the documentation claims a code claim contradicts, and what was overruled. */
// RF-602
export function codeOverDocumentation(
  cards: readonly SourceCard[],
  verbs: ClaimVerbs,
): { readonly cards: SourceCard[]; readonly overruled: OverruledClaim[] } {
  if (verbs.families.length === 0) return { cards: [...cards], overruled: [] };
  const found = overruledBy(cards, verbs);
  if (found.size === 0) return { cards: [...cards], overruled: [] };
  const kept = cards.flatMap((card) => {
    const claims = card.claims.filter((claim) => !found.has(claim.claimId));
    return claims.length === 0 ? [] : [{ ...card, claims }];
  });
  return { cards: kept, overruled: [...found.values()] };
}

/** The cards the planner and the package use: Supported claims only, and the code over the documentation. */
// RF-604, RF-602
export function usableCards(
  cards: readonly SourceCard[],
  verbs: ClaimVerbs,
): ReturnType<typeof codeOverDocumentation> {
  return codeOverDocumentation(supportedCards(cards), verbs);
}
