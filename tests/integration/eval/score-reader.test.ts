import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Fetch } from '../../../eval/spike/ollama-probe.js';
import {
  candidateModels,
  exitCodes,
  runScoreReader,
  type SpikeIo,
} from '../../../eval/spike/score-reader-cli.js';
import { FakeProvider } from '../../../src/infrastructure/providers/fake/fake-provider.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';

// Q-04, RF-401, ADR-008: the spike script end to end on the Services area of the webforms-csharp
// fixture, with the fake provider replaying recorded answers behind the guarded provider factory.
// The first model finishes with a card, the second never answers and runs out of turns.

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
