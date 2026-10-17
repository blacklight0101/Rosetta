import { z } from 'zod';
import { parseCitation, type Citation } from '../../domain/cards/citation.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { isRepositoryPath } from '../../domain/sources/permalink.js';

// RF-305, DEC-57, ADR-008: the calibration set is hand-written data, `unknown` until this schema has
// read it. Every object is strict (an unknown key is refused), every text has a limit, the source
// folder is a relative path of the Rosetta repository (no `..`, no absolute or Windows path), every
// citation parses, ids are unique, and both labels are present: a set that holds only supported
// claims (or none) cannot show whether the verifier tells a supported claim from an unsupported one.
// Anything else is refused with every problem named.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u, 'must be lower-case words joined by -');
const repositoryPath = z.string().max(400).refine(isRepositoryPath, 'is not a repository path');

const claimSchema = z.strictObject({
  id,
  text: z.string().trim().min(1).max(2000),
  citations: z.array(z.string().max(420)).min(1).max(20),
  supported: z.boolean(),
  note: z.string().trim().min(1).max(1000),
});

const setSchema = z.strictObject({
  schemaVersion: z.literal(1),
  version: z.string().trim().min(1).max(60),
  description: z.string().max(2000),
  source: z.strictObject({ folder: repositoryPath }),
  claims: z.array(claimSchema).min(1).max(200),
});

type RawSet = z.infer<typeof setSchema>;

/** One claim of the set: a statement, the lines it cites and the hand label. */
export interface CalibrationClaim {
  readonly id: string;
  readonly text: string;
  readonly citations: readonly Citation[];
  /** The hand label: whether the cited lines (with the verifier's margin) support the claim. */
  readonly supported: boolean;
  /** Why the claim is labelled so, for a person who reviews the set. */
  readonly note: string;
}

export interface CalibrationSet {
  readonly schemaVersion: 1;
  readonly version: string;
  readonly description: string;
  /** A folder of the Rosetta repository that holds the files the claims cite. */
  readonly source: { readonly folder: string };
  readonly claims: readonly CalibrationClaim[];
}

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where =
      issue.path.length === 0 ? 'the calibration set' : issue.path.map(String).join('.');
    return `${where}: ${issue.message}`;
  });
}

function claimsOf(raw: RawSet): Result<CalibrationClaim[], string[]> {
  const problems: string[] = [];
  const claims = raw.claims.map((claim, index) => {
    const citations = claim.citations.flatMap((text) => {
      const parsed = parseCitation(text);
      if (!parsed.ok)
        problems.push(
          `claims.${String(index)}.citations: ${text} is not a citation (${parsed.error})`,
        );
      return parsed.ok ? [parsed.value] : [];
    });
    return { ...claim, citations };
  });
  return problems.length === 0 ? ok(claims) : err(problems);
}

/** The problems of the set as a whole: repeated ids and a missing label. */
function setProblems(raw: RawSet): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const claim of raw.claims) {
    if (seen.has(claim.id)) problems.push(`claims: the id ${claim.id} is used twice`);
    seen.add(claim.id);
  }
  if (!raw.claims.some((claim) => claim.supported)) {
    problems.push('claims: the set holds no supported claim');
  }
  if (raw.claims.every((claim) => claim.supported)) {
    problems.push('claims: the set holds no claim labelled not supported');
  }
  return problems;
}

// RF-305
export function parseCalibrationSet(data: unknown): Result<CalibrationSet, string[]> {
  const parsed = setSchema.safeParse(data);
  if (!parsed.success) return err(issuesOf(parsed.error));
  const claims = claimsOf(parsed.data);
  const problems = [...setProblems(parsed.data), ...(claims.ok ? [] : claims.error)];
  if (problems.length > 0 || !claims.ok) return err(problems);
  return ok({ ...parsed.data, claims: claims.value });
}
