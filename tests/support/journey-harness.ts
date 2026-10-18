import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SubmitRun } from '../../src/application/use-cases/submit-run.js';
import { BuildReport } from '../../src/application/use-cases/build-report.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileReportCards } from '../../src/infrastructure/cards/file-report-cards.js';
import { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import { FileRunTextFiles } from '../../src/infrastructure/files/file-run-text-files.js';
import { NodeRunFileReader } from '../../src/infrastructure/files/node-run-file-reader.js';
import { runPath } from '../../src/infrastructure/files/workspace-paths.js';
import { FileReportWriter } from '../../src/infrastructure/report/file-report-writer.js';
import { loadRecording } from '../../src/infrastructure/providers/fake/recording.js';
import { buildBrief } from '../../src/domain/planning/planning-brief.js';
import type { Run } from '../../src/domain/runs/run.js';
import { sampleAccount } from './account-fixtures.js';
import { separateFrontEnd } from './api-plan-harness.js';
import { filesUnder } from './files-under.js';
import { planExecutor } from './plan-harness.js';
import { shippedCatalogue } from './planning-brief-harness.js';
import { sampleProject } from './project-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { understandSettings } from './understand-run-harness.js';
import { understandProviders, type UnderstandProviders } from './understand-providers.js';
import { queueOf, scanResultsOf, stores, type Stores } from './understand-run-services.js';
import { starterOf, submitOf, waitUntilEnded } from './understand-run-starters.js';

// RF-260..RF-263, RF-508, RF-620..RF-627, ADR-008, P3-22: the documentation set journey. One data
// folder, one set of memory indexes and one queue run the stages of the demo in order: a scan and
// an understand run over the webforms-shop fixture (the demo shop), then a plan run that reads the
// cards that understand run wrote. Every model answer is a recording; no live provider is called.
// The reader and the planner replay `understand-shop-journey.json` and then `planner-shop.json`
// (the understand run makes nine calls, the plan run six), the verifier replays
// `verifier-shop-journey.json` and the planner's coverage call replays `planner-shop-coverage.json`.

const recordings = join('tests', 'recordings', 'fake');

/** The planning brief of the demo: hexagonal, parallel change, a React front end on PostgreSQL. */
const demoBrief = separateFrontEnd;

export interface Journey {
  readonly s: Stores;
  readonly providers: UnderstandProviders;
  readonly scan: Run;
  readonly understand: Run;
  readonly plan: Run;
  /** Every file of the understand run's folder (the specification), by path. */
  readonly specification: Readonly<Record<string, string>>;
  /** Every file of the plan run's `handoff/` folder (the documentation set), by path. */
  readonly documents: Readonly<Record<string, string>>;
  /** The files the report of the understand run adds under `report/`, by path inside it. */
  readonly report: Readonly<Record<string, string>>;
  readonly folderOf: (run: Run) => string;
}

const fake = (name: string) => loadRecording(join(recordings, name));

/** The reader's nine calls and then the planner's six: one fake answers both roles in order. */
async function modelRecording() {
  const [reader, planner] = await Promise.all([
    fake('understand-shop-journey.json'),
    fake('planner-shop.json'),
  ]);
  return {
    ...reader,
    description: `${reader.description} ${planner.description}`,
    calls: [...reader.calls, ...planner.calls],
  };
}

async function providersOf(dataDir: string, s: Stores): Promise<UnderstandProviders> {
  const { writer, masker, clock, logger } = s;
  return understandProviders({
    ...{ dataDir, writer, masker, clock, logger },
    recording: await modelRecording(),
    verifierRecording: await fake('verifier-shop-journey.json'),
    coverageRecording: await fake('planner-shop-coverage.json'),
  });
}

/** Builds the report of the understand run as the Build report button does. */
function reportBuilder(s: Stores, dataDir: string): BuildReport {
  const { writer, masker, logger, clock, runs, manifests, log } = s;
  return new BuildReport({
    ...{ runs, manifests, history: log, scans: scanResultsOf(s), logger, clock },
    answers: new FileAnswersFile({ writer, masker }),
    files: new FileRunTextFiles(writer),
    cards: new FileReportCards(new NodeRunFileReader(dataDir)),
    costs: new MemoryCostTotals(),
    writer: new FileReportWriter({
      writer,
      masker,
      assetsFolder: join('templates', 'report'),
    }),
  });
}

// RF-620
export async function runJourney(dataDir: string): Promise<Journey> {
  const s = stores(dataDir, false, 'webforms-shop');
  const account = sampleAccount({ userName: 'journey.user' });
  await s.users.insert(account);
  const settings = understandSettings((base) => ({
    ...base,
    roles: {
      ...base.roles,
      planner: { ...base.roles.planner, provider: 'fake', model: 'fake-model' },
    },
  }));
  const project = sampleProject({
    userId: account.id,
    sourceUrl: 'https://github.com/octo/demo',
    settings,
  });
  await s.projects.insertOrFind(project);
  const providers = await providersOf(dataDir, s);
  const executors = { plan: planExecutor(s, providers, scanResultsOf(s)) };
  const queue = await queueOf(s, providers, undefined, executors);
  const start = starterOf(s, submitOf(s, queue), project);
  const scan = await start('scan', {});
  const understand = await start('understand', {});
  const ref = { userId: account.id, projectId: project.id };
  const brief = { ...buildBrief(demoBrief, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
  await new FilePlanningBriefStore({ writer: s.writer, masker: s.masker }).write(ref, brief);
  const submit = new SubmitRun({
    ...{ runs: s.runs, manifests: s.manifests, queue, clock: s.clock },
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
  });
  const actor = { userId: account.id, role: 'user' } as const;
  const submitted = await submit.execute({ actor, project, stage: 'plan', options: {} });
  if (!submitted.ok) throw new Error(`The plan run was refused: ${submitted.error}`);
  const plan = await waitUntilEnded(s)(submitted.value.run);
  const folderOf = (run: Run): string =>
    join(dataDir, 'users', account.id, runPath(run.projectId, run.runKey));
  const built = await reportBuilder(s, dataDir).execute({ actor, runId: understand.id });
  if (!built.ok) throw new Error(`The report was refused: ${built.error}`);
  return {
    ...{ s, providers, scan, understand, plan, folderOf },
    specification: await filesUnder(folderOf(understand)),
    documents: await filesUnder(join(folderOf(plan), 'handoff')),
    report: await filesUnder(join(folderOf(understand), 'report')),
  };
}

/** Writes the specification, the package and the report under `out`, for the owner to open (P3-22). */
export async function leaveDemoPackage(made: Journey, out: string): Promise<void> {
  const parts = [
    ['specification', made.specification],
    ['package', made.documents],
    ['report', made.report],
  ] as const;
  for (const [folder, files] of parts) {
    for (const [path, text] of Object.entries(files)) {
      const skipped = path.startsWith('transcripts/') || path.startsWith('report/');
      if (folder === 'specification' && skipped) continue;
      const target = join(out, folder, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, text);
    }
  }
}
