import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { json } from './fake-api.js';
import { savedBrief, unsavedBrief } from './plan-setup-fixtures.js';
import { base, press, ready, renderPlan, saves, stepName } from './plan-setup-helpers.js';

// RF-612, RF-639, DEC-176 (Q-A, Q-B): the build method step asks plainly, says what each answer
// leaves out, asks the tool first and the models after it.

async function openMethod(): Promise<void> {
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Build method' }));
  await waitFor(() => {
    expect(stepName()).toBe('Build method');
  });
}

const agents = (): HTMLElement => screen.getByRole('radio', { name: /^Agents will build/u });
const people = (): HTMLElement => screen.getByRole('radio', { name: /^People will build/u });
const tool = (name: RegExp): HTMLElement => screen.getByRole('radio', { name });

interface BriefView {
  readonly saved: boolean;
  readonly outOfDate: boolean;
  readonly brief: object;
}

const briefWith = (patch: Record<string, unknown>, from: BriefView = unsavedBrief): BriefView => ({
  ...from,
  brief: { ...from.brief, ...patch },
});

const namingClaudeCode = briefWith({
  context: { ...unsavedBrief.brief.context, experience: 'Claude Code' },
});

describe('the build method question', () => {
  it('RF-612 is a two-way choice with nothing selected, each answer saying what it leaves out', async () => {
    renderPlan();
    await openMethod();

    expect(screen.getByRole('radiogroup', { name: /How will the team build/u })).not.toBeNull();
    expect(agents()).toHaveProperty('checked', false);
    expect(people()).toHaveProperty('checked', false);
    expect(document.getElementById('build-method-agents-more')?.textContent).toMatch(
      /AGENTS\.md.*Leaves out: nothing/u,
    );
    expect(document.getElementById('build-method-people-more')?.textContent).toMatch(
      /Leaves out: AGENTS\.md/u,
    );
    expect(screen.queryByText(/Which agent tool/u)).toBeNull();
  });

  it('RF-612 records People will build without a tool or a model', async () => {
    const page = renderPlan();
    await openMethod();

    fireEvent.click(people());
    press('Save');

    const summary = await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      { buildMethod: { aiAssisted: false }, chosen: { buildMethod: 'people' } },
    ]);
    expect(within(summary).getByText('People will build')).not.toBeNull();
  });
});

describe('the build method question: the shortcut and the invitation', () => {
  it('RF-612 opens on Agents will build and says why when the project context names a tool', async () => {
    const page = renderPlan({ [`GET ${base}/planning-brief`]: json(200, namingClaudeCode) });
    await openMethod();

    expect(agents()).toHaveProperty('checked', true);
    expect(tool(/^Claude Code/u)).toHaveProperty('checked', true);
    expect(screen.getByText(/Your project context names Claude Code/u)).not.toBeNull();
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      { buildMethod: { aiAssisted: true, agentTool: { kind: 'claude-code' } } },
    ]);
  });

  it('RF-612 invites a returning user whose saved brief never answered it to answer again', async () => {
    const saved = briefWith({ defaulted: ['buildMethod'] }, savedBrief);
    renderPlan({ [`GET ${base}/planning-brief`]: json(200, saved) });
    await openMethod();

    expect(screen.getByText(/saved before this question was answered/u)).not.toBeNull();
    expect(people()).toHaveProperty('checked', false);
  });

  it('RF-612 does not invite a user who answered', async () => {
    renderPlan({ [`GET ${base}/planning-brief`]: json(200, savedBrief) });
    await openMethod();

    expect(screen.queryByText(/saved before this question was answered/u)).toBeNull();
    expect(people()).toHaveProperty('checked', true);
  });
});

describe('the agent tool and the models', () => {
  it('RF-639 asks the tool first and the models only after a tool is chosen', async () => {
    renderPlan();
    await openMethod();

    fireEvent.click(agents());

    expect(screen.getByRole('radiogroup', { name: /Which agent tool/u })).not.toBeNull();
    expect(screen.queryByLabelText(/Smallest tier/u)).toBeNull();
    fireEvent.click(tool(/^Codex/u));
    expect(screen.getByLabelText(/Smallest tier/u)).not.toBeNull();
    expect(screen.getByLabelText(/Middle tier/u)).not.toBeNull();
    expect(screen.getByLabelText(/Largest tier/u)).not.toBeNull();
    expect(screen.getByLabelText(/Escalation model/u)).not.toBeNull();
  });
});

describe('the agent tool and the models: the answers', () => {
  it('RF-639 Claude Code shows haiku, sonnet and opus as its defaults and sends only the tool', async () => {
    const page = renderPlan();
    await openMethod();

    fireEvent.click(agents());
    fireEvent.click(tool(/^Claude Code/u));

    expect(screen.getByLabelText(/Smallest tier/u)).toHaveProperty('placeholder', 'haiku');
    expect(screen.getByLabelText(/Middle tier/u)).toHaveProperty('placeholder', 'sonnet');
    expect(screen.getByLabelText(/Largest tier/u)).toHaveProperty('placeholder', 'opus');
    press('Save');

    const summary = await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      {
        buildMethod: { aiAssisted: true, agentTool: { kind: 'claude-code' } },
        chosen: { buildMethod: 'agents' },
      },
    ]);
    expect(
      within(summary).getByText(
        'Agents will build with Claude Code. Models: smallest haiku, middle sonnet, largest opus',
      ),
    ).not.toBeNull();
  });
});

describe('the agent tool and the models: other tools', () => {
  it('RF-639 P7-12 Codex offers tier model names as defaults and sends only the names typed', async () => {
    const page = renderPlan();
    await openMethod();

    fireEvent.click(agents());
    fireEvent.click(tool(/^Codex/u));
    expect(screen.getByLabelText(/Smallest tier/u)).toHaveProperty('placeholder', 'gpt-5-mini');
    expect(screen.getByLabelText(/Middle tier/u)).toHaveProperty('placeholder', 'gpt-5-codex');
    expect(screen.getByLabelText(/Largest tier/u)).toHaveProperty('placeholder', 'gpt-5');
    fireEvent.input(screen.getByLabelText(/Middle tier/u), { target: { value: 'gpt-mid' } });
    press('Save');

    const summary = await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      {
        buildMethod: {
          aiAssisted: true,
          agentTool: { kind: 'codex' },
          models: { middle: 'gpt-mid' },
        },
        chosen: { buildMethod: 'agents' },
      },
    ]);
    expect(
      within(summary).getByText(/Agents will build with Codex\. Models: middle gpt-mid/u),
    ).not.toBeNull();
  });

  it('RF-639 another tool is named in free text', async () => {
    const page = renderPlan();
    await openMethod();

    fireEvent.click(agents());
    fireEvent.click(tool(/^Another tool/u));
    fireEvent.input(screen.getByLabelText('Name of the tool'), { target: { value: 'Aider' } });
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      {
        buildMethod: { aiAssisted: true, agentTool: { kind: 'other', name: 'Aider' } },
        chosen: { buildMethod: 'agents' },
      },
    ]);
  });
});

describe('the agent tool and the models: another tool without a name', () => {
  it('RF-639 another tool shows its models only once it has a name, and records what is sent', async () => {
    const page = renderPlan();
    await openMethod();
    fireEvent.click(agents());
    fireEvent.click(tool(/^Another tool/u));

    expect(screen.queryByLabelText(/Middle tier/u)).toBeNull();
    const name = screen.getByLabelText('Name of the tool');
    fireEvent.input(name, { target: { value: 'Aider' } });
    fireEvent.input(screen.getByLabelText(/Middle tier/u), { target: { value: 'aider-mid' } });
    fireEvent.input(name, { target: { value: ' ' } });
    expect(screen.queryByLabelText(/Middle tier/u)).toBeNull();
    press('Save');

    const summary = await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)).toEqual([
      { buildMethod: { aiAssisted: true }, chosen: { buildMethod: 'agents' } },
    ]);
    expect(within(summary).queryByText(/aider-mid/u)).toBeNull();
    expect(within(summary).getByText(/the other tool has no name yet/u)).not.toBeNull();
  });
});

describe('the agent tool and the models: a saved brief and a refusal', () => {
  it('RF-639 a saved tool and its models come back and are sent again on a re-save', async () => {
    const saved = briefWith(
      {
        buildMethod: {
          aiAssisted: true,
          agentTool: { kind: 'codex' },
          models: { middle: 'gpt-mid' },
        },
        defaulted: ['buildMethod.models.smallest', 'buildMethod.models.largest'],
      },
      savedBrief,
    );
    const page = renderPlan({ [`GET ${base}/planning-brief`]: json(200, saved) });
    await openMethod();

    expect(tool(/^Codex/u)).toHaveProperty('checked', true);
    expect(screen.getByLabelText(/Middle tier/u)).toHaveProperty('value', 'gpt-mid');
    fireEvent.input(screen.getByLabelText(/Largest tier/u), { target: { value: 'gpt-top' } });
    press('Save');

    await screen.findByRole('region', { name: 'What I recorded' });
    expect(saves(page)[0]).toHaveProperty('buildMethod', {
      aiAssisted: true,
      agentTool: { kind: 'codex' },
      models: { middle: 'gpt-mid', largest: 'gpt-top' },
    });
  });

  it('RF-639 a model name that is too long is refused before the save', async () => {
    const page = renderPlan();
    await openMethod();

    fireEvent.click(agents());
    fireEvent.click(tool(/^Codex/u));
    fireEvent.input(screen.getByLabelText(/Largest tier/u), { target: { value: 'm'.repeat(81) } });
    press('Save');

    expect(await screen.findByText(/Use at most 80 characters/u)).not.toBeNull();
    expect(saves(page)).toEqual([]);
  });
});
