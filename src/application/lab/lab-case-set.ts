/* eslint-disable @typescript-eslint/no-unused-vars -- red skeleton, replaced by the feat commit */
import type { Result } from '../../domain/errors/result.js';

// RF-1401, ADR-029: a case set holds the inputs of one prompt's cases.

export interface LabCase {
  readonly id: string;
  readonly expected: string | undefined;
  readonly split: 'tune' | 'held-back';
  readonly input: unknown;
}

export interface LabCaseSet {
  readonly schemaVersion: 1;
  readonly version: string;
  readonly prompt: string;
  readonly description: string;
  readonly cases: readonly LabCase[];
}

export function parseLabCaseSet(_data: unknown): Result<LabCaseSet, string[]> {
  throw new Error('not implemented');
}
