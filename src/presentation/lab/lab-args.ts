import { err, ok, type Result } from '../../domain/errors/result.js';

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
      /** RF-1404: the model that scores each answer against the family rubric. */
      readonly judge?: { readonly provider: string; readonly model: string };
    }
  | {
      readonly kind: 'judge-check';
      readonly model: { readonly provider: string; readonly model: string };
      readonly yes: boolean;
    }
  | { readonly kind: 'compare'; readonly a: string; readonly b: string }
  | { readonly kind: 'help' };

export const LAB_USAGE = [
  'Usage: npm run lab -- --prompt <id> --version <vN|file> --model <provider:model> --cases <set>',
  '                      [--repetitions n] [--yes]',
  '       npm run lab -- --compare <runA> <runB>',
  '  --prompt <id>            the prompt, such as verifier/claim or summariser/overview',
  '  --version <vN|file>      a version of the prompts folder (v5), or the path of a draft file',
  '  --model <provider:model> the model that answers, such as anthropic:claude-haiku-5-5',
  '  --cases <set>            a case set of lab/cases/ (without .json)',
  '  --repetitions <n>        runs of every case, 1 to 20 (default 1)',
  '  --yes                    send the calls; without it the plan and the caps are only shown',
  '  --compare <a> <b>        two run ids of lab-out/: their metrics side by side; sends nothing',
  'Calls the provider of the model with the server key of .env (node --env-file=.env), within the',
  'caps of lab/config.json and the shared ledger lab-out/ledger.jsonl. Results go to lab-out/<id>/.',
].join('\n');

const VALUE_FLAGS = ['--prompt', '--version', '--model', '--cases', '--repetitions'] as const;

function modelOf(value: string): Result<{ provider: string; model: string }, string> {
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

function runOf(draft: Draft): Result<LabArgs, string> {
  const missing = ['--prompt', '--version', '--model', '--cases'].filter(
    (flag) => !draft.values.has(flag),
  );
  if (missing.length > 0) return err(`missing ${missing.join(', ')}`);
  const model = modelOf(draft.values.get('--model') ?? '');
  if (!model.ok) return model;
  const repetitions = repetitionsOf(draft.values.get('--repetitions'));
  if (!repetitions.ok) return repetitions;
  return ok({
    kind: 'run',
    prompt: draft.values.get('--prompt') ?? '',
    version: draft.values.get('--version') ?? '',
    model: model.value,
    cases: draft.values.get('--cases') ?? '',
    repetitions: repetitions.value,
    yes: draft.yes,
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
  const draft = readDraft(args);
  return draft.ok ? runOf(draft.value) : draft;
}
