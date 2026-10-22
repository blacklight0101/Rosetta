import type { ArchitectureStyleId } from './catalogue.js';
import type { DraftComponent } from './plan-draft.js';

// RF-608 (stub; the rules follow in the next commit).

export const styleRoles: Record<ArchitectureStyleId, readonly string[]> = {
  layered: [],
  'modular-monolith': [],
  hexagonal: [],
  clean: [],
  'event-driven': [],
  microservices: [],
};

export type BrokenRuleKind =
  'upward' | 'skipping' | 'core-on-adapter' | 'module-on-module' | 'direct-call' | 'shared-store';

export interface BrokenRule {
  readonly from: string;
  readonly to: string;
  readonly rule: BrokenRuleKind;
}

export interface UnknownRole {
  readonly name: string;
  readonly role: string;
}

export interface StyleCheck {
  readonly broken: readonly BrokenRule[];
  readonly unknownRole: readonly UnknownRole[];
}

export function checkStyle(
  style: ArchitectureStyleId,
  components: readonly DraftComponent[],
): StyleCheck {
  const known = styleRoles[style];
  return {
    broken: [],
    unknownRole: components
      .filter((component) => !known.includes(component.role))
      .map(({ name, role }) => ({ name, role })),
  };
}

export interface StyleRisk {
  readonly id: string;
  readonly text: string;
  readonly sources: readonly string[];
}

export function addStyleRisks(
  risks: readonly StyleRisk[],
  check: StyleCheck,
  styleTitle: string,
): readonly StyleRisk[] {
  if (check.broken.length === 0) return risks;
  return [...risks, { id: 'RISK-000', text: styleTitle, sources: [] }];
}
