import type { LegacyFacts } from './application-kind.js';
import type { ApplicationKind, MigrationStrategy, PlanningBrief } from './planning-brief.js';
import type { StackData } from './stack-data.js';

// P5-39, RF-609, RF-610: what the plan proposes where the brief leaves a choice open. Type-only
// stub for the tests that come first; the next commit implements it.

export interface StrategyFit {
  readonly strategy: MigrationStrategy;
  readonly seam: 'shared-database' | null;
  readonly changedFrom: MigrationStrategy | null;
  readonly finding: string | null;
  readonly reason: string;
}

export interface PlanProposal {
  readonly kind: ApplicationKind;
  readonly kindFrom: 'owner' | 'code-map' | 'default';
  readonly kindReason: string;
  readonly layers: readonly {
    readonly layer: string;
    readonly choice: string;
    readonly why: string;
  }[];
  readonly fit: StrategyFit;
}

// RF-609, RF-610
export function proposeFor(
  brief: PlanningBrief,
  facts: LegacyFacts,
  stack: StackData,
): { readonly brief: PlanningBrief; readonly proposal: PlanProposal } {
  const fit = {
    strategy: brief.migration,
    seam: null,
    changedFrom: null,
    finding: null,
    reason: stack.proposals.signals.length < 0 ? facts.languages.join(' ') : '',
  };
  const proposal = { kind: 'web', kindFrom: 'default', kindReason: '', layers: [], fit } as const;
  return { brief, proposal };
}
