import { z } from 'zod';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { CalibrationSet } from '../../eval/calibration-set-schema.js';
import { RUBRIC_FAMILIES } from './rubric.js';

// RF-1405: the items the judge check scores. (a) A fixed sample of the hand-labelled calibration
// claims (RF-305): each is shown to the judge with the verdict the hand label gives or its opposite,
// alternately, and the judge is not told the label. (b) The hand-scored samples of
// `eval/judge-check/hand-scored.json`: an answer, its source and the scores a person gave it.

export interface CheckItem {
  readonly id: string;
  readonly kind: 'calibration' | 'hand-scored';
  readonly family: string;
  readonly source: string;
  readonly answer: string;
  readonly label: string | null;
  /** Calibration: whether the verdict shown follows the hand label. */
  readonly followsLabel: boolean | null;
  /** Hand-scored: the hand score of each criterion. */
  readonly scores: Readonly<Record<string, number>> | null;
}

const score = z.number().int().min(1).max(5);

const sampleSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
  family: z.enum(RUBRIC_FAMILIES),
  /** Where the source comes from: repository, path, commit. */
  origin: z.string().trim().min(1).max(400),
  licence: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(14_000),
  answer: z.string().trim().min(1).max(8000),
  label: z.string().trim().min(1).max(200).optional(),
  scores: z.record(z.string(), score),
  note: z.string().max(1000).optional(),
});

const setSchema = z.strictObject({
  schemaVersion: z.literal(1),
  version: z.string().min(1).max(60),
  description: z.string().max(3000).optional(),
  samples: z.array(sampleSchema).min(1).max(200),
});

export type HandScoredSample = z.infer<typeof sampleSchema>;

// RF-1405
export function parseHandScored(data: unknown): Result<HandScoredSample[], string> {
  const parsed = setSchema.safeParse(data);
  if (!parsed.success) {
    const where = parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
    );
    return err(where.join('; '));
  }
  const ids = parsed.data.samples.map((sample) => sample.id);
  if (new Set(ids).size !== ids.length) return err('two samples share an id');
  return ok(parsed.data.samples);
}

// RF-1405
export function handScoredItems(samples: readonly HandScoredSample[]): CheckItem[] {
  return samples.map((sample) => ({
    ...{ id: sample.id, kind: 'hand-scored', family: sample.family },
    ...{ source: sample.source, answer: sample.answer, label: sample.label ?? null },
    ...{ followsLabel: null, scores: sample.scores },
  }));
}

/** Two claims in every five, so the sample keeps the set's mix of labels. */
const sampled = (index: number): boolean => index % 5 < 2;

function fileText(
  path: string,
  range: { startLine: number; endLine: number },
  files: Readonly<Record<string, string>>,
): string {
  const head = `File ${path}, cited lines ${String(range.startLine)}-${String(range.endLine)} (marked with >):`;
  const text = files[path];
  if (text === undefined) return `${head}\n[the file is not available]`;
  const body = text.split(/\r?\n/u).map((line, index) => {
    const number = index + 1;
    const mark = number >= range.startLine && number <= range.endLine ? '>' : ' ';
    return `${mark}${String(number).padStart(3)} ${line}`;
  });
  return [head, ...body].join('\n');
}

// RF-1405
export function calibrationItems(
  set: CalibrationSet,
  files: Readonly<Record<string, string>>,
): CheckItem[] {
  return set.claims
    .filter((_claim, index) => sampled(index))
    .map((claim, position): CheckItem => {
      const followsLabel = position % 2 === 0;
      const shown = claim.supported === followsLabel ? 'Supported' : 'Rejected';
      const reason = followsLabel
        ? claim.note
        : shown === 'Supported'
          ? 'The cited lines show what the claim says.'
          : 'The cited lines do not show what the claim says.';
      const cited = claim.citations.map((each) => fileText(each.path, each, files));
      return {
        ...{ id: claim.id, kind: 'calibration', family: 'verifier' },
        source: [`Claim: ${claim.text}`, ...cited].join('\n\n'),
        answer: `Reason: ${reason}\nVerdict: ${shown}`,
        ...{ label: null, followsLabel, scores: null },
      };
    });
}

/** The first `limit` items of each kind and family; all of them when there is no limit. */
// RF-1405
export function limitItems(items: readonly CheckItem[], limit: number | undefined): CheckItem[] {
  throw new Error(`not implemented: ${String(items.length)} ${String(limit)}`);
}
