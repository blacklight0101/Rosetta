import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { migrationStrategyInfo } from '../../domain/planning/migration-strategy.js';
import { difficultyBands } from '../../domain/planning/task-method.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { decisionLink, handoffFiles } from './handoff-links.js';
import { metricsRuleLines } from './handoff-metrics-markdown.js';
import { operationsLines } from './handoff-parallel-markdown.js';
import { behaviourRuleLines } from './handoff-behaviour-markdown.js';
import { qualityRuleLines } from './handoff-quality-markdown.js';
import { uploadSentence } from '../../domain/sources/upload-facts.js';

// RF-607, RF-608, RF-609, RF-612, RF-636, DEC-75, DEC-76: the working rules of the package. The
// conventions document turns each chosen principle into a rule with its reason and its check, and
// states the chosen style and technologies. `AGENTS.md` is written only for an AI-assisted build:
// the same principles and stack as rules for an agent, the rule to plan before building, how the
// task cards are rated and the human review of every pull request. Plain Markdown, in Rosetta's
// words; a principle that was not chosen appears in neither.

function principleLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  if (handoff.principles.length === 0) return ['No principle was chosen.', ''];
  return handoff.principles.flatMap((each) => [
    `### ${esc.inline(each.title)}`,
    '',
    `Rule: ${esc.inline(each.rule)}`,
    '',
    `Why it matters: ${esc.inline(each.why)}`,
    '',
    `How to check: ${esc.inline(each.check)}`,
    '',
  ]);
}

function styleLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { style, choices } = handoff;
  const decision = choices.style === '' ? '' : ` (${decisionLink(choices.style)})`;
  return [
    `**${esc.inline(style.title)}**${decision}: ${esc.inline(style.rule)}`,
    '',
    `How to check: ${esc.inline(style.check)}`,
    '',
  ];
}

function technologyLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { stack } = handoff.choices;
  if (stack.length === 0) return ['The planning brief chose no technology.', ''];
  return [
    ...stack.map(
      (each) =>
        `- ${esc.inline(each.name)}: ${esc.inline(each.choice)} (${decisionLink(each.decision)})`,
    ),
    '',
  ];
}

// RF-607, RF-608, RF-609
export function conventionsMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return [
    '# Conventions',
    '',
    `The rules the build follows. Each one comes from a choice in the planning brief (see the [README](${handoffFiles.readme})); a principle that was not chosen is not listed. The task cards carry the checks that concern them.`,
    '',
    '## Principles and practices',
    '',
    ...principleLines(handoff, esc),
    '## Architecture style',
    '',
    ...styleLines(handoff, esc),
    '## Technology',
    '',
    ...technologyLines(handoff, esc),
  ].join('\n');
}

function bandLines(): string[] {
  return difficultyBands.map(
    (band) =>
      `- Difficulty ${String(band.from)} to ${String(band.to)}: the ${band.tier} model tier.`,
  );
}

/** The system the package replaces: its repository address, or the uploaded zip (RF-131). */
function replacedSystem(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const { repository, upload } = handoff;
  return upload === undefined ? esc.url(repository.url) : esc.inline(uploadSentence(upload));
}

// RF-612
export function agentsMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const strategy = migrationStrategyInfo[handoff.brief.migration];
  return [
    '# AGENTS.md',
    '',
    `Instructions for the AI agents (and the people) who build the new system that replaces ${replacedSystem(handoff, esc)}. The requirements, the architecture and the task cards are in the [README](${handoffFiles.readme}) reading order; the rules below come from the planning brief.`,
    '',
    '## Rules from the chosen principles',
    '',
    ...(handoff.principles.length === 0
      ? ['No principle was chosen.']
      : handoff.principles.map(
          (each) =>
            `- ${esc.inline(each.title)}: ${esc.inline(each.rule)} Check: ${esc.inline(each.check)}`,
        )),
    '',
    '## Architecture and migration',
    '',
    ...styleLines(handoff, esc),
    `Migration: ${esc.inline(strategy.title)} (${decisionLink(handoff.choices.migration)}). ${esc.inline(strategy.ordering)}`,
    '',
    '## Technology',
    '',
    ...technologyLines(handoff, esc),
    'Use only the technologies above. When a task needs another one, stop and ask instead of choosing.',
    '',
    '## Plan before building',
    '',
    `Before writing code for a task card, read the card and the requirements it names, then write a short plan: the files to change, the tests to write and what could go wrong. Build only after the plan matches the card. If the card and the requirements disagree, stop and ask. The cards are in [the task cards](${handoffFiles.tasks}).`,
    '',
    '## Task cards and difficulty',
    '',
    'Every task card has a difficulty from 1 to 10. Give the card to the model tier of its band:',
    '',
    ...bandLines(),
    '',
    ...qualityRuleLines(),
    ...behaviourRuleLines(),
    ...operationsLines(),
    ...metricsRuleLines(),
    '## Human review',
    '',
    'A person reviews every pull request before it is merged. The reviewer checks the card, the acceptance criteria and the review checklist on the card, and no agent merges its own work.',
    '',
  ].join('\n');
}
