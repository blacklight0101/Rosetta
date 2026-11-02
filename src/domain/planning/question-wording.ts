// RF-605, RF-637, RF-645, DEC-178, DEC-184, P6-31, P7-17: the one source of the fixed wording of the
// Plan setup options: the project-context answers, the build method and "keep the legacy technology".
// The server serves it with the catalogue (`GET /api/plan/catalogue`, `wording`) and uses it for the
// suggested answers of the package, so the page and the package cannot drift apart.

export interface WordedOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** For a project-context question: the text the option puts in the field. */
  readonly value: string;
}

/** The id of the "leave it open" option; it is the recommended one of a project-context question. */
export const OPEN_OPTION_ID = 'open';

const open = (what: string): WordedOption => ({
  id: OPEN_OPTION_ID,
  title: 'Leave it open',
  description: `Nothing is assumed about ${what}; the package lists it as an open question.`,
  value: '',
});

const pick = (id: string, title: string, description: string, value = title): WordedOption => ({
  id,
  title,
  description,
  value,
});

export const contextWording: Readonly<Record<string, readonly WordedOption[]>> = {
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

export const keepLegacyWording: WordedOption = pick(
  'keep-legacy',
  'Keep the legacy technology',
  'This layer stays as it is until the migration reaches it.',
);

/** The three build method options; none is recommended (DEC-184). */
export const methodWording: readonly WordedOption[] = [
  pick(
    'agents',
    'Agents will build',
    'The package adds the agent working method and the model of each task card.',
  ),
  pick(
    'people',
    'People will build',
    'The package is the plan and the specification, without the agent method.',
  ),
  pick(
    'both',
    'Agents build, people review each change',
    'Agents build every card and people review each change; the package is the same as for Agents will build.',
  ),
];
