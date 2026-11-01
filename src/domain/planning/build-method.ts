// RF-612, RF-639, DEC-176, data-model.md section 3.20: how the team builds. `aiAssisted` is the
// answer to "agents or people"; with agents, the brief also records the agent tool and one model
// name per tier. Claude Code and Codex have a model map offered as the default of each tier (P7-12);
// another tool has none, so a tier without a name stays unnamed and the package lists it (RF-641).

type AgentTool =
  | { readonly kind: 'claude-code' }
  | { readonly kind: 'codex' }
  | { readonly kind: 'other'; readonly name: string };

/** The tiers of the difficulty bands, smallest first (RF-639). */
export const modelTiers = ['smallest', 'middle', 'largest'] as const;
export type ModelTier = (typeof modelTiers)[number];

/** The default model name of each tier for Claude Code and for Codex (P7-23, RF-639, from the catalogue). */
export interface AgentModelMaps {
  readonly claudeCode: Readonly<Record<ModelTier, string>>;
  readonly codex: Readonly<Record<ModelTier, string>>;
}

interface BuildModels {
  readonly smallest?: string | undefined;
  readonly middle?: string | undefined;
  readonly largest?: string | undefined;
  /** Used only with the owner's approval in chat; never defaulted (DEC-176 Q-I). */
  readonly escalation?: string | undefined;
}

/** The tiers whose model runs on the team's own machine (P6-22, RF-641); a key is present only when true. */
type LocalTiers = Partial<Record<ModelTier, true | undefined>>;

export interface BuildMethod {
  readonly aiAssisted: boolean;
  /** Present only when agents build and the tool was answered. */
  readonly agentTool?: AgentTool | undefined;
  readonly models?: BuildModels | undefined;
  /** Optional and additive: the tier models that run locally (RF-641); absent when none does. */
  readonly local?: LocalTiers | undefined;
}

/** A local model builds only scripted cards of difficulty 1 and 2 (DEC-176 Q-F, RF-641): one ceiling for the check and the bands. */
export const localModelCeiling = 2;

/** The model map of a tool: one name per tier, or none for another tool (RF-639, P7-12, P7-23). */
// RF-639
export function modelMapOf(
  tool: AgentTool | undefined,
  maps: AgentModelMaps,
): Readonly<Record<ModelTier, string>> | undefined {
  if (tool?.kind === 'claude-code') return maps.claudeCode;
  return tool?.kind === 'codex' ? maps.codex : undefined;
}

function modelsOf(given: BuildMethod, maps: AgentModelMaps): BuildModels | undefined {
  if (given.agentTool === undefined) return undefined;
  const fallback: BuildModels = modelMapOf(given.agentTool, maps) ?? {};
  const named = given.models ?? {};
  const models: Record<string, string> = {};
  for (const tier of modelTiers) {
    const model = named[tier] ?? fallback[tier];
    if (model !== undefined) models[tier] = model;
  }
  if (named.escalation !== undefined) models['escalation'] = named.escalation;
  return Object.keys(models).length === 0 ? undefined : models;
}

/** The local flags to keep: only with a tool answered, in tier order, and none when empty (P6-22). */
function localOf(given: BuildMethod): LocalTiers | undefined {
  if (given.agentTool === undefined) return undefined;
  const kept = modelTiers.filter((tier) => given.local?.[tier] === true);
  return kept.length === 0 ? undefined : Object.fromEntries(kept.map((tier) => [tier, true]));
}

/** The build method to store: people building keep neither a tool nor a model. */
// RF-639
export function resolveBuildMethod(
  given: BuildMethod | undefined,
  maps: AgentModelMaps,
): BuildMethod {
  if (given?.aiAssisted !== true) return { aiAssisted: false };
  const models = modelsOf(given, maps);
  const local = localOf(given);
  return {
    aiAssisted: true,
    ...(given.agentTool === undefined ? {} : { agentTool: given.agentTool }),
    ...(models === undefined ? {} : { models }),
    ...(local === undefined ? {} : { local }),
  };
}

/** The `defaulted` ids of the build method: the whole question, the tool, or each unnamed tier. */
// RF-612, RF-639
export function buildMethodDefaulted(given: BuildMethod | undefined): string[] {
  if (given === undefined) return ['buildMethod'];
  if (!given.aiAssisted) return [];
  if (given.agentTool === undefined) return ['buildMethod.agentTool'];
  return modelTiers
    .filter((tier) => given.models?.[tier] === undefined)
    .map((tier) => `buildMethod.models.${tier}`);
}

/** True when the build method marks the model of this tier as running locally (RF-641, P6-22). */
// RF-641
export function isLocalTier(method: BuildMethod, tier: ModelTier): boolean {
  return method.aiAssisted && method.local?.[tier] === true;
}

/** The model the build method names for a tier, or undefined when it names none (RF-639). */
// RF-639
export function modelForTier(method: BuildMethod, tier: ModelTier): string | undefined {
  return method.aiAssisted ? method.models?.[tier] : undefined;
}

/** The maps of a catalogue with no names, for tests that build a catalogue by hand (P7-23). */
export const noAgentModels: AgentModelMaps = {
  claudeCode: { smallest: '', middle: '', largest: '' },
  codex: { smallest: '', middle: '', largest: '' },
};
