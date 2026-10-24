import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import {
  countByArea,
  countByKind,
  countByStatus,
  rankLeftOut,
  type LeftOutCount,
} from '../../domain/planning/left-out-claims.js';
import type { ExcludedClaim } from '../../domain/planning/plan-sources.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { handoffFiles, idLink } from './handoff-links.js';

// P5-26, RF-604, P3-121: the claims the package does not use. open-questions.md holds a short
// summary (counts per card kind, area and status, and the most important claims) and links this
// file, which lists every claim. Ids come from code; the area comes from model output and goes through the escaper. The text of a
// claim the verifier did not support is not written: nothing unsupported enters the package.

/** How many claims the summary in open-questions.md names. */
const summaryClaims = 20;

function countTable(
  heading: string,
  counts: readonly LeftOutCount[],
  name: (value: string) => string,
): string[] {
  return [
    `| ${heading} | Claims left out |`,
    '|---|---|',
    ...counts.map((each) => `| ${name(each.name)} | ${String(each.count)} |`),
  ];
}

/** The card as a link into sources.md, or its id alone when no claim of it was supported (RF-602). */
function cardCell(claim: ExcludedClaim, inSources: ReadonlySet<string>): string {
  return inSources.has(claim.cardId) ? idLink(claim.cardId, handoffFiles.sources) : claim.cardId;
}

function claimRow(
  claim: ExcludedClaim,
  esc: MarkdownEscaper,
  inSources: ReadonlySet<string>,
): string {
  const cells = [
    esc.inline(claim.claimId),
    cardCell(claim, inSources),
    claim.cardType,
    esc.inline(claim.area),
    String(claim.citations),
    claim.status,
  ];
  return `| ${cells.join(' | ')} |`;
}

const claimHeader = [
  '| Claim | Card | Kind | Area | Citations | Status |',
  '|---|---|---|---|---|---|',
];

/** The "Claims left out" section of open-questions.md. */
// RF-604
export function leftOutSummaryLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const claims = handoff.excluded;
  if (claims.length === 0) return ['No claim was left out.'];
  const ranked = rankLeftOut(claims);
  const inSources = new Set(handoff.sources.map((card) => card.id));
  const shown = Math.min(summaryClaims, ranked.length);
  return [
    `${String(claims.length)} ${claims.length === 1 ? 'claim was' : 'claims were'} left out: the verifier did not find them supported by the code (rejected, with an invalid citation, or never judged). The package uses none of them. [${handoffFiles.claimsLeftOut}](${handoffFiles.claimsLeftOut}) lists every one.`,
    '',
    ...countTable('Card kind', countByKind(claims), (name) => name),
    '',
    ...countTable('Status', countByStatus(claims), (name) => name),
    '',
    ...countTable('Area', countByArea(claims), (name) => esc.inline(name)),
    '',
    `${shown === 1 ? 'The most important claim' : `The ${String(shown)} most important claims`} (business rules first, then features, then the other kinds; within a kind, the claims with the most citations first):`,
    '',
    ...claimHeader,
    ...ranked.slice(0, summaryClaims).map((claim) => claimRow(claim, esc, inSources)),
  ];
}

/** The full list of the claims left out, most important first. */
// RF-604
export function claimsLeftOutMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const claims = handoff.excluded;
  const inSources = new Set(handoff.sources.map((card) => card.id));
  return [
    '# Claims left out of the package',
    '',
    `Claims the verifier did not find supported by the code (rejected, with an invalid citation, or never judged). The package uses none of them. The summary is in [open questions](${handoffFiles.openQuestions}). The list is ordered by importance: business rules first, then features, then the other kinds; within a kind, the claims with the most citations first.`,
    '',
    ...(claims.length === 0
      ? ['No claim was left out.']
      : [...claimHeader, ...rankLeftOut(claims).map((claim) => claimRow(claim, esc, inSources))]),
    '',
  ].join('\n');
}
