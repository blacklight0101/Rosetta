import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { migrationStrategyInfo } from '../../domain/planning/migration-strategy.js';
import { bandsFor } from '../../domain/planning/task-method.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import {
  hasOwnAnswer,
  ownAnswerLines,
  ownAnswerText,
  ownPrincipleBullets,
  referenceLine,
} from './handoff-own-answers-markdown.js';
import { writesAgentFolder } from './handoff-agents-folder.js';
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
  const own = ownAnswerLines(handoff, 'principles', esc);
  if (handoff.principles.length === 0) return ['No principle was chosen.', '', ...own];
  return [
    ...handoff.principles.flatMap((each) => [
      `### ${esc.inline(each.title)}`,
      '',
      `Rule: ${esc.inline(each.rule)}`,
      '',
      `Why it matters: ${esc.inline(each.why)}`,
      '',
      `How to check: ${esc.inline(each.check)}`,
      '',
    ]),
    ...own,
  ];
}

function styleLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { style, choices } = handoff;
  const decision = choices.style === '' ? '' : ` (${decisionLink(choices.style)})`;
  // DEC-184: the owner's own answer leads and the default style is only the reference.
  const named = hasOwnAnswer(handoff, 'architecture')
    ? referenceLine(esc.inline(style.title), decision, 'style', esc.inline(style.rule))
    : `**${esc.inline(style.title)}**${decision}: ${esc.inline(style.rule)}`;
  return [
    ...ownAnswerLines(handoff, 'architecture', esc),
    named,
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

function bandLines(handoff: HandoffPackage): string[] {
  return bandsFor(handoff.brief.buildMethod).map(
    (band) =>
      `- Difficulty ${String(band.from)} to ${String(band.to)}: the ${band.tier} model tier.`,
  );
}

/** The system the package replaces: its repository address, or the uploaded zip (RF-131). */
function replacedSystem(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const { repository, upload } = handoff;
  return upload === undefined ? esc.url(repository.url) : esc.inline(uploadSentence(upload));
}

const longRulesHeading = '## Rules kept in this file';
const unknownCommand = 'Unknown: decide it when the stack is set up';

const commandRows: readonly (readonly [string, string])[] = [
  ['install', 'Fetch the dependencies'],
  ['run', 'Start the application locally'],
  ['test', 'Run the tests'],
  ['check', 'Run every gate before asking for review'],
];

/** RF-640: the command table; the package knows no command, so each value is marked unknown. */
function commandLines(): string[] {
  return [
    '| Command | What it does | Value |',
    '| ------- | ------------ | ----- |',
    ...commandRows.map(([name, what]) => `| ${name} | ${what} | ${unknownCommand} |`),
  ];
}

function principleBullets(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const own = ownPrincipleBullets(handoff, esc);
  if (handoff.principles.length === 0) return ['No principle was chosen.', ...own];
  return [
    ...handoff.principles.map(
      (each) =>
        `- ${esc.inline(each.title)}: ${esc.inline(each.rule)} Check: ${esc.inline(each.check)}`,
    ),
    ...own,
  ];
}

/** The migration line of the layout: the owner's own answer first and the default as the reference. */
function migrationLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const strategy = migrationStrategyInfo[handoff.brief.migration];
  const record = ` (${decisionLink(handoff.choices.migration)})`;
  const own = ownAnswerText(handoff, 'migration', esc);
  if (own === undefined) {
    return [
      `Migration: ${esc.inline(strategy.title)}${record}. ${esc.inline(strategy.ordering)}`,
      '',
    ];
  }
  return [
    `Migration, the owner's own answer: ${own}`,
    '',
    referenceLine(esc.inline(strategy.title), record, 'strategy', esc.inline(strategy.ordering)),
    '',
  ];
}

function indexLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  return [
    '# AGENTS.md',
    '',
    `Instructions for the AI agents (and the people) who build the new system that replaces ${replacedSystem(handoff, esc)}. Start here.`,
    '',
    '## Start here',
    '',
    `1. Read the [README](${handoffFiles.readme}) reading order: the requirements, the architecture and the decisions.`,
    `2. Read [orchestration.md](${handoffFiles.orchestration}) for the roles, the model bands, the retry ladder and the merge rules.${writesAgentFolder(handoff.brief.buildMethod) ? ` The agent definitions of those roles are in [agents/README.md](${handoffFiles.agentsReadme}); copy them only as that note says.` : ''}`,
    `3. Take one card from [the task cards](${handoffFiles.tasks}) and give it to the model tier of its band (see Task cards and difficulty below).`,
    '4. Read [Operations](#operations) before you work next to other agents, and [Risk class](#risk-class) before you take a risky card.',
    '',
    '## Commands',
    '',
    ...commandLines(),
    '',
    '## Rules broken most often',
    '',
    ...principleBullets(handoff, esc),
    '- Use only the technologies listed under Layout; when a task needs another one, stop and ask instead of choosing.',
    '- Write the failing test first and keep every card to its own files.',
    '',
    '## Layout',
    '',
    ...styleLines(handoff, esc),
    ...migrationLines(handoff, esc),
    ...technologyLines(handoff, esc),
    '## Plan before building',
    '',
    'Before writing code for a task card, read the card and the requirements it names, then write a short plan: the files to change, the tests to write and what could go wrong. Build only after the plan matches the card. If the card and the requirements disagree, stop and ask.',
    '',
    '## Human review',
    '',
    'A person reviews every pull request before it is merged. The reviewer checks the card, the acceptance criteria and the review checklist on the card, and no agent merges its own work.',
    '',
  ];
}

/** The rules kept in this file; the build protocol is in `orchestration.md` (P6-07, RF-636). */
function longRuleLines(handoff: HandoffPackage): string[] {
  return [
    longRulesHeading,
    '',
    `The sections below are the rules of the build kept in this file: task cards, quality, behaviour, operations and metrics. The build protocol (roles, bands, retry ladder, merge rules) is in [orchestration.md](${handoffFiles.orchestration}). The start-here index above does not depend on these sections.`,
    '',
    '## Task cards and difficulty',
    '',
    'Every task card has a difficulty from 1 to 10. Give the card to the model tier of its band:',
    '',
    ...bandLines(handoff),
    '',
    ...qualityRuleLines(),
    ...behaviourRuleLines(),
    ...operationsLines(),
    ...metricsRuleLines(),
  ];
}

// RF-612, RF-640
export function agentsMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return [...indexLines(handoff, esc), ...longRuleLines(handoff)].join('\n');
}
