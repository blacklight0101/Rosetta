import type { ModelTable } from './data-model.js';
import type { PlanDecision } from './plan-content.js';

// RF-623, P9-15: stub.

export interface AdrModelFinding {
  readonly decision: string;
  readonly title: string;
  readonly structure: string;
  readonly reason: string;
}

export type AdrModelCheck =
  | {
      readonly kind: 'checked';
      readonly findings: readonly AdrModelFinding[];
      readonly dropped: number;
    }
  | { readonly kind: 'not-run'; readonly reason: string };

export interface AdrModelDraft {
  readonly missing: readonly {
    readonly decision: string;
    readonly structure: string;
    readonly reason: string;
  }[];
}

export function decisionsNeedingData(decisions: readonly PlanDecision[]): PlanDecision[] {
  return decisions.slice(0, 0);
}

export function adrModelFindings(
  draft: AdrModelDraft,
  sent: readonly PlanDecision[],
  tables: readonly Pick<ModelTable, 'name'>[],
): AdrModelCheck {
  return {
    kind: 'checked',
    findings: [],
    dropped: draft.missing.length - sent.length - tables.length,
  };
}
