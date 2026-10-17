import type { PlanDraft } from '../../domain/planning/plan-draft.js';

// RF-601, ADR-013: the planner's answer read as a draft (not built yet).

// RF-601
export const parsePlanAnswer: (output: string) => PlanDraft | undefined = () => undefined;
