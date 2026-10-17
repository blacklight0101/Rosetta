import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Fetch } from '../../../eval/spike/ollama-probe.js';
import {
  candidateModels,
  exitCodes,
  runScoreReader,
  type SpikeIo,
} from '../../../eval/spike/score-reader-cli.js';
import { loadDemoArea } from '../../../eval/spike/demo-area.js';
import { runReaderSpike } from '../../../eval/spike/reader-spike.js';
import { spikeFactory } from '../../../eval/spike/spike-providers.js';
import { loadPriceTable } from '../../../src/infrastructure/budget/price-file.js';
import { loadProjectTemplate } from '../../../src/infrastructure/files/project-template.js';
import { loadReaderPrompts } from '../../../src/infrastructure/prompts/prompt-files.js';
import { SystemClock } from '../../../src/infrastructure/system/system-clock.js';
import { TimestampIdGenerator } from '../../../src/infrastructure/system/timestamp-id-generator.js';
import { FakeProvider } from '../../../src/infrastructure/providers/fake/fake-provider.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';

// Q-04, RF-401, ADR-008: the spike script end to end on the Services area of the webforms-csharp
// fixture, with the fake provider replaying recorded answers behind the guarded provider factory.
// The first model finishes with a card, the second never answers and runs out of turns.

const demoRepo = join('tests', 'fixtures', 'repos', 'webforms-csharp');
const recordings = join('tests', 'recordings', 'fake');

function tags(models: readonly string[]): Fetch {
  return () => Promise.resolve(Response.json({ models: models.map((name) => ({ name })) }));
}

interface Spike {
  readonly io: SpikeIo;
  readonly lines: string[];
  readonly fake: FakeProvider;
}

async function spikeIo(argv: readonly string[], fetch: Fetch): Promise<Spike> {
  const finished = await loadRecording(join(recordings, 'reader-normal-area.json'));
  const looping = await loadRecording(join(recordings, 'reader-turn-limit.json'));
  const fake = new FakeProvider({
    testMode: true,
    recording: { ...finished, calls: [...finished.calls, ...looping.calls] },
  });
  const lines: string[] = [];
  let tick = 0;
  const io: SpikeIo = {
    argv,
    env: {},
    fetch,
    write: (line) => lines.push(line),
    adapters: () => fake,
    now: () => (tick += 2000),
  };
  return { io, lines, fake };
}

describe('score-reader script', () => {
  it('Q-04 scores each candidate model and recommends the best one', async () => {
    const { io, lines, fake } = await spikeIo(
      ['--models', 'good:8b,loops:7b', '--max-turns', '3'],
      tags(['good:8b', 'loops:7b']),
    );

    const code = await runScoreReader(io);

    const output = lines.join('\n');
    expect(code).toBe(exitCodes.ok);
    expect(output).toContain('| good:8b | Done | 1 (0 rejected) | 1/1 | 0 | 3 | 2.0 |');
    expect(output).toContain('| loops:7b | TurnLimitReached');
    expect(output).toContain('Recommended model: `good:8b`.');
    expect(new Set(fake.requests.map((request) => request.model))).toEqual(
      new Set(['good:8b', 'loops:7b']),
    );
  });
});

describe('score-reader script refusals', () => {
  it('Q-04 refuses cleanly when Ollama is not reachable and calls no model', async () => {
    const down: Fetch = () => Promise.reject(new Error('connect ECONNREFUSED'));
    const { io, lines, fake } = await spikeIo([], down);

    const code = await runScoreReader(io);

    expect(code).toBe(exitCodes.unavailable);
    expect(lines.join('\n')).toContain('ollama serve');
    expect(lines.join('\n')).toContain('nothing was downloaded');
    expect(fake.requests).toEqual([]);
  });

  it('Q-04 names the ollama pull command of a candidate that is not pulled', async () => {
    const { io, lines, fake } = await spikeIo(
      ['--models', 'good:8b,missing:7b'],
      tags(['good:8b']),
    );

    const code = await runScoreReader(io);

    expect(code).toBe(exitCodes.unavailable);
    expect(lines).toContain('ollama pull missing:7b');
    expect(fake.requests).toEqual([]);
  });
});

describe('score-reader script locality', () => {
  it('DEC-118 a non-local ROSETTA_OLLAMA_URL is refused: no tags request, no model call', async () => {
    const urls: string[] = [];
    const fetch: Fetch = (url) => {
      urls.push(url);
      return tags(['good:8b'])(url, {});
    };
    const { io, lines, fake } = await spikeIo(['--models', 'good:8b'], fetch);

    const code = await runScoreReader({
      ...io,
      env: { ROSETTA_OLLAMA_URL: 'http://ollama.example.com:11434' },
    });

    expect(code).toBe(exitCodes.unavailable);
    expect(lines.join(' ')).toContain('only an Ollama on this machine');
    expect(urls).toEqual([]);
    expect(fake.requests).toEqual([]);
  });
});

describe('score-reader guarded provider', () => {
  it('RF-143 the guarded provider refuses a non-local Ollama with RST-1515 and no request', async () => {
    const { fake } = await spikeIo([], tags([]));
    const settings = await loadProjectTemplate('templates');
    const logger = { log: () => Promise.resolve(), securityEvent: () => Promise.resolve() };
    const clock = new SystemClock();
    const ids = new TimestampIdGenerator(clock);
    const demo = await loadDemoArea(demoRepo, 'Services', settings, logger);
    if (typeof demo === 'string') throw new Error(demo);
    const factory = spikeFactory({
      ...{ clock, ids, logger },
      adapters: () => fake,
      ollamaUrl: 'http://ollama.example.com:11434',
      priceTable: await loadPriceTable('prices/default-prices.yaml'),
    });

    const [score] = await runReaderSpike(
      {
        ...{ factory, settings, demo, ids, logger },
        prompts: await loadReaderPrompts('prompts'),
        now: () => 0,
        signal: new AbortController().signal,
      },
      ['good:8b'],
    );

    expect(score?.code).toBe('RST-1515');
    expect(fake.requests).toEqual([]);
  });

  it('Q-04 refuses more than four candidate models', async () => {
    const { io, lines } = await spikeIo(['--models', 'a,b,c,d,e'], tags([]));

    expect(await runScoreReader(io)).toBe(exitCodes.usage);
    expect(lines.join('\n')).toContain('between 1 and 4');
  });

  it('Q-04 the default candidate list has at most four models', () => {
    expect(candidateModels.length).toBeGreaterThan(0);
    expect(candidateModels.length).toBeLessThanOrEqual(4);
  });
});
