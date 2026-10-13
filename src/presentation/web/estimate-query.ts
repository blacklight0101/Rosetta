import { z } from 'zod';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { FieldProblemsError } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-425, P1-107: the query of GET /api/projects/:id/estimate. `?areas=A&areas=B` names the areas;
// a single `areas=A` arrives as a string. Any other parameter (`areas[]=A`, a misspelt `area=A`)
// is refused with RST-2000 and a problem that names it, instead of being ignored, so a caller never
// gets the estimate of every area while believing it asked for fewer.

const MAX_AREAS = 200;
const MAX_AREA_NAME = 1024;

const areaName = z.string().min(1).max(MAX_AREA_NAME);

const estimateQuery = z.strictObject({
  areas: z
    .union([areaName, z.array(areaName).max(MAX_AREAS)])
    .optional()
    .transform((areas) => (typeof areas === 'string' ? [areas] : areas)),
});

function unknownParameters(issues: readonly z.core.$ZodIssue[]): readonly string[] {
  return issues.flatMap((issue) => (issue.code === 'unrecognized_keys' ? issue.keys : []));
}

/** The areas the query names; undefined for every area. Throws RST-2000 for any other query. */
// RF-425
export function parseEstimateQuery(query: unknown): readonly string[] | undefined {
  const parsed = estimateQuery.safeParse(query);
  if (parsed.success) return parsed.data.areas;
  const unknown = unknownParameters(parsed.error.issues);
  if (unknown.length === 0) throw new RosettaError(ERROR_CODES.requestInvalid);
  throw new FieldProblemsError(
    ERROR_CODES.requestInvalid,
    unknown.toSorted().map((name) => ({
      field: name,
      code: ERROR_CODES.requestInvalid,
      reason: `Unknown query parameter "${name}". Name each area as areas=<name>, repeated for several.`,
    })),
  );
}
