import { modelMapOf, modelTiers } from './build-method.js';
import type { Catalogue } from './catalogue.js';
import { migrationStrategies } from './planning-brief.js';
import type { PlanningBrief } from './planning-brief.js';
import { migrationStrategyInfo } from './migration-strategy.js';
import {
  contextWording,
  keepLegacyWording,
  methodWording,
  OPEN_OPTION_ID,
  type WordedOption,
} from './question-wording.js';

// RF-637, RF-645, DEC-178, DEC-184, DEC-189, P6-31: the Plan setup options of each brief question
// that took its default, so the open questions of the package list them as suggested answers. The
// wording follows web/src/lib/plan-setup/question-options.ts, which the page shows; the default
// is the recommended option, and the build method has no recommended option (DEC-184). A tier-model
// question that took its default offers the model map of the brief's tool (P7-12, EV-77).

export interface BriefOption {
  readonly answer: string;
  readonly description: string;
  readonly recommended: boolean;
}

const pick = (answer: string, description: string, recommended = false): BriefOption => ({
  answer,
  description,
  recommended,
});

/** The wording of the fixed options (question-wording.ts): the same text the page shows. */
const worded = (option: WordedOption): BriefOption =>
  pick(option.title, option.description, option.id === OPEN_OPTION_ID);

const KEEP_LEGACY: BriefOption = worded(keepLegacyWording);
const METHOD: readonly BriefOption[] = methodWording.map(worded);

const recommendedFirst = (list: readonly BriefOption[]): BriefOption[] => [
  ...list.filter((option) => option.recommended),
  ...list.filter((option) => !option.recommended),
];

function principles(catalogue: Catalogue): BriefOption[] {
  return recommendedFirst(
    catalogue.entries
      .filter((entry) => entry.group !== 'architecture-styles')
      .map((entry) => pick(entry.title, entry.rule, entry.defaultOn)),
  );
}

function architecture(brief: PlanningBrief, catalogue: Catalogue): BriefOption[] {
  return recommendedFirst(
    catalogue.styles.map((style) =>
      pick(style.title, style.rule, style.id === brief.architecture.style),
    ),
  );
}

function migration(): BriefOption[] {
  return migrationStrategies.map((id, index) =>
    pick(migrationStrategyInfo[id].title, migrationStrategyInfo[id].tradeOff, index === 0),
  );
}

function stack(layer: string, brief: PlanningBrief, catalogue: Catalogue): BriefOption[] {
  const proposed = brief.stack.find((entry) => entry.layer === layer && entry.proposed === true);
  const named = catalogue.stack.technologies
    .filter((technology) => technology.layer === layer && technology.name !== proposed?.choice)
    .slice(0, proposed === undefined ? 3 : 2)
    .map((technology) => pick(technology.name, technology.description));
  return [
    ...(proposed === undefined
      ? []
      : [
          pick(
            proposed.choice,
            'The closest to the legacy technology, so the smallest change for the team.',
            true,
          ),
        ]),
    ...named,
    KEEP_LEGACY,
  ];
}

/** P7-12, RF-639, RF-645: the tool's models for a blank tier, the tier's own first and recommended. */
function modelOptions(tier: string, brief: PlanningBrief, catalogue: Catalogue): BriefOption[] {
  const map = modelMapOf(brief.buildMethod.agentTool, catalogue.agentModels);
  const own = modelTiers.find((each) => each === tier);
  if (map === undefined || own === undefined) return [];
  const title = brief.buildMethod.agentTool?.kind === 'codex' ? 'Codex' : 'Claude Code';
  return recommendedFirst(
    modelTiers.map((each) =>
      each === own
        ? pick(
            map[each],
            `The ${each} tier model of ${title}; this tier uses it until you name another.`,
            true,
          )
        : pick(
            map[each],
            `The ${each} tier model of ${title}, for a team that builds this tier with it.`,
          ),
    ),
  );
}

function optionsOf(id: string, brief: PlanningBrief, catalogue: Catalogue): BriefOption[] {
  if (id === 'principles') return principles(catalogue);
  if (id === 'architecture') return architecture(brief, catalogue);
  if (id === 'migration') return migration();
  if (id === 'buildMethod') return [...METHOD];
  if (id.startsWith('buildMethod.models.'))
    return modelOptions(id.slice('buildMethod.models.'.length), brief, catalogue);
  if (id.startsWith('stack.')) return stack(id.slice('stack.'.length), brief, catalogue);
  return (contextWording[id] ?? []).map(worded);
}

/** The options of every question the brief left at its default, by question id; none for an unknown id. */
export function briefQuestionOptions(
  brief: PlanningBrief,
  catalogue: Catalogue,
): Record<string, readonly BriefOption[]> {
  return Object.fromEntries(
    brief.defaulted
      .map((id) => [id, optionsOf(id, brief, catalogue)] as const)
      .filter(([, options]) => options.length > 0),
  );
}
