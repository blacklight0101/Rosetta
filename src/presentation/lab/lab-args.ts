/* eslint-disable @typescript-eslint/no-unused-vars -- red skeleton, replaced by the feat commit */
import type { Result } from '../../domain/errors/result.js';

// RF-1400, RF-1403: the options of `npm run lab`.

export type LabArgs =
  | {
      readonly kind: 'run';
      readonly prompt: string;
      readonly version: string;
      readonly model: { readonly provider: string; readonly model: string };
      readonly cases: string;
      readonly repetitions: number;
      readonly yes: boolean;
    }
  | { readonly kind: 'compare'; readonly a: string; readonly b: string };

export function parseLabArgs(_args: readonly string[]): Result<LabArgs, string> {
  throw new Error('not implemented');
}
