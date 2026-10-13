import { z } from 'zod';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { FieldProblemsError } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { MAX_AREAS, MAX_AREA_NAME } from './area-limits.js';

// RF-425, P1-107: what the estimate routes read. GET /api/projects/:id/estimate takes no query
// (the estimate of every area); any parameter, such as `areas`, is refused with RST-2000 and a
// problem that names it, so a caller never gets the estimate of every area while believing it asked
// for fewer. The areas travel in the body of POST /api/projects/:id/estimate, so a long selection
// is bounded by a body limit, not by the length of a URL.

const noQuery = z.strictObject({});

/** RF-425: the names of the areas to estimate; at least one, each as the code map names it. */
export const estimateBody = z.strictObject({
  areas: z.array(z.string().min(1).max(MAX_AREA_NAME)).min(1).max(MAX_AREAS),
});

function unknownParameters(issues: readonly z.core.$ZodIssue[]): readonly string[] {
  return issues.flatMap((issue) => (issue.code === 'unrecognized_keys' ? issue.keys : []));
}

/** Throws RST-2000 for any query parameter of the GET estimate. */
// RF-425
export function refuseEstimateQuery(query: unknown): void {
  const parsed = noQuery.safeParse(query);
  if (parsed.success) return;
  const unknown = unknownParameters(parsed.error.issues);
  if (unknown.length === 0) throw new RosettaError(ERROR_CODES.requestInvalid);
  throw new FieldProblemsError(
    ERROR_CODES.requestInvalid,
    unknown.toSorted().map((name) => ({
      field: name,
      code: ERROR_CODES.requestInvalid,
      reason: `Unknown query parameter "${name}". To estimate some areas, POST them as { "areas": [...] } to the same address.`,
    })),
  );
}
