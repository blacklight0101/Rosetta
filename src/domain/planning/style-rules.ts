import type { ArchitectureStyleId } from './catalogue.js';
import type { DraftComponent } from './plan-draft.js';
import { planId } from './plan-content.js';

// RF-608, DEC-76, ADR-018: the package checks the components against the architecture style the
// owner chose. The roles of each style are fixed here, so the planner is asked for one of them and
// code reads the answer; the rule of each style is checked on the dependencies between components
// by their roles. A component whose role is not a role of the style is listed, never guessed, and
// its dependencies are not judged. The names are model text; the roles, rules and sentences are
// Rosetta's.

/** The roles a component can have in each style, in the order the prompt and the checks list them. */
export const styleRoles: Record<ArchitectureStyleId, readonly string[]> = {
  layered: ['presentation', 'business', 'data'],
  'modular-monolith': ['module', 'shared kernel'],
  hexagonal: ['core', 'port', 'adapter'],
  clean: ['core', 'port', 'adapter'],
  'event-driven': ['producer', 'consumer', 'broker'],
  microservices: ['service', 'gateway', 'store'],
};

export type BrokenRuleKind =
  'upward' | 'skipping' | 'core-on-adapter' | 'module-on-module' | 'direct-call' | 'shared-store';

/** A dependency that breaks the rule of the style. */
export interface BrokenRule {
  readonly from: string;
  readonly to: string;
  readonly rule: BrokenRuleKind;
}

/** A component whose role is empty or is not a role of the style. */
export interface UnknownRole {
  readonly name: string;
  readonly role: string;
}

export interface StyleCheck {
  readonly broken: readonly BrokenRule[];
  readonly unknownRole: readonly UnknownRole[];
}

export const noStyleFindings: StyleCheck = { broken: [], unknownRole: [] };

const reasons: Record<BrokenRuleKind, string> = {
  upward: 'a lower layer must not call a higher one',
  skipping: 'a layer may call only the layer directly below it',
  'core-on-adapter': 'the core must depend on no adapter',
  'module-on-module': 'a module must not depend on another module',
  'direct-call': 'producers and consumers must reach each other only through the broker',
  'shared-store': 'a store must belong to one service',
};

/** Why a dependency breaks the rule, as one sentence of Rosetta's. */
export function brokenRuleReason(rule: BrokenRuleKind): string {
  return reasons[rule];
}

type PairRule = (from: string, to: string) => BrokenRuleKind | undefined;

function layeredRule(from: string, to: string): BrokenRuleKind | undefined {
  const gap = styleRoles.layered.indexOf(to) - styleRoles.layered.indexOf(from);
  if (gap < 0) return 'upward';
  return gap > 1 ? 'skipping' : undefined;
}

function coreRule(from: string, to: string): BrokenRuleKind | undefined {
  return from === 'core' && to === 'adapter' ? 'core-on-adapter' : undefined;
}

function moduleRule(from: string, to: string): BrokenRuleKind | undefined {
  return from === 'module' && to === 'module' ? 'module-on-module' : undefined;
}

function eventRule(from: string, to: string): BrokenRuleKind | undefined {
  const apart =
    (from === 'producer' && to === 'consumer') || (from === 'consumer' && to === 'producer');
  return apart ? 'direct-call' : undefined;
}

const pairRules: Partial<Record<ArchitectureStyleId, PairRule>> = {
  layered: layeredRule,
  hexagonal: coreRule,
  clean: coreRule,
  'modular-monolith': moduleRule,
  'event-driven': eventRule,
};

/** A role as the style names it: case, hyphens, underscores and spaces around it do not count. */
function roleIn(style: ArchitectureStyleId, raw: string): string | undefined {
  const key = raw
    .toLowerCase()
    .replace(/[\s_-]+/gu, ' ')
    .trim();
  return styleRoles[style].find((role) => role === key);
}

interface Edge {
  readonly from: string;
  readonly to: string;
  readonly fromRole: string;
  readonly toRole: string;
}

/** Every dependency between two components that both have a role of the style. */
function judgedEdges(style: ArchitectureStyleId, components: readonly DraftComponent[]): Edge[] {
  const roles = new Map<string, string>();
  for (const { name, role } of components) {
    const known = roleIn(style, role);
    if (known !== undefined && !roles.has(name)) roles.set(name, known);
  }
  return components.flatMap((component) =>
    component.dependsOn.flatMap((to) => {
      const fromRole = roles.get(component.name);
      const toRole = roles.get(to);
      if (fromRole === undefined || toRole === undefined) return [];
      return [{ from: component.name, to, fromRole, toRole }];
    }),
  );
}

function sharedStores(edges: readonly Edge[]): BrokenRule[] {
  const users = edges.filter((edge) => edge.fromRole === 'service' && edge.toRole === 'store');
  const count = (store: string): number =>
    new Set(users.filter((edge) => edge.to === store).map((edge) => edge.from)).size;
  return users
    .filter((edge) => count(edge.to) > 1)
    .map(({ from, to }) => ({ from, to, rule: 'shared-store' as const }));
}

function pairBroken(rule: PairRule, edges: readonly Edge[]): BrokenRule[] {
  return edges.flatMap(({ from, to, fromRole, toRole }) => {
    const broken = rule(fromRole, toRole);
    return broken === undefined ? [] : [{ from, to, rule: broken }];
  });
}

/** The dependencies that break the rule of the style, and the components with no role of it. */
// RF-608
export function checkStyle(
  style: ArchitectureStyleId,
  components: readonly DraftComponent[],
): StyleCheck {
  const edges = judgedEdges(style, components);
  const rule = pairRules[style];
  return {
    broken:
      style === 'microservices'
        ? sharedStores(edges)
        : rule === undefined
          ? []
          : pairBroken(rule, edges),
    unknownRole: components
      .filter((component) => roleIn(style, component.role) === undefined)
      .map(({ name, role }) => ({ name, role })),
  };
}

export interface StyleRisk {
  readonly id: string;
  readonly text: string;
  readonly sources: readonly string[];
}

/** The risks of the plan, then one for each broken rule, with no source card (RF-608). */
export function addStyleRisks(
  risks: readonly StyleRisk[],
  check: StyleCheck,
  styleTitle: string,
): readonly StyleRisk[] {
  if (check.broken.length === 0) return risks;
  return [
    ...risks,
    ...check.broken.map((each, index) => ({
      id: planId('RISK', risks.length + index + 1),
      text: `The component ${each.from} depends on ${each.to}, which breaks the ${styleTitle} style: ${brokenRuleReason(each.rule)}.`,
      sources: [],
    })),
  ];
}
