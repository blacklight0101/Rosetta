import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlannerCall } from '../../src/application/plan/ask-planner.js';
import type { LinkCalls } from '../../src/application/plan/plan-links.js';
import type { CoverageInput } from '../../src/application/plan/plan-coverage.js';
import { ManifestUpdates } from '../../src/application/runs/manifest-updates.js';
import type { ModelTable } from '../../src/domain/planning/data-model.js';
import type { PlanContent } from '../../src/domain/planning/plan-content.js';
import type { CoverageDocuments } from '../../src/domain/planning/plan-coverage.js';
import { emptyPrd } from '../../src/domain/planning/prd-content.js';
import type { TargetScreen } from '../../src/domain/planning/target-ux.js';
import { MemoryRunManifestStore } from '../../src/infrastructure/files/memory-run-manifest-store.js';
import { FakeProvider } from '../../src/infrastructure/providers/fake/fake-provider.js';
import { loadRecording } from '../../src/infrastructure/providers/fake/recording.js';
import { planOf } from './coverage-fixtures.js';
import { scopeFor } from './run-event-fixtures.js';
import { sampleRun } from './run-fixtures.js';
import { planTask } from './task-card-fixtures.js';

// P8-95, EV-95, RF-627: the first eShop plan try of the evaluation of 2026-11-02, whose gap round
// left FLOW-002, FLOW-009, FLOW-010 and FLOW-012 built by no card. tests/fixtures/planner/
// eshop-gap-round-ev95.json holds the items of its coverage call (features, tables, journeys,
// screens, modules and deployment, with the names and details the call was sent) and the plan the
// cards joined (phases, requirement titles, the planner's three cards); the recordings replay the
// coverage answer, then a gap answer. Everything comes from the public eShopModernizing (MIT).

interface Fixture {
  readonly documents: {
    readonly features: readonly {
      readonly title: string;
      readonly description: string;
      readonly priority: 'Must' | 'Should' | 'Could';
      readonly sources: readonly string[];
    }[];
    readonly tables: readonly { readonly name: string; readonly purpose: string }[];
    readonly flows: readonly {
      readonly cardId: string;
      readonly title: string;
      readonly outcome: string;
    }[];
    readonly screens: readonly {
      readonly id: string;
      readonly name: string;
      readonly purpose: string;
    }[];
    readonly modules: readonly {
      readonly path: string;
      readonly manifests: readonly string[];
      readonly languages: readonly string[];
      readonly files: number;
    }[];
    readonly deployment: { readonly paths: readonly string[]; readonly files: number };
  };
  readonly plan: {
    readonly phases: readonly {
      readonly number: number;
      readonly name: string;
      readonly goal: string;
    }[];
    readonly requirements: readonly { readonly title: string; readonly sources: string[] }[];
    readonly tasks: readonly {
      readonly title: string;
      readonly phase: number;
      readonly requirements: readonly number[];
      readonly acceptanceCriteria: string[];
    }[];
  };
}

/** The four journeys the first gap round of EV-95 left built by no card. */
export const ev95Flows = ['flow:FLOW-002', 'flow:FLOW-009', 'flow:FLOW-010', 'flow:FLOW-012'];

async function fixture(): Promise<Fixture> {
  const path = join('tests', 'fixtures', 'planner', 'eshop-gap-round-ev95.json');
  return JSON.parse(await readFile(path, 'utf8')) as Fixture;
}

function table(name: string, purpose: string): ModelTable {
  const columns = [{ name: 'id', type: 'int', nullable: false, legacy: null, migrationRisk: '' }];
  return {
    ...{ name, purpose, sources: [], columns, primaryKey: ['id'] },
    ...{ uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
  };
}

function screen(id: string, name: string, purpose: string): TargetScreen {
  return {
    ...{ id, name, purpose, reason: purpose, cards: [id], roles: [] },
    ...{ fields: [], uncheckedFields: [], fieldsNotConfirmed: false, actions: [], navigation: [] },
  };
}

function documentsOf({ documents: d }: Fixture): CoverageDocuments {
  const features = d.features.map((feature) => ({ ...feature, sources: [...feature.sources] }));
  const flows = d.flows.map((flow) => ({ ...flow, trigger: '', steps: [] }));
  const modules = d.modules.map((each) => ({ ...each, cards: [] }));
  return {
    prd: { ...emptyPrd, features },
    dataModel: {
      database: null,
      tables: d.tables.map((t) => table(t.name, t.purpose)),
      dropped: [],
    },
    flows: { flows, outOfScope: [] },
    apiContract: { kind: 'none', reason: 'No contract.' },
    ux: {
      screens: d.screens.map((s) => screen(s.id, s.name, s.purpose)),
      legacy: [],
      designBrief: { audience: '', tone: '', components: [] },
    },
    modules: { modules, overCap: [], deployment: { ...d.deployment, cards: [] } },
  };
}

const requirementId = (position: number): string => `REQ-${String(position).padStart(3, '0')}`;

function contentOf({ plan }: Fixture): PlanContent {
  const base = planOf(
    plan.tasks.map(({ title, phase, requirements, acceptanceCriteria }, at) =>
      planTask({
        ...{ id: `T-00${String(at + 1)}`, title, phase, acceptanceCriteria },
        requirements: requirements.map(requirementId),
      }),
    ),
  );
  const requirements = plan.requirements.map(({ title, sources }, at) => ({
    ...{ id: requirementId(at + 1), title, statement: title, sources },
  }));
  const phases = plan.phases.map((phase) => ({ ...phase, exitCriteria: ['Done.'] }));
  return { ...base, requirements, phases };
}

/** The plan and the documents of the coverage call of EV-95. */
export async function ev95Input(): Promise<CoverageInput> {
  const read = await fixture();
  return { content: contentOf(read), documents: documentsOf(read) };
}

const prompt = { name: 'planner/gap.v5.md', version: 'v5', sha256: 'b'.repeat(64), text: 'x' };
const continuePrompt = { ...prompt, name: 'planner/continue.v1.md', version: 'v1', text: 'go' };

function callOf(provider: FakeProvider, agentTaskId: string): PlannerCall {
  let count = 0;
  const run = sampleRun({ stage: 'plan' });
  return {
    run,
    planner: {
      ...{ provider, name: 'fake', kind: 'fake', model: 'm', maxOutputTokens: 16_000 },
      keySource: 'user',
    },
    ...{ prompt, continuePrompt, agentTaskId },
    updates: new ManifestUpdates(new MemoryRunManifestStore(), scopeFor()),
    tags: () => {
      count += 1;
      return `${'a'.repeat(23)}${'abcdefgh'[count % 8] ?? 'A'}`;
    },
    callId: () => `${run.runKey}#${String(count)}`,
    signal: new AbortController().signal,
  };
}

/** The coverage and gap calls of the plan, replaying a recording of `tests/recordings/fake`. */
export async function ev95Calls(
  recording: string,
): Promise<{ readonly calls: LinkCalls; readonly provider: FakeProvider }> {
  const path = join('tests', 'recordings', 'fake', recording);
  const provider = new FakeProvider({ testMode: true, recording: await loadRecording(path) });
  const repairPrompt = { ...prompt, name: 'planner/gap-repair.v4.md', version: 'v4' };
  const calls: LinkCalls = {
    coverage: callOf(provider, 'planner-coverage'),
    gap: callOf(provider, 'planner-gap'),
    ...{ repairPrompt, specificationDriven: false },
  };
  return { calls, provider };
}
