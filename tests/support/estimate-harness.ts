import { ALL_KEYS_SERVED } from './web-role-keys.js';
import {
  EstimateRun,
  type EstimateRunDependencies,
} from '../../src/application/estimate/estimate-run.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import type { ScannedSource, ScanResults } from '../../src/application/ports/scan-results.js';
import type { Area } from '../../src/domain/code-map/area.js';
import type { FileEntry } from '../../src/domain/code-map/file-entry.js';
import { NO_LISTED_MODELS, type ModelList } from '../../src/application/models/model-list.js';
import type { PriceTable } from '../../src/domain/budget/price-table.js';
import type { Project } from '../../src/application/projects/project.js';
import type { Run } from '../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import type { ServerCaps } from '../../src/domain/budget/budget.js';
import type { UserAccount } from '../../src/domain/accounts/user.js';
import { MemoryAccountUsage } from '../../src/infrastructure/db/memory-account-usage.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { sampleAccount } from './account-fixtures.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryRepositoryReader } from './memory-repository-reader.js';
import { sampleProject } from './project-fixtures.js';
import { sampleRun } from './run-fixtures.js';

// RF-425: the estimate use case over memory adapters, a fixed code map and a fixed price table.

/** An area of the code map with a token estimate; the estimate reads nothing else of it. */
export function areaOf(name: string, estimatedTokens: number): Area {
  return {
    name,
    files: [`${name}/File.cs`],
    estimatedTokens,
    mapLevel: 'coarse',
    origin: 'folder',
  };
}

/** The scan of a project: a code map with these areas, a reader with no files. */
export class FixedScans implements ScanResults {
  readonly opened: Run[] = [];
  private readonly areas: readonly Area[];
  private readonly files: readonly FileEntry[];

  private readonly workbookFolders: readonly string[];
  private readonly snapshotKey: string;

  constructor(
    areas: readonly Area[],
    files: readonly FileEntry[] = [],
    workbookFolders: readonly string[] = [],
    snapshotKey = 'owner-repo-cccccccc',
  ) {
    this.areas = areas;
    this.files = files;
    this.workbookFolders = workbookFolders;
    this.snapshotKey = snapshotKey;
  }

  open(scan: Run): Promise<ScannedSource> {
    this.opened.push(scan);
    return Promise.resolve({
      codeMap: {
        schemaVersion: 1,
        source: { owner: 'owner', repo: 'repo', commitSha: 'c'.repeat(40), subpath: '' },
        files: this.files,
        areas: this.areas,
        symbols: [],
        links: [],
        sqlStatements: [],
        entities: [],
        languagePacks: [],
      },
      codeMapHash: 'a'.repeat(64),
      ...(this.workbookFolders.length === 0 ? {} : { workbookFolders: this.workbookFolders }),
      reader: new MemoryRepositoryReader({}),
      source: {
        commitSha: 'c'.repeat(40),
        snapshotKey: this.snapshotKey,
        snapshotHash: `sha256:${'b'.repeat(64)}`,
      },
    });
  }
}

/** One cloud model, priced in whole micro-dollars per million tokens; a local model is free. */
export const estimatePrices: PriceTable = {
  version: '2026-10-11',
  currency: 'USD',
  prices: [
    {
      provider: 'openai',
      model: 'priced-model',
      inputPerMillionMicros: 250_000n,
      outputPerMillionMicros: 2_000_000n,
      cachedInputPerMillionMicros: 25_000n,
      currency: 'USD',
    },
  ],
};

/** The areas of the estimate tests: 14,000 tokens in two areas. */
export const catalogAreas: readonly Area[] = [areaOf('Catalog', 10_000), areaOf('Orders', 4_000)];

/** A completed scan of the project, as the run index lists it. */
export function completedScan(projectId: string, userId: string): Run {
  return sampleRun({
    projectId,
    userId,
    stage: 'scan',
    queueState: 'Ended',
    endState: 'Completed',
  });
}

export interface EstimateHarness {
  readonly estimate: EstimateRun;
  readonly projects: MemoryProjectRepository;
  readonly runs: MemoryRunIndex;
  readonly keys: MemoryProviderKeyRepository;
  readonly scans: FixedScans;
}

/** Stores a project of the user with these settings and, unless `scanned` is false, a completed scan. */
export async function projectWithScan(
  harness: Pick<EstimateHarness, 'projects' | 'runs'>,
  userId: string,
  settings: ProjectSettings,
  scanned = true,
): Promise<Project> {
  const project = sampleProject({ userId, settings });
  await harness.projects.insertOrFind(project);
  if (scanned) await harness.runs.insert(completedScan(project.id, userId));
  return project;
}

export function createEstimateHarness(
  areas: readonly Area[] = catalogAreas,
  files: readonly FileEntry[] = [],
  priceTable: PriceTable = estimatePrices,
  workbookFolders: readonly string[] = [],
): EstimateHarness {
  return harnessOver(new FixedScans(areas, files, workbookFolders), priceTable, NO_LISTED_MODELS);
}

/** Q-57: the estimate over a model list, whose entries give each model its context and output limit. */
export function createModelEstimateHarness(
  areas: readonly Area[],
  priceTable: PriceTable,
  models: ModelList,
): EstimateHarness {
  return harnessOver(new FixedScans(areas), priceTable, models);
}

/** Q-49: the estimate over the snapshot of a workbook project (its folder name is a workbook key). */
export function createWorkbookEstimateHarness(
  areas: readonly Area[],
  workbookFolders: readonly string[],
  snapshotKey: string,
): EstimateHarness {
  return harnessOver(
    new FixedScans(areas, [], workbookFolders, snapshotKey),
    estimatePrices,
    NO_LISTED_MODELS,
  );
}

/** P3-96: what the caps of the first calls are read from; the account is stored under `userId`. */
export interface CappedEstimateOptions {
  readonly userId: string;
  readonly account?: Partial<UserAccount>;
  /** The administrator's caps; the memory defaults (run 0.50, user day 1.00, month 10.00 USD) when absent. */
  readonly caps?: ServerCaps;
}

/** P3-96: the estimate with the caps the budget guard checks the first calls against. */
export async function createCappedEstimateHarness(
  inputs: {
    readonly areas: readonly Area[];
    readonly priceTable: PriceTable;
    readonly models: ModelList;
  },
  options: CappedEstimateOptions,
): Promise<EstimateHarness> {
  const users = new MemoryUserRepository();
  await users.insert(sampleAccount({ id: options.userId, ...options.account }));
  const serverSettings = new MemoryServerSettings({});
  if (options.caps !== undefined) await serverSettings.saveCaps(options.caps);
  const capDeps = {
    users,
    serverSettings,
    usage: new MemoryAccountUsage(),
    clock: new FixedClock('2026-10-22T10:00:00.000Z'),
  };
  return harnessOver(new FixedScans(inputs.areas), inputs.priceTable, inputs.models, capDeps);
}

function harnessOver(
  scans: FixedScans,
  priceTable: PriceTable,
  models: ModelList,
  capDeps?: EstimateRunDependencies['caps'],
): EstimateHarness {
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const keys = new MemoryProviderKeyRepository();
  const estimate = new EstimateRun({
    roleKeys: ALL_KEYS_SERVED,
    ...{ projects, runs, scans, keys, priceTable, models },
    reasoningModels: () => false,
    ...(capDeps === undefined ? {} : { caps: capDeps }),
  });
  return { estimate, projects, runs, keys, scans };
}
