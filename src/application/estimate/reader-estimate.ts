import type { Area } from '../../domain/code-map/area.js';
import type { AreaMarks } from '../../domain/code-map/area-surface.js';
import { ceilPercent } from './estimate-assumptions.js';
import type { ByScenario, EstimateAssumptions, Scenario } from './estimate-types.js';

// RF-425, ADR-007: the tokens of the reader tasks. Every turn of a task resends the whole
// conversation, so the input of turn t is the prompt overhead, the part of the area read in the
// turns before it and everything answered before it. A turn never sends more than the context
// share of the model, because the task ends there (architecture section 8).

export interface TokenFigures {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

function areaTokens(
  area: Area,
  scenario: Scenario,
  assumptions: EstimateAssumptions,
): TokenFigures {
  const turns = assumptions.turnsPerArea[scenario];
  const answered = assumptions.outputTokensPerTurn[scenario];
  const read = ceilPercent(area.estimatedTokens, assumptions.readSharePercent[scenario]);
  let inputTokens = 0;
  for (let turn = 1; turn <= turns; turn += 1) {
    const before = turn - 1;
    const context =
      assumptions.promptOverheadTokens + Math.floor((read * before) / turns) + answered * before;
    inputTokens += Math.min(context, assumptions.contextLimitTokens);
  }
  return { inputTokens, outputTokens: turns * answered };
}

// RF-425
export function readerTokens(
  areas: readonly Area[],
  assumptions: EstimateAssumptions,
  marks: ReadonlyMap<string, AreaMarks> = new Map(),
): ByScenario<TokenFigures> {
  const counted = marks.size >= 0 ? areas : [];
  const sum = (scenario: Scenario): TokenFigures =>
    counted
      .map((area) => areaTokens(area, scenario, assumptions))
      .reduce(
        (total, each) => ({
          inputTokens: total.inputTokens + each.inputTokens,
          outputTokens: total.outputTokens + each.outputTokens,
        }),
        { inputTokens: 0, outputTokens: 0 },
      );
  return { low: sum('low'), likely: sum('likely'), high: sum('high') };
}
