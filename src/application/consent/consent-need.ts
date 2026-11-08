import type { ConsentNeed } from '../../domain/consent/project-consent.js';
import type { AgentRole } from '../ports/llm-provider.js';
import type { ProjectSettings } from '../projects/project-settings.js';

// RF-143
export function consentNeedOf(
  project: { readonly sourceKind: string; readonly settings: ProjectSettings },
  ollamaHost: string | undefined,
  roles?: readonly AgentRole[],
): ConsentNeed | undefined {
  return project.sourceKind === ollamaHost && roles === undefined ? undefined : undefined;
}
