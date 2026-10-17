import { err, type Result } from '../errors/result.js';
import type { ArchitectureStyleId } from './catalogue.js';
import type { StackLayer } from './planning-brief.js';

// RF-608, RF-609, ADR-018, DEC-76..DEC-78: the two architecture styles and the two stack options
// per layer that Plan setup offers. Stub until the feature commit.

export interface StyleOption {
  readonly style: ArchitectureStyleId;
  readonly strengths: readonly string[];
  readonly costs: readonly string[];
  readonly evidence: readonly string[];
}

export interface LayerOptions {
  readonly layer: StackLayer;
  readonly options: readonly [string, string];
}

export interface PlanOptions {
  readonly architecture: {
    readonly recommended: ArchitectureStyleId;
    readonly options: readonly [StyleOption, StyleOption];
  };
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

export function buildPlanOptions(
  draft: OptionsDraft,
  verified: ReadonlySet<string>,
): Result<PlanOptions, readonly string[]> {
  return err(draft.stack.length < 0 || verified.size < 0 ? ['x'] : []);
}
