import { err, ok, type Result } from '../errors/result.js';
import { byCodeUnit } from '../code-map/code-unit-order.js';
import { isArchitectureStyleId, type ArchitectureStyleId } from './catalogue.js';
import { stackLayers, type StackLayer } from './planning-brief.js';

// RF-608, RF-609, ADR-005, ADR-013, ADR-018, DEC-76..DEC-78: the two architecture styles and the two
// stack options per layer that Plan setup offers. The planner is a model, so its answer is checked
// here: two known styles, each with trade-offs and evidence that names verified cards (an id that
// names no verified card is dropped, a style left with none is refused), one of them recommended;
// two different options for each of the seven layers, bounded like a stack choice of the brief.

const MAX_OPTION_CHARS = 200;
const MAX_TRADEOFF_CHARS = 300;
const MAX_TRADEOFFS = 5;

interface StyleOption {
  readonly style: ArchitectureStyleId;
  readonly strengths: readonly string[];
  readonly costs: readonly string[];
  /** Ids of verified cards, sorted. */
  readonly evidence: readonly string[];
}

interface LayerOptions {
  readonly layer: StackLayer;
  readonly options: readonly [string, string];
}

export interface PlanOptions {
  readonly architecture: {
    readonly recommended: ArchitectureStyleId;
    /** The recommended style first. */
    readonly options: readonly [StyleOption, StyleOption];
  };
  /** One entry per layer, in layer order. */
  readonly stack: readonly LayerOptions[];
}

/** What the planner's answer holds, before the domain checks it. */
export interface OptionsDraft {
  readonly architecture: {
    readonly recommended: string;
    readonly options: readonly {
      readonly style: string;
      readonly strengths: readonly string[];
      readonly costs: readonly string[];
      readonly evidence: readonly string[];
    }[];
  };
  readonly stack: readonly { readonly layer: string; readonly options: readonly string[] }[];
}

type DraftStyle = OptionsDraft['architecture']['options'][number];

function tidy(texts: readonly string[], limit: number, count: number): string[] {
  return texts
    .map((text) => text.trim().slice(0, limit))
    .filter((text) => text !== '')
    .slice(0, count);
}

/** The ids that name a verified card, without repeats, sorted. */
function evidenceOf(ids: readonly string[], verified: ReadonlySet<string>): string[] {
  return [...new Set(ids.filter((id) => verified.has(id)))].sort(byCodeUnit);
}

function styleProblems(draft: DraftStyle, style: StyleOption): string[] {
  return [
    ...(style.strengths.length === 0 ? [`The style ${draft.style} lists no strength.`] : []),
    ...(style.costs.length === 0 ? [`The style ${draft.style} lists no cost.`] : []),
    ...(style.evidence.length === 0 ? [`The style ${draft.style} cites no verified card.`] : []),
  ];
}

function styleOf(draft: DraftStyle, verified: ReadonlySet<string>): StyleOption | undefined {
  if (!isArchitectureStyleId(draft.style)) return undefined;
  return {
    style: draft.style,
    strengths: tidy(draft.strengths, MAX_TRADEOFF_CHARS, MAX_TRADEOFFS),
    costs: tidy(draft.costs, MAX_TRADEOFF_CHARS, MAX_TRADEOFFS),
    evidence: evidenceOf(draft.evidence, verified),
  };
}

function shapeProblems(options: readonly DraftStyle[], recommended: string): string[] {
  if (options.length !== 2) {
    return [`Two architecture styles are needed, not ${String(options.length)}.`];
  }
  const names = options.map((option) => option.style);
  return [
    ...names
      .filter((name) => !isArchitectureStyleId(name))
      .map((name) => `${name} is not an architecture style.`),
    ...(names[0] === names[1] ? [`The style ${names[0] ?? ''} is offered twice.`] : []),
    ...(names.includes(recommended)
      ? []
      : [`The recommended style ${recommended} is not one of the two.`]),
  ];
}

type Architecture = Result<PlanOptions['architecture'], string[]>;

function architectureOf(
  draft: OptionsDraft['architecture'],
  verified: ReadonlySet<string>,
): Architecture {
  const { options, recommended } = draft;
  const problems = shapeProblems(options, recommended);
  if (problems.length > 0) return err(problems);
  const styles = options.map((option) => ({ option, style: styleOf(option, verified) }));
  const checked = styles.flatMap(({ option, style }) =>
    style === undefined ? [] : styleProblems(option, style),
  );
  const [first, second] = styles.map(({ style }) => style);
  if (checked.length > 0 || first === undefined || second === undefined) return err(checked);
  const ordered: [StyleOption, StyleOption] =
    first.style === recommended ? [first, second] : [second, first];
  return ok({ recommended: ordered[0].style, options: ordered });
}

/** The first two different options (compared without case), each bounded; fewer is no answer. */
function twoOptions(texts: readonly string[]): [string, string] | undefined {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const text of texts) {
    const option = text.trim().slice(0, MAX_OPTION_CHARS).trim();
    if (option === '' || seen.has(option.toLowerCase())) continue;
    seen.add(option.toLowerCase());
    kept.push(option);
  }
  const [first, second] = kept;
  return first === undefined || second === undefined ? undefined : [first, second];
}

type Stack = Result<LayerOptions[], string[]>;

function stackOf(draft: OptionsDraft['stack']): Stack {
  const layers: LayerOptions[] = [];
  const problems: string[] = [];
  for (const layer of stackLayers) {
    const given = draft.filter((each) => each.layer === layer);
    const options =
      given.length === 0 ? undefined : twoOptions(given.flatMap((each) => each.options));
    if (given.length === 0) problems.push(`The layer ${layer} has no options.`);
    else if (options === undefined)
      problems.push(`The layer ${layer} needs two different options.`);
    else layers.push({ layer, options });
  }
  return problems.length > 0 ? err(problems) : ok(layers);
}

/** The options of a draft, or every problem found; `verified` holds the ids of the verified cards. */
// RF-608, RF-609
export function buildPlanOptions(
  draft: OptionsDraft,
  verified: ReadonlySet<string>,
): Result<PlanOptions, readonly string[]> {
  const architecture = architectureOf(draft.architecture, verified);
  const stack = stackOf(draft.stack);
  if (architecture.ok && stack.ok) {
    return ok({ architecture: architecture.value, stack: stack.value });
  }
  return err([...(architecture.ok ? [] : architecture.error), ...(stack.ok ? [] : stack.error)]);
}
