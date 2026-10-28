// RF-612, RF-639, DEC-176, data-model.md section 3.20: how the team builds. `aiAssisted` is the
// answer to "agents or people"; with agents, the brief also records the agent tool and one model
// name per tier. Claude Code has default aliases; Codex and another tool have none (names change
// too fast to ship), so a tier without a name stays unnamed and the package lists it (RF-641).

type AgentTool =
  | { readonly kind: 'claude-code' }
  | { readonly kind: 'codex' }
  | { readonly kind: 'other'; readonly name: string };

/** The tiers of the difficulty bands, smallest first (RF-639). */
export const modelTiers = ['smallest', 'middle', 'largest'] as const;
type ModelTier = (typeof modelTiers)[number];

interface BuildModels {
  readonly smallest?: string | undefined;
  readonly middle?: string | undefined;
  readonly largest?: string | undefined;
  /** Used only with the owner's approval in chat; never defaulted (DEC-176 Q-I). */
  readonly escalation?: string | undefined;
}

export interface BuildMethod {
  readonly aiAssisted: boolean;
  /** Present only when agents build and the tool was answered. */
  readonly agentTool?: AgentTool | undefined;
  readonly models?: BuildModels | undefined;
}

/** The model aliases Claude Code gets when the team names none (RF-639). */
const claudeCodeModels: Readonly<Record<ModelTier, string>> = {
  smallest: 'haiku',
  middle: 'sonnet',
  largest: 'opus',
};

function modelsOf(given: BuildMethod): BuildModels | undefined {
  if (given.agentTool === undefined) return undefined;
  const fallback: BuildModels = given.agentTool.kind === 'claude-code' ? claudeCodeModels : {};
  const named = given.models ?? {};
  const models: Record<string, string> = {};
  for (const tier of modelTiers) {
    const model = named[tier] ?? fallback[tier];
    if (model !== undefined) models[tier] = model;
  }
  if (named.escalation !== undefined) models['escalation'] = named.escalation;
  return Object.keys(models).length === 0 ? undefined : models;
}

/** The build method to store: people building keep neither a tool nor a model. */
// RF-639
export function resolveBuildMethod(given: BuildMethod | undefined): BuildMethod {
  if (given?.aiAssisted !== true) return { aiAssisted: false };
  const models = modelsOf(given);
  return {
    aiAssisted: true,
    ...(given.agentTool === undefined ? {} : { agentTool: given.agentTool }),
    ...(models === undefined ? {} : { models }),
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
