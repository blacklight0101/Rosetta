import { err, ok, type Result } from '../../../domain/errors/result.js';
import { parseLabCaseSet, type LabCaseSet, type LabCaseSource } from '../lab-case-set.js';
import { captureInput, capturablePromptIds } from './capture-rules.js';
import type { CapturedRun } from './capture-types.js';
import { inputKey, splitsOf, type Sha256 } from './held-back.js';
import { personalDataIn } from './personal-data.js';

// RF-1404, RF-1405: a case set from saved runs. Every run gives at most `maxPerRun` cases, chosen by
// the hash of the task name (never by the input), after the inputs that hold personal data were
// left out. Every text of an input is masked again by the run's masker, so a secret shape the masker
// learnt after the run is masked too. A case whose input equals an earlier case's input (the same
// area, files and reads from another run) is dropped before the split, which follows the fixed rule
// of held-back.ts on the input; a set left with no case on one side is written with a warning.
// Nothing here calls a model, and no `expected` is written: an
// expected label is added by hand from the code (DEC-57).

export interface CaptureRequest {
  readonly prompt: string;
  readonly name: string;
  readonly description: string;
  readonly maxPerRun: number;
  readonly sha256: Sha256;
  /** The run's secret masker over one text (RF-141). */
  readonly mask: (text: string) => string;
  /** One entry per run: the source it belongs to, with the run behind it. */
  readonly runs: readonly {
    readonly source: Omit<LabCaseSource, 'runs'>;
    readonly run: CapturedRun;
  }[];
}

export interface Captured {
  readonly set: LabCaseSet;
  /** Candidate tasks left out because their input held personal data, per kind. */
  readonly leftOut: readonly string[];
  /** Candidate tasks dropped because an earlier case holds the same input. */
  readonly repeated: readonly string[];
  /** What the set lacks for a keep decision: a side with no case (RF-1405). */
  readonly warnings: readonly string[];
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');

interface Candidate {
  readonly id: string;
  readonly from: string;
  /** `<run id>/<task name>`, as the output names a case it leaves out. */
  readonly task: string;
  readonly input: unknown;
}

/** Every text of a JSON value masked, keys and structure kept. */
function maskedTexts(value: unknown, mask: (text: string) => string): unknown {
  if (typeof value === 'string') return mask(value);
  if (Array.isArray(value)) return value.map((item: unknown) => maskedTexts(item, mask));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]: [string, unknown]) => [key, maskedTexts(item, mask)]),
    );
  }
  return value;
}

/** The candidates whose input no earlier candidate holds, and a line for each one dropped. */
function withoutRepeats(
  candidates: readonly Candidate[],
  sha256: Sha256,
): { kept: Candidate[]; repeated: string[] } {
  const firstOf = new Map<string, string>();
  const kept: Candidate[] = [];
  const repeated: string[] = [];
  for (const each of candidates) {
    const key = inputKey(each.input, sha256);
    const first = firstOf.get(key);
    if (first === undefined) {
      firstOf.set(key, each.id);
      kept.push(each);
    } else repeated.push(`${each.task}: the input of ${first}`);
  }
  return { kept, repeated };
}

function candidatesOf(
  request: CaptureRequest,
  entry: CaptureRequest['runs'][number],
  leftOut: string[],
): Candidate[] {
  const rank = request.sha256;
  const ordered = [...entry.run.tasks].sort((a, b) => rank(a.name).localeCompare(rank(b.name)));
  const kept: Candidate[] = [];
  for (const task of ordered) {
    if (kept.length === request.maxPerRun) break;
    const captured = captureInput(request.prompt, task, { maxTurns: entry.run.maxTurns });
    if (captured === undefined) continue;
    const input = maskedTexts(captured, request.mask);
    const personal = personalDataIn(JSON.stringify(input));
    if (personal !== undefined) {
      leftOut.push(`${entry.run.runId}/${task.name}: ${personal}`);
      continue;
    }
    const id = slug(`${entry.run.key}-${entry.run.runId}-${task.name}`).slice(0, 64);
    kept.push({ id, from: entry.source.key, task: `${entry.run.runId}/${task.name}`, input });
  }
  return kept;
}

// RF-1404, RF-1405
export function buildCaseSet(request: CaptureRequest): Result<Captured, string> {
  if (!capturablePromptIds.includes(request.prompt)) {
    return err(
      `The capture has no rule for ${request.prompt}. Prompts it can capture: ${capturablePromptIds.join(', ')}.`,
    );
  }
  const leftOut: string[] = [];
  const candidates = request.runs.flatMap((entry) => candidatesOf(request, entry, leftOut));
  if (candidates.length === 0) return err(`No task of the runs is an input of ${request.prompt}.`);
  const { kept: cases, repeated } = withoutRepeats(candidates, request.sha256);
  const splits = splitsOf(
    cases.map((each) => each.input),
    request.sha256,
  );
  const sources = request.runs.map(({ source, run }) => ({ ...source, runs: [run.runId] }));
  const set = parseLabCaseSet({
    schemaVersion: 1,
    version: `${request.name}-1`,
    prompt: request.prompt,
    description: request.description,
    sources: mergedSources(sources),
    cases: cases.map((each, index) => ({
      id: each.id,
      from: each.from,
      split: splits[index],
      input: each.input,
    })),
  });
  return set.ok
    ? ok({ set: set.value, leftOut, repeated, warnings: sideWarnings(splits) })
    : err(set.error.join('; '));
}

/**
 * A side with no case. The rule cannot move an input to the other side, so the set is still written
 * (its cases can be tuned on, or measured as a baseline) and the owner is told what it lacks.
 */
function sideWarnings(splits: readonly string[]): string[] {
  const warnings: string[] = [];
  if (!splits.includes('held-back')) {
    warnings.push(
      'The set has no held-back case, so no version can be kept on it (DEC-231): capture more runs.',
    );
  }
  if (!splits.includes('tune')) {
    warnings.push('The set has no tune case, so no version can be tuned on it: capture more runs.');
  }
  return warnings;
}

/** Runs of one source are listed once under it. */
function mergedSources(sources: readonly LabCaseSource[]): LabCaseSource[] {
  const byKey = new Map<string, LabCaseSource>();
  for (const source of sources) {
    const known = byKey.get(source.key);
    byKey.set(
      source.key,
      known === undefined ? source : { ...known, runs: [...known.runs, ...source.runs] },
    );
  }
  return [...byKey.values()];
}
