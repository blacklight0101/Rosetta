import {
  RunCalibration,
  type CalibrationModel,
  type CalibrationProblem,
  type CalibrationSummary,
} from '../../application/eval/run-calibration.js';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { Logger } from '../../application/ports/logger.js';
import type {
  ProviderAccount,
  ProviderRun,
  ProviderSetFactory,
  ProviderSinks,
} from '../../application/ports/provider-set-factory.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import { silentBudgetEvents } from '../../application/runs/run-budget-events.js';
import { defaultEvidenceLimits } from '../../application/verifier/cited-lines.js';
import type { VerifierPrompts } from '../../application/verifier/verifier-prompts.js';
import type { ModelList } from '../../application/models/model-list.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { MemoryCostLedger } from '../../infrastructure/db/memory-cost-ledger.js';
import { MemoryProviderKeyRepository } from '../../infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../infrastructure/db/memory-server-settings.js';
import { FileCalibrationOutput } from '../../infrastructure/eval/calibration-files.js';
import type { LoadedCalibrationSet } from '../../infrastructure/eval/calibration-set-file.js';
import {
  openCalibrationSource,
  skipLookupOf,
} from '../../infrastructure/eval/calibration-source.js';
import type { SecretMasker } from '../../infrastructure/guards/secret-masker.js';
import { loadVerifierPrompts } from '../../infrastructure/prompts/verifier-prompt-files.js';
import type { ServerKeys } from '../../infrastructure/providers/provider-access.js';
import { unrecordedSinks } from '../../infrastructure/providers/unrecorded-sinks.js';
import type { GuardedFactoryMaker } from '../compose-providers.js';
import { evaluationAccount } from './eval-account.js';
import { noUserKeys } from './eval-pipeline.js';
import { evaluationCaps } from './eval-settings.js';

// Architecture section 2 (composition root), RF-305, DEC-57, ADR-003, ADR-007, ADR-008: one
// calibration. The `verifier` role of each chosen model is built by the guarded provider factory
// (the egress guard masks what is sent and the budget guard meters and caps every call), under an
// in-memory account of the calibration's own whose daily cap is the cap of the whole calibration.
// All calls are booked to one run of the stage `verify` of that account, with no project, whose cost
// cap is the calibration's cap, so the cap bounds the models together; nothing is kept of the calls
// besides the ledger. The cited lines come from a folder of this repository, opened read-only. The
// result goes to `eval-out/<id>/calibration.json`.

export interface CalibrationParts {
  readonly outputDir: string;
  /** The folder the set's `source.folder` is relative to: the Rosetta repository. */
  readonly repositoryRoot: string;
  readonly promptsFolder: string;
  /** The guarded provider factory over the calibration's stores (the release adapters, or a fake). */
  readonly providers: GuardedFactoryMaker;
  readonly serverKeys: ServerKeys;
  readonly ollamaUrl: string | undefined;
  readonly priceTable: PriceTable;
  readonly models: ModelList;
  /** The project settings the models are chosen in: the template's providers and limits. */
  readonly settings: ProjectSettings;
  /** The most the whole calibration may cost, in micro-dollars. */
  readonly capMicros: number;
  readonly rosettaVersion: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly masker: SecretMasker;
}

export interface CalibrationRole {
  readonly provider: string;
  readonly model: string;
}

interface Guarded {
  readonly factory: ProviderSetFactory;
  readonly account: ProviderAccount;
  readonly run: ProviderRun;
  readonly sinks: ProviderSinks;
}

/** What every model of the calibration shares. */
interface Shared {
  readonly reader: CalibrationModel['judge']['reader'];
  readonly skipReason: CalibrationModel['judge']['skipReason'];
  readonly prompts: VerifierPrompts;
}

async function guardedOf(parts: CalibrationParts): Promise<Guarded> {
  const { clock, ids, logger, masker } = parts;
  const serverSettings = new MemoryServerSettings({});
  const factory = parts.providers({
    ...{ keys: new MemoryProviderKeyRepository(), box: noUserKeys, serverKeys: parts.serverKeys },
    ...{ ollamaUrl: parts.ollamaUrl, serverSettings, ledger: new MemoryCostLedger() },
    ...{ priceTable: parts.priceTable, models: parts.models, masker, clock, ids, logger },
  });
  const { dailyCapMicros, ...caps } = evaluationCaps({
    totalCapMicros: parts.capMicros,
    runCapMicros: parts.capMicros,
  });
  await serverSettings.saveCaps(caps);
  const sinks: ProviderSinks = {
    ...unrecordedSinks(),
    costs: { addCall: () => Promise.resolve() },
    stopRun: () => undefined,
    budgetEvents: silentBudgetEvents,
  };
  const account = evaluationAccount(parts, dailyCapMicros);
  const run: ProviderRun = { id: ids.uuid(), userId: account.id, projectId: null, stage: 'verify' };
  return { factory, account, run, sinks };
}

/** The settings with the model as the verifier and the calibration's cap as the run's cost cap. */
function settingsFor(
  settings: ProjectSettings,
  role: CalibrationRole,
  capMicros: number,
): ProjectSettings {
  const verifier = { ...settings.roles.verifier, ...role };
  const run = { ...settings.budget.run, maxCostMicros: capMicros };
  return {
    ...settings,
    roles: { ...settings.roles, verifier },
    budget: { ...settings.budget, run },
  };
}

/** The judging parts of a model's `verifier` role, or why its provider cannot be served. */
async function modelOf(
  parts: CalibrationParts,
  guarded: Guarded,
  role: CalibrationRole,
  shared: Shared,
): Promise<Result<CalibrationModel, CalibrationProblem>> {
  const settings = settingsFor(parts.settings, role, parts.capMicros);
  const { account, run, sinks } = guarded;
  const built = await guarded.factory.build({
    ...{ account, run, settings, roles: ['verifier'], sinks },
    cloudConsent: true,
  });
  const chosen = built.ok ? built.value.get('verifier') : undefined;
  if (!built.ok || chosen === undefined) {
    const code = (built.ok ? undefined : built.error[0]?.code) ?? ERROR_CODES.providerUnavailable;
    const message = `The verifier model ${role.provider} ${role.model} cannot be used (${code}).`;
    return err({ code, message });
  }
  const traceId = parts.ids.uuid().replaceAll('-', '').padEnd(32, '0').slice(0, 32);
  let calls = 0;
  const nextCallId = (): string => {
    calls += 1;
    return `calibration-${role.provider}-${role.model}#${String(calls)}`;
  };
  return ok({
    ...role,
    judge: {
      ...{ role: chosen, prompts: shared.prompts, reader: shared.reader, ids: parts.ids },
      skipReason: shared.skipReason,
      limits: { ...defaultEvidenceLimits, maxLines: settings.scan.excerptMaxLines },
      call: { runId: 'calibration', traceId, nextCallId, signal: new AbortController().signal },
    },
  });
}

// RF-305, DEC-57, ADR-007
export async function runCalibration(
  parts: CalibrationParts,
  loaded: LoadedCalibrationSet,
  roles: readonly CalibrationRole[],
): Promise<Result<CalibrationSummary, CalibrationProblem>> {
  const source = await openCalibrationSource(
    parts.repositoryRoot,
    loaded.set.source.folder,
    parts.logger,
  );
  if (!source.ok) return err({ code: ERROR_CODES.configurationInvalid, message: source.error });
  const cited = loaded.set.claims.flatMap((claim) => claim.citations.map((each) => each.path));
  const skipReason = await skipLookupOf(source.value, cited, parts.settings.scan.maxFileBytes);
  const prompts = await loadVerifierPrompts(parts.promptsFolder);
  const guarded = await guardedOf(parts);
  const models: CalibrationModel[] = [];
  for (const role of roles) {
    const model = await modelOf(parts, guarded, role, {
      reader: source.value,
      skipReason,
      prompts,
    });
    if (!model.ok) return model;
    models.push(model.value);
  }
  const { clock, ids, rosettaVersion, masker } = parts;
  const output = new FileCalibrationOutput({ outputDir: parts.outputDir, masker });
  const run = new RunCalibration({ output, clock, ids, rosettaVersion, prompts });
  return run.execute({ set: loaded.set, setSha256: loaded.sha256, models });
}
