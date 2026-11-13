/* eslint-disable @typescript-eslint/no-unused-vars -- red skeleton, replaced by the feat commit */
import type { Result } from '../../domain/errors/result.js';

// RF-1403, RNF-015: what one lab invocation writes, its summary and the comparison of two.

export interface LabCaseResult {
  readonly caseId: string;
  readonly repetition: number;
  readonly split: 'tune' | 'held-back';
  readonly expected: string | null;
  readonly detail: string;
  readonly answer: string;
  readonly usable: boolean;
  readonly validFirstTry: boolean;
  readonly repaired: boolean;
  readonly refused: boolean;
  readonly rstCode: string | null;
  readonly agreed: boolean | null;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly costMicros: number;
}

export interface LabResults {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly at: string;
  readonly rosettaVersion: string;
  readonly prompt: {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly sha256: string;
  };
  readonly model: {
    readonly provider: string;
    readonly model: string;
    readonly modelVersion: string | null;
  };
  readonly caseSet: { readonly version: string; readonly sha256: string };
  readonly repetitions: number;
  readonly planned: number;
  readonly endState: 'Completed' | 'Refused';
  readonly refusal: string | null;
  readonly cases: LabCaseResult[];
}

export interface LabSummary {
  readonly cases: number;
  readonly calls: number;
  readonly firstTryRate: number | null;
  readonly repairedRate: number | null;
  readonly invalidRate: number | null;
  readonly refusedCount: number;
  readonly errorsByCode: Readonly<Record<string, number>>;
  readonly agreementRate: number | null;
  readonly meanInputTokens: number | null;
  readonly meanOutputTokens: number | null;
  readonly meanLatencyMs: number | null;
  readonly costMicros: number;
}

export interface ComparedSide {
  readonly name: string;
  readonly version: string;
  readonly sha256: string;
  readonly model: string;
  readonly summary: LabSummary;
}

export interface LabComparison {
  readonly a: ComparedSide;
  readonly b: ComparedSide;
  readonly cases: readonly {
    readonly caseId: string;
    readonly repetition: number;
    readonly a: LabCaseResult | undefined;
    readonly b: LabCaseResult | undefined;
  }[];
}

export function parseLabResults(_data: unknown): Result<LabResults, string> {
  throw new Error('not implemented');
}

export function summariseLab(_results: LabResults): LabSummary {
  throw new Error('not implemented');
}

export function compareLab(_a: LabResults, _b: LabResults): Result<LabComparison, string> {
  throw new Error('not implemented');
}
