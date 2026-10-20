import { err, type Result } from '../../../domain/errors/result.js';

export interface OvbaFailure {
  readonly reason: 'corrupt' | 'too-large';
  readonly detail: string;
}

export function decompressOvba(
  input: Uint8Array,
  maxBytes: number,
): Result<Uint8Array, OvbaFailure> {
  return err({ reason: 'corrupt', detail: `pending ${String(input.length)} ${String(maxBytes)}` });
}
