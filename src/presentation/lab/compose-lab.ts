import { join } from 'node:path';
import type { PromptFile } from '../../application/agent/prompt-file.js';
import type { LabTarget } from '../../application/lab/lab-target.js';
import { RunLab, type LabProblem, type LabRun } from '../../application/lab/run-lab.js';
import type { CaseJudge } from '../../application/lab/judge/answer-judge.js';
import type { LedgerLimits, SpendLedger } from '../../application/lab/spend-ledger.js';
import type { ModelList } from '../../application/models/model-list.js';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type { Logger } from '../../application/ports/logger.js';
import type {
  ProviderAccount,
  ProviderRun,
  ProviderSetFactory,
  ProviderSinks,
} from '../../application/ports/provider-set-factory.js';
import type { RoleProvider } from '../../application/providers/provider-set.js';
import type { ProjectSettings } from '../../application/projects/project-settings.js';
import { silentBudgetEvents } from '../../application/runs/run-budget-events.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { MemoryCostLedger } from '../../infrastructure/db/memory-cost-ledger.js';
import { MemoryProviderKeyRepository } from '../../infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../infrastructure/db/memory-server-settings.js';
import type { SecretMasker } from '../../infrastructure/guards/secret-masker.js';
import { FileSpendLedger } from '../../infrastructure/lab/file-spend-ledger.js';
import { LabCallGate, type CostTap } from '../../infrastructure/lab/lab-call-gate.js';
import { FileLabOutput, type LoadedLabSet } from '../../infrastructure/lab/lab-files.js';
import type { ServerKeys } from '../../infrastructure/providers/provider-access.js';
import { unrecordedSinks } from '../../infrastructure/providers/unrecorded-sinks.js';
import type { GuardedFactoryMaker } from '../compose-providers.js';
import { evaluationAccount } from '../eval/eval-account.js';
import { noUserKeys } from '../eval/eval-pipeline.js';
import { evaluationCaps } from '../eval/eval-settings.js';

// Architecture section 2 (composition root), RF-1400, RF-1402, ADR-003, ADR-007, ADR-029: one lab
// invocation. The model's role is built by the guarded provider factory (the egress guard masks
// what is sent and the budget guard meters and caps every call), under an in-memory account of the
// lab's own whose caps are the invocation cap; the lab's gate sits in front of it and holds every
// call's worst case in the shared ledger first. Nothing is kept of the calls besides the ledger and
// `lab-out/<id>/results.json`.

export interface LabParts {
  /** The git-ignored `lab-out/`: results folders and the shared ledger `ledger.jsonl`. */
  readonly outputDir: string;
  readonly promptsFolder: string;
  /** RF-1402: the ledger file shared by every checkout (`ROSETTA_LAB_LEDGER`); `ledger.jsonl` in `outputDir` when absent. */
  readonly ledgerFile?: string | undefined;
  /** The guarded provider factory over the lab's own stores (the release adapters, or a fake). */
  readonly providers: GuardedFactoryMaker;
  readonly serverKeys: ServerKeys;
  readonly ollamaUrl: string | undefined;
  readonly priceTable: PriceTable;
  readonly models: ModelList;
  /** The project settings the model is chosen in: the template's providers and limits. */
  readonly settings: ProjectSettings;
  /** The phase caps of `lab/config.json`. */
  readonly limits: LedgerLimits;
  readonly rosettaVersion: string;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly masker: SecretMasker;
}

export interface LabRequest {
  readonly target: LabTarget;
  readonly prompt: PromptFile;
  readonly model: { readonly provider: string; readonly model: string };
  readonly loaded: LoadedLabSet;
  readonly repetitions: number;
  /** RF-1404: builds the judge that scores each answer; it runs before any call is sent. */
  readonly judge?: JudgeMaker;
}

/** RF-1404: what a judge is built over: the guarded provider factory and the invocation's ledger. */
export type JudgeMaker = (context: {
  readonly guarded: Guarded;
  readonly ledger: SpendLedger;
}) => Promise<Result<CaseJudge, { readonly code: ErrorCode; readonly message: string }>>;

type WorstCase = NonNullable<RoleProvider['worstCaseOf']>;

export interface Guarded {
  readonly factory: ProviderSetFactory;
  readonly account: ProviderAccount;
  readonly run: ProviderRun;
  readonly sinks: ProviderSinks;
  readonly tap: CostTap;
}

export async function guardedOf(parts: LabParts): Promise<Guarded> {
  const { clock, ids, logger, masker, limits } = parts;
  const serverSettings = new MemoryServerSettings({});
  const factory = parts.providers({
    ...{ keys: new MemoryProviderKeyRepository(), box: noUserKeys, serverKeys: parts.serverKeys },
    ...{ ollamaUrl: parts.ollamaUrl, serverSettings, ledger: new MemoryCostLedger() },
    ...{ priceTable: parts.priceTable, models: parts.models, masker, clock, ids, logger },
  });
  const cap = limits.invocationCapMicros;
  const { dailyCapMicros, ...caps } = evaluationCaps({ totalCapMicros: cap, runCapMicros: cap });
  await serverSettings.saveCaps(caps);
  // The budget guard tells the sink what each call cost; the gate books that in the ledger.
  const tap: CostTap = { lastCostMicros: 0 };
  const sinks: ProviderSinks = {
    ...unrecordedSinks(),
    costs: {
      addCall: (call) => {
        tap.lastCostMicros = Number(call.costMicros);
        return Promise.resolve();
      },
    },
    stopRun: () => undefined,
    budgetEvents: silentBudgetEvents,
  };
  const account = evaluationAccount(parts, dailyCapMicros);
  const run: ProviderRun = {
    id: ids.uuid(),
    userId: account.id,
    projectId: null,
    stage: 'understand',
  };
  return { factory, account, run, sinks, tap };
}

/** The settings with the model as the target's role and the invocation cap as the run's cost cap. */
function settingsFor(parts: LabParts, request: LabRequest): ProjectSettings {
  const { settings, limits } = parts;
  const { role } = request.target;
  const chosen = { ...settings.roles[role], ...request.model };
  const run = { ...settings.budget.run, maxCostMicros: limits.invocationCapMicros };
  return {
    ...settings,
    roles: { ...settings.roles, [role]: chosen },
    budget: { ...settings.budget, run },
  };
}

/** The target's role from the guarded factory, or why the model cannot be used. */
async function targetRole(
  parts: LabParts,
  request: LabRequest,
  guarded: Guarded,
): Promise<Result<RoleProvider & { readonly worstCaseOf: WorstCase }, LabProblem>> {
  const { account, run, sinks } = guarded;
  const { role } = request.target;
  const built = await guarded.factory.build({
    ...{ account, run, settings: settingsFor(parts, request), roles: [role], sinks },
    cloudConsent: true,
    approvedAmount: undefined,
  });
  const chosen = built.ok ? built.value.get(role) : undefined;
  if (!built.ok || chosen?.worstCaseOf === undefined) {
    const code = (built.ok ? undefined : built.error[0]?.code) ?? ERROR_CODES.providerUnavailable;
    const { provider, model } = request.model;
    return err({ code, message: `The model ${provider}:${model} cannot be used (${code}).` });
  }
  return ok({ ...chosen, worstCaseOf: chosen.worstCaseOf });
}

// RF-1400, RF-1402
export async function runLab(
  parts: LabParts,
  request: LabRequest,
): Promise<Result<LabRun, LabProblem>> {
  const guarded = await guardedOf(parts);
  const picked = await targetRole(parts, request, guarded);
  if (!picked.ok) return picked;
  const chosen = picked.value;
  const { worstCaseOf } = chosen;
  const { clock, ids } = parts;
  const ledger = new FileSpendLedger({
    ...{ file: parts.ledgerFile ?? join(parts.outputDir, 'ledger.jsonl'), limits: parts.limits },
    ...{ invocation: ids.uuid(), clock, ids },
  });
  const gate = new LabCallGate({
    ...{ inner: chosen.provider, ledger, tap: guarded.tap, clock },
    worstCaseMicros: (each) => Number(worstCaseOf(each).micros),
  });
  const judge = await request.judge?.({ guarded, ledger });
  if (judge !== undefined && !judge.ok) return err(judge.error);
  const temperature = chosen.temperature === undefined ? {} : { temperature: chosen.temperature };
  const lab = new RunLab({
    ...{ output: new FileLabOutput({ outputDir: parts.outputDir, masker: parts.masker }) },
    ...{ meter: gate, clock, ids, rosettaVersion: parts.rosettaVersion },
    ...(judge?.ok === true ? { judge: judge.value } : {}),
    role: {
      provider: gate,
      model: chosen.model,
      maxOutputTokens: chosen.maxOutputTokens,
      ...temperature,
    },
  });
  const { target, prompt, model, loaded, repetitions } = request;
  return lab.execute({
    target,
    prompt,
    model,
    caseSet: loaded.set,
    setSha256: loaded.sha256,
    repetitions,
  });
}
