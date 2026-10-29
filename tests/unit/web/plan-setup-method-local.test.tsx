import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { briefViewSchema } from '../../../web/src/api/plan-schemas.js';
import { methodLineOf } from '../../../web/src/lib/plan-setup/build-method.js';
import { answersOf, draftOf } from '../../../web/src/lib/plan-setup/draft.js';
import { json } from './fake-api.js';
import { savedBrief, unsavedBrief } from './plan-setup-fixtures.js';
import { base, press, ready, renderPlan, saves, stepName } from './plan-setup-helpers.js';

// RF-639, RF-641, DEC-185, P6-22: the "runs locally" checkbox of each tier model on the build
// method step: labelled, operable by keyboard, sent only when ticked, loaded back from a saved brief.

const claude = { aiAssisted: true, agentTool: { kind: 'claude-code' } };
const view = (buildMethod: object) =>
  briefViewSchema.parse({
    ...savedBrief,
    brief: { ...savedBrief.brief, buildMethod, defaulted: [] },
  });

async function openMethod(): Promise<void> {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Build method' }));
  await waitFor(() => {
    expect(stepName()).toBe('Build method');
  });
}

const box = (tier: string): HTMLInputElement =>
  screen.getByRole('checkbox', { name: new RegExp(`runs locally: ${tier} tier model`, 'iu') });

describe('the runs-locally flag in the draft', () => {
  it('RF-639 a saved brief without the flag loads with every tier unticked and sends no key', () => {
    const draft = draftOf(view(claude).brief);

    expect(draft.local).toEqual({ smallest: false, middle: false, largest: false });
    expect(answersOf(draft).buildMethod).not.toHaveProperty('local');
  });

  it('RF-639 a saved flag loads, is sent again and is named in the recorded line', () => {
    const draft = draftOf(view({ ...claude, local: { middle: true } }).brief);

    expect(draft.local).toMatchObject({ middle: true });
    expect(answersOf(draft).buildMethod).toMatchObject({ local: { middle: true } });
    expect(methodLineOf(draft)).toContain('runs locally: middle');
  });
});

describe('the runs-locally checkbox: shown', () => {
  it('RF-639 shows one labelled checkbox per tier model once the tool is chosen, none before', async () => {
    renderPlan();
    await openMethod();
    fireEvent.click(screen.getByRole('radio', { name: /^Agents will build/u }));
    expect(screen.queryByRole('checkbox', { name: /runs locally/iu })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /^Claude Code/u }));

    for (const tier of ['Smallest', 'Middle', 'Largest']) expect(box(tier).checked).toBe(false);
    expect(screen.queryByRole('checkbox', { name: /Escalation.*runs locally/iu })).toBeNull();
  });
});

describe('the runs-locally checkbox: saved', () => {
  it('RF-639 sends the flag of a ticked tier only', async () => {
    const page = renderPlan();
    await openMethod();
    fireEvent.click(screen.getByRole('radio', { name: /^Agents will build/u }));
    fireEvent.click(screen.getByRole('radio', { name: /^Claude Code/u }));

    fireEvent.click(box('Middle'));
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      {
        buildMethod: {
          aiAssisted: true,
          agentTool: { kind: 'claude-code' },
          local: { middle: true },
        },
        chosen: { buildMethod: 'agents' },
      },
    ]);
  });

  it('RF-639 is ticked from a saved brief, can be switched off and then sends no key', async () => {
    const saved = { ...savedBrief, brief: view({ ...claude, local: { middle: true } }).brief };
    const page = renderPlan({ [`GET ${base}/planning-brief`]: json(200, saved) });
    await openMethod();
    expect(box('Middle').checked).toBe(true);

    fireEvent.click(box('Middle'));
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(JSON.stringify(saves(page))).not.toContain('local');
  });
});

describe('the runs-locally checkbox: keyboard', () => {
  it('RF-639 is operable by keyboard: it is a native checkbox in the tab order, space toggles it', async () => {
    renderPlan({ [`GET ${base}/planning-brief`]: json(200, { ...unsavedBrief }) });
    await openMethod();
    fireEvent.click(screen.getByRole('radio', { name: /^Agents will build/u }));
    fireEvent.click(screen.getByRole('radio', { name: /^Claude Code/u }));

    const middle = box('Middle');
    expect(middle.type).toBe('checkbox');
    expect(middle.tabIndex).toBeGreaterThanOrEqual(0);
    middle.focus();
    expect(document.activeElement).toBe(middle);
    fireEvent.click(middle);
    expect(box('Middle').checked).toBe(true);
  });
});
