import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { behavioursKeptByNoCard, behavioursOf } from '../../domain/planning/behaviours-to-keep.js';
import {
  coverageItems,
  coverageOf,
  type CoverageItem,
} from '../../domain/planning/plan-coverage.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { probeStatesOutcome } from '../../domain/planning/task-card-quality.js';
import { keepOrFixOf } from './handoff-keep-or-fix.js';
import { decisionLink } from './handoff-links.js';
import { requirementLines } from './handoff-requirement-notes-markdown.js';
import { stackClashCheckLines } from './handoff-stack-markdown.js';
import { styleLines } from './handoff-style-markdown.js';
import { truthfulCheckLines } from './handoff-truthful-checks-markdown.js';

// RF-627, RF-507, RNF-003: checks.md, what the package checks say about itself. The plan coverage
// lists every item (feature, table, operation, journey or screen) that no task card builds, kind by
// kind and by id, so the same package always gives the same list; the run that wrote such a
// package is not complete. Names are model text and go through the escaper; the kinds, ids' prefixes
// and sentences are Rosetta's.

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function rowOf(item: CoverageItem, esc: MarkdownEscaper): string {
  return `| ${item.kind} | ${esc.inline(item.id)} | ${esc.inline(item.name)} |`;
}

function coverageLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { items, uncovered } = coverageOf(coverageItems(handoff), handoff.content.tasks);
  const head = [
    '## Plan coverage',
    '',
    'Every feature of the product requirements document, table of the target data model, operation of the API contract, journey of the target flows and screen of the user-interface material is built by at least one task card that links it by its id. A card that only names an item in its title does not build it.',
    '',
  ];
  if (items.length === 0) {
    return [...head, 'The package has no item to cover.', ''];
  }
  if (uncovered.length === 0) {
    return [...head, 'Every item is built by at least one task card.', ''];
  }
  return [
    ...head,
    `${plural(uncovered.length, 'item')} of ${String(items.length)} ${uncovered.length === 1 ? 'is' : 'are'} built by no task card; the run is not complete.`,
    '',
    '| Kind | Id | Name |',
    '|---|---|---|',
    ...uncovered.map((item) => rowOf(item, esc)),
    '',
  ];
}

// RF-625: the steps of a target flow no component covers, and those the code placed from the files
// they cite instead of the planner, counted per flow.
function unmappedFlowLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const rows = handoff.flows.flows.flatMap((flow) => {
    const none = flow.steps.filter((step) => step.component === null).length;
    const inferred = flow.steps.filter((step) => step.inferred).length;
    return none + inferred === 0
      ? []
      : [
          `- ${esc.inline(flow.cardId)}: ${String(none)} of ${String(flow.steps.length)} steps not mapped, ${String(inferred)} inferred`,
        ];
  });
  if (rows.length === 0) return [];
  return [
    '## Flow steps not mapped or inferred',
    '',
    'No component of the target architecture covers the code a not mapped step cites, so the flow file shows it as not mapped and draws it on the nearest component. An inferred step was placed by Rosetta from the files it cites, not by the planner; check it.',
    '',
    ...rows,
    '',
  ];
}

// RF-608, RF-609, RF-610: the planner decisions the package left out because a record of the brief decides them.
function restatedLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (handoff.restated.length === 0) return [];
  return [
    '## Decisions the brief already records',
    '',
    'The planner wrote these decisions with no source card; each only says again a choice the planning brief records, so the package keeps the record of the brief and links to it.',
    '',
    ...handoff.restated.map(
      (each) => `- ${esc.inline(each.title)}: see ${decisionLink(each.record)}`,
    ),
    '',
  ];
}

// RF-631: the legacy behaviour the migrations card no longer keeps and no task card keeps.
function keptByNoCardLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const lost = behavioursKeptByNoCard(
    handoff.content.tasks,
    handoff.content.requirements,
    handoff.sources,
    keepOrFixOf(handoff).context,
  );
  if (lost.length === 0) return [];
  return [
    '## Behaviour kept by no card',
    '',
    'A card keeps only the claims of the items it builds, and the migrations card only the business rules that name a table or a column it creates. Each behaviour below would be kept under the plain rule (every claim of the cards a requirement cites) and no task card keeps, changes or lists it now; the owner decides whether a card must build it.',
    '',
    ...lost.map(
      (each) =>
        `- ${esc.inline(each.claimId)} (${esc.inline(each.cardId)}): ${esc.inline(each.text)}`,
    ),
    '',
  ];
}

// P5-41: an acceptance criterion the planner says contradicts a claim its card keeps. The claim must be
// one the card keeps and the criterion must exist; anything else the planner wrote is not listed.
function contradictionLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { context } = keepOrFixOf(handoff);
  const rows = handoff.content.tasks.flatMap((task) => {
    const { keep } = behavioursOf(task, handoff.content.requirements, handoff.sources, context);
    return (task.contradicts ?? []).flatMap((each) => {
      const kept = keep.find((candidate) => candidate.claimId === each.claim);
      const criterion = task.acceptanceCriteria[each.criterion - 1];
      if (kept === undefined || criterion === undefined) return [];
      return [
        `- ${task.id}, criterion ${String(each.criterion)}: ${esc.inline(criterion)} Contradicts ${esc.inline(kept.claimId)}: ${esc.inline(kept.text)}`,
      ];
    });
  });
  if (rows.length === 0) return [];
  return [
    '## Acceptance criteria against kept claims',
    '',
    'The planner says each criterion below needs behaviour that a claim its card keeps says the legacy system does not have. Change the criterion, or decide that the claim is not to be kept (a decision or an answer, or a keep-or-fix row).',
    '',
    ...rows,
    '',
  ];
}

// P3-101, P3-102: the parts of the plan the package leaves out, grouped by area. The item is a position
// or a name from the planner's answer and goes through the escaper; the field and the reason are the
// plan's own words for the fault, never a sentence of the answer.
function leftOutLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (handoff.leftOut.length === 0) return [];
  const areas = [...new Set(handoff.leftOut.map((each) => each.area))];
  return [
    '## Left out',
    '',
    'The planner answer named these parts of the plan, and the package leaves them out. Each one is listed by its position or name, with the field that kept it out.',
    '',
    ...areas.flatMap((area) => [
      `### ${esc.inline(area)}`,
      '',
      ...handoff.leftOut
        .filter((each) => each.area === area)
        .map(
          (each) =>
            `- ${esc.inline(each.item)}: the field "${esc.inline(each.field)}". ${esc.inline(each.reason)}`,
        ),
      '',
    ]),
  ];
}

// P3-117, EV-34: the sentences that repeat the example of a planner prompt word for word. The
// sentence is the prompt's own, so it is shown; the reader checks it against the cards.
function copiedExampleLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (handoff.copiedExamples.length === 0) return [];
  return [
    '## Copied from a prompt example',
    '',
    'These sentences repeat an example sentence of a planner prompt word for word. No card may support them; check each one against the cards before the team builds from it.',
    '',
    ...handoff.copiedExamples.map(
      (each) => `- ${esc.inline(each.where)}: ${esc.inline(each.sentence)}`,
    ),
    '',
  ];
}

// RF-604, P3-121: the source run ended at a cap; only the claims it had judged were used.
function sourceStopLines(handoff: HandoffPackage): string[] {
  const stop = handoff.sourceStop;
  if (stop === undefined) return [];
  const { unjudgedClaims: left, totalClaims: total } = stop;
  return [
    '## Source run stopped at a cap',
    '',
    `The understand run this package was planned from (${handoff.sourceRun}) stopped at a cap before it finished. Only its Supported claims were used. ${String(left)} of ${String(total)} claim${total === 1 ? '' : 's'} ${left === 1 ? 'was' : 'were'} never judged and ${left === 1 ? 'is' : 'are'} excluded; the areas it did not read are not in the package. Resume the run, then write the package again to cover them.`,
    '',
  ];
}

// P5-08, RF-630: the probes that say what to try but not what must happen. Only the card id and the
// position of the probe are shown; the probe text stays on its card.
function probeOutcomeLines(handoff: HandoffPackage): string[] {
  const missing = handoff.content.tasks.flatMap((task) =>
    task.probes.flatMap((probe, at) =>
      probeStatesOutcome(probe) ? [] : [`- ${task.id}, probe ${String(at + 1)}`],
    ),
  );
  if (missing.length === 0) return [];
  return [
    '## Probes without an expected outcome',
    '',
    'A review probe is an input together with what must happen for it. These probes state only the input; the reviewer cannot tell a pass from a fail, so add the expected outcome before the card is built.',
    '',
    ...missing,
    '',
  ];
}

// RF-627
export function checksMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const lines = [
    ...sourceStopLines(handoff),
    ...coverageLines(handoff, esc),
    ...truthfulCheckLines(handoff, esc),
    ...unmappedFlowLines(handoff, esc),
    ...styleLines(handoff, esc),
    ...stackClashCheckLines(handoff, esc),
    ...restatedLines(handoff, esc),
    ...requirementLines(handoff.content.requirementNotes ?? []),
    ...keptByNoCardLines(handoff, esc),
    ...contradictionLines(handoff, esc),
    ...probeOutcomeLines(handoff),
    ...copiedExampleLines(handoff, esc),
    ...leftOutLines(handoff, esc),
  ];
  return ['# Package checks', '', ...lines].join('\n');
}
