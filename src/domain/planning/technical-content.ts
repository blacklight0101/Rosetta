// RF-622, ADR-005, ADR-018, DEC-135: the technical part of the planner's draft and of the package.

export const securityApproaches = ['allowlist', 'denylist', 'other'] as const;
export type SecurityApproach = (typeof securityApproaches)[number];

export const integrationActions = ['keep', 'replace'] as const;
export type IntegrationAction = (typeof integrationActions)[number];

export interface DraftIntegration {
  /** The id of an `INT` card. */
  readonly card: string;
  readonly action: IntegrationAction;
  readonly note: string;
  /** The position of a decision in the draft's `decisions`, from 1. */
  readonly decision: number | null;
}

export interface DraftControl {
  readonly name: string;
  readonly approach: SecurityApproach;
  readonly description: string;
  /** What must always hold for the control to do its job; empty when the planner did not say. */
  readonly invariant: string;
  /** An allowlist, or a rule that does not depend on the shape of the input; empty for none. */
  readonly alternative: string;
  readonly sources: readonly string[];
  readonly decision: number | null;
}

export interface DraftTarget {
  readonly name: string;
  readonly target: string;
  readonly sources: readonly string[];
  readonly decision: number | null;
}

export interface DraftEnvironment {
  readonly name: string;
  readonly purpose: string;
  readonly decision: number | null;
}

export interface TechnicalDraft {
  readonly integrations: readonly DraftIntegration[];
  readonly security: readonly DraftControl[];
  readonly targets: readonly DraftTarget[];
  readonly environments: readonly DraftEnvironment[];
}

/** The decision record of an item, for example `ADR-002`; empty when it has none. */
interface Decided {
  readonly decision: string;
}

export type PlanIntegration = Omit<DraftIntegration, 'decision'> & Decided;
export type PlanControl = Omit<DraftControl, 'decision'> & Decided;
export type PlanTarget = Omit<DraftTarget, 'decision'> & Decided;
export type PlanEnvironment = Omit<DraftEnvironment, 'decision'> & Decided;

export interface TechnicalContent {
  readonly integrations: readonly PlanIntegration[];
  readonly security: readonly PlanControl[];
  readonly targets: readonly PlanTarget[];
  readonly environments: readonly PlanEnvironment[];
}

export interface TechnicalAssembly {
  readonly content: TechnicalContent;
  /** How many items the draft had that the package leaves out. */
  readonly dropped: number;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

// RF-622, ADR-005: the draft's technical part checked. An integration stays only for a supported
// card, once (the first answer counts); a security control or a target stays only with a
// supported source card; a decision position names the record of the draft's decision at that
// position (`decisionIds`, in the draft's order) or no record at all.
export function assembleTechnical(
  draft: TechnicalDraft,
  supported: ReadonlySet<string>,
  decisionIds: readonly string[],
): TechnicalAssembly {
  const decided = (position: number | null): string =>
    position === null ? '' : (decisionIds[position - 1] ?? '');
  const answered = new Set<string>();
  const integrations = draft.integrations.flatMap((item) => {
    if (!supported.has(item.card) || answered.has(item.card)) return [];
    answered.add(item.card);
    return [{ ...item, decision: decided(item.decision) }];
  });
  const withSources = <T extends { readonly sources: readonly string[] }>(
    items: readonly T[],
  ): (T & { readonly sources: readonly string[] })[] =>
    items.flatMap((item) => {
      const sources = unique(item.sources.filter((id) => supported.has(id)));
      return sources.length === 0 ? [] : [{ ...item, sources }];
    });
  const security = withSources(draft.security).map((item) => ({
    ...item,
    decision: decided(item.decision),
  }));
  const targets = withSources(draft.targets).map((item) => ({
    ...item,
    decision: decided(item.decision),
  }));
  const environments = draft.environments.map((item) => ({
    ...item,
    decision: decided(item.decision),
  }));
  const kept = integrations.length + security.length + targets.length;
  const given = draft.integrations.length + draft.security.length + draft.targets.length;
  return {
    content: { integrations, security, targets, environments },
    dropped: given - kept,
  };
}
