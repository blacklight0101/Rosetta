import type { AreaCoverage } from '../../src/domain/cards/area-coverage.js';
import type { Card, Claim } from '../../src/domain/cards/card.js';
import type { ClaimStatus } from '../../src/domain/cards/card-vocabulary.js';
import type { FileEntry } from '../../src/domain/code-map/file-entry.js';
import { entry } from './code-map-builders.js';

// RF-209, RF-231: small cards, claims and coverage for the Deepen round planner and the measures.

/** A claim citing the given paths, lines 1-2 of each; `extra` overrides any field. */
export function claimOf(
  claimId: string,
  status: ClaimStatus,
  paths: readonly string[],
  extra: Partial<Claim> = {},
): Claim {
  const citations = paths.map((path) => ({ path, startLine: 1, endLine: 2 }));
  const judged = status === 'Supported' || status === 'Rejected';
  const verdict = judged
    ? { step: 'judgement' as const, reason: `Reason of ${claimId}.`, model: 'judge', at: 'T' }
    : undefined;
  return {
    claimId,
    text: `Text of ${claimId}.`,
    citations,
    status,
    ...(verdict === undefined ? {} : { verdict }),
    ...extra,
  };
}

/** A card of the area holding these claims; the card id is the part of the first claim id before the dot. */
export function cardOf(area: string, claims: readonly Claim[]): Card {
  const id = claims[0]?.claimId.split('.')[0] ?? 'BR-001';
  return {
    id,
    type: 'BR',
    title: `Card ${id}`,
    summary: 'A summary.',
    area,
    agentTaskId: 'reader-001',
    confidence: 'Medium',
    claims,
  };
}

/** The coverage of an area: each listed file, with lines 1-`read` read (0: not read). */
export function coverageOf(
  area: string,
  files: readonly { readonly path: string; readonly read: number }[],
): AreaCoverage {
  return {
    area,
    files: files.map(({ path, read }) => ({
      path,
      read: read === 0 ? [] : [{ startLine: 1, endLine: read }],
    })),
    tokens: 0,
    readTokens: 0,
    readTokenShare: 0,
  };
}

/** `src/a.cs` (100 tokens), `src/b.cs` (300), `src/c.cs` (50) and a vendored `Scripts/jquery-3.4.1.js` (1000). */
export const deepenFiles: readonly FileEntry[] = [
  entry('src/a.cs', 100),
  entry('src/b.cs', 300),
  entry('src/c.cs', 50),
  entry('Scripts/jquery-3.4.1.js', 1000),
];

export const libraryPath = 'Scripts/jquery-3.4.1.js';
