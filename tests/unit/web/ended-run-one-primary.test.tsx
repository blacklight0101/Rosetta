import { screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import type { JourneyFacts } from '../../../web/src/api/journey-schemas.js';
import { json } from './fake-api.js';
import { openEnded, question, readShare, type EndedOptions } from './ended-run-helpers.js';
import { facts, planId, planRun, projectId, source } from './journey-fixtures.js';
import { runUuid } from './live-run-helpers.js';

// RF-1021, RF-615, RF-006 (P8-84): after an understand the page of the run has one primary action
// in every state, counted over the whole page (the head, the journey strip and Your turn). A run that
// completed with a Supported claim holds it in Your turn (Deepen below the coverage bar, else Set up
// the plan); a run that stopped holds Resume in the head; a run with nothing to plan from holds the
// strip's "Start a new run". The strip never says "Deepen first" while Your turn offers the plan.

afterEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});

const journeyPath = `/api/projects/${projectId}/journey?run=${runUuid}`;
const strip = (): HTMLElement =>
  screen.getByRole('region', { name: 'Journey from code to package' });
const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });
const primaries = (): string[] =>
  Array.from(document.querySelectorAll('.rst-button--primary')).map((each) => each.textContent);

const twoQuestions = [question(1), question(2)];

/** The facts of a project whose understand run (this page's run) ended so; nothing planned yet. */
const journeyOf = (over: Parameters<typeof source>[0], brief = false): JourneyFacts =>
  facts({ source: source(over), briefSaved: brief });

/** Opens the ended run with its journey and its coverage; resolves once the strip shows. */
async function open(options: EndedOptions, journey: JourneyFacts, share = 0.16): Promise<void> {
  await openEnded({
    ...options,
    extra: { ...readShare(share), [`GET ${journeyPath}`]: json(200, journey), ...options.extra },
  });
  await screen.findByRole('region', { name: 'Journey from code to package' });
}

const completed = { judged: 'Supported', questions: twoQuestions } as const;

it('RF-1021 below the coverage bar Deepen in Your turn is the one primary action of the page, and the strip points to it', async () => {
  await open({ ...completed, deepens: 0 }, journeyOf({ openQuestions: 2, deepens: 0 }));

  await within(turn()).findByRole('heading', { name: 'Your turn: read the rest of the code' });
  await waitFor(() => {
    expect(strip().textContent).toContain('use the Deepen button in Your turn');
  });
  expect(primaries()).toEqual(['Deepen this run']);
});

it('RF-1021 at the coverage bar or above Set up the plan is the one primary action, and the strip asks the questions in a secondary button', async () => {
  await open({ ...completed, deepens: 0 }, journeyOf({ openQuestions: 2, deepens: 0 }), 0.9);

  await within(turn()).findByRole('heading', { name: 'Your turn: set up the plan' });
  const answer = await within(strip()).findByRole('button', { name: 'Answer 2 questions' });
  expect(answer.className).toContain('rst-button--secondary');
  expect(strip().textContent).not.toContain('Deepen first');
  expect(primaries()).toEqual(['Set up the plan']);
});

it('RF-1021 RF-646 a run whose Deepen was skipped has Set up the plan as the one primary action', async () => {
  window.localStorage.setItem(`rosetta.skip-deepen.${runUuid}`, '1');
  await open({ ...completed, deepens: 0 }, journeyOf({ openQuestions: 2, deepens: 0 }));

  await within(turn()).findByRole('heading', { name: 'Your turn: set up the plan' });
  await within(strip()).findByRole('button', { name: 'Answer 2 questions' });
  expect(primaries()).toEqual(['Set up the plan']);
});

it('RF-1021 a run that was deepened has Set up the plan as the one primary action', async () => {
  await open({ ...completed, deepens: 1 }, journeyOf({ openQuestions: 2, deepens: 1 }));

  await within(turn()).findByRole('heading', { name: 'Your turn: set up the plan' });
  await within(strip()).findByRole('button', { name: 'Answer 2 questions' });
  expect(primaries()).toEqual(['Set up the plan']);
});

it('RF-1021 RF-615 a run whose package is written keeps Set up the plan the one primary action; Open the package is secondary', async () => {
  const written = facts({
    source: source({ openQuestions: 0 }),
    plan: planRun(),
    handoff: { runId: planId, runKey: '20261012-103000-plan', outOfDate: false, gaps: false },
  });
  await open({ judged: 'Supported', questions: [], deepens: 1 }, written);

  const pkg = await within(strip()).findByRole('button', { name: 'Open the package' });
  expect(pkg.className).toContain('rst-button--secondary');
  await waitFor(() => {
    expect(primaries()).toEqual(['Set up the plan']);
  });
});

it('RF-1021 RF-006 a run that stopped at its cap has Resume in the head as the one primary action; the plan is a link in Your turn', async () => {
  const capped = journeyOf({ endState: 'CapReached', errorCode: 'RST-1600', supportedClaims: 3 });
  await open({ judged: 'Supported', endState: 'CapReached', questions: [] }, capped);

  const resume = await within(strip()).findByRole('button', { name: 'Resume this run' });
  expect(resume.className).toContain('rst-button--secondary');
  const plan = await within(turn()).findByRole('button', { name: 'Set up the plan' });
  expect(plan.className).toContain('rst-button--link');
  expect(primaries()).toEqual(['Resume run']);
});

it.each([
  ['Failed', 'RST-2006'],
  ['Interrupted', null],
] as const)(
  'RF-1021 RF-006 a run that ended %s has Resume in the head as the one primary action',
  async (endState, errorCode) => {
    await open(
      { judged: 'Supported', endState, questions: [] },
      journeyOf({ endState, errorCode, supportedClaims: 1 }),
    );

    const resume = await within(strip()).findByRole('button', { name: 'Resume this run' });
    expect(resume.className).toContain('rst-button--secondary');
    expect(primaries()).toEqual(['Resume run']);
  },
);

it('RF-1021 RST-1802 a run with nothing to plan from has the strip action Start a new run as the one primary action', async () => {
  await open(
    { judged: 'Rejected', questions: [], deepens: 1 },
    journeyOf({ supportedClaims: 0, openQuestions: 0 }),
  );

  await within(strip()).findByRole('button', { name: 'Start a new run' });
  await waitFor(() => {
    expect(primaries()).toEqual(['Start a new run']);
  });
});
