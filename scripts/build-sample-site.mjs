// RF-800, RF-507, P1-50: writes the sample report of the repository's `site/` folder from a recorded
// run (tests/fixtures/runs/sample-report, a benign copy of the replay test run). No provider is called
// and no live run is made; the owner's demo run replaces this folder through a `needs-owner` pull
// request (DEC-105).
// Usage: npm run site:build                  (writes site/)
//        node --import ./scripts/register-ts.mjs scripts/build-sample-site.mjs <folder>   (writes <folder>)
// The integration test rebuilds into a temporary folder and compares it with site/ byte for byte.
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { buildReportModel } = await import('../src/application/report/build-report-model.ts');
const { parseRunEvent } = await import('../src/application/runs/run-event-schema.ts');
const { parseRunManifest } = await import('../src/application/runs/run-manifest-schema.ts');
const { SecretMasker } = await import('../src/infrastructure/guards/secret-masker.ts');
const { buildSiteFiles } = await import('../src/infrastructure/report/published-site.ts');

const recorded = fileURLToPath(new URL('../tests/fixtures/runs/sample-report/', import.meta.url));
const assetsFolder = fileURLToPath(new URL('../templates/report/', import.meta.url));
const defaultSite = fileURLToPath(new URL('../site/', import.meta.url));
const siteFolder = process.argv[2] === undefined ? defaultSite : resolve(process.argv[2]);

async function readRunFile(path) {
  return await readFile(join(recorded, path), 'utf8');
}

async function exists(path) {
  return await access(join(recorded, path)).then(
    () => true,
    () => false,
  );
}

async function recordedEvents() {
  return (await readRunFile('events.jsonl'))
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const event = parseRunEvent(JSON.parse(line));
      if (event === undefined)
        throw new Error('The recorded run holds an event that does not parse.');
      return event;
    });
}

// The documents the pages link, read from the run folder: the specification, the cost report and
// every card of the index (their paths are the links of the report).
async function documentsOf(model) {
  const documents = {};
  for (const name of ['spec.md', 'cost.md']) {
    if (await exists(name)) documents[name] = await readRunFile(name);
  }
  for (const card of model.cards) documents[card.path] = await readRunFile(card.path);
  return documents;
}

async function writeSite(files) {
  await rm(siteFolder, { recursive: true, force: true });
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(siteFolder, name, '..'), { recursive: true });
    await writeFile(join(siteFolder, name), text);
  }
}

async function main() {
  const manifest = parseRunManifest(JSON.parse(await readRunFile('manifest.json')));
  if (manifest === undefined) throw new Error('The recorded manifest does not parse.');
  // The run row is what the report needs from the database: its key, stage and end state.
  const run = {
    id: 'sample-run',
    projectId: 'sample-project',
    userId: 'sample-user',
    runKey: manifest.runId,
    stage: manifest.stage,
    commitSha: manifest.source.commitSha,
    snapshotKey: null,
    queueState: 'Ended',
    endState: manifest.endState,
    queuedAt: 0,
    startedAt: 0,
    endedAt: 0,
    totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  };
  const cardIndex = await readRunFile('cards/index.json');
  const model = buildReportModel({
    run,
    manifest,
    events: await recordedEvents(),
    cardIndex,
    documents: {
      spec: await exists('spec.md'),
      coverage: await exists('coverage.md'),
      cost: await exists('cost.md'),
    },
    areas: [],
    // The sample is a recording: it has no ledger, no coverage or cost file and no answers, and its
    // generation time is the time the run ended, so rebuilding it gives the same bytes (RF-1010).
    generatedAt: manifest.endedAt ?? manifest.startedAt ?? '',
    coverage: null,
    cost: null,
    projectTotals: null,
    questions: [],
  });
  const documents = await documentsOf(model);
  const assets = {
    'report.css': await readFile(join(assetsFolder, 'report.css'), 'utf8'),
    'replay.js': await readFile(join(assetsFolder, 'replay.js'), 'utf8'),
  };
  const files = buildSiteFiles(model, assets, new SecretMasker(), documents);
  await writeSite(files);
  console.log(
    `wrote ${String(Object.keys(files).length)} files to ${siteFolder} for run ${manifest.runId}`,
  );
}

await main();
