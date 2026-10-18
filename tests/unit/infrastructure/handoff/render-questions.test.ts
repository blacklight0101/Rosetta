import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { PlanTask } from '../../../../src/domain/planning/plan-content.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { plain } from '../../../support/plan-method-harness.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-637, RF-638, DEC-135: each open question names the cards that wait on it, and the roadmap
// marks those cards as waiting until the question is answered or its default accepted; the build
// method names the measures of the build and says to change one thing at a time.

const masker = new SecretMasker();

function withTasks(tasks: readonly PlanTask[], aiAssisted = true): HandoffPackage {
  const base = handoffOf('Plain text.');
  return {
    ...base,
    brief: { ...base.brief, buildMethod: { aiAssisted } },
    content: { ...base.content, tasks },
    briefQuestions: [
      { id: 'migration', question: 'How to move?', answer: 'Step by step.' },
      { id: 'context.deadline', question: 'Is there a deadline?', answer: 'Not stated.' },
    ],
    openQuestions: [
      { cardId: 'OQ-001', question: 'Who cancels?', area: 'Plain text.' },
      { cardId: 'OQ-002', question: 'Which tax?', area: 'payroll' },
    ],
  };
}

const first = planTask({ id: 'T-001', requirements: ['REQ-001'] });
const second = planTask({ id: 'T-002', requirements: [] });
const link = (id: string): string => `[${id}](tasks.md#${id.toLowerCase()})`;

describe('renderHandoff: the cards an open question blocks', () => {
  const files = renderHandoff(withTasks([first, second]), masker);
  const questions = plain(files['open-questions.md']);

  it('RF-637 a question of the brief lists its default and the cards waiting on it', () => {
    expect(questions).toContain(
      `| How to move? | migration | Step by step. | ${link('T-001')}, ${link('T-002')} |`,
    );
  });

  it('RF-637 a question that shapes no card says none', () => {
    expect(questions).toContain('| Is there a deadline? | context.deadline | Not stated. | none |');
  });

  it('RF-637 a question of the analysis lists its default and the cards built from its area', () => {
    expect(questions).toContain(
      `- OQ-001: Who cancels? Default: keep the legacy behaviour. Cards waiting: ${link('T-001')}`,
    );
  });

  it('RF-637 a question of the analysis in an area no card was built from says none', () => {
    expect(questions).toContain(
      '- OQ-002: Which tax? Default: keep the legacy behaviour. Cards waiting: none',
    );
  });

  it('RF-637 the PRD questions say none or name their cards too', () => {
    const base = withTasks([first]);
    const prd = { id: 'prd.problem', question: 'What problem?', answer: 'Unknown.' };

    const text = renderHandoff({ ...base, prdQuestions: [prd] }, masker)['open-questions.md'] ?? '';

    expect(text).toContain('| prd.problem | What problem? | Unknown. | none |');
  });
});

describe('renderHandoff: the roadmap marks the cards that wait on a question', () => {
  const roadmap = plain(renderHandoff(withTasks([first, second]), masker)['roadmap.md']);

  it('RF-637 a card that waits is marked with the questions it waits on', () => {
    expect(roadmap).toContain(
      `\nWaiting on open questions:\n\n- ${link('T-001')}: migration, OQ-001\n`,
    );
    expect(roadmap).toContain(`\n- ${link('T-002')}: migration\n`);
  });

  it('RF-637 the roadmap says the cards wait until the question is answered or its default accepted', () => {
    expect(roadmap).toContain('until the question is answered or its default is accepted');
    expect(roadmap).toContain('(open-questions.md)');
  });

  it('RF-637 a package with no card waiting marks none', () => {
    const base = withTasks([first]);
    const text =
      renderHandoff({ ...base, briefQuestions: [], openQuestions: [] }, masker)['roadmap.md'] ?? '';

    expect(text).not.toContain('Waiting on open questions');
  });
});

describe('renderHandoff: the measures of the build', () => {
  const agents = renderHandoff(withTasks([first]), masker)['AGENTS.md'] ?? '';
  const section = agents.split(/^## /mu).find((part) => part.startsWith('Build metrics')) ?? '';

  it('RF-638 the build method has a section on the measures', () => {
    expect(section).not.toBe('');
  });

  it.each([
    [
      'the share of cards that pass review the first time',
      'share of cards that pass review the first time',
    ],
    ['the review rounds per card', 'review rounds per card'],
    ['the cost or tokens per card', 'cost or tokens per card'],
    ['the defects that escaped and were found after merge', 'escaped defects found after merge'],
  ])('RF-638 it names %s', (_, phrase) => {
    expect(section).toContain(phrase);
  });

  it('RF-638 it says where the measures are recorded', () => {
    expect(section).toContain('Record');
    expect(section).toContain('pull request');
  });

  it('RF-638 it says to change one thing in the process at a time and compare', () => {
    expect(section).toContain('Change one thing in the process at a time');
    expect(section).toContain('compare');
  });

  it('RF-638 a build that is not AI-assisted has no AGENTS.md and so no section', () => {
    expect(renderHandoff(withTasks([first], false), masker)['AGENTS.md']).toBeUndefined();
  });
});
