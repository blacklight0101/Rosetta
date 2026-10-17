import { parseCitation, type Citation } from '../../src/domain/cards/citation.js';
import type { CardType, ClaimStatus } from '../../src/domain/cards/card-vocabulary.js';
import type { EvaluatedClaim } from '../../src/domain/eval/claim-match.js';
import type {
  FindingKind,
  GoldenAbsence,
  GoldenCase,
  GoldenFinding,
} from '../../src/domain/eval/golden-set.js';

// RNF-006, RNF-015: small builders for the claims of a run and the entries of a golden set, so a
// scoring test names only what it is about.

function citationsOf(texts: readonly string[]): readonly Citation[] {
  return texts.map((text) => {
    const parsed = parseCitation(text);
    if (!parsed.ok) throw new Error(`Not a citation: ${text}`);
    return parsed.value;
  });
}

interface ClaimParts {
  readonly claimId?: string;
  readonly cardType?: CardType;
  readonly cardTitle?: string;
  readonly text?: string;
  readonly status?: ClaimStatus;
  readonly citations?: readonly string[];
}

/** A Supported claim of a FEAT card citing `Models/Item.cs:20-24` about the price. */
export function claim(parts: ClaimParts = {}): EvaluatedClaim {
  return {
    claimId: parts.claimId ?? 'FEAT-001.c1',
    cardType: parts.cardType ?? 'FEAT',
    cardTitle: parts.cardTitle ?? 'Item',
    text: parts.text ?? 'The price is kept with two decimals.',
    status: parts.status ?? 'Supported',
    citations: citationsOf(parts.citations ?? ['Models/Item.cs:20-24']),
  };
}

interface FindingParts {
  readonly id?: string;
  readonly kind?: FindingKind;
  readonly cardTypes?: readonly CardType[];
  readonly evidence?: readonly string[];
  readonly keywords?: readonly string[];
}

/** A rule about the price, with evidence at `Models/Item.cs:20-24`. */
export function finding(parts: FindingParts = {}): GoldenFinding {
  return {
    id: parts.id ?? 'rule-price',
    kind: parts.kind ?? 'rule',
    statement: 'The price of an item has at most two decimals.',
    cardTypes: parts.cardTypes ?? [],
    evidence: citationsOf(parts.evidence ?? ['Models/Item.cs:20-24']),
    keywords: parts.keywords ?? ['price'],
  };
}

interface AbsenceParts {
  readonly id?: string;
  readonly claimPatterns?: readonly (readonly string[])[];
  readonly unless?: readonly string[];
}

/** "Nothing reorders an item by itself": hit by a claim that names an automatic reorder. */
export function absence(parts: AbsenceParts = {}): GoldenAbsence {
  return {
    id: parts.id ?? 'absent-auto-reorder',
    statement: 'Nothing reorders an item by itself when its stock is low.',
    claimPatterns: parts.claimPatterns ?? [['reorder', 'automatic']],
    unless: parts.unless ?? [],
  };
}

interface CaseParts {
  readonly id?: string;
  readonly paths?: readonly string[];
  readonly findings?: readonly GoldenFinding[];
  readonly absences?: readonly GoldenAbsence[];
}

/** A case about `Models/Item.cs` with the price rule and the reorder absence. */
export function goldenCase(parts: CaseParts = {}): GoldenCase {
  return {
    id: parts.id ?? 'catalog-item',
    title: 'The catalog item',
    paths: parts.paths ?? ['Models/Item.cs'],
    findings: parts.findings ?? [finding()],
    absences: parts.absences ?? [absence()],
  };
}
