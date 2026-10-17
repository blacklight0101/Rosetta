import type { EvaluationRoles } from '../../application/eval/evaluation-config.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RNF-015: the options of `npm run eval -- [options]`. The settings file (default
// `eval/config.json`) holds the models and the caps; the command line may choose other models and
// more repetitions, never fewer than three (the use case refuses them) and never other caps.

export interface EvalArgs {
  readonly config: string;
  readonly repetitions?: number;
  readonly roles: EvaluationRoles;
  readonly help: boolean;
}

export const EVAL_USAGE = [
  'Usage: npm run eval -- [options]',
  '  --config <file>          settings under eval/ (default config.json)',
  '  --repetitions <n>        runs per case, at least 3 (default from the settings)',
  '  --reader <provider:model>, --verifier <provider:model>, --summariser <provider:model>',
  '                           models instead of those of the settings',
  'Calls the providers of the chosen models with the server keys of .env; the caps of the',
  'settings bound each run and the whole evaluation. Results go to eval-out/<id>/.',
].join('\n');

const ROLE_FLAGS = ['--reader', '--verifier', '--summariser'] as const;

function roleOf(value: string): Result<{ provider: string; model: string }, string> {
  const colon = value.indexOf(':');
  if (colon <= 0 || colon === value.length - 1) return err(`${value} is not provider:model`);
  return ok({ provider: value.slice(0, colon), model: value.slice(colon + 1) });
}

interface Draft {
  config: string;
  repetitions?: number;
  roles: Record<string, { provider: string; model: string }>;
  help: boolean;
}

function apply(draft: Draft, flag: string, value: string): string | undefined {
  if (flag === '--config') draft.config = value;
  else if (flag === '--repetitions') {
    const count = Number(value);
    if (!/^\d{1,2}$/u.test(value) || !Number.isInteger(count)) return `${value} is not a count`;
    draft.repetitions = count;
  } else if (ROLE_FLAGS.some((role) => role === flag)) {
    const role = roleOf(value);
    if (!role.ok) return role.error;
    draft.roles[flag.slice(2)] = role.value;
  } else return `unknown option ${flag}`;
  return undefined;
}

// RNF-015
export function parseEvalArgs(args: readonly string[]): Result<EvalArgs, string> {
  // P2-11 red step: removed by the feat commit.
  if (args.length >= 0) return err('red step');
  const draft: Draft = { config: 'config.json', roles: {}, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index] ?? '';
    if (flag === '--help') {
      draft.help = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined) return err(`${flag} needs a value`);
    const problem = apply(draft, flag, value);
    if (problem !== undefined) return err(problem);
    index += 1;
  }
  const { reader, verifier, summariser } = draft.roles;
  const roles = {
    ...(reader === undefined ? {} : { reader }),
    ...(verifier === undefined ? {} : { verifier }),
    ...(summariser === undefined ? {} : { summariser }),
  };
  return ok({ ...draft, roles });
}
