import { cleanup, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { json } from './fake-api.js';
import {
  agentStarted,
  deepenEnded,
  deepenRoundEnded,
  deepenRoundStarted,
  deepenStarted,
  ev,
  planned,
  runEnded,
  startedData,
} from './live-run-fixtures.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';
import { codeMapAnswer, codeMapPath, ownAreas } from './live-run-running-helpers.js';
import { measures, understanding, understandingPath } from './understanding-fixtures.js';

// RF-209, RF-1002, RF-1015: the page of a Deepen run while it runs: where it started from, each
// round as it begins and ends. A reload of the page reads the same events and shows the same.

afterEach(() => {
  vi.unstubAllGlobals();
});

const withMap = { [`GET ${codeMapPath}`]: codeMapAnswer(ownAreas) };
const progress = (): HTMLElement => screen.getByRole('region', { name: 'Deepen progress' });
const textOf = (testId: string): string => screen.getByTestId(testId).textContent;

const beforeRound = [
  ev(1, 'run.started', startedData),
  deepenStarted(2),
  deepenRoundStarted(3, 1),
  planned(4, 'r1', 'Catalog'),
  agentStarted(5, 'r1', 'Catalog'),
];
const afterRound = [deepenRoundEnded(6, 1), deepenRoundStarted(7, 2)];

describe('RF-209 a Deepen run while it runs', () => {
  it('RF-209 announces the cards it starts from and the round that is running', async () => {
    const { stream } = renderLive(withMap);
    const connection = await stream.connection();
    for (const event of beforeRound) connection.event(event);

    await screen.findByRole('region', { name: 'Deepen progress' });
    expect(progress().textContent).toContain('Deepen of run 20261001-090000-understand');
    expect(textOf('deepen-seeded')).toBe(
      'Started from 24 cards and 118 claims: 68 supported, 40 rejected, 10 not judged.',
    );
    expect(textOf('deepen-round-1')).toContain('Round 1 of 3, running');
    expect(textOf('deepen-round-1')).toContain('judging 10 claims, re-reading 40');
  });

  it('RF-209 updates live: the round that ended, then the next one that begins', async () => {
    const { stream } = renderLive(withMap);
    const connection = await stream.connection();
    for (const event of beforeRound) connection.event(event);
    await screen.findByTestId('deepen-round-1');

    for (const event of afterRound) connection.event(event);

    await waitFor(() => {
      expect(textOf('deepen-round-1')).toContain('Round 1 of 3, done: 30 new claims, 22 supported');
    });
    expect(textOf('deepen-round-2')).toContain('Round 2 of 3, running');
  });

  it('RF-209 marks a round a cap cut short, with words and a glyph', async () => {
    const { stream } = renderLive(withMap);
    const connection = await stream.connection();
    for (const event of [...beforeRound, deepenRoundEnded(6, 1, false)]) connection.event(event);

    await waitFor(() => {
      expect(textOf('deepen-round-1')).toContain('Round 1 of 3, cut short');
    });
    expect(screen.getByTestId('deepen-round-1').querySelector('svg')).not.toBeNull();
  });
});

describe('RF-1002 a reload of a Deepen run', () => {
  it('RF-1002 shows a reload the same as the live page showed', async () => {
    const events: readonly RunEvent[] = [...beforeRound, ...afterRound];
    const live = renderLive(withMap);
    const connection = await live.stream.connection();
    for (const event of events) connection.event(event);
    await screen.findByTestId('deepen-round-2');
    const liveText = progress().textContent;
    cleanup();

    const reloaded = renderLive(withMap);
    const again = await reloaded.stream.connection();
    for (const event of events) again.event(event);

    await screen.findByTestId('deepen-round-2');
    expect(progress().textContent).toBe(liveText);
  });
});

describe('RF-209 a Deepen run that has ended', () => {
  const ended = [
    ...beforeRound,
    ...afterRound,
    deepenRoundEnded(8, 2),
    deepenEnded(9, 'roundLimit', 2),
    runEnded(10, 'Completed'),
  ];

  it('RF-209 keeps the rounds on the page and says why the Deepen stopped', async () => {
    const { stream } = renderLive({
      ...withMap,
      [`GET ${runPath}`]: runRow({ queueState: 'Ended', endState: 'Completed' }),
      [`GET ${runPath}/overview`]: json(200, { overview: null }),
      [`GET ${runPath}/answers`]: json(200, { questions: [] }),
      [understandingPath]: understanding(measures()),
    });
    const connection = await stream.connection();
    for (const event of ended) connection.event(event);

    await screen.findByRole('tablist', { name: 'Results' });
    await screen.findByTestId('deepen-progress-stop');
    expect(textOf('deepen-round-2')).toContain('Round 2 of 3, done');
    expect(textOf('deepen-progress-stop')).toContain(
      'The round limit was reached: 2 of 3 rounds ran.',
    );
  });
});
