import type { JSX } from 'preact';
import type { RoleCapSettings } from '../api/project-schemas.js';
import { ROLE_NAMES, type RoleName } from './project-settings-form.js';
import { formatValue, numberOf } from './setting-limits.js';

// RF-423, P2-26: a role cap is stored in `budget.roles` and has no field on this page. A stored cap
// above the run cap never applies (the run cap stops the run first), so the page names it next to
// the run caps and follows the run cap as it is typed.

export type RoleCaps = Partial<Record<RoleName, RoleCapSettings>>;

const titles: Readonly<Record<RoleName, string>> = {
  reader: 'Reader',
  verifier: 'Verifier',
  planner: 'Planner',
  summariser: 'Summariser',
};

const MICROS_PER_DOLLAR = 1_000_000;

/** A line for a role cap above the run cap, in the words the page uses for both kinds of cap. */
function lineOf(
  role: RoleName,
  kind: 'cost cap' | 'token cap',
  roleText: string,
  runText: string,
): string {
  return `${titles[role]} ${kind} of ${roleText} is above the run ${kind} of ${runText}, so the run cap always stops first.`;
}

/** One line for each role cap, cost then tokens, that is above the run cap as typed. */
export function roleCapNotices(
  roles: RoleCaps,
  runCost: string,
  runTokens: string,
): readonly string[] {
  const costRun = numberOf(runCost);
  const tokenRun = numberOf(runTokens);
  const lines: string[] = [];
  for (const role of ROLE_NAMES) {
    const cap = roles[role];
    if (cap?.maxCostMicros !== undefined && costRun !== undefined) {
      const roleMicros = cap.maxCostMicros;
      if (roleMicros > Math.round(costRun * MICROS_PER_DOLLAR)) {
        const roleText = formatValue(roleMicros / MICROS_PER_DOLLAR, 'dollars');
        lines.push(lineOf(role, 'cost cap', roleText, formatValue(costRun, 'dollars')));
      }
    }
    if (cap?.maxTokens !== undefined && tokenRun !== undefined && cap.maxTokens > tokenRun) {
      const roleText = formatValue(cap.maxTokens, 'count');
      lines.push(lineOf(role, 'token cap', roleText, formatValue(tokenRun, 'count')));
    }
  }
  return lines;
}

export function RoleCapNotice(props: {
  readonly roles: RoleCaps;
  readonly runCost: string;
  readonly runTokens: string;
}): JSX.Element | null {
  const lines = roleCapNotices(props.roles, props.runCost, props.runTokens);
  if (lines.length === 0) return null;
  return (
    <div class="rst-limit">
      {lines.map((line) => (
        <p key={line} class="rst-field__help rst-limit__warning">
          {line}
        </p>
      ))}
    </div>
  );
}
