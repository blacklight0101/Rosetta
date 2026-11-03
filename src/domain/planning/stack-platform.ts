import type { PlanningBrief, StackLayer } from './planning-brief.js';
import { stackLayers } from './planning-brief.js';
import { technologiesNamed } from './stack-catalogue.js';
import type { StackData, VagueWords } from './stack-data.js';
import { platformOptions } from './stack-offer.js';

// RF-609, DEC-208: the platform a choice of the brief belongs to, read from the `platform` of the
// technologies of the catalogue, and the layers whose choice belongs to another platform than the
// language and runtime. Only the owner's own choices count: a layer Rosetta proposed is not one.

export interface PlatformMismatch {
  readonly layer: StackLayer;
  readonly technology: string;
  readonly platform: string;
  readonly language: string;
  /** The recommended technology of the language's platform for the layer; undefined when it has none. */
  readonly recommended: string | undefined;
}

function platformOfChoice(stack: StackData, layer: StackLayer, choice: string) {
  return technologiesNamed(stack.technologies, layer, choice).find(
    (tech) => tech.platform !== undefined,
  );
}

function ownChoice(brief: PlanningBrief, layer: StackLayer): string | undefined {
  const entry = brief.stack.find((each) => each.layer === layer);
  return entry === undefined || entry.proposed === true ? undefined : entry.choice;
}

/** The owner's own language and runtime when it belongs to a platform of the catalogue, with that platform's group. */
export function languagePlatform(
  brief: PlanningBrief,
  stack: StackData,
): { readonly name: string; readonly platform: string; readonly group: VagueWords } | undefined {
  const typed = ownChoice(brief, 'language-runtime');
  const language =
    typed === undefined ? undefined : platformOfChoice(stack, 'language-runtime', typed);
  const group = stack.proposals.vague.find((each) => each.label === language?.platform);
  if (language?.platform === undefined || group === undefined) return undefined;
  return { name: language.name, platform: language.platform, group };
}

/** The mismatch of one layer, when its owner choice belongs to another platform than the language's. */
function mismatchOf(
  layer: StackLayer,
  brief: PlanningBrief,
  stack: StackData,
  language: NonNullable<ReturnType<typeof languagePlatform>>,
): PlatformMismatch | undefined {
  const choice = ownChoice(brief, layer);
  const found = choice === undefined ? undefined : platformOfChoice(stack, layer, choice);
  if (found?.platform === undefined || found.platform === language.platform) return undefined;
  const kind = brief.application ?? 'web';
  const [first] = platformOptions(stack, { kind, layer, platform: language.group, scanned: [] });
  return {
    ...{ layer, technology: found.name, platform: found.platform, language: language.name },
    recommended: first?.choice,
  };
}

/** The layers below the language whose choice belongs to a platform other than the language's. */
// RF-609
export function platformMismatches(brief: PlanningBrief, stack: StackData): PlatformMismatch[] {
  const language = languagePlatform(brief, stack);
  if (language === undefined) return [];
  return stackLayers
    .filter((layer) => layer !== 'language-runtime')
    .flatMap((layer) => mismatchOf(layer, brief, stack, language) ?? []);
}
