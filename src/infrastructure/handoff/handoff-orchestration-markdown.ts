import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { modelForTier, resolveBuildMethod } from '../../domain/planning/build-method.js';
import type { BuildMethod } from '../../domain/planning/build-method.js';
import { difficultyBands } from '../../domain/planning/task-method.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { grepRows, stackLanguages, unlistedLanguages } from './handoff-grep-rules.js';
import type { GrepSource } from './handoff-grep-rules.js';
import { handoffFiles } from './handoff-links.js';

// RF-612, RF-640: the build protocol of an AI-assisted build, written in the package's own words:
// who does what, which model tier takes which card, what happens when a review fails, how a card
// moves, when a pull request may merge and which formats the reports use. Every section is a
// function in `orchestrationSections`; a later card adds its section to that list. Model names
// come from the brief and go through the escaper; nothing else in the file is model text.

type SectionWriter = (handoff: HandoffPackage, esc: MarkdownEscaper) => string[];
type Tier = (typeof difficultyBands)[number]['tier'];

const notNamed = 'not named';

function modelOf(method: BuildMethod, tier: Tier, esc: MarkdownEscaper): string {
  const model = modelForTier(method, tier);
  return model === undefined ? notNamed : esc.inline(model);
}

function verifierTier(from: number): Tier {
  return from >= 9 ? 'largest' : 'middle';
}

const rolesSection: SectionWriter = () => [
  '## Roles',
  '',
  '- Orchestrator: runs as the main session, never as a subagent, because a subagent cannot start builders. It reads the task cards, picks the cards that are ready, starts one builder per card, opens the pull request, starts the verifier, posts the verdict and merges under the merge rules below. It does not write the code of a card.',
  '- Builder per tier: one builder takes one card on its own branch, in its own worktree, and reports in the format below. The tier follows the difficulty of the card. A builder never merges and never changes the scope of its card.',
  '- Independent verifier: a different agent from the builder checks the branch against the card, the requirements, the decisions and the conventions, runs every gate itself and returns PASS or FAIL. It never edits the branch and never verifies its own work.',
  '- Person: answers open questions, opens the human gates and merges every pull request labelled `needs-owner`.',
  '',
];

const bandsSection: SectionWriter = (handoff, esc) => {
  const method = resolveBuildMethod(handoff.brief.buildMethod);
  const escalation = method.models?.escalation;
  return [
    '## Bands and models',
    '',
    'The difficulty of a card (1 to 10) selects the tier that builds it and the tier that verifies it. A card with a risk class other than `none` is built by at least the middle tier. When in doubt between two bands, take the higher one.',
    '',
    '| Difficulty | Builder tier | Builder model | Verifier tier | Verifier model |',
    '| ---------- | ------------ | ------------- | ------------- | -------------- |',
    ...difficultyBands.map((band) => {
      const verifier = verifierTier(band.from);
      return `| ${String(band.from)} to ${String(band.to)} | ${band.tier} | ${modelOf(method, band.tier, esc)} | ${verifier} | ${modelOf(method, verifier, esc)} |`;
    }),
    '',
    escalation === undefined
      ? 'No escalation model is named: when a card fails a third time, the owner decides what happens next.'
      : `The escalation model is ${esc.inline(escalation)}. It is used only with the owner's approval in chat, for a third attempt at a card; no card starts there.`,
    '',
  ];
};

const retrySection: SectionWriter = () => [
  '## Retry ladder',
  '',
  '- First failure: send the findings back to the same builder, with its context, for a second round.',
  '- Second failure: start a fresh builder one band up, and move the verifier up with it. A card of the largest tier stays there; a card goes up, never down.',
  "- Third failure: stop. The owner decides; if an escalation model is named, it is used only with the owner's approval.",
  '- The difficulty written on the card is not edited by a promotion; the pull request says that the card was promoted.',
  '',
];

const statusSection: SectionWriter = () => [
  '## Card status flow',
  '',
  'Statuses: `Todo`, `In progress`, `In review`, `Done` and `Blocked (<reason>)`. The reason is a gate, an open question, an escalation or a pull request waiting for the owner. Only the orchestrator changes a status; a builder never edits the task list on its branch.',
  '',
  '```mermaid',
  'stateDiagram-v2',
  '    state "In progress" as InProgress',
  '    state "In review" as InReview',
  '    [*] --> Todo',
  '    Todo --> InProgress: dependencies done and gates open',
  '    InProgress --> InReview: builder reports, pull request opened',
  '    InReview --> Done: verdict PASS, CI green, merged',
  '    InReview --> InProgress: verdict FAIL, retry ladder',
  '    InReview --> Blocked: third failure or needs-owner',
  '    Todo --> Blocked: gate closed or open question',
  '    Blocked --> Todo: the owner decides',
  '    Done --> [*]',
  '```',
  '',
];

const mergeSection: SectionWriter = () => [
  '## Merge rules',
  '',
  'The orchestrator merges a pull request only when all of these hold, checked again right before the merge:',
  '',
  '1. Continuous integration is green on every required check.',
  "2. The verifier's verdict is PASS with no BLOCKING or MAJOR finding, and it is posted on the pull request.",
  '3. The branch is up to date with the integration branch.',
  '4. The pull request does not change the specification, the ADRs, the decision log or the agent files. One that does is labelled `needs-owner` and only a person merges it. This is the default; a team without a status pull request may replace it by a decision it records.',
  '5. The merge is a squash, the branch is deleted, and nobody bypasses the branch protection or pushes to the integration branch.',
  '',
];

const redTestSection: SectionWriter = () => [
  '## Red test first',
  '',
  'For every scenario of the requirements a card builds, the builder writes the failing test before the code and sees it fail for the right reason. The failing test is committed in a `test:` commit before the `feat:` or `fix:` commit that makes it pass. The verifier checks the commit order.',
  '',
];

const formatsSection: SectionWriter = () => [
  '## Report and verdict formats',
  '',
  'Builder report:',
  '',
  '    TASK: <id> <title>   BRANCH: <branch>   DIFFICULTY: <n>',
  '    DONE: <deliverables completed, with paths>',
  '    NOT DONE / DEVIATIONS: <exact list, or "none">',
  '    SCENARIOS -> TESTS: <requirement id and scenario -> test file:line>',
  '    TDD ORDER: <test commit -> feat or fix commit -> refactor commit>',
  '    VERIFY: <last lines of the check command and its exit code>',
  '    DOCS UPDATED: <files, or "none">',
  '    OPEN QUESTIONS: <what the verifier or the owner must decide, or "none">',
  '',
  'Verifier verdict:',
  '',
  '    VERDICT: PASS | FAIL',
  '    TASK: <id>   BRANCH: <branch>',
  '    FINDINGS: <one per line: severity, file:line, what is wrong, what to do>',
  '',
  'Severities are BLOCKING, MAJOR and MINOR. Any BLOCKING or MAJOR finding is a FAIL; a PASS may carry MINOR findings, which become follow-up cards.',
  '',
];

function grepTableLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const rows = grepRows(handoff);
  if (rows.length === 0) {
    return [
      'The package states no rule a search can check; the verifier checks the rules below by reading.',
      '',
    ];
  }
  return [
    'The verifier searches the branch for these patterns and reports each hit that sits outside the place the rule allows. Each row comes from a principle, the style or the risk class of a card in this package. A row marked "stated by" is a rule the package states. A row marked only "suggested by" is a suggestion: the principle names the area but not the rule, or the risk class asks for care without stating a rule, and the team may drop it.',
    '',
    '| Pattern | Rule | Source |',
    '| ------- | ---- | ------ |',
    ...rows.map(
      (row) =>
        `| ${row.patterns.map((each) => `\`${each}\``).join(', ')} | ${row.rule} | ${sourceText(row.sources, esc)} |`,
    ),
    '',
    ...languageLines(handoff, esc),
  ];
}

function sourceText(sources: readonly GrepSource[], esc: MarkdownEscaper): string {
  return sources.map((each) => `${each.kind} by ${esc.inline(each.name)}`).join('; ');
}

/** P6-07: why some languages get no pattern; nothing when every language of the stack has its patterns. */
function languageLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const unlisted = unlistedLanguages(handoff);
  if (unlisted.length > 0) {
    return [
      `No search pattern is listed for ${unlisted.map((each) => esc.inline(each)).join(', ')}; only the patterns that hold in any language apply to its code, so add the patterns of that language to this table.`,
      '',
    ];
  }
  if (stackLanguages(handoff).length > 0) return [];
  return [
    'No language is chosen in the stack, so only the patterns that hold in any language are listed; add those of the language when it is chosen.',
    '',
  ];
}

const grepsSection: SectionWriter = (handoff, esc) => [
  '## Hard-rule greps',
  '',
  ...grepTableLines(handoff, esc),
  ...(handoff.principles.length === 0
    ? []
    : [
        'The chosen principles are checked by reading:',
        '',
        ...handoff.principles.map(
          (each) => `- ${esc.inline(each.title)}: ${esc.inline(each.check)}`,
        ),
        '',
      ]),
];

/** Each section of orchestration.md in order; a later card appends its section to this list. */
export const orchestrationSections: readonly SectionWriter[] = [
  rolesSection,
  bandsSection,
  retrySection,
  statusSection,
  mergeSection,
  redTestSection,
  formatsSection,
  grepsSection,
];

// RF-640
export function orchestrationMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return [
    '# orchestration.md',
    '',
    `The build protocol: who does what, which model takes which card, what happens when a review fails and when a pull request may merge. Start with [AGENTS.md](${handoffFiles.agents}).`,
    '',
    ...orchestrationSections.flatMap((each) => each(handoff, esc)),
  ].join('\n');
}
