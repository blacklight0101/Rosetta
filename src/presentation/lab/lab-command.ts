import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PromptFile } from '../../application/agent/prompt-file.js';
import type { LabTarget } from '../../application/lab/lab-target.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { compareLab } from '../../application/lab/lab-results.js';
import { loadModelList } from '../../infrastructure/models/model-list-file.js';
import { loadPriceTable } from '../../infrastructure/budget/price-file.js';
import { readAppVersion } from '../../infrastructure/config/app-version.js';
import { loadProjectTemplate } from '../../infrastructure/files/project-template.js';
import { SecretMasker } from '../../infrastructure/guards/secret-masker.js';
import {
  loadLabCaseSet,
  type LoadedLabSet,
  loadLabConfig,
  loadPromptVersion,
  readLabResults,
} from '../../infrastructure/lab/lab-files.js';
import { StdoutJsonLogger } from '../../infrastructure/system/stdout-json-logger.js';
import { SystemClock } from '../../infrastructure/system/system-clock.js';
import { TimestampIdGenerator } from '../../infrastructure/system/timestamp-id-generator.js';
import { evaluationProviderFactory } from '../compose-providers.js';
import { dollars } from '../eval/eval-settings.js';
import { runLab, type LabParts } from './compose-lab.js';
import { LAB_USAGE, parseLabArgs, type LabArgs } from './lab-args.js';
import { compareLines, summaryLines } from './lab-report.js';
import { ledgerFileFromEnvironment, sharedLedgerProblem } from './lab-ledger-path.js';
import { findLabTarget } from './lab-targets.js';

// RF-1400, RF-1403, DEC-231, ADR-008: `npm run lab`, the opt-in prompt lab. It reads `lab/config.json`
// and the case set under `lab/`, the server keys from the environment (`.env`), sends the real
// messages of one prompt over the cases to one model and writes `lab-out/<id>/results.json`. It is
// never run by the tests or CI (they drive `runLabRun` with the fake provider). As in RF-143 it
// starts only with `--yes`: it first shows the prompt, the model, the number of calls and the caps.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const folder = (name: string): string => join(root, name);

type Environment = Readonly<Record<string, string | undefined>>;
type Print = (line: string) => void;
type RunArgs = Extract<LabArgs, { kind: 'run' }>;

export interface LabFolders {
  readonly labFolder: string;
  readonly promptsFolder: string;
}

const NOT_STARTED = 'Nothing was sent. Run again with --yes to start.';

function planLines(args: RunArgs, parts: LabParts, cases: number, promptName: string): string[] {
  const calls = cases * args.repetitions;
  const { limits } = parts;
  return [
    `npm run lab sends the prompt ${promptName} over ${String(cases)} cases, ${String(args.repetitions)} time(s) each,`,
    `at least ${String(calls)} calls, to ${args.model.provider}:${args.model.model} (case set ${args.cases}).`,
    `This invocation may cost up to ${dollars(limits.invocationCapMicros)}; the phase has a stop line at ${dollars(limits.stopMicros)} and a cap of ${dollars(limits.totalCapMicros)}.`,
  ];
}

interface Resolved {
  readonly target: LabTarget;
  readonly loaded: LoadedLabSet;
  readonly prompt: PromptFile;
}

/** The target, case set and prompt version of a run, or the first thing that is wrong with them. */
async function resolveRun(args: RunArgs, folders: LabFolders): Promise<Result<Resolved, string>> {
  const target = await findLabTarget(folders.promptsFolder, args.prompt);
  if (!target.ok) return target;
  const loaded = await loadLabCaseSet(folders.labFolder, args.cases);
  if (!loaded.ok) return loaded;
  if (loaded.value.set.prompt !== target.value.id) {
    return err(
      `The case set ${args.cases} is written for ${loaded.value.set.prompt}, not for ${args.prompt}.`,
    );
  }
  const prompt = await loadPromptVersion(folders.promptsFolder, target.value.id, args.version);
  if (!prompt.ok) return prompt;
  return ok({ target: target.value, loaded: loaded.value, prompt: prompt.value });
}

// RF-1400
export async function runLabRun(
  parts: LabParts,
  args: RunArgs,
  folders: LabFolders,
  print: Print,
): Promise<number> {
  const resolved = await resolveRun(args, folders);
  if (!resolved.ok) return (print(resolved.error), 1);
  const missing = sharedLedgerProblem(
    parts.settings.providers[args.model.provider]?.kind,
    parts.ledgerFile,
  );
  if (missing !== undefined) return (print(missing), 1);
  const { target, loaded, prompt } = resolved.value;
  for (const line of planLines(args, parts, loaded.set.cases.length, prompt.name)) print(line);
  if (!args.yes) return (print(NOT_STARTED), 1);
  const { model, repetitions } = args;
  const run = await runLab(parts, { target, prompt, model, loaded, repetitions });
  if (!run.ok) {
    print(`${run.error.code}: ${run.error.message}`);
    if (run.error.results !== undefined)
      print(parts.masker.mask(JSON.stringify(run.error.results, null, 2)).text);
    return 1;
  }
  for (const line of summaryLines(run.value.results, run.value.folder)) print(line);
  return run.value.results.endState === 'Completed' ? 0 : 1;
}

// RF-1403
export async function runLabCompare(
  outputDir: string,
  a: string,
  b: string,
  print: Print,
): Promise<number> {
  const [first, second] = [await readLabResults(outputDir, a), await readLabResults(outputDir, b)];
  if (!first.ok) return (print(first.error), 1);
  if (!second.ok) return (print(second.error), 1);
  const compared = compareLab(first.value, second.value);
  if (!compared.ok) return (print(compared.error), 1);
  for (const line of compareLines(compared.value)) print(line);
  return 0;
}

async function realParts(env: Environment): Promise<LabParts | string> {
  const config = await loadLabConfig(folder('lab/'));
  if (!config.ok) return config.error;
  const ledgerFile = ledgerFileFromEnvironment(env);
  if (!ledgerFile.ok) return ledgerFile.error;
  const clock = new SystemClock();
  const masker = new SecretMasker();
  const output = { write: (text: string) => process.stderr.write(text) };
  const logger = new StdoutJsonLogger({ output, clock, masker, minLevel: 'warn' });
  return {
    ...{ outputDir: folder('lab-out/'), promptsFolder: folder('prompts/') },
    ledgerFile: ledgerFile.value,
    providers: await evaluationProviderFactory(logger),
    serverKeys: { openai: env['OPENAI_API_KEY'], anthropic: env['ANTHROPIC_API_KEY'] },
    ollamaUrl: env['ROSETTA_OLLAMA_URL'],
    priceTable: await loadPriceTable(folder('prices/default-prices.yaml')),
    models: await loadModelList(folder('prices/models.yaml')),
    settings: await loadProjectTemplate(folder('templates/')),
    limits: config.value,
    rosettaVersion: await readAppVersion(),
    ...{ clock, ids: new TimestampIdGenerator(clock), logger, masker },
  };
}

// RF-1400, RF-1403
export async function runLabCommand(
  argv: readonly string[],
  env: Environment,
  print: Print,
): Promise<number> {
  const args = parseLabArgs(argv);
  if (!args.ok) return (print(`${args.error}\n${LAB_USAGE}`), 1);
  if (args.value.kind === 'help') return (print(LAB_USAGE), 0);
  if (args.value.kind === 'compare') {
    return runLabCompare(folder('lab-out/'), args.value.a, args.value.b, print);
  }
  const parts = await realParts(env);
  if (typeof parts === 'string') return (print(parts), 1);
  return runLabRun(
    parts,
    args.value,
    { labFolder: folder('lab/'), promptsFolder: folder('prompts/') },
    print,
  );
}
