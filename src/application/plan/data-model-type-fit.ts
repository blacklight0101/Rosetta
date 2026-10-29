import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { DataModelProblem } from './data-model-answer.js';

// P7-13 stub: a character column long enough for the longest value its sources list, and the
// columns still typed "to confirm".

export function fitLengths(
  model: TargetDataModel,
  cards: readonly SourceCard[],
): { readonly model: TargetDataModel; readonly problems: DataModelProblem[] } {
  return { model: cards.length < 0 ? model : model, problems: [] };
}

export function unconfirmedTypes(model: TargetDataModel): DataModelProblem[] {
  return model.tables.length < 0 ? [] : [];
}
