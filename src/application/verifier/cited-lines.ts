import type { Citation } from '../../domain/cards/citation.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { RepositoryReader } from '../ports/repository-reader.js';

// RF-301: the cited lines the verifier sees (P2-02, not built yet).

export const JUDGEMENT_MARGIN_LINES = 0;

export interface EvidenceLimits {
  readonly maxLines: number;
  readonly maxChars: number;
}

export const defaultEvidenceLimits: EvidenceLimits = { maxLines: 0, maxChars: 0 };

export interface CitedExcerpt {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly lines: readonly string[];
}

// RF-301
export function readCitedLines(
  reader: Pick<RepositoryReader, 'readLines'>,
  citations: readonly Citation[],
  limits: EvidenceLimits,
): Promise<Result<readonly CitedExcerpt[], string>> {
  const what = `${String(citations.length)} ${String(limits.maxLines)} ${typeof reader}`;
  return Promise.resolve(err(`not built: ${what}`));
}
