import { z } from 'zod';
import type { AgentRole } from '../ports/llm-provider.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import { needsCloudConsent } from '../providers/cloud-consent.js';

// RF-200, RF-143, data-model.md section 3.6 (`options`): what the start request of an understand
// run fixes: the areas to read (every area when absent or empty) and the consent to send code to a cloud
// provider. Both are recorded in the manifest when the run is accepted and read back from it when
// it starts, so nothing in a later request can change them.

/**
 * The roles an understand run calls in this release: the readers and, once they have ended, the
 * summariser that merges duplicate cards (RF-250). The judgement step is P2.
 */
export const UNDERSTAND_ROLES: readonly AgentRole[] = ['reader', 'summariser'];

export interface UnderstandOptions {
  readonly areas?: readonly string[];
  readonly cloudConsent: boolean;
}

const optionsSchema = z.object({
  areas: z.array(z.string()).optional(),
  cloudConsent: z.boolean().optional(),
});

/** The options as the manifest records them; `areas` only when the request sent it, as sent (empty kept). */
export function understandOptionsOf(request: {
  readonly areas?: readonly string[] | undefined;
  readonly cloudConsent?: boolean | undefined;
}): UnderstandOptions {
  const consent = { cloudConsent: request.cloudConsent === true };
  return request.areas === undefined ? consent : { areas: [...request.areas], ...consent };
}

/** The options recorded in a run's manifest; anything unreadable counts as no areas, no consent. */
export function readUnderstandOptions(
  options: Readonly<Record<string, unknown>>,
): UnderstandOptions {
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success) return { cloudConsent: false };
  return understandOptionsOf(parsed.data);
}

/**
 * RF-143: whether a role of the run sends code off this machine. Ollama is local when the server's
 * Ollama host is this machine; with no Ollama address configured no Ollama call can be made, so it
 * needs no consent.
 */
export function rolesNeedCloudConsent(
  settings: ProjectSettings,
  ollamaHost: string | undefined,
): boolean {
  return UNDERSTAND_ROLES.some((role) => {
    const provider = settings.providers[settings.roles[role].provider];
    if (provider === undefined) return false;
    const endpointHost = provider.kind === 'ollama' ? (ollamaHost ?? 'localhost') : '';
    return needsCloudConsent({ kind: provider.kind, endpointHost });
  });
}

/**
 * RF-205, RNF-004: whether the reader uses Ollama in the text tool mode, whose adapter appends the
 * text tool protocol prompt to the system prompt; the run then records that file too. The
 * summariser sends no tool, so its provider never uses the protocol.
 */
export function rolesUseTextToolProtocol(settings: ProjectSettings): boolean {
  const provider = settings.providers[settings.roles.reader.provider];
  return provider?.kind === 'ollama' && provider.toolMode === 'text';
}
