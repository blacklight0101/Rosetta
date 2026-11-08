import type { ProjectSettings } from '../api/project-schemas.js';
import type { KeyAccess } from '../api/schemas.js';
import type { ModelListState } from './model-lists.js';
import { ROLE_NAMES, type RoleName } from './project-settings-form.js';
import { kindOfProvider, providerLabel, providerOptions } from './provider-choices.js';
import { roleStates, type RoleState } from './role-state.js';

// RF-436, P8-74: the rule behind the warning at the top of the project settings page. A role whose
// provider the user cannot use now is named: an Ollama that answered that it could not be reached,
// or a provider that takes a key for which the user has no key they can use (the rule of the
// every-role control, DEC-225). Nothing is decided before the answer it rests on has come, and no
// role is changed by it (DEC-106).

export interface RoleProblem {
  readonly provider: string;
  readonly reason: 'unreachable' | 'no-key';
  readonly roles: readonly RoleName[];
}

/** Ollama answered that it could not be asked: a list came back with the reason why. */
function ollamaUnreachable(list: ModelListState | undefined): boolean {
  return list?.status === 'ready' && list.reason !== undefined;
}

/** P8-135: the warning and the State column of the Roles table read one rule (role-state.ts). */
function reasonOf(state: RoleState | undefined): RoleProblem['reason'] | undefined {
  if (state === 'not-reachable') return 'unreachable';
  return state === 'no-key' ? 'no-key' : undefined;
}

// RF-436
export function unusableRoles(
  settings: ProjectSettings,
  roles: Readonly<Record<RoleName, { readonly provider: string }>>,
  access: readonly KeyAccess[] | undefined,
  ollama: ModelListState | undefined,
): readonly RoleProblem[] {
  const states = roleStates(settings, roles, access, ollama);
  const problems = new Map<string, RoleProblem>();
  for (const role of ROLE_NAMES) {
    const { provider } = roles[role];
    const reason = reasonOf(states[role]);
    if (reason === undefined) continue;
    const before = problems.get(provider);
    problems.set(provider, { provider, reason, roles: [...(before?.roles ?? []), role] });
  }
  return [...problems.values()];
}

/** `All four roles use it`, `The planner uses it`, `The reader and the verifier use it`. */
function rolesPhrase(roles: readonly RoleName[]): string {
  if (roles.length === ROLE_NAMES.length) return 'All four roles use it';
  const names = roles.map((role) => `the ${role}`);
  const last = names.at(-1) ?? '';
  const list = names.length < 2 ? last : `${names.slice(0, -1).join(', ')} and ${last}`;
  const verb = names.length < 2 ? 'uses' : 'use';
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${verb} it`;
}

// RF-436
export function problemText(problem: RoleProblem): {
  readonly title: string;
  readonly detail: string;
} {
  const name = providerLabel(problem.provider);
  const roles = rolesPhrase(problem.roles);
  return problem.reason === 'unreachable'
    ? {
        title: `${name} cannot be reached.`,
        detail: `${roles}, so a run would fail at its first call.`,
      }
    : {
        title: `${name} has no key you can use.`,
        detail: `${roles}, so a run would be refused (RST-2302).`,
      };
}

const articleOf = (name: string): string => (/^[aeiou]/iu.test(name) ? 'an' : 'a');

/** What the user can use, named after the provider the every-role control has chosen first. */
export function usableText(
  settings: ProjectSettings,
  provider: string,
  access: readonly KeyAccess[],
): string {
  const name = providerLabel(provider);
  const kind = kindOfProvider(settings)(provider);
  if (kind === 'ollama') return `${name} can be reached.`;
  const own = access.find((entry) => entry.provider === kind)?.ownKey === true;
  return own ? `You have ${articleOf(name)} ${name} key.` : `You may use the server's ${name} key.`;
}

/** DEC-225: the warning's control also shows an unreachable Ollama, which cannot be chosen. */
export function unreachableOptions(
  settings: ProjectSettings,
  ollama: ModelListState | undefined,
): readonly { readonly value: string; readonly label: string; readonly disabled: true }[] {
  if (!ollamaUnreachable(ollama)) return [];
  const kindOf = kindOfProvider(settings);
  return providerOptions(settings)
    .filter((option) => kindOf(option.value) === 'ollama')
    .map((option) => ({ ...option, label: `${option.label} (not reachable)`, disabled: true }));
}

/** What the warning says and offers. */
export interface RoleWarningFacts {
  readonly problems: readonly RoleProblem[];
  /** The providers its control lists: the usable ones, then an unreachable Ollama, disabled. */
  readonly providers: readonly {
    readonly value: string;
    readonly label: string;
    readonly disabled?: true;
  }[];
  /** What the user can use, named after the provider the control chooses first. */
  readonly usable: string | undefined;
}

// RF-436
/** The warning of the page, or undefined when every role can be used or nothing is known yet. */
export function roleWarningOf(
  settings: ProjectSettings,
  facts: {
    readonly roles: Readonly<Record<RoleName, { readonly provider: string }>>;
    readonly access: readonly KeyAccess[] | undefined;
    readonly ollama: ModelListState | undefined;
    /** The providers the every-role control lists (every-role.ts). */
    readonly usable: readonly { readonly value: string; readonly label: string }[];
  },
): RoleWarningFacts | undefined {
  const problems = unusableRoles(settings, facts.roles, facts.access, facts.ollama);
  if (problems.length === 0) return undefined;
  const first = facts.usable[0];
  return {
    problems,
    providers: [...facts.usable, ...unreachableOptions(settings, facts.ollama)],
    usable: first === undefined ? undefined : usableText(settings, first.value, facts.access ?? []),
  };
}
