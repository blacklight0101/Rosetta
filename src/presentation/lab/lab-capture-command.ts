import { join } from 'node:path';
import { z } from 'zod';
import { buildCaseSet } from '../../application/lab/capture/build-case-set.js';
import type { CaptureRequest } from '../../application/lab/capture/build-case-set.js';
import { labSourceFields } from '../../application/lab/lab-case-set.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import {
  readJsonFile,
  readRunFolder,
  sha256Hex,
  writeCaseSetFile,
} from '../../infrastructure/lab/run-folder.js';

// RF-1404, RF-1405: `npm run lab -- --capture ...`, the capture mode. It reads saved run folders
// (never written, no model call, no key) and writes `lab/cases/<name>.json`.

const CAPTURE_USAGE = [
  'Usage: npm run lab -- --capture --prompt <id> --name <set> --sources <file>',
  '                      --run <source>=<run folder> [--run ...] [--max-per-run n]',
  '  --prompt <id>     the prompt the cases are for, such as planner/gap',
  '  --name <set>      the case set to write: lab/cases/<set>.json',
  '  --sources <file>  JSON of the sources (name, address, commit or snapshot, licence) by key',
  '  --run <key>=<dir> a saved run folder (or the folder that holds one) and the source it is of',
  '  --max-per-run <n> the most cases taken from one run, 1 to 50 (default 3)',
  'Sends nothing. Inputs only: no system prompt, no model answer, no expected label.',
].join('\n');

const sourceFile = z.record(z.string(), labSourceFields.omit({ runs: true }));

interface CaptureArgs {
  readonly prompt: string;
  readonly name: string;
  readonly sources: string;
  readonly runs: readonly { readonly key: string; readonly folder: string }[];
  readonly maxPerRun: number;
}

interface Flags {
  readonly values: Map<string, string>;
  readonly runs: { key: string; folder: string }[];
}

const VALUE_FLAGS = ['--prompt', '--name', '--sources', '--max-per-run'];

function flagsOf(argv: readonly string[]): Result<Flags, string> {
  const flags: Flags = { values: new Map(), runs: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index] ?? '';
    const value = argv[index + 1];
    if (value === undefined) return err(`${flag} needs a value`);
    const at = value.indexOf('=');
    if (flag === '--run' && at > 0)
      flags.runs.push({ key: value.slice(0, at), folder: value.slice(at + 1) });
    else if (flag === '--run') return err(`${value} is not <source>=<run folder>`);
    else if (VALUE_FLAGS.includes(flag)) flags.values.set(flag, value);
    else return err(`unknown option ${flag}`);
  }
  return ok(flags);
}

function invalidSetting(maxPerRun: number, name: string): string | undefined {
  if (!Number.isInteger(maxPerRun) || maxPerRun < 1 || maxPerRun > 50) {
    return '--max-per-run is 1 to 50';
  }
  return /^[a-z0-9][a-z0-9-]{0,63}$/u.test(name)
    ? undefined
    : '--name is lower-case words joined by -';
}

function argsOf(argv: readonly string[]): Result<CaptureArgs, string> {
  const flags = flagsOf(argv);
  if (!flags.ok) return flags;
  const { values, runs } = flags.value;
  const maxPerRun = Number(values.get('--max-per-run') ?? '3');
  const name = values.get('--name') ?? '';
  const prompt = values.get('--prompt');
  const sources = values.get('--sources');
  if (prompt === undefined || sources === undefined || runs.length === 0) {
    return err('missing --prompt, --sources or --run');
  }
  const invalid = invalidSetting(maxPerRun, name);
  if (invalid !== undefined) return err(invalid);
  return ok({ prompt, name, sources, runs, maxPerRun });
}

async function requestOf(args: CaptureArgs): Promise<Result<CaptureRequest, string>> {
  const known = sourceFile.safeParse(await readJsonFile(args.sources));
  if (!known.success) return err(`${args.sources} is not a valid sources file.`);
  const runs: CaptureRequest['runs'][number][] = [];
  for (const each of args.runs) {
    const source = known.data[each.key];
    if (source === undefined) return err(`The sources file has no source ${each.key}.`);
    const run = await readRunFolder(each.folder, each.key);
    if (!run.ok) return run;
    runs.push({ source, run: run.value });
  }
  const description = `Inputs of ${args.prompt} captured from saved runs of public code; no model answer is stored and no expected label is written. The held-back cases follow the fixed rule of the lab (docs/runbooks/prompt-lab.md section 4).`;
  return ok({
    prompt: args.prompt,
    name: args.name,
    description,
    maxPerRun: args.maxPerRun,
    sha256: sha256Hex,
    runs,
  });
}

// RF-1404
export async function runLabCapture(
  argv: readonly string[],
  labFolder: string,
  print: (line: string) => void,
): Promise<number> {
  const args = argsOf(argv);
  if (!args.ok) return (print(`${args.error}\n${CAPTURE_USAGE}`), 1);
  try {
    const request = await requestOf(args.value);
    if (!request.ok) return (print(request.error), 1);
    const built = buildCaseSet(request.value);
    if (!built.ok) return (print(built.error), 1);
    const file = await writeCaseSetFile(join(labFolder, 'cases'), args.value.name, built.value.set);
    const held = built.value.set.cases.filter((each) => each.split === 'held-back').length;
    print(
      `Wrote ${file}: ${String(built.value.set.cases.length)} cases, ${String(held)} held back.`,
    );
    if (built.value.leftOut.length > 0) {
      print(`Left out for personal data: ${built.value.leftOut.join('; ')}`);
    }
    return 0;
  } catch (error) {
    print(`The capture failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
