import { z } from 'zod';
import type { AgentRole } from '../ports/llm-provider.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import { needsCloudConsent } from '../providers/cloud-consent.js';

// RF-200, RF-143, data-model.md section 3.6 (`options`): what the start request of an understand
// run fixes: the areas to read (every area when absent or empty), the answers option (RF-241) and the consent to send code to a cloud
// provider. Both are recorded in the manifest when the run is accepted and read back from it when
// it starts, so nothing in a later request can change them.

/**
 * The roles an understand run calls: the readers, the verifier that judges each claim once the
 * readers have ended (RF-301), and the summariser that then merges duplicate cards (RF-250). All
 * take part in the consent, the estimate, the Ollama check and the unpriced rule (RF-143, RF-425,
 * RF-401, RF-427).
 */
export const UNDERSTAND_ROLES: readonly AgentRole[] = ['reader', 'verifier', 'summariser'];

/** RF-209: a Deepen run: the completed run it improves and what the owner confirmed. */
export interface DeepenOptions {
  readonly parentRunId: string;
  readonly maxRounds: number;
  readonly coveragePass: boolean;
}

export interface UnderstandOptions {
  readonly areas?: readonly string[];
  readonly cloudConsent: boolean;
  /** RF-132: the second confirmation, recorded for an uploaded project that needed it. */
  readonly privateCodeConfirmed?: boolean;
  /** RF-241: run again the areas of the answered questions, with the answers as context. */
  readonly withAnswers?: boolean;
  /** RF-209: present only for a Deepen run. */
  readonly deepen?: DeepenOptions;
}

const optionsSchema = z.object({
  areas: z.array(z.string()).optional(),
  cloudConsent: z.boolean().optional(),
  privateCodeConfirmed: z.boolean().optional(),
  withAnswers: z.boolean().optional(),
  deepen: z
    .object({ parentRunId: z.string(), maxRounds: z.number().int(), coveragePass: z.boolean() })
    .optional(),
});

/** The options as the manifest records them; `areas` only when the request sent it, as sent (empty kept). */
export function understandOptionsOf(request: {
  readonly areas?: readonly string[] | undefined;
  readonly cloudConsent?: boolean | undefined;
  readonly privateCodeConfirmed?: boolean | undefined;
  readonly withAnswers?: boolean | undefined;
  readonly deepen?: DeepenOptions | undefined;
}): UnderstandOptions {
  const consent = { cloudConsent: request.cloudConsent === true };
  const priv = request.privateCodeConfirmed === true ? { privateCodeConfirmed: true } : {};
  const answers = request.withAnswers === true ? { withAnswers: true } : {};
  const deepen = request.deepen === undefined ? {} : { deepen: { ...request.deepen } };
  const base = { ...consent, ...priv, ...answers, ...deepen };
  return request.areas === undefined ? base : { areas: [...request.areas], ...base };
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
 * RF-143: whether a role of the run sends code off this machine (the roles of an understand run,
 * or the ones given: a plan run calls the planner only). Ollama is local when the server's
 * Ollama host is this machine; with no Ollama address configured no Ollama call can be made, so it
 * needs no consent.
 */
export function rolesNeedCloudConsent(
  settings: ProjectSettings,
  ollamaHost: string | undefined,
  roles: readonly AgentRole[] = UNDERSTAND_ROLES,
): boolean {
  return roles.some((role) => {
    const provider = settings.providers[settings.roles[role].provider];
    if (provider === undefined) return false;
    const endpointHost = provider.kind === 'ollama' ? (ollamaHost ?? 'localhost') : '';
    return needsCloudConsent({ kind: provider.kind, endpointHost });
  });
}

/**
 * RF-132: whether a run of the project needs the second confirmation: the project is an upload and
 * a role of the run sends code off this machine (RF-143). A GitHub project never needs it.
 */
export function rolesNeedPrivateConfirmation(
  project: { readonly sourceKind: string; readonly settings: ProjectSettings },
  ollamaHost: string | undefined,
  roles: readonly AgentRole[] = UNDERSTAND_ROLES,
): boolean {
  return (
    project.sourceKind === 'upload' && rolesNeedCloudConsent(project.settings, ollamaHost, roles)
  );
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
