import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvaluationConfig } from '../../application/eval/evaluation-config.js';
import type { EvaluationProblem } from '../../application/eval/run-evaluation.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import { ok, type Result } from '../../domain/errors/result.js';
import { loadPriceTable } from '../../infrastructure/budget/price-file.js';
import { readAppVersion } from '../../infrastructure/config/app-version.js';
import {
  loadEvaluationConfig,
  loadGoldenSet,
  type LoadedGoldenSet,
} from '../../infrastructure/eval/golden-set-file.js';
import { loadProjectTemplate } from '../../infrastructure/files/project-template.js';
import { GitHubSnapshotFetcher } from '../../infrastructure/github/github-snapshot-fetcher.js';
import { SnapshotStore } from '../../infrastructure/github/snapshot-store.js';
import { SecretMasker } from '../../infrastructure/guards/secret-masker.js';
import { StdoutJsonLogger } from '../../infrastructure/system/stdout-json-logger.js';
import { SystemClock } from '../../infrastructure/system/system-clock.js';
import { TimestampIdGenerator } from '../../infrastructure/system/timestamp-id-generator.js';
import { composeLanguagePacks } from '../composition-root.js';
import { evaluationProviderFactory } from '../compose-providers.js';
import { runEvaluation, type EvaluationParts } from './compose-evaluation.js';
import { runCalibrationCommand } from './calibration-command.js';
import { EVAL_USAGE, parseEvalArgs, type EvalArgs } from './eval-args.js';
import { reportLines } from './eval-report-lines.js';
import { evaluationPlan, evaluationSettings } from './eval-settings.js';

// RNF-006, RNF-012, RNF-015, ADR-008: `npm run eval`, the opt-in evaluation against real models.
// It is never run by the tests or CI (they drive `runEvaluation` with the fake provider). It reads
// the settings and the golden set under `eval/`, the server keys from the environment (`.env`), and
// fetches the golden set's pinned commit from GitHub like a project's scan. Its runs, snapshot and
// results stay in the git-ignored `eval-out/` of this repository. RF-143: it first shows the models,
// caps and source, and starts only with `--yes`, the owner's consent to send the source and spend.

const root = new URL('../../../', import.meta.url);
const folder = (name: string): string => fileURLToPath(new URL(name, root));

type Environment = Readonly<Record<string, string | undefined>>;
type Print = (line: string) => void;

async function partsOf(
  config: EvaluationConfig,
  settings: ProjectSettings,
  env: Environment,
): Promise<EvaluationParts> {
  const clock = new SystemClock();
  const masker = new SecretMasker();
  const ids = new TimestampIdGenerator(clock);
  const output = { write: (text: string) => process.stderr.write(text) };
  const logger = new StdoutJsonLogger({ output, clock, masker, minLevel: 'warn' });
  const dataDir = join(folder('eval-out/'), 'data');
  const githubToken = env['GITHUB_TOKEN'];
  const promptsFolder = folder('prompts/');
  return {
    ...{ dataDir, outputDir: folder('eval-out/'), clock, masker, ids, logger, promptsFolder },
    settings,
    fetcher: new GitHubSnapshotFetcher({ dataDir, clock, logger, idGenerator: ids, githubToken }),
    snapshotRoot: (key) => new SnapshotStore(dataDir).filesDir(key),
    providers: await evaluationProviderFactory(logger),
    serverKeys: { openai: env['OPENAI_API_KEY'], anthropic: env['ANTHROPIC_API_KEY'] },
    ollamaUrl: env['ROSETTA_OLLAMA_URL'],
    priceTable: await loadPriceTable(folder('prices/default-prices.yaml')),
    totalCapMicros: config.totalCapMicros,
    rosettaVersion: await readAppVersion(),
    packs: await composeLanguagePacks(),
  };
}

interface Inputs {
  readonly config: EvaluationConfig;
  readonly golden: LoadedGoldenSet;
  readonly settings: ProjectSettings;
  readonly repetitions: number;
}

/** The settings file, the golden set and the settings of the runs; nothing is sent yet. */
async function inputsOf(args: EvalArgs): Promise<Result<Inputs, string>> {
  const evalFolder = folder('eval/');
  const config = await loadEvaluationConfig(evalFolder, args.config);
  if (!config.ok) return config;
  const golden = await loadGoldenSet(evalFolder, config.value.goldenSet);
  if (!golden.ok) return golden;
  const template = await loadProjectTemplate(folder('templates/'));
  const settings = evaluationSettings(template, config.value, args);
  const repetitions = args.repetitions ?? config.value.repetitions;
  return ok({ config: config.value, golden: golden.value, settings, repetitions });
}

const NOT_STARTED = 'Nothing was sent. Run again with --yes to start the runs.';

/** The problem, and the results of paid runs that could not be written, so they are not lost. */
function failed(problem: EvaluationProblem, print: Print): void {
  print(`${problem.code}: ${problem.message}`);
  if (problem.files !== undefined) print(JSON.stringify(problem.files, null, 2));
}

/** The golden-set evaluation: show the plan, then run it with the owner's consent. */
async function runGoldenCommand(args: EvalArgs, env: Environment, print: Print): Promise<number> {
  const inputs = await inputsOf(args);
  if (!inputs.ok) return (print(inputs.error), 1);
  const { config, golden, settings, repetitions } = inputs.value;
  const { totalCapMicros } = config;
  for (const line of evaluationPlan({ settings, totalCapMicros, repetitions }, golden.set))
    print(line);
  if (!args.yes) return (print(NOT_STARTED), 1);
  const parts = await partsOf(config, settings, env);
  const result = await runEvaluation(parts, golden, repetitions);
  if (!result.ok) return (failed(result.error, print), 1);
  for (const line of reportLines(result.value)) print(line);
  return 0;
}

// RNF-006, RNF-015, RF-143, RF-305
export async function runEvalCommand(
  args: readonly string[],
  env: Environment,
  print: Print,
): Promise<number> {
  const parsed = parseEvalArgs(args);
  if (!parsed.ok || parsed.value.help) {
    print(
      parsed.ok
        ? EVAL_USAGE
        : `${parsed.error}
${EVAL_USAGE}`,
    );
    return parsed.ok ? 0 : 2;
  }
  const run = parsed.value.calibration ? runCalibrationCommand : runGoldenCommand;
  return run(parsed.value, env, print);
}
