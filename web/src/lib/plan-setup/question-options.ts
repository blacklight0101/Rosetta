import type { Catalogue, PlanOptions } from '../../api/plan-schemas.js';
import { STEP_IDS, questionsOf, STACK_LAYERS, STYLE_GROUP } from './steps.js';

// RF-645, RF-605, DEC-178: the options of every Plan setup question, the way Claude Code asks: at
// least three, the recommended one first and marked, each with a one-line description, then "Type
// your own answer". A question with two natural answers adds a qualified third. The recommended
// option is the default that applies when the question is skipped (DEC-80: nothing is invented, so
// for a project-context question that is "leave it open").

export interface QuestionOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly recommended: boolean;
  /** For a project-context question: the text the option puts in the field. */
  readonly value?: string;
}

export const OWN_ANSWER = 'Type your own answer';

/** Every question of the six steps, in question order. */
export const OPTION_QUESTIONS: readonly string[] = STEP_IDS.flatMap((step) => questionsOf(step));

export interface OptionSources {
  readonly catalogue: Catalogue;
  readonly options: PlanOptions | undefined;
}

/** The title with its "(Recommended)" mark. */
export function optionTitle(option: QuestionOption): string {
  return option.recommended ? `${option.title} (Recommended)` : option.title;
}

const open = (what: string): QuestionOption => ({
  id: 'open',
  title: 'Leave it open',
  description: `Nothing is assumed about ${what}; the package lists it as an open question.`,
  recommended: true,
  value: '',
});

const pick = (id: string, title: string, description: string, value = title): QuestionOption => ({
  id,
  title,
  description,
  recommended: false,
  value,
});

const CONTEXT: Readonly<Record<string, readonly QuestionOption[]>> = {
  'context.teamSize': [
    open('the team size'),
    pick(
      'solo',
      'One person',
      'The roadmap is sized for one builder, so phases are small and serial.',
      '1',
    ),
    pick('small', 'A small team of 4', 'The roadmap lets about four people work in parallel.', '4'),
    pick(
      'large',
      'A large team of 10',
      'The roadmap runs several tracks at once, at more coordination cost.',
      '10',
    ),
  ],
  'context.experience': [
    open('the team experience'),
    pick(
      'new',
      'New to the target stack',
      'The roadmap adds learning time and starts with small cards.',
    ),
    pick('mixed', 'Mixed experience', 'The roadmap pairs newer people with experienced ones.'),
    pick('expert', 'Experienced with the target stack', 'The roadmap assumes no ramp-up time.'),
  ],
  'context.deadline': [
    open('a deadline'),
    pick('none', 'No fixed deadline', 'The roadmap orders phases by risk, with no date pressure.'),
    pick('six-months', 'Within six months', 'The roadmap cuts scope to the essential flows first.'),
    pick('one-year', 'Within a year', 'The roadmap has room for every phase, one after another.'),
  ],
  'context.keepIntegrations': [
    open('integrations'),
    pick(
      'all',
      'Every integration stays',
      'Every integration the code shows is kept as it is.',
      'Every current integration stays as it is',
    ),
    pick(
      'none',
      'No integration has to stay',
      'Integrations may be redesigned with the new system.',
      'No integration has to stay as it is',
    ),
  ],
  'context.dataMigration': [
    open('the data migration'),
    pick(
      'once',
      'Move all data once, at cut-over',
      'One migration at the end; simple, with a short freeze.',
      'Move all the data once, at cut-over',
    ),
    pick(
      'phased',
      'Move data with each phase',
      'Data moves with the part of the system that uses it; no freeze.',
      'Move the data with each phase',
    ),
  ],
};

function principleOptions(catalogue: Catalogue): QuestionOption[] {
  const entries = catalogue.entries.filter((entry) => entry.group !== STYLE_GROUP);
  const options = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    description: entry.rule,
    recommended: entry.defaultOn,
  }));
  return [...options.filter((o) => o.recommended), ...options.filter((o) => !o.recommended)];
}

function architectureOptions({ catalogue, options }: OptionSources): QuestionOption[] {
  const recommended = options?.architecture.recommended;
  const styles = catalogue.entries.filter((entry) => entry.group === STYLE_GROUP);
  const proposed = options?.architecture.options.map((option) => option.style) ?? [];
  const order = [
    ...(recommended === undefined ? [] : [recommended]),
    ...proposed.filter((style) => style !== recommended),
    ...styles.map((entry) => entry.id).filter((id) => !proposed.includes(id)),
  ];
  return order.flatMap((id) => {
    const entry = styles.find((each) => each.id === id);
    if (entry === undefined) return [];
    return [{ id, title: entry.title, description: entry.rule, recommended: id === recommended }];
  });
}

function stackOptions(layer: string, options: PlanOptions | undefined): QuestionOption[] {
  const offered = options?.stack.find((each) => each.layer === layer)?.options ?? [];
  const proposals = offered.map((choice, index) => ({
    id: index === 0 ? 'a' : 'b',
    title: choice,
    description:
      index === 0
        ? 'The closest to the legacy technology, so the smallest change for the team.'
        : 'The other proposal for this layer, derived from the legacy stack.',
    recommended: index === 0,
  }));
  return [
    ...proposals,
    {
      id: 'keep-legacy',
      title: 'Keep the legacy technology',
      description: 'This layer stays as it is until the migration reaches it.',
      recommended: false,
    },
  ];
}

const METHOD: readonly QuestionOption[] = [
  {
    id: 'agents',
    title: 'Agents will build',
    description: 'The package adds the agent working method and the model of each task card.',
    recommended: false,
  },
  {
    id: 'people',
    title: 'People will build',
    description: 'The package is the plan and the specification, without the agent method.',
    recommended: false,
  },
  {
    id: 'both',
    title: 'Agents and people together',
    description: 'People lead and review every change; agents build the routine cards.',
    recommended: false,
  },
];

const withDefaultFirst = (options: readonly QuestionOption[]): QuestionOption[] => [
  ...options.filter((option) => option.recommended),
  ...options.filter((option) => !option.recommended),
];

/** The options of one question, the recommended one first (empty for an unknown question). */
export function questionOptions(id: string, sources: OptionSources): QuestionOption[] {
  const { catalogue, options } = sources;
  if (id === 'principles') return principleOptions(catalogue);
  if (id === 'architecture') return architectureOptions(sources);
  if (id === 'migration') {
    return catalogue.migrations.map((strategy, index) => ({
      id: strategy.id,
      title: strategy.title,
      description: strategy.tradeOff,
      recommended: index === 0,
    }));
  }
  if (id === 'buildMethod') return [...METHOD];
  const layer = STACK_LAYERS.find((each) => id === `stack.${each.id}`);
  if (layer !== undefined) return withDefaultFirst(stackOptions(layer.id, options));
  return withDefaultFirst(CONTEXT[id] ?? []);
}
