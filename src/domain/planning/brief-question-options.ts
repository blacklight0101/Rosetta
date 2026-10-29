import type { Catalogue } from './catalogue.js';
import { migrationStrategies } from './planning-brief.js';
import type { PlanningBrief } from './planning-brief.js';
import { migrationStrategyInfo } from './migration-strategy.js';

// RF-637, RF-645, DEC-178, DEC-184, DEC-189, P6-31: the Plan setup options of each brief question
// that took its default, so the open questions of the package list them as suggested answers. The
// wording follows web/src/lib/plan-setup/question-options.ts, which the page shows; the default
// is the recommended option, and the build method has no recommended option (DEC-184).

export interface BriefOption {
  readonly answer: string;
  readonly description: string;
  readonly recommended: boolean;
}

const KEEP_LEGACY: BriefOption = {
  answer: 'Keep the legacy technology',
  description: 'This layer stays as it is until the migration reaches it.',
  recommended: false,
};

const pick = (answer: string, description: string, recommended = false): BriefOption => ({
  answer,
  description,
  recommended,
});

const open = (what: string): BriefOption =>
  pick(
    'Leave it open',
    `Nothing is assumed about ${what}; the package lists it as an open question.`,
    true,
  );

const CONTEXT: Readonly<Record<string, readonly BriefOption[]>> = {
  'context.teamSize': [
    open('the team size'),
    pick('One person', 'The roadmap is sized for one builder, so phases are small and serial.'),
    pick('A small team of 4', 'The roadmap lets about four people work in parallel.'),
    pick(
      'A large team of 10',
      'The roadmap runs several tracks at once, at more coordination cost.',
    ),
  ],
  'context.experience': [
    open('the team experience'),
    pick('New to the target stack', 'The roadmap adds learning time and starts with small cards.'),
    pick('Mixed experience', 'The roadmap pairs newer people with experienced ones.'),
    pick('Experienced with the target stack', 'The roadmap assumes no ramp-up time.'),
  ],
  'context.deadline': [
    open('a deadline'),
    pick('No fixed deadline', 'The roadmap orders phases by risk, with no date pressure.'),
    pick('Within six months', 'The roadmap cuts scope to the essential flows first.'),
    pick('Within a year', 'The roadmap has room for every phase, one after another.'),
  ],
  'context.keepIntegrations': [
    open('integrations'),
    pick('Every integration stays', 'Every integration the code shows is kept as it is.'),
    pick('No integration has to stay', 'Integrations may be redesigned with the new system.'),
  ],
  'context.dataMigration': [
    open('the data migration'),
    pick(
      'Move all data once, at cut-over',
      'One migration at the end; simple, with a short freeze.',
    ),
    pick(
      'Move data with each phase',
      'Data moves with the part of the system that uses it; no freeze.',
    ),
  ],
};

const METHOD: readonly BriefOption[] = [
  pick(
    'Agents will build',
    'The package adds the agent working method and the model of each task card.',
  ),
  pick(
    'People will build',
    'The package is the plan and the specification, without the agent method.',
  ),
  pick(
    'Agents build, people review each change',
    'Agents build every card and people review each change; the package is the same as for Agents will build.',
  ),
];

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

function optionsOf(id: string, brief: PlanningBrief, catalogue: Catalogue): BriefOption[] {
  if (id === 'principles') return principles(catalogue);
  if (id === 'architecture') return architecture(brief, catalogue);
  if (id === 'migration') return migration();
  if (id === 'buildMethod') return [...METHOD];
  if (id.startsWith('stack.')) return stack(id.slice('stack.'.length), brief, catalogue);
  return [...(CONTEXT[id] ?? [])];
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
