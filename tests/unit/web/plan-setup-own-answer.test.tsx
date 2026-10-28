import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { unsavedBrief } from './plan-setup-fixtures.js';
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

const own = (): HTMLElement => screen.getByRole('radio', { name: /^Type your own answer/u });
const labelOf = (radio: HTMLElement): string => radio.parentElement?.textContent?.trim() ?? '';

describe('the migration question', () => {
  it('RF-645 lists the options with the recommended first and your own answer last', async () => {
    renderPlan();
    await openStep('Migration');

    const titles = screen.getAllByRole('radio').map(labelOf);
    expect(titles[0]).toMatch(/^Strangler Fig \(Recommended\)/u);
    expect(titles.at(-1)).toMatch(/^Type your own answer/u);
    expect(screen.queryByLabelText('Your own answer')).toBeNull();
  });

  it('RF-645 saves a typed answer in the brief and shows it in What I recorded', async () => {
    const page = renderPlan();
    await openStep('Migration');

    fireEvent.click(own());
    fireEvent.input(screen.getByLabelText('Your own answer'), {
      target: { value: 'Move one module a week.' },
    });
    press('Save');

    const summary = await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      { chosen: { migration: 'typed' }, typed: { migration: 'Move one module a week.' } },
    ]);
    expect(within(summary).getByText(/Your own answer: Move one module a week\./u)).not.toBeNull();
  });

  it('RF-645 saves the option chosen with its id', async () => {
    const page = renderPlan();
    await openStep('Migration');

    fireEvent.click(screen.getByRole('radio', { name: /Parallel Change/u }));
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      { migration: 'parallel-change', chosen: { migration: 'parallel-change' } },
    ]);
  });

  it('RF-645 a typed answer chosen but left empty is not sent', async () => {
    const page = renderPlan();
    await openStep('Migration');

    fireEvent.click(own());
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([{}]);
  });

  it('RF-645 a brief saved with a typed answer opens on it', async () => {
    const saved = {
      ...unsavedBrief,
      saved: true,
      brief: {
        ...unsavedBrief.brief,
        savedAt: '2026-10-28T09:00:00.000Z',
        defaulted: unsavedBrief.brief.defaulted.filter((id) => id !== 'migration'),
        chosen: { migration: 'typed' },
        typed: { migration: 'Move one module a week.' },
      },
    };
    renderPlan({ [`GET ${base}/planning-brief`]: json(200, saved) });
    await openStep('Migration');

    expect(own()).toHaveProperty('checked', true);
    expect(screen.getByLabelText('Your own answer')).toHaveProperty(
      'value',
      'Move one module a week.',
    );
  });
});

describe('the stack question', () => {
  const layer = (): HTMLElement => screen.getByRole('radiogroup', { name: 'Database' });

  it('RF-645 offers the two proposals, a qualified third and your own answer', async () => {
    renderPlan();
    await openStep('Stack');

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

    fireEvent.click(within(layer()).getByRole('radio', { name: /^database B/u }));
    fireEvent.input(screen.getByLabelText('Your own for Hosting'), { target: { value: 'Azure' } });
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    const [body] = saves(page);
    expect(body).toMatchObject({
      chosen: { 'stack.database': 'b', 'stack.hosting': 'typed' },
      stack: [
        { layer: 'database', choice: 'database B', custom: false },
        { layer: 'hosting', choice: 'Azure', custom: true },
      ],
    });
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
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      { context: { teamSize: 4 }, chosen: { 'context.teamSize': 'small' } },
    ]);
  });

  it('RF-645 typing in the field is your own answer', async () => {
    const page = renderPlan();
    await openStep('Project context');

    fireEvent.input(screen.getByLabelText('Deadline'), { target: { value: 'March 2027' } });
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      { context: { deadline: 'March 2027' }, chosen: { 'context.deadline': 'typed' } },
    ]);
  });
});

describe('the build method and the principles', () => {
  it('RF-645 the build method adds a qualified third answer and your own', async () => {
    const page = renderPlan();
    await openStep('Build method');

    expect(screen.getByRole('radio', { name: /^Agents and people together/u })).not.toBeNull();
    fireEvent.click(own());
    fireEvent.input(screen.getByLabelText('Your own answer'), {
      target: { value: 'A vendor builds it.' },
    });
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      { chosen: { buildMethod: 'typed' }, typed: { buildMethod: 'A vendor builds it.' } },
    ]);
  });

  it('RF-645 the principles list the recommended ones first and take a typed principle', async () => {
    const page = renderPlan();
    await openStep('Principles');

    const first = screen.getAllByRole('checkbox')[0];
    expect(first?.closest('div')?.textContent).toMatch(/\(Recommended\)/u);
    fireEvent.input(screen.getByLabelText('Your own answer'), {
      target: { value: 'Every module has an owner.' },
    });
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      {
        principles: ['solid', 'kiss', 'tdd'],
        chosen: { principles: 'typed' },
        typed: { principles: 'Every module has an owner.' },
      },
    ]);
  });
});
