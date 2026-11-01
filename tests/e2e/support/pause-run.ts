import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { createPool } from '../../../src/infrastructure/db/pool.js';
import { disposableSchemaUrl } from './database.js';
import { runFolderOf } from './run-folder.js';
import { e2ePort } from './server-config.js';

// RF-432, RF-006, P7-05: a run that is already paused. The recorded run spends less than the worst
// case it was approved at and no product setting lowers the ceilings, so the real run cannot reach
// its line. Its finished files are put back to the moment after one agent was left unread: the
// row says `AwaitingApproval`, the log ends in `run.awaitingApproval`, the manifest records the
// approved amount and the saved task results lack that agent. The server then reads and resumes it
// as any paused run. Nothing in the product is overridden.

const line = z.looseObject({
  seq: z.number(),
  type: z.string(),
  agentTaskId: z.string().optional(),
});
const totalsOf = z.looseObject({
  data: z.looseObject({
    totals: z.looseObject({
      costMicros: z.number(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      cachedInputTokens: z.number().optional(),
    }),
  }),
});
const results = z.looseObject({
  tasks: z.array(z.looseObject({ agentTaskId: z.string(), area: z.string() })),
});

/** Puts the finished run of the page (its UUID) back to a pause that left `area` unread. */
export async function pauseFinishedRun(page: Page, runUuid: string, area: string): Promise<void> {
  const folder = await runFolderOf(page, runUuid);
  const resultsFile = join(folder.dir, 'task-results.json');
  const saved = results.parse(JSON.parse(await readFile(resultsFile, 'utf8')));
  const left = saved.tasks.find((result) => result.area === area);
  if (left === undefined) throw new Error(`The run has no saved result for ${area}.`);
  await writeFile(
    resultsFile,
    `${JSON.stringify({ ...saved, tasks: saved.tasks.filter((r) => r !== left) }, null, 2)}\n`,
    'utf8',
  );

  const eventsFile = join(folder.dir, 'events.jsonl');
  const events = (await readFile(eventsFile, 'utf8')).split('\n').filter((text) => text !== '');
  const endAt = events.findIndex((text) => line.parse(JSON.parse(text)).type === 'run.ended');
  const ended = totalsOf.parse(JSON.parse(events[endAt] ?? '{}'));
  const { totals } = ended.data;
  const spent = totals.inputTokens + totals.outputTokens + (totals.cachedInputTokens ?? 0);
  // A call is reserved at its worst case, far above what the recorded run spent, so the approved
  // amount leaves room for that reserve: Continue adds half of it and the left agent can run.
  const approved = { tokens: spent + 4_000_000, costMicros: totals.costMicros + 2_000_000 };
  const half = {
    tokens: Math.ceil(approved.tokens / 2),
    costMicros: Math.ceil(approved.costMicros / 2),
  };
  const kept = events
    .slice(0, endAt)
    .map((text) => z.record(z.string(), z.unknown()).parse(JSON.parse(text)))
    .filter((event) => event['agentTaskId'] !== left.agentTaskId);
  const last = kept.at(-1) ?? {};
  kept.push({
    ...{ schemaVersion: 1, at: last['at'], runId: last['runId'], type: 'run.awaitingApproval' },
    data: {
      totals: ended.data.totals,
      unreadAreas: 1,
      approvedAmount: approved,
      continueAmount: half,
    },
  });
  const numbered = kept.map((event, index) => JSON.stringify({ ...event, seq: index + 1 }));
  await writeFile(eventsFile, `${numbered.join('\n')}\n`, 'utf8');

  await recordApproval(join(folder.dir, 'manifest.json'), approved);

  await rewindRow(runUuid);
}

/** The row of the run says it waits for its owner's answer, as `pause` leaves it. */
async function rewindRow(runUuid: string): Promise<void> {
  const pool = createPool({
    connectionString: disposableSchemaUrl(
      process.env['ROSETTA_TEST_DATABASE_URL'] ?? '',
      e2ePort(),
    ),
    onIdleError: () => undefined,
  });
  try {
    await pool.query(
      "UPDATE runs SET queue_state = 'AwaitingApproval', end_state = NULL, ended_at = NULL, unread_areas = 1 WHERE id = $1",
      [runUuid],
    );
  } finally {
    await pool.end();
  }
}

/** The manifest says the run is not over and records the approved amount. */
async function recordApproval(
  manifestFile: string,
  approved: { readonly tokens: number; readonly costMicros: number },
): Promise<void> {
  const manifest = z
    .looseObject({ options: z.looseObject({}) })
    .parse(JSON.parse(await readFile(manifestFile, 'utf8')));
  const options = { ...manifest.options, approvedAmount: approved };
  await writeFile(
    manifestFile,
    `${JSON.stringify({ ...manifest, endedAt: null, endState: null, options }, null, 2)}\n`,
    'utf8',
  );
}
