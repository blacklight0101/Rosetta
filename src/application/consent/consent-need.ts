import type {
  ConsentKind,
  ConsentNeed,
  ConsentProvider,
} from '../../domain/consent/project-consent.js';
import type { AgentRole, ProviderKind } from '../ports/llm-provider.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import {
  rolesNeedCloudConsent,
  rolesNeedPrivateConfirmation,
  UNDERSTAND_ROLES,
} from '../understand/understand-options.js';

// RF-143, RF-132, DEC-209: what a start needs a consent for. The providers are the kinds of the
// roles the start calls that send code off this machine (the rule of RF-143, so an Ollama elsewhere
// counts), sorted; the kinds are `cloud`, and `private-code` for a project of kind `upload` or
// `workbook` (RF-132, RF-157). A start whose roles are all local needs none.

interface ConsentProject {
  readonly sourceKind: string;
  readonly settings: ProjectSettings;
}

function consentProviderOf(kind: ProviderKind | undefined): ConsentProvider | undefined {
  return kind === undefined || kind === 'fake' ? undefined : kind;
}

// RF-143
export function consentNeedOf(
  project: ConsentProject,
  ollamaHost: string | undefined,
  roles: readonly AgentRole[] = UNDERSTAND_ROLES,
): ConsentNeed | undefined {
  const { settings } = project;
  const providers = new Set<ConsentProvider>();
  for (const role of roles) {
    if (!rolesNeedCloudConsent(settings, ollamaHost, [role])) continue;
    const provider = consentProviderOf(settings.providers[settings.roles[role].provider]?.kind);
    if (provider !== undefined) providers.add(provider);
  }
  if (providers.size === 0) return undefined;
  const kinds: ConsentKind[] = ['cloud'];
  if (rolesNeedPrivateConfirmation(project, ollamaHost, roles)) kinds.push('private-code');
  return { providers: [...providers].sort(), kinds };
}
