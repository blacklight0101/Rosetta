import type { RoleEstimate } from '../api/estimate-schemas.js';
import { providerNames } from './provider-choices.js';
import { useProject } from './use-project.js';
import { holdsWorkbooks, sendsPrivateCode } from './use-private-code.js';
import { useSwitchToOllama, type SwitchToOllama } from './use-switch-to-ollama.js';

// RF-209, RF-132, RF-143, DEC-209 (P8-79): the private-code confirmation of the Deepen panel. The
// panel reads the project, so on a project of kind `upload` or `workbook` whose roles send code to
// a cloud provider the box shows from the start, and no start is refused for a box that was not
// shown. While the project cannot be read, the box shows once the server asks for it (RST-1521).

export interface DeepenPrivateCode {
  readonly shown: boolean;
  readonly projectName: string;
  /** RF-157: the data is Excel workbooks, so the wording names cell values, formulas and macros. */
  readonly workbooks: boolean;
  /** The providers the cloud roles use, for a sentence (`OpenAI and Anthropic`). */
  readonly providers: string;
  readonly switchToOllama: SwitchToOllama;
}

// RF-209, RF-132
export function useDeepenPrivateCode(
  projectId: string,
  cloud: readonly RoleEstimate[],
  asked: boolean,
  onSwitched: () => void,
): DeepenPrivateCode {
  const load = useProject(projectId);
  const switchToOllama = useSwitchToOllama(projectId, onSwitched);
  const project = load.status === 'ready' ? load.project : undefined;
  const fromStart = project !== undefined && sendsPrivateCode(project) && cloud.length > 0;
  return {
    shown: asked || fromStart,
    projectName: project?.name ?? 'this project',
    workbooks: project !== undefined && holdsWorkbooks(project),
    providers:
      cloud.length === 0 ? 'a cloud provider' : providerNames(cloud.map((role) => role.provider)),
    switchToOllama,
  };
}
