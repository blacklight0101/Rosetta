import type { Area } from '../../domain/code-map/area.js';
import type { AreaMarks } from '../../domain/code-map/area-surface.js';
import { ceilPercent } from './estimate-assumptions.js';
import type { ByScenario, ReaderAssumptions, Scenario } from './estimate-types.js';

// RF-425, RF-263, ADR-007: the tokens of the reader tasks. Every turn of a task resends the whole
// conversation, so the input of turn t is the prompt overhead, the part of the area read in the
// turns before it and everything answered before it. A turn never sends more than the context
// share of the model, because the task ends there (architecture section 8). An area the code map
// marks for flows or screens resends one more prompt fragment on every turn for each of them and
// answers the extra cards once (Q-25); any other area costs what it always did. A provider with a
// prompt cache bills only what a turn adds to the conversation at its cache-write price (P2-37), so
// the tokens a task writes are the conversation as it stands at its last turn.

export interface TokenFigures {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** The part of `inputTokens` written to a prompt cache: the conversation at the last turn (P2-37). */
  readonly cacheWriteTokens: number;
  /**
   * The estimated prompt of one call of the role, which picks the tier of a model priced by prompt
   * length (Q-56): the average prompt of the calls for the low and likely figures, the largest one
   * for the high figure. It is not a part of `inputTokens`, which sums every call.
   */
  readonly promptTokens: number;
}

/** The figures of one area with what the prompt of one call is made from: its calls and largest prompt. */
interface AreaFigures extends Omit<TokenFigures, 'promptTokens'> {
  readonly calls: number;
  readonly largestPrompt: number;
}

const noMarks: AreaMarks = { flows: false, screens: false };
/** RF-155: a workbook area gets both fragments with the guidance. */
const bothMarks: AreaMarks = { flows: true, screens: true };

/** How many of the flows and the screens fragments the area gets: 0, 1 or 2. */
function fragmentsOf(marks: AreaMarks): number {
  return (marks.flows ? 1 : 0) + (marks.screens ? 1 : 0);
}

function areaTokens(
  area: Area,
  scenario: Scenario,
  assumptions: ReaderAssumptions,
  kind: { readonly marks: AreaMarks; readonly workbook: boolean },
): AreaFigures {
  const { marks, workbook } = kind;
  const turns = assumptions.turnsPerArea[scenario];
  const answered = assumptions.outputTokensPerTurn[scenario];
  const read = ceilPercent(area.estimatedTokens, assumptions.readSharePercent[scenario]);
  const fragments = fragmentsOf(workbook ? bothMarks : marks);
  const guidance = workbook ? assumptions.workbookPromptTokens : 0;
  const surface = fragments * assumptions.surfacePromptTokens;
  const overhead = assumptions.promptOverheadTokens + surface + guidance;
  let inputTokens = 0;
  let cacheWriteTokens = 0;
  let largestPrompt = 0;
  for (let turn = 1; turn <= turns; turn += 1) {
    const before = turn - 1;
    const context = overhead + Math.floor((read * before) / turns) + answered * before;
    cacheWriteTokens = Math.min(context, assumptions.contextLimitTokens);
    inputTokens += cacheWriteTokens;
    largestPrompt = Math.max(largestPrompt, cacheWriteTokens);
  }
  const extra = fragments * assumptions.surfaceOutputTokens[scenario];
  const outputTokens = turns * answered + extra;
  return { inputTokens, outputTokens, cacheWriteTokens, calls: turns, largestPrompt };
}

// RF-425, RF-263
export function readerTokens(
  areas: readonly Area[],
  assumptions: ReaderAssumptions,
  marks: ReadonlyMap<string, AreaMarks> = new Map(),
  /** RF-155: the names of the areas that hold a rendered workbook. */
  workbooks: ReadonlySet<string> = new Set(),
): ByScenario<TokenFigures> {
  const sum = (scenario: Scenario): TokenFigures => {
    const total = areas
      .map((area) =>
        areaTokens(area, scenario, assumptions, {
          marks: marks.get(area.name) ?? noMarks,
          workbook: workbooks.has(area.name),
        }),
      )
      .reduce(
        (all, each) => ({
          inputTokens: all.inputTokens + each.inputTokens,
          outputTokens: all.outputTokens + each.outputTokens,
          cacheWriteTokens: all.cacheWriteTokens + each.cacheWriteTokens,
          calls: all.calls + each.calls,
          largestPrompt: Math.max(all.largestPrompt, each.largestPrompt),
        }),
        { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, calls: 0, largestPrompt: 0 },
      );
    const { calls, largestPrompt, ...figures } = total;
    const average = calls === 0 ? 0 : Math.ceil(total.inputTokens / calls);
    return { ...figures, promptTokens: scenario === 'high' ? largestPrompt : average };
  };
  return { low: sum('low'), likely: sum('likely'), high: sum('high') };
}
