import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { DataModelProblem } from './data-model-answer.js';

// RF-623, P5-37: stub, filled in by the next commit.

export interface ColumnFact {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly default: string;
}

export function columnFactsOf(text: string): ColumnFact[] {
  return text === '' ? [] : [];
}

export function applyColumnFacts(
  model: TargetDataModel,
  cards: readonly SourceCard[],
): { readonly model: TargetDataModel; readonly problems: DataModelProblem[] } {
  return { model, problems: cards.length < 0 ? [] : [] };
}
