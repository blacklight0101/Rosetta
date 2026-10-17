import type { Area } from '../../domain/code-map/area.js';
import type { AreaMarks } from '../../domain/code-map/area-surface.js';
import { ceilPercent } from './estimate-assumptions.js';
import type { ByScenario, EstimateAssumptions, Scenario } from './estimate-types.js';

// RF-425, RF-263, ADR-007: the tokens of the reader tasks. Every turn of a task resends the whole
// conversation, so the input of turn t is the prompt overhead, the part of the area read in the
// turns before it and everything answered before it. A turn never sends more than the context
// share of the model, because the task ends there (architecture section 8). An area the code map
// marks for flows or screens resends one more prompt fragment on every turn for each of them and
// answers the extra cards once (Q-25); any other area costs what it always did.

export interface TokenFigures {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

const noMarks: AreaMarks = { flows: false, screens: false };

/** How many of the flows and the screens fragments the area gets: 0, 1 or 2. */
function fragmentsOf(marks: AreaMarks): number {
  return (marks.flows ? 1 : 0) + (marks.screens ? 1 : 0);
}

function areaTokens(
  area: Area,
  scenario: Scenario,
  assumptions: EstimateAssumptions,
  marks: AreaMarks,
): TokenFigures {
  const turns = assumptions.turnsPerArea[scenario];
  const answered = assumptions.outputTokensPerTurn[scenario];
  const read = ceilPercent(area.estimatedTokens, assumptions.readSharePercent[scenario]);
  const fragments = fragmentsOf(marks);
  const overhead = assumptions.promptOverheadTokens + fragments * assumptions.surfacePromptTokens;
  let inputTokens = 0;
  for (let turn = 1; turn <= turns; turn += 1) {
    const before = turn - 1;
    const context = overhead + Math.floor((read * before) / turns) + answered * before;
    inputTokens += Math.min(context, assumptions.contextLimitTokens);
  }
  const extra = fragments * assumptions.surfaceOutputTokens[scenario];
  return { inputTokens, outputTokens: turns * answered + extra };
}

// RF-425, RF-263
export function readerTokens(
  areas: readonly Area[],
  assumptions: EstimateAssumptions,
  marks: ReadonlyMap<string, AreaMarks> = new Map(),
): ByScenario<TokenFigures> {
  const sum = (scenario: Scenario): TokenFigures =>
    areas
      .map((area) => areaTokens(area, scenario, assumptions, marks.get(area.name) ?? noMarks))
      .reduce(
        (total, each) => ({
          inputTokens: total.inputTokens + each.inputTokens,
          outputTokens: total.outputTokens + each.outputTokens,
        }),
        { inputTokens: 0, outputTokens: 0 },
      );
  return { low: sum('low'), likely: sum('likely'), high: sum('high') };
}
