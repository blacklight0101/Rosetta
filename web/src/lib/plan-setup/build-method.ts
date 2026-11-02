// RF-612, RF-639, DEC-176 (Q-A, Q-B), data-model.md section 3.20: the build method on the page. The
// person answers "agents or people", then the agent tool, then one model name per tier. A tier left
// blank is not sent, so the server lists it as defaulted; the model names of the tool (the Claude Code
// aliases, the Codex names) are only shown as the default, never sent as if the person had named them.

export type ToolKind = 'claude-code' | 'codex' | 'other';

/** The tiers of the difficulty bands, smallest first, and the escalation model (RF-639). */
export const MODEL_SLOTS = ['smallest', 'middle', 'largest', 'escalation'] as const;
export type ModelSlot = (typeof MODEL_SLOTS)[number];
export type Tier = Exclude<ModelSlot, 'escalation'>;
export const TIERS: readonly Tier[] = ['smallest', 'middle', 'largest'];

/** The longest model or tool name the brief keeps (the server limit). */
export const MAX_NAME = 80;

export interface MethodDraft {
  /** True when agents build; only meaningful once the question is answered. */
  readonly aiAssisted: boolean;
  /** The chosen agent tool; empty while the tool is unanswered. */
  readonly toolKind: ToolKind | '';
  /** The name of another tool, as typed. */
  readonly toolName: string;
  /** The model names as typed; empty text is a name not given. */
  readonly models: Readonly<Record<ModelSlot, string>>;
  /** P6-22 (RF-641): the tier models that run on the team's own machine. */
  readonly local: Readonly<Record<Tier, boolean>>;
}

const NO_MODELS: Readonly<Record<ModelSlot, string>> = {
  smallest: '',
  middle: '',
  largest: '',
  escalation: '',
};

const NO_LOCAL: Readonly<Record<Tier, boolean>> = {
  smallest: false,
  middle: false,
  largest: false,
};

/** The tools the step offers, in order (RF-639); the list a later card extends with more options. */
export const TOOL_CHOICES: readonly { readonly kind: ToolKind; readonly title: string }[] = [
  { kind: 'claude-code', title: 'Claude Code' },
  { kind: 'codex', title: 'Codex' },
  { kind: 'other', title: 'Another tool' },
];

const claudeCodeModels: Readonly<Record<Tier, string>> = {
  smallest: 'haiku',
  middle: 'sonnet',
  largest: 'opus',
};

/** The model names Codex is offered; the server keeps the same map (src/domain/planning/build-method.ts, P7-12). */
const codexModels: Readonly<Record<Tier, string>> = {
  smallest: 'gpt-5-mini',
  middle: 'gpt-5-codex',
  largest: 'gpt-5',
};

/** The models a tool is offered per tier; none for another tool. */
function modelMap(kind: ToolKind | ''): Readonly<Record<Tier, string>> | undefined {
  if (kind === 'claude-code') return claudeCodeModels;
  return kind === 'codex' ? codexModels : undefined;
}

const EXAMPLE_WORD: Readonly<Record<Tier, string>> = {
  smallest: 'cheapest',
  middle: 'middle',
  largest: 'strongest',
};

/** The default shown for a tier: the tool's model name, or an example for a tool with none. */
export function modelExample(kind: ToolKind, slot: ModelSlot): string {
  if (slot === 'escalation') return 'only used with your approval in chat';
  const offered = modelMap(kind)?.[slot];
  if (offered !== undefined) return offered;
  return `the ${EXAMPLE_WORD[slot]} model of your plan`;
}

/** The model the package will use for a tier: the typed name, else the tool's offered name. */
function modelOf(draft: MethodDraft, tier: Tier): string | undefined {
  const typed = draft.models[tier].trim();
  if (typed !== '') return typed;
  return modelMap(draft.toolKind)?.[tier];
}

export interface NamedTool {
  readonly kind: ToolKind;
  readonly name?: string | undefined;
}

const NAMES: readonly { readonly pattern: RegExp; readonly tool: NamedTool }[] = [
  { pattern: /claude[ -]?code/iu, tool: { kind: 'claude-code' } },
  { pattern: /\bcodex\b/iu, tool: { kind: 'codex' } },
  { pattern: /copilot[ -]agent/iu, tool: { kind: 'other', name: 'Copilot agent' } },
];

/** RF-612 (Q-A): the agent tool the project context names in any of its answers, if one. */
export function agentToolNamedIn(texts: Readonly<Record<string, string>>): NamedTool | undefined {
  const text = Object.values(texts).join('\n');
  return NAMES.find((each) => each.pattern.test(text))?.tool;
}

/**
 * True once the tool is one a save can send: chosen, and named when it is another tool. Only then
 * does the step show the model fields and the save send them, so a model is never typed and dropped.
 */
export function toolUsable(draft: MethodDraft): boolean {
  if (draft.toolKind === '') return false;
  return draft.toolKind !== 'other' || draft.toolName.trim() !== '';
}

/** The title of a tool as the recorded line says it. */
function toolTitle(draft: MethodDraft): string {
  const chosen = TOOL_CHOICES.find((choice) => choice.kind === draft.toolKind);
  return draft.toolKind === 'other' && draft.toolName.trim() !== ''
    ? draft.toolName.trim()
    : (chosen?.title ?? '');
}

function modelsLine(draft: MethodDraft): string {
  const named = TIERS.flatMap((tier) => {
    const model = modelOf(draft, tier);
    return model === undefined ? [] : [`${tier} ${model}`];
  });
  const missing = TIERS.filter((tier) => modelOf(draft, tier) === undefined);
  const parts = [named.join(', ')].filter((part) => part !== '');
  const escalation = draft.models.escalation.trim();
  if (escalation !== '') parts.push(`escalation ${escalation}`);
  const local = TIERS.filter((tier) => draft.local[tier]);
  if (local.length > 0) parts.push(`runs locally: ${local.join(', ')}`);
  if (missing.length > 0) parts.push(`no name for ${missing.join(', ')}`);
  return parts.join('; ');
}

/** The "What I recorded" value of an answered build method (RF-612, RF-639). */
export function methodLineOf(draft: MethodDraft): string {
  if (!draft.aiAssisted) return 'People will build';
  if (draft.toolKind === '') return 'Agents will build; tool not chosen yet';
  if (!toolUsable(draft)) return 'Agents will build; the other tool has no name yet';
  return `Agents will build with ${toolTitle(draft)}. Models: ${modelsLine(draft)}`;
}

/** The build method a save sends: the tool only once chosen, the models only once a tool is. */
export function buildMethodOf(draft: MethodDraft): {
  readonly aiAssisted: boolean;
  readonly agentTool?: { readonly kind: ToolKind; readonly name?: string | undefined };
  readonly models?: Partial<Record<ModelSlot, string>>;
  readonly local?: Partial<Record<Tier, boolean>>;
} {
  if (!draft.aiAssisted) return { aiAssisted: false };
  const name = draft.toolName.trim();
  if (draft.toolKind === '' || !toolUsable(draft)) return { aiAssisted: true };
  const models = Object.fromEntries(
    MODEL_SLOTS.map((slot) => [slot, draft.models[slot].trim()] as const).filter(
      ([, model]) => model !== '',
    ),
  );
  const local = Object.fromEntries(
    TIERS.filter((tier) => draft.local[tier]).map((tier) => [tier, true]),
  );
  return {
    aiAssisted: true,
    agentTool: draft.toolKind === 'other' ? { kind: 'other', name } : { kind: draft.toolKind },
    ...(Object.keys(models).length === 0 ? {} : { models }),
    ...(Object.keys(local).length === 0 ? {} : { local }),
  };
}

interface SavedMethod {
  readonly aiAssisted: boolean;
  readonly agentTool?: { readonly kind: ToolKind; readonly name?: string | undefined } | undefined;
  readonly models?: Partial<Record<ModelSlot, string | undefined>> | undefined;
  readonly local?: Partial<Record<Tier, boolean | undefined>> | undefined;
}

/** The method part of a draft from a saved brief: only the models the person named are kept. */
export function methodDraftOf(saved: SavedMethod, defaulted: readonly string[]): MethodDraft {
  if (defaulted.includes('buildMethod') || !saved.aiAssisted) {
    return { aiAssisted: false, toolKind: '', toolName: '', models: NO_MODELS, local: NO_LOCAL };
  }
  const named = (slot: ModelSlot): string => {
    const kept = slot === 'escalation' || !defaulted.includes(`buildMethod.models.${slot}`);
    return kept ? (saved.models?.[slot] ?? '') : '';
  };
  return {
    aiAssisted: true,
    toolKind: saved.agentTool?.kind ?? '',
    toolName: saved.agentTool?.name ?? '',
    models: {
      smallest: named('smallest'),
      middle: named('middle'),
      largest: named('largest'),
      escalation: named('escalation'),
    },
    local: {
      smallest: saved.local?.smallest === true,
      middle: saved.local?.middle === true,
      largest: saved.local?.largest === true,
    },
  };
}
