import { err, ok, type Result } from '../../../domain/errors/result.js';
import { parseLabCaseSet, type LabCaseSet, type LabCaseSource } from '../lab-case-set.js';
import { captureInput, capturablePromptIds } from './capture-rules.js';
import type { CapturedRun } from './capture-types.js';
import { heldBackIds, type Sha256 } from './held-back.js';
import { personalDataIn } from './personal-data.js';

// RF-1404, RF-1405: a case set from saved runs. Every run gives at most `maxPerRun` cases, chosen by
// the hash of the task name (never by the input), after the inputs that hold personal data were
// left out. The split follows the fixed rule of held-back.ts. Nothing here calls a model, and no
// `expected` is written: an expected label is added by hand from the code (DEC-57).

export interface CaptureRequest {
  readonly prompt: string;
  readonly name: string;
  readonly description: string;
  readonly maxPerRun: number;
  readonly sha256: Sha256;
  /** Not used yet (red). */
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
  /** Not filled yet (red). */
  readonly repeated: readonly string[];
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');

interface Candidate {
  readonly id: string;
  readonly from: string;
  readonly input: unknown;
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
    const input = captureInput(request.prompt, task, { maxTurns: entry.run.maxTurns });
    if (input === undefined) continue;
    const personal = personalDataIn(JSON.stringify(input));
    if (personal !== undefined) {
      leftOut.push(`${entry.run.runId}/${task.name}: ${personal}`);
      continue;
    }
    const id = slug(`${entry.run.key}-${entry.run.runId}-${task.name}`).slice(0, 64);
    kept.push({ id, from: entry.source.key, input });
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
  const cases = request.runs.flatMap((entry) => candidatesOf(request, entry, leftOut));
  if (cases.length === 0) return err(`No task of the runs is an input of ${request.prompt}.`);
  const held = heldBackIds(
    request.prompt,
    cases.map((each) => each.id),
    request.sha256,
  );
  const sources = request.runs.map(({ source, run }) => ({ ...source, runs: [run.runId] }));
  const set = parseLabCaseSet({
    schemaVersion: 1,
    version: `${request.name}-1`,
    prompt: request.prompt,
    description: request.description,
    sources: mergedSources(sources),
    cases: cases.map((each) => ({
      id: each.id,
      from: each.from,
      split: held.has(each.id) ? 'held-back' : 'tune',
      input: each.input,
    })),
  });
  return set.ok ? ok({ set: set.value, leftOut, repeated: [] }) : err(set.error.join('; '));
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
