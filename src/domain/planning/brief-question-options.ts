import type { Catalogue } from './catalogue.js';
import type { PlanningBrief } from './planning-brief.js';

// RF-637, RF-645, DEC-189: the Plan setup options of a brief question (stub, filled by the next commit).

export interface BriefOption {
  readonly answer: string;
  readonly description: string;
  readonly recommended: boolean;
}

export function briefQuestionOptions(
  brief: PlanningBrief,
  catalogue: Catalogue,
): Record<string, readonly BriefOption[]> {
  return catalogue.version < 0 ? {} : Object.fromEntries(brief.defaulted.map((id) => [id, []]));
}
