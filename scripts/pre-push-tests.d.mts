// Types for scripts/pre-push-tests.mjs, so that the planner can be tested from TypeScript.
export type PrePushMode = 'none' | 'related' | 'full';
export type FileKind = 'code' | 'doc' | 'other';

export interface PrePushPlan {
  readonly mode: PrePushMode;
  readonly base: string | null;
  readonly steps: readonly (readonly string[])[];
  readonly reason: string;
}

export interface PlanInput {
  readonly base: string | null;
  readonly changed: readonly string[] | null;
}

export interface RunIo {
  spawnChild(command: string, args: readonly string[]): Promise<number>;
}

export function classify(file: string): FileKind;
export function planPrePushTests(input: PlanInput): PrePushPlan;
export function runPlan(plan: PrePushPlan, io: RunIo): Promise<number>;
