import {
  MAX_TEXT,
  namesRole,
  prefixesOf,
  roleStated,
  statesValue,
  valuesOf,
  wordsOf,
} from './claim-text.js';
import type { ClaimVerbs, VerbFamily } from './claim-verbs.js';
import type { PlanContent } from './plan-content.js';
import type { SourceCard } from './plan-sources.js';
import type { PrdContent } from './prd-content.js';
import type { TargetFlows } from './target-flows.js';

// P5-43, RF-602, ADR-013, DEC-11: a plan statement keeps the meaning of the claim it comes from. The
// planner rewords claims; the check lists a statement whose verb contradicts the verb of a linked
// Supported claim ("rejects" written as "deletes"), a value (a number or a quoted text) and a role
// that no linked claim states. The pairs of verbs are the families of `claim-verbs.v<n>.yaml`, so
// the check reads words and knows no language, framework or database. Texts are untrusted: each is
// cut to a bound before it is read, and every pass over the claims is linear.

const MAX_TOPICS = 40;
/** The most findings of one kind that checks.md lists. */
export const MAX_FINDINGS = 200;

interface VerbContradiction {
  /** Where the statement is: "REQ-003", "PRD feature F-002", "FLOW-006 step FLOW-006.c3". */
  readonly where: string;
  readonly claimId: string;
  /** Rosetta's label of the side the statement takes, and of the side the claim takes. */
  readonly statement: string;
  readonly claim: string;
}

interface UnstatedValue {
  readonly where: string;
  readonly value: string;
}

interface UnstatedRole {
  readonly where: string;
  readonly role: string;
}

/** A documentation claim a code claim overruled, both by claim id. */
export interface OverruledClaim {
  readonly documentClaimId: string;
  readonly codeClaimId: string;
  /** Rosetta's labels of the side the documentation takes and of the side the code takes. */
  readonly document: string;
  readonly code: string;
}

export interface MeaningCheck {
  readonly contradictions: readonly VerbContradiction[];
  readonly unstatedValues: readonly UnstatedValue[];
  /** Roles of the PRD, and the statements that name one, that no claim states. */
  readonly unstatedRoles: readonly UnstatedRole[];
  /** The names of the PRD roles no claim states; the PRD marks them as proposed. */
  readonly proposedRoles: readonly string[];
  readonly overruled: readonly OverruledClaim[];
}

export interface Claim {
  readonly id: string;
  readonly text: string;
}

function sidesOf(words: readonly string[], family: VerbFamily): Set<number> {
  const found = new Set<number>();
  family.sides.forEach((side, at) => {
    if (words.some((word) => side.terms.some((term) => word.startsWith(term)))) found.add(at);
  });
  return found;
}

function isVerbWord(word: string, verbs: ClaimVerbs): boolean {
  return verbs.families.some((family) =>
    family.sides.some((side) => side.terms.some((term) => word.startsWith(term))),
  );
}

/** The topic keys of a text: its words of five letters or more that are no stop word and no verb of a family. */
export function topicsOf(words: readonly string[], verbs: ClaimVerbs): Set<string> {
  const stop = new Set(verbs.stopWords);
  const keys = new Set<string>();
  for (const word of words) {
    if (word.length < 5 || stop.has(word) || isVerbWord(word, verbs)) continue;
    keys.add(word.slice(0, 6));
    if (keys.size >= MAX_TOPICS) break;
  }
  return keys;
}

interface Clash {
  readonly family: VerbFamily;
  readonly statementSide: number;
  readonly claimSide: number;
}

interface ReadClaim {
  readonly claim: Claim;
  readonly words: readonly string[];
}

/**
 * The first family in which `statement` takes a side that the claims on its topic never take, while one of
 * them takes another side. A claim on the topic that takes the statement's side settles the family.
 */
function clashOf(
  statement: readonly string[],
  claims: readonly ReadClaim[],
  verbs: ClaimVerbs,
): (Clash & { readonly claim: Claim }) | undefined {
  const topics = topicsOf(statement, verbs);
  const near = claims.filter(({ words }) => {
    const claimTopics = topicsOf(words, verbs);
    return [...topics].some((key) => claimTopics.has(key));
  });
  for (const family of verbs.families) {
    const own = sidesOf(statement, family);
    if (own.size === 0) continue;
    const taken = near.map((each) => ({ ...each, sides: sidesOf(each.words, family) }));
    if (taken.some(({ sides }) => [...sides].some((side) => own.has(side)))) continue;
    const other = taken.find(({ sides }) => sides.size > 0);
    const [statementSide] = own;
    const [claimSide] = other?.sides ?? [];
    if (other === undefined || statementSide === undefined || claimSide === undefined) continue;
    return { family, statementSide, claimSide, claim: other.claim };
  }
  return undefined;
}

/** The clash of two single texts (a documentation claim and a code claim), by side labels. */
export function clashBetween(
  first: readonly string[],
  second: Claim & { readonly words: readonly string[] },
  verbs: ClaimVerbs,
): { readonly first: string; readonly second: string } | undefined {
  const found = clashOf(first, [{ claim: second, words: second.words }], verbs);
  if (found === undefined) return undefined;
  return {
    first: found.family.sides[found.statementSide]?.label ?? '',
    second: found.family.sides[found.claimSide]?.label ?? '',
  };
}

interface Statement {
  readonly where: string;
  readonly text: string;
  /** Card ids the statement comes from. */
  readonly sources: readonly string[];
}

function statementsOf(plan: PlanContent, prd: PrdContent): Statement[] {
  return [
    ...plan.requirements.map((each) => ({
      where: each.id,
      text: each.statement,
      sources: each.sources,
    })),
    ...prd.features.map((each, at) => ({
      where: `PRD feature F-${String(at + 1).padStart(3, '0')}`,
      text: each.description,
      sources: each.sources,
    })),
    ...prd.rules.map((each, at) => ({
      where: `PRD rule ${String(at + 1)}`,
      text: each.text,
      sources: each.sources,
    })),
    ...prd.roles.map((each) => ({
      where: `PRD role ${each.name}`,
      text: each.description,
      sources: each.sources,
    })),
  ];
}

function claimsFor(sources: readonly SourceCard[]): (statement: Statement) => Claim[] {
  const byCard = new Map(sources.map((card) => [card.id, card] as const));
  return (statement) =>
    statement.sources.flatMap((id) =>
      (byCard.get(id)?.claims ?? []).map((claim) => ({ id: claim.claimId, text: claim.text })),
    );
}

interface Checked {
  readonly clash?: VerbContradiction;
  readonly values: UnstatedValue[];
}

function checkStatement(
  statement: Statement,
  claims: readonly Claim[],
  verbs: ClaimVerbs,
): Checked {
  const clash = clashOf(
    wordsOf(statement.text),
    claims.map((claim) => ({ claim, words: wordsOf(claim.text) })),
    verbs,
  );
  const corpus = claims.map((claim) => claim.text.slice(0, MAX_TEXT).toLowerCase()).join('\n');
  const values = valuesOf(statement.text)
    .filter((value) => !statesValue(corpus, value))
    .map((value) => ({ where: statement.where, value }));
  if (clash === undefined) return { values };
  return {
    values,
    clash: {
      where: statement.where,
      claimId: clash.claim.id,
      statement: clash.family.sides[clash.statementSide]?.label ?? '',
      claim: clash.family.sides[clash.claimSide]?.label ?? '',
    },
  };
}

/** A flow step is a claim of its card; what the planner says the component does at it is the statement. */
function stepChecks(flows: TargetFlows, verbs: ClaimVerbs): Checked[] {
  return flows.flows.flatMap((flow) =>
    flow.steps.map((step) =>
      checkStatement(
        { where: `${flow.cardId} step ${step.claimId}`, text: step.action, sources: [] },
        [{ id: step.claimId, text: step.text }],
        verbs,
      ),
    ),
  );
}

/**
 * The statements of the requirements, the PRD and the flow steps checked against the Supported
 * claims they link (RF-602), and the PRD roles no claim states. `overruled` is what
 * `codeOverDocumentation` found in the same sources.
 */
// RF-602
export function claimMeaning(
  parts: {
    readonly plan: PlanContent;
    readonly prd: PrdContent;
    readonly flows: TargetFlows;
    readonly sources: readonly SourceCard[];
    readonly overruled: readonly OverruledClaim[];
  },
  verbs: ClaimVerbs,
): MeaningCheck {
  const { plan, prd, flows, sources } = parts;
  const statements = statementsOf(plan, prd);
  const claimsOf = claimsFor(sources);
  const checked = [
    ...statements.map((each) => checkStatement(each, claimsOf(each), verbs)),
    ...stepChecks(flows, verbs),
  ];
  const prefixes = prefixesOf(sources);
  const proposed = prd.roles.map((role) => role.name).filter((name) => !roleStated(name, prefixes));
  const unstatedRoles = [
    ...proposed.map((role) => ({ where: 'PRD roles', role })),
    ...statements
      .filter((statement) => !statement.where.startsWith('PRD role '))
      .flatMap((statement) =>
        proposed
          .filter((role) => namesRole(statement.text, role))
          .map((role) => ({ where: statement.where, role })),
      ),
  ];
  return {
    contradictions: checked.flatMap(({ clash }) => (clash === undefined ? [] : [clash])),
    unstatedValues: checked.flatMap(({ values }) => values),
    unstatedRoles,
    proposedRoles: proposed,
    overruled: parts.overruled,
  };
}
