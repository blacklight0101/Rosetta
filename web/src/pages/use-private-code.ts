import { useState } from 'preact/hooks';
import type { Project } from '../api/project-schemas.js';
import { useSwitchToOllama, type SwitchToOllama } from './use-switch-to-ollama.js';

// RF-132: the state of the second confirmation of the start page. It is needed for a project of
// kind `upload` while some role would send code to a cloud provider (the roles the cloud notice
// lists), and it is only ever sent when it is needed and ticked.

export interface PrivateCode {
  readonly needed: boolean;
  readonly checked: boolean;
  readonly set: (checked: boolean) => void;
  /** What the request carries: needed and ticked. */
  readonly confirmed: boolean;
  readonly switchToOllama: SwitchToOllama;
}

// RF-132
export function usePrivateCode(
  project: Project,
  cloudRoles: boolean,
  onSwitched: (project: Project) => void,
): PrivateCode {
  const [checked, set] = useState(false);
  const needed = project.sourceKind === 'upload' && cloudRoles;
  const switchToOllama = useSwitchToOllama(project.id, onSwitched);
  return { needed, checked, set, confirmed: needed && checked, switchToOllama };
}
