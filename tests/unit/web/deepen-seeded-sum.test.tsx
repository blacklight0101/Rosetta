import { screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ev, startedData } from './live-run-fixtures.js';
import { renderLive } from './live-run-helpers.js';
import { codeMapAnswer, codeMapPath, ownAreas } from './live-run-running-helpers.js';

// RF-209: the line "Started from ..." of a Deepen run names every status of the claims, so the
// parts add up to the total (the owner's test of 2026-10-20: 41 + 40 + 0 of 83 left two unnamed).

afterEach(() => {
  vi.unstubAllGlobals();
});

const withMap = { [`GET ${codeMapPath}`]: codeMapAnswer(ownAreas) };

function started(seeded: Readonly<Record<string, number>>) {
  return ev(2, 'deepen.started', {
    parentRunId: 'parent-uuid',
    parentRunKey: '20261001-090000-understand',
    maxRounds: 3,
    coveragePass: true,
    seeded,
  });
}

async function seededText(seeded: Readonly<Record<string, number>>): Promise<string> {
  const { stream } = renderLive(withMap);
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(started(seeded));
  return (await screen.findByTestId('deepen-seeded')).textContent;
}

describe('RF-209 the claims a Deepen run started from', () => {
  it('RF-209 names the claims whose citation is invalid, so the parts add up', async () => {
    const text = await seededText({
      ...{ cards: 34, claims: 83, supported: 41, rejected: 40, notJudged: 0 },
      citationInvalid: 2,
    });

    expect(text).toBe(
      'Started from 34 cards and 83 claims: 41 supported, 40 rejected, 2 citation invalid, 0 not judged.',
    );
  });

  it('RF-209 puts claims an older event left unnamed under citation invalid, not nowhere', async () => {
    const text = await seededText({
      ...{ cards: 34, claims: 83, supported: 41, rejected: 40, notJudged: 0 },
    });

    expect(text).toContain('41 supported, 40 rejected, 2 citation invalid, 0 not judged');
  });
});
