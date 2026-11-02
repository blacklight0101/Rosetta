import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { unsavedBrief } from './plan-setup-fixtures.js';
import type { RenderedPage } from './fake-api.js';
import { base, press, ready, renderPlan, saves, stepName } from './plan-setup-helpers.js';

// RF-645, RF-605, DEC-178: Plan setup offers the options of every question with the recommended one
// first, and "Type your own answer", which is saved in the brief with the option that was chosen.

async function openStep(name: string): Promise<void> {
  await ready();
  fireEvent.click(screen.getByRole('button', { name }));
  await waitFor(() => {
    expect(stepName()).toBe(name);
  });
}

async function saved(page: RenderedPage): Promise<void> {
  await waitFor(() => {
    expect(saves(page)).toHaveLength(1);
  });
}

const own = (): HTMLElement => screen.getByRole('radio', { name: /^Type your own answer/u });
const NOTE = 'Recorded; the planner reads it as your own answer';
/** DEC-184: a brief saved before P6-21 still lists the typed question as defaulted. */
const OLD_NOTE = 'Recorded; the plan uses the default until you save the brief again';

/** A brief saved before P6-21 with a typed answer: the question is still defaulted. */
function typedBrief(question: string, text = 'Move one module a week.') {
  return {
    ...unsavedBrief,
    saved: true,
    brief: {
      ...unsavedBrief.brief,
      savedAt: '2026-10-28T09:00:00.000Z',
      chosen: { [question]: 'typed' },
      typed: { [question]: text },
    },
  };
}
const labelOf = (radio: HTMLElement): string => (radio.parentElement?.textContent ?? '').trim();

describe('the migration question', () => {
  it('RF-645 lists the options with the recommended first and your own answer last', async () => {
    renderPlan();
    await openStep('Migration');

    const titles = screen.getAllByRole('radio').map(labelOf);
    expect(titles[0]).toMatch(/^Strangler Fig \(Recommended\)/u);
    expect(titles.at(-1)).toMatch(/^Type your own answer/u);
    expect(screen.queryByLabelText('Your answer')).toBeNull();
  });

  it('RF-645 saves a typed answer in the brief and shows it in What I recorded', async () => {
    const page = renderPlan();
    await openStep('Migration');

    fireEvent.click(own());
    fireEvent.input(screen.getByLabelText('Your answer'), {
      target: { value: 'Move one module a week.' },
    });
    press('Save and continue');

    await saved(page);
    const summary = screen.getByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      { chosen: { migration: 'typed' }, typed: { migration: 'Move one module a week.' } },
    ]);
    expect(within(summary).getByText(/Your own answer: Move one module a week\./u)).not.toBeNull();
    expect(within(summary).getByText(new RegExp(NOTE, 'u'))).not.toBeNull();
  });
});

describe('the migration question: the option chosen', () => {
  it('RF-645 saves the option chosen with its id', async () => {
    const page = renderPlan();
    await openStep('Migration');

    fireEvent.click(screen.getByRole('radio', { name: /Parallel Change/u }));
    press('Save and continue');

    await saved(page);
    expect(saves(page)).toEqual([
      { migration: 'parallel-change', chosen: { migration: 'parallel-change' } },
    ]);
  });

  it('RF-645 a typed answer chosen but left empty is not sent', async () => {
    const page = renderPlan();
    await openStep('Migration');

    fireEvent.click(own());
    press('Save and continue');

    await saved(page);
    expect(saves(page)).toEqual([{}]);
  });

  it('RF-645 a brief saved with a typed answer opens on it, still defaulted, and saves it again', async () => {
    const page = renderPlan({ [`GET ${base}/planning-brief`]: json(200, typedBrief('migration')) });
    await openStep('Migration');

    expect(own()).toHaveProperty('checked', true);
    expect(screen.getByLabelText('Your answer')).toHaveProperty('value', 'Move one module a week.');
    const summary = screen.getByRole('region', { name: 'What I recorded' });
    expect(within(summary).getByText(new RegExp(OLD_NOTE, 'u'))).not.toBeNull();
    expect(within(summary).queryByText(new RegExp(NOTE, 'u'))).toBeNull();
    press('Save and continue');

    await saved(page);
    expect(saves(page)).toEqual([
      { chosen: { migration: 'typed' }, typed: { migration: 'Move one module a week.' } },
    ]);
    await waitFor(() => {
      const after = screen.getByRole('region', { name: 'What I recorded' });
      expect(within(after).getByText(new RegExp(NOTE, 'u'))).not.toBeNull();
    });
  });
});

describe('the architecture question: a typed answer', () => {
  it('RF-645 DEC-178 saving the step keeps the typed answer, not the recommended style', async () => {
    const brief = typedBrief('architecture');
    const page = renderPlan({ [`GET ${base}/planning-brief`]: json(200, brief) });
    await openStep('Architecture');
    await screen.findByRole('radio', { name: /\(Recommended\)/u });

    expect(own()).toHaveProperty('checked', true);
    press('Save and continue');

    await saved(page);
    expect(saves(page)).toEqual([
      {
        architecture: {
          style: 'modular-monolith',
          recommended: ['modular-monolith', 'hexagonal'],
          evidence: ['BR-001'],
        },
        chosen: { architecture: 'typed' },
        typed: { architecture: 'Move one module a week.' },
      },
    ]);
  });
});

describe('the stack question', () => {
  const layer = (): HTMLElement => screen.getByRole('radiogroup', { name: 'Database' });

  it('RF-645 offers the two proposals, a qualified third and your own answer', async () => {
    renderPlan();
    await openStep('Stack');
    await screen.findByRole('radio', { name: /^database A/u });

    const titles = within(layer()).getAllByRole('radio').map(labelOf);
    expect(titles).toEqual([
      expect.stringMatching(/^database A \(Recommended\)/u),
      expect.stringMatching(/^database B/u),
      expect.stringMatching(/^Keep the legacy technology/u),
      expect.stringMatching(/^Type your own answer/u),
    ]);
  });

  it('RF-645 saves the layer option chosen, and a typed one as custom', async () => {
    const page = renderPlan();
    await openStep('Stack');
    await screen.findByRole('radio', { name: /^database A/u });

    fireEvent.click(within(layer()).getByRole('radio', { name: /^database B/u }));
    fireEvent.input(screen.getByLabelText('Your own for Hosting'), { target: { value: 'Azure' } });
    press('Save and continue');

    await saved(page);
    const [body] = saves(page);
    expect(body).toMatchObject({ chosen: { 'stack.database': 'b', 'stack.hosting': 'typed' } });
    const sent = JSON.stringify(body);
    expect(sent).toContain('"layer":"database","choice":"database B","custom":false');
    expect(sent).toContain('"layer":"hosting","choice":"Azure","custom":true');
    // P7-29: a layer left alone takes the planner's recommended option
    expect(sent).toContain('"layer":"testing","choice":"testing A","custom":false');
  });
});

describe('the project context questions', () => {
  const teamSize = (): HTMLElement =>
    screen.getByRole('radiogroup', { name: 'Choose an answer for team size' });

  it('RF-645 offers to leave a question open (recommended), answers and your own', async () => {
    renderPlan();
    await openStep('Project context');

    const titles = within(teamSize()).getAllByRole('radio').map(labelOf);
    expect(titles[0]).toMatch(/^Leave it open \(Recommended\)/u);
    expect(titles.at(-1)).toMatch(/^Type your own answer/u);
    expect(titles.length).toBeGreaterThanOrEqual(5);
  });

  it('RF-645 choosing an option fills the field and saves which option was chosen', async () => {
    const page = renderPlan();
    await openStep('Project context');

    fireEvent.click(within(teamSize()).getByRole('radio', { name: /^A small team/u }));
    expect(screen.getByLabelText('Team size')).toHaveProperty('value', '4');
    press('Save and continue');

    await saved(page);
    expect(saves(page)).toEqual([
      { context: { teamSize: 4 }, chosen: { 'context.teamSize': 'small' } },
    ]);
  });

  it('RF-645 typing in the field is your own answer', async () => {
    const page = renderPlan();
    await openStep('Project context');

    fireEvent.input(screen.getByLabelText('Deadline'), { target: { value: 'March 2027' } });
    press('Save and continue');

    await saved(page);
    expect(saves(page)).toEqual([
      { context: { deadline: 'March 2027' }, chosen: { 'context.deadline': 'typed' } },
    ]);
  });
});

describe('the build method', () => {
  it('RF-645 the build method adds a qualified third answer and your own', async () => {
    const page = renderPlan();
    await openStep('Build method');

    expect(
      screen.getByRole('radio', { name: /^Agents build, people review each change/u }),
    ).not.toBeNull();
    fireEvent.click(own());
    fireEvent.input(screen.getByLabelText('Your answer'), {
      target: { value: 'A vendor builds it.' },
    });
    press('Save');

    await saved(page);
    expect(saves(page)).toEqual([
      { chosen: { buildMethod: 'typed' }, typed: { buildMethod: 'A vendor builds it.' } },
    ]);
  });

  it('RF-645 DEC-178 a brief with a typed build method still invites an answer and shows the text', async () => {
    renderPlan({
      [`GET ${base}/planning-brief`]: json(200, typedBrief('buildMethod', 'A vendor builds it.')),
    });
    await openStep('Build method');

    expect(own()).toHaveProperty('checked', true);
    expect(
      screen.getByText(/Your brief was saved before this question was answered/u),
    ).not.toBeNull();
    const summary = screen.getByRole('region', { name: 'What I recorded' });
    expect(within(summary).getByText(/Your own answer: A vendor builds it\./u)).not.toBeNull();
    expect(within(summary).getByText(new RegExp(OLD_NOTE, 'u'))).not.toBeNull();
  });
});

describe('the principles', () => {
  it('RF-645 the principles list the recommended ones first and take a typed principle', async () => {
    const page = renderPlan();
    await openStep('Principles');

    const first = screen.getAllByRole('checkbox')[0];
    expect(first?.closest('div')?.textContent).toMatch(/\(Recommended\)/u);
    fireEvent.input(screen.getByLabelText('Your own answer'), {
      target: { value: 'Every module has an owner.' },
    });
    press('Save and continue');

    await saved(page);
    expect(saves(page)).toEqual([
      { chosen: { principles: 'typed' }, typed: { principles: 'Every module has an owner.' } },
    ]);
  });

  it('RF-645 DEC-178 principles switched on are sent beside a typed principle', async () => {
    const page = renderPlan();
    await openStep('Principles');

    fireEvent.click(screen.getAllByRole('checkbox')[0] ?? document.body);
    fireEvent.input(screen.getByLabelText('Your own answer'), {
      target: { value: 'Every module has an owner.' },
    });
    press('Save and continue');

    await saved(page);
    const [body] = saves(page);
    expect(body).toHaveProperty('principles');
    expect(body).toHaveProperty('typed', { principles: 'Every module has an owner.' });
  });
});
