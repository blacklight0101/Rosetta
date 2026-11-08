import { useState } from 'preact/hooks';
import type { Project } from '../api/project-schemas.js';
import { useSwitchToOllama, type SwitchToOllama } from './use-switch-to-ollama.js';

// RF-132: the state of the second confirmation of the start page. It is needed for a project of
// kind `upload` or `workbook` (RF-157) while some role would send code to a cloud provider (the roles the cloud notice
// lists), and it is only ever sent when it is needed and ticked.

export interface PrivateCode {
  readonly needed: boolean;
  /** RF-157: the data is Excel workbooks (a workbook project, or a zip that holds some). */
  readonly workbooks: boolean;
  readonly checked: boolean;
  readonly set: (checked: boolean) => void;
  /** What the request carries: needed and ticked. */
  readonly confirmed: boolean;
  readonly switchToOllama: SwitchToOllama;
}

/** RF-132: the project's code is the user's own (an uploaded zip or workbooks, never GitHub). */
export function sendsPrivateCode(project: Pick<Project, 'sourceKind'>): boolean {
  return project.sourceKind === 'upload' || project.sourceKind === 'workbook';
}

/** RF-157: the data is Excel workbooks (a workbook project, or a zip that holds some). */
export function holdsWorkbooks(project: Pick<Project, 'sourceKind' | 'source'>): boolean {
  return project.sourceKind === 'workbook' || (project.source?.workbooks ?? 0) > 0;
}

// RF-132
export function usePrivateCode(
  project: Project,
  cloudRoles: boolean,
  onSwitched: (project: Project) => void,
): PrivateCode {
  const [checked, set] = useState(false);
  const needed = sendsPrivateCode(project) && cloudRoles;
  const workbooks = holdsWorkbooks(project);
  const switchToOllama = useSwitchToOllama(project.id, onSwitched);
  return { needed, workbooks, checked, set, confirmed: needed && checked, switchToOllama };
}
