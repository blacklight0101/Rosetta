import { z } from 'zod';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-1401, ADR-029: a lab case set is hand-written data, `unknown` until this schema has read it.
// Every object is strict, every text has a limit, ids are unique. A case holds the inputs of one
// prompt (`input`, parsed later by the prompt's target), never the prompt text, so any version of
// the prompt can be rendered over it. `expected` is a label the target's `detail` is compared with;
// `split` marks the cases held back from tuning (DEC-231).

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u, 'must be lower-case words joined by -');

const caseSchema = z.strictObject({
  id,
  expected: z.string().min(1).max(100).optional(),
  split: z.enum(['tune', 'held-back']).default('tune'),
  input: z.unknown(),
});

// RF-1405: where the inputs of a captured set come from. `commit` is the commit of a repository;
// `snapshot` the hash of an uploaded archive that has no commit. One of the two is always given.
export const labSourceFields = z.strictObject({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/u),
  name: z.string().min(1).max(200),
  url: z.string().max(400).optional(),
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,64}$/u)
    .optional(),
  snapshot: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/u)
    .optional(),
  licence: z.string().min(1).max(400),
  runs: z.array(z.string().min(1).max(100)).max(50),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub of the test commit (DEC-191)
const sourceSchema = labSourceFields.refine(
  (source) => source.commit !== undefined || source.snapshot !== undefined,
  {
    message: 'must name a commit or a snapshot hash',
  },
);

const setSchema = z.strictObject({
  schemaVersion: z.literal(1),
  version: z.string().trim().min(1).max(60),
  prompt: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/u, 'must be <folder>/<name>'),
  description: z.string().max(2000),
  cases: z.array(caseSchema).min(1).max(500),
});

export type LabCaseSource = z.infer<typeof labSourceFields>;

interface LabCase {
  readonly id: string;
  readonly from?: string | undefined;
  readonly expected: string | undefined;
  readonly split: 'tune' | 'held-back';
  readonly input: unknown;
}

export interface LabCaseSet {
  readonly schemaVersion: 1;
  readonly version: string;
  /** The prompt id the set is written for, such as `verifier/claim`. */
  readonly prompt: string;
  readonly description: string;
  readonly sources?: readonly LabCaseSource[] | undefined;
  readonly cases: readonly LabCase[];
}

function duplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const each of ids) {
    if (seen.has(each)) repeated.add(each);
    seen.add(each);
  }
  return [...repeated];
}

const idsSchema = z.object({ cases: z.array(z.object({ id: z.string() })) });

/** The ids of the cases of raw data, so a repeated one is named even when other problems exist. */
function idsOf(data: unknown): string[] {
  const parsed = idsSchema.safeParse(data);
  return parsed.success ? parsed.data.cases.map((each) => each.id) : [];
}

// RF-1401
export function parseLabCaseSet(data: unknown): Result<LabCaseSet, string[]> {
  const parsed = setSchema.safeParse(data);
  const repeated = duplicateIds(idsOf(data));
  const twice = repeated.map((each) => `cases: the id ${each} is used twice`);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
    );
    return err([...issues, ...twice]);
  }
  if (twice.length > 0) return err(twice);
  const cases = parsed.data.cases.map((each) => ({
    id: each.id,
    from: undefined,
    expected: each.expected,
    split: each.split,
    input: each.input,
  }));
  return ok({ ...parsed.data, cases });
}
