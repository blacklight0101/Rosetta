import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CalibrationProblem } from '../../application/eval/run-calibration.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { loadPriceTable } from '../../infrastructure/budget/price-file.js';
import { readAppVersion } from '../../infrastructure/config/app-version.js';
import {
  loadCalibrationSet,
  type LoadedCalibrationSet,
} from '../../infrastructure/eval/calibration-set-file.js';
import { loadEvaluationConfig } from '../../infrastructure/eval/golden-set-file.js';
import { loadProjectTemplate } from '../../infrastructure/files/project-template.js';
import { SecretMasker } from '../../infrastructure/guards/secret-masker.js';
import { StdoutJsonLogger } from '../../infrastructure/system/stdout-json-logger.js';
import { SystemClock } from '../../infrastructure/system/system-clock.js';
import { TimestampIdGenerator } from '../../infrastructure/system/timestamp-id-generator.js';
import { evaluationProviderFactory } from '../compose-providers.js';
import { calibrationReport } from './calibration-report.js';
import {
  runCalibration,
  type CalibrationParts,
  type CalibrationRole,
} from './compose-calibration.js';
import type { EvalArgs } from './eval-args.js';
import { dollars } from './eval-settings.js';

// RF-305, RF-143, DEC-57, ADR-008: `npm run eval -- --calibration`, the opt-in calibration of the
// verifier. It reads the settings and the calibration set under `eval/`, the server keys from the
// environment (`.env`), judges the hand-labelled claims with the `verifier` role of each chosen model
// and writes `eval-out/<id>/calibration.json`. It is never run by the tests or CI (they drive
// `runCalibration` with the fake provider). RF-143: it first shows the models, the cap and the
// source folder, and starts only with `--yes`, the owner's consent to send the cited lines and spend.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const folder = (name: string): string => join(root, name);

type Environment = Readonly<Record<string, string | undefined>>;
type Print = (line: string) => void;

const NOT_STARTED = 'Nothing was sent. Run again with --yes to start the calibration.';

interface Inputs {
  readonly loaded: LoadedCalibrationSet;
  readonly models: readonly CalibrationRole[];
  readonly capMicros: number;
}

async function inputsOf(args: EvalArgs): Promise<Result<Inputs, string>> {
  const config = await loadEvaluationConfig(folder('eval/'), args.config);
  if (!config.ok) return config;
  const { calibration } = config.value;
  if (calibration === undefined)
    return err(`The settings ${args.config} have no calibration section.`);
  const loaded = await loadCalibrationSet(folder('eval/'), calibration.set);
  if (!loaded.ok) return loaded;
  // `--verifier` replaces the models of the settings, as it replaces the verifier of a golden run.
  const models = args.roles.verifier === undefined ? calibration.models : [args.roles.verifier];
  return ok({ loaded: loaded.value, models, capMicros: calibration.capMicros });
}

// RF-143
export function calibrationPlan(inputs: Inputs): string[] {
  const { set } = inputs.loaded;
  return [
    `npm run eval -- --calibration judges ${String(set.claims.length)} hand-labelled claims (calibration set ${set.version}).`,
    `It sends the lines they cite from ${set.source.folder} to these models:`,
    ...inputs.models.map((role) => `  verifier: ${role.provider} ${role.model}`),
    `All together may cost up to ${dollars(inputs.capMicros)}.`,
  ];
}

async function partsOf(
  settings: ProjectSettings,
  capMicros: number,
  env: Environment,
): Promise<CalibrationParts> {
  const clock = new SystemClock();
  const masker = new SecretMasker();
  const ids = new TimestampIdGenerator(clock);
  const output = { write: (text: string) => process.stderr.write(text) };
  const logger = new StdoutJsonLogger({ output, clock, masker, minLevel: 'warn' });
  return {
    ...{ outputDir: folder('eval-out/'), repositoryRoot: root, promptsFolder: folder('prompts/') },
    providers: await evaluationProviderFactory(logger),
    serverKeys: { openai: env['OPENAI_API_KEY'], anthropic: env['ANTHROPIC_API_KEY'] },
    ollamaUrl: env['ROSETTA_OLLAMA_URL'],
    priceTable: await loadPriceTable(folder('prices/default-prices.yaml')),
    rosettaVersion: await readAppVersion(),
    ...{ settings, capMicros, clock, ids, logger, masker },
  };
}

/** The problem, and the results of paid calls that could not be written, so they are not lost. */
function failed(problem: CalibrationProblem, print: Print): void {
  print(`${problem.code}: ${problem.message}`);
  if (problem.results !== undefined) print(JSON.stringify(problem.results, null, 2));
}

// RF-305, RF-143
export async function runCalibrationCommand(
  args: EvalArgs,
  env: Environment,
  print: Print,
): Promise<number> {
  const inputs = await inputsOf(args);
  if (!inputs.ok) return (print(inputs.error), 1);
  for (const line of calibrationPlan(inputs.value)) print(line);
  if (!args.yes) return (print(NOT_STARTED), 1);
  const settings = await loadProjectTemplate(folder('templates/'));
  const { loaded, models, capMicros } = inputs.value;
  const result = await runCalibration(await partsOf(settings, capMicros, env), loaded, models);
  if (!result.ok) return (failed(result.error, print), 1);
  for (const line of calibrationReport(result.value)) print(line);
  return 0;
}
