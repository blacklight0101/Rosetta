/* eslint-disable @typescript-eslint/no-unused-vars -- red skeleton, replaced by the feat commit */
import type { Result } from '../../domain/errors/result.js';

// RF-1402, DEC-231: `lab/config.json`, the caps of the prompt lab in micro-dollars.

export interface LabConfig {
  readonly schemaVersion: 1;
  readonly totalCapMicros: number;
  readonly stopMicros: number;
  readonly invocationCapMicros: number;
}

export function parseLabConfig(_data: unknown): Result<LabConfig, string> {
  throw new Error('not implemented');
}
