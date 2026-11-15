import { err, ok, type Result } from '../../domain/errors/result.js';
import type { LabSplit } from '../../application/lab/lab-selection.js';

// RF-1400, RF-1403: the options of `npm run lab -- [options]`. A run needs the prompt id, its
// version (`v5` or the path of a draft file), the model (`provider:model`) and the case set; the
// caps come from `lab/config.json` and are never set on the command line. As with `npm run eval`
// (RF-143) the command sends something and spends money only with `--yes`. `--compare a b` reads the
// results of two runs and takes no other option.

export type LabArgs =
  | {
      readonly kind: 'run';
      readonly prompt: string;
      readonly version: string;
      readonly model: { readonly provider: string; readonly model: string };
      readonly cases: string;
      readonly repetitions: number;
      readonly yes: boolean;
      /** RF-1407: the model that scores each answer against the family rubric. */
      readonly judge?: { readonly provider: string; readonly model: string };
      /** RF-1409: run only the cases of one side, and only a sample of them. */
      readonly split?: LabSplit;
      readonly sample?: number;
    }
  | {
      readonly kind: 'judge-check';
      readonly model: { readonly provider: string; readonly model: string };
      readonly yes: boolean;
      /** RF-1408: score only the first n items of each kind and family (a smoke run). */
      readonly limit?: number;
    }
  | { readonly kind: 'compare'; readonly a: string; readonly b: string }
  | { readonly kind: 'help' };

export const LAB_USAGE = [
  'Usage: npm run lab -- --prompt <id> --version <vN|file> --model <provider:model> --cases <set>',
  '                      [--repetitions n] [--judge <provider:model>] [--yes]',
  '                      [--split tune|held-back] [--sample n]',
  '       npm run lab -- --compare <runA> <runB>',
  '       npm run lab -- --judge-check <provider:model> [--limit n] [--yes]',
  '  --prompt <id>            the prompt, such as verifier/claim or summariser/overview',
  '  --version <vN|file>      a version of the prompts folder (v5), or the path of a draft file',
  '  --model <provider:model> the model that answers, such as anthropic:claude-haiku-5-5',
  '  --cases <set>            a case set of lab/cases/ (without .json)',
  '  --repetitions <n>        runs of every case, 1 to 20 (default 1)',
  '  --split <side>           send only the cases of one side of the set: tune or held-back',
  '  --sample <n>             send only the first n cases by id (after --split); a run is compared only with one of the same selection',
  '  --judge <provider:model> score each answer against the rubric of its family (more calls)',
  '  --judge-check <p:m>      check that judge on the calibration claims and the hand-scored samples',
  '  --yes                    send the calls; without it the plan and the caps are only shown',
  '  --compare <a> <b>        two run ids of lab-out/: their metrics side by side; sends nothing',
  'Calls the provider of the model with the server key of .env (node --env-file=.env), within the',
  'caps of lab/config.json and the shared ledger lab-out/ledger.jsonl. Results go to lab-out/<id>/.',
].join('\n');

const VALUE_FLAGS = [
  '--prompt',
  '--version',
  '--model',
  '--cases',
  '--repetitions',
  '--judge',
  '--split',
  '--sample',
] as const;

interface ModelRef {
  provider: string;
  model: string;
}

function modelOf(value: string): Result<ModelRef, string> {
  const colon = value.indexOf(':');
  if (colon <= 0 || colon === value.length - 1) return err(`${value} is not provider:model`);
  return ok({ provider: value.slice(0, colon), model: value.slice(colon + 1) });
}

interface Draft {
  values: Map<string, string>;
  yes: boolean;
}

function readDraft(args: readonly string[]): Result<Draft, string> {
  const draft: Draft = { values: new Map(), yes: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index] ?? '';
    if (flag === '--yes') {
      draft.yes = true;
      continue;
    }
    if (!VALUE_FLAGS.some((known) => known === flag)) return err(`unknown option ${flag}`);
    const value = args[index + 1];
    if (value === undefined) return err(`${flag} needs a value`);
    draft.values.set(flag, value);
    index += 1;
  }
  return ok(draft);
}

function repetitionsOf(value: string | undefined): Result<number, string> {
  if (value === undefined) return ok(1);
  const count = Number(value);
  if (!/^\d{1,2}$/u.test(value) || count < 1 || count > 20)
    return err(`${value} is not a count from 1 to 20`);
  return ok(count);
}

function splitOf(value: string | undefined): Result<LabSplit | undefined, string> {
  if (value === undefined || value === 'tune' || value === 'held-back') return ok(value);
  return err(`${value} is not tune or held-back`);
}

function sampleOf(value: string | undefined): Result<number | undefined, string> {
  if (value === undefined) return ok(undefined);
  const count = Number(value);
  if (!/^\d{1,3}$/u.test(value) || count < 1 || count > 500)
    return err(`${value} is not a count from 1 to 500`);
  return ok(count);
}

function judgeOf(value: string | undefined): Result<ModelRef | undefined, string> {
  return value === undefined ? ok(undefined) : modelOf(value);
}

interface RunOptions {
  judge?: ModelRef;
  split?: LabSplit;
  sample?: number;
}

/** The optional --judge, --split (RF-1409) and --sample (RF-1409) of a run, each left out when absent. */
function optionsOf(draft: Draft): Result<RunOptions, string> {
  const judge = judgeOf(draft.values.get('--judge'));
  if (!judge.ok) return judge;
  const split = splitOf(draft.values.get('--split'));
  if (!split.ok) return split;
  const sample = sampleOf(draft.values.get('--sample'));
  if (!sample.ok) return sample;
  return ok({
    ...(judge.value === undefined ? {} : { judge: judge.value }),
    ...(split.value === undefined ? {} : { split: split.value }),
    ...(sample.value === undefined ? {} : { sample: sample.value }),
  });
}

function runOf(draft: Draft): Result<LabArgs, string> {
  const missing = ['--prompt', '--version', '--model', '--cases'].filter(
    (flag) => !draft.values.has(flag),
  );
  if (missing.length > 0) return err(`missing ${missing.join(', ')}`);
  const model = modelOf(draft.values.get('--model') ?? '');
  if (!model.ok) return model;
  const repetitions = repetitionsOf(draft.values.get('--repetitions'));
  if (!repetitions.ok) return repetitions;
  const options = optionsOf(draft);
  if (!options.ok) return options;
  return ok({
    kind: 'run',
    prompt: draft.values.get('--prompt') ?? '',
    version: draft.values.get('--version') ?? '',
    model: model.value,
    cases: draft.values.get('--cases') ?? '',
    repetitions: repetitions.value,
    yes: draft.yes,
    ...options.value,
  });
}

// RF-1408
/** `--limit n` of the judge check: the count, undefined when absent, null when it is not a count. */
function limitOf(rest: readonly string[]): { limit: number | undefined | null; others: string[] } {
  const at = rest.indexOf('--limit');
  const others = rest.filter((each, index) => each !== '--yes' && index !== at && index !== at + 1);
  if (at < 0) return { limit: undefined, others };
  const count = Number(rest[at + 1]);
  return { limit: Number.isInteger(count) && count >= 1 ? count : null, others };
}

function judgeCheckOf(args: readonly string[]): Result<LabArgs, string> {
  const [value, ...rest] = args;
  const model = modelOf(value ?? '');
  const { limit, others } = limitOf(rest);
  if (!model.ok || others.length > 0 || limit === null) {
    return err('--judge-check takes a provider:model, optionally --limit n, and --yes to send');
  }
  const yes = rest.includes('--yes');
  return ok({
    kind: 'judge-check',
    model: model.value,
    yes,
    ...(limit === undefined ? {} : { limit }),
  });
}

// RF-1400, RF-1403
export function parseLabArgs(args: readonly string[]): Result<LabArgs, string> {
  if (args.length === 1 && args[0] === '--help') return ok({ kind: 'help' });
  if (args[0] === '--compare') {
    const [, a, b, ...rest] = args;
    if (a === undefined || b === undefined || rest.length > 0) {
      return err('--compare takes exactly two run ids and no other option');
    }
    return ok({ kind: 'compare', a, b });
  }
  if (args[0] === '--judge-check') return judgeCheckOf(args.slice(1));
  const draft = readDraft(args);
  return draft.ok ? runOf(draft.value) : draft;
}
