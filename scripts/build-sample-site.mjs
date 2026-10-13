// RF-800, RF-507, P1-50: writes the sample report of the repository's `site/` folder from the recorded
// run of tests/fixtures/runs/replay-demo. No provider is called and no live run is made; the replay of
// the owner's demo run replaces this folder through a `needs-owner` pull request (DEC-105).
// Usage: npm run site:build   (node --import ./scripts/register-ts.mjs scripts/build-sample-site.mjs)
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { buildReportModel } = await import('../src/application/report/build-report-model.ts');
const { parseRunEvent } = await import('../src/application/runs/run-event-schema.ts');
const { parseRunManifest } = await import('../src/application/runs/run-manifest-schema.ts');
const { SecretMasker } = await import('../src/infrastructure/guards/secret-masker.ts');
const { buildSiteFiles } = await import('../src/infrastructure/report/published-site.ts');

const fixture = fileURLToPath(new URL('../tests/fixtures/runs/replay-demo/', import.meta.url));
const assetsFolder = fileURLToPath(new URL('../templates/report/', import.meta.url));
const siteFolder = fileURLToPath(new URL('../site/', import.meta.url));

async function readRunFile(path) {
  return await readFile(join(fixture, path), 'utf8');
}

async function exists(path) {
  return await access(join(fixture, path)).then(
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
  const model = buildReportModel({
    run,
    manifest,
    events: await recordedEvents(),
    cardIndex: await readRunFile('cards/index.json'),
    documents: {
      spec: await exists('spec.md'),
      coverage: await exists('coverage.md'),
      cost: await exists('cost.md'),
    },
    areas: [],
  });
  const assets = {
    'report.css': await readFile(join(assetsFolder, 'report.css'), 'utf8'),
    'replay.js': await readFile(join(assetsFolder, 'replay.js'), 'utf8'),
  };
  const files = buildSiteFiles(model, assets, new SecretMasker());
  await rm(siteFolder, { recursive: true, force: true });
  await mkdir(siteFolder, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(siteFolder, name), text);
  }
  console.log(
    `wrote ${String(Object.keys(files).length)} files to site/ for run ${manifest.runId}`,
  );
}

await main();
