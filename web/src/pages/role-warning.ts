import type { ProjectSettings } from '../api/project-schemas.js';
import type { KeyAccess } from '../api/schemas.js';
import type { ModelListState } from './model-lists.js';
import type { RoleName } from './project-settings-form.js';

// RF-436, P8-74: the rule behind the warning of the project settings page (not built yet: every
// function answers nothing).

export interface RoleProblem {
  readonly provider: string;
  readonly reason: 'unreachable' | 'no-key';
  readonly roles: readonly RoleName[];
}

// RF-436
export function unusableRoles(
  settings: ProjectSettings,
  roles: Readonly<Record<RoleName, { readonly provider: string }>>,
  access: readonly KeyAccess[] | undefined,
  ollama: ModelListState | undefined,
): readonly RoleProblem[] {
  return [settings, roles, access, ollama].flatMap(() => []);
}

// RF-436
export function problemText(problem: RoleProblem): {
  readonly title: string;
  readonly detail: string;
} {
  return { title: problem.provider, detail: '' };
}

// RF-436
export function usableText(
  settings: ProjectSettings,
  provider: string,
  access: readonly KeyAccess[],
): string {
  return [settings, provider, access].flatMap(() => []).join('');
}

// RF-436
export function unreachableOptions(
  settings: ProjectSettings,
  ollama: ModelListState | undefined,
): readonly { readonly value: string; readonly label: string; readonly disabled: true }[] {
  return [settings, ollama].flatMap(() => []);
}
