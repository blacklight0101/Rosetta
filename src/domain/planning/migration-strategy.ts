import type { PlanningBrief } from './planning-brief.js';

// RF-610, DEC-76: the three ways to move from the legacy system to the new one, each with the
// order its phases follow. The package's roadmap states the chosen order and its decision record
// weighs all three; the planner is given the order as part of the brief.

type MigrationStrategy = PlanningBrief['migration'];

interface StrategyInfo {
  readonly title: string;
  /** The strategy in words, as a brief question's default answer. */
  readonly answer: string;
  /** How the roadmap's phases are ordered under this strategy. */
  readonly ordering: string;
  readonly tradeOff: string;
}

export const migrationStrategyInfo: Readonly<Record<MigrationStrategy, StrategyInfo>> = {
  'strangler-fig': {
    title: 'Strangler Fig',
    answer: 'Strangler Fig: replace the legacy system one part at a time',
    ordering:
      'The phases replace the legacy system one part at a time. The legacy system keeps running, each part goes live on the new system before the next phase starts, and the legacy system is switched off after the last part.',
    tradeOff:
      'Risk stays small and value arrives early, but both systems run for a long time and need a routing layer between them.',
  },
  'parallel-change': {
    title: 'Parallel Change',
    answer: 'Parallel Change: run the old and the new side by side, then switch',
    ordering:
      'The phases add the new way beside the old, then move users over, and remove the old way last. Both ways work at the end of every phase.',
    tradeOff:
      'Every step can be undone, but the code carries both ways until the removal and the data may need to be written twice.',
  },
  rewrite: {
    title: 'Full rewrite',
    answer: 'a full rewrite',
    ordering:
      'The phases build the whole new system while the legacy system stays as it is. Users move over once, in a single cut-over after the last phase.',
    tradeOff:
      'The design is free of the legacy structure, but nothing reaches users until the end and the cut-over carries all the risk at once.',
  },
};
