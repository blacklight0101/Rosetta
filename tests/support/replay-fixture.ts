import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseRunEvent } from '../../src/application/runs/run-event-schema.js';
import type { RunEvent } from '../../src/domain/runs/run-event.js';

// RF-506, RF-507: the recorded run of `tests/fixtures/runs/replay-demo/`. It is the run folder an
// understand run leaves (manifest, events, cards, specification, cost report) with synthetic
// repository and model text, among it a card whose text holds a `<script>` element, an `onerror`
// attribute and a `javascript:` link. Nothing in it is real: the repository `octo/demo` is the
// fixture of the other tests.

export const replayDemoFolder = fileURLToPath(
  new URL('../fixtures/runs/replay-demo/', import.meta.url),
);

/** The run key of the recorded run. */
export const replayDemoRunKey = '20261012-100000-understand';

/** The files of the recorded run, `path` relative to its run folder. */
export const replayDemoPaths = [
  'manifest.json',
  'events.jsonl',
  'cards/index.json',
  'cards/BR/BR-001.md',
  'spec.md',
  'cost.md',
] as const;

export type ReplayDemoPath = (typeof replayDemoPaths)[number];

export async function replayDemoText(path: ReplayDemoPath): Promise<string> {
  return await readFile(`${replayDemoFolder}${path}`, 'utf8');
}

/** The events of the recorded run, parsed like the log reader does. */
export async function replayDemoEvents(): Promise<readonly RunEvent[]> {
  const lines = (await replayDemoText('events.jsonl')).split('\n').filter((line) => line !== '');
  return lines.map((line) => {
    const event = parseRunEvent(JSON.parse(line));
    if (event === undefined) throw new Error('The fixture holds an event that does not parse');
    return event;
  });
}
