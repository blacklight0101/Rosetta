import { describe, expect, it } from 'vitest';
import { dangerousIn } from '../../../support/render-markdown.js';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { PlanTask } from '../../../../src/domain/planning/plan-content.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-634, RF-636, ADR-018, DEC-135: the cards list their files, their allocated identifiers and
// the cards they wait for; the roadmap lists the groups of cards that can run together; and the
// agent instructions of an AI-assisted build have an operations section.

const masker = new SecretMasker();

function withTasks(tasks: readonly PlanTask[], aiAssisted = true): HandoffPackage {
  const base = handoffOf('Plain text.');
  return {
    ...base,
    brief: { ...base.brief, buildMethod: { aiAssisted } },
    content: { ...base.content, tasks },
  };
}

const first = planTask({
  ...{ id: 'T-001', files: ['src/orders/order.ts', 'tests/orders/'] },
  identifiers: [{ kind: 'error code', purpose: 'order not found', value: 'ERR-001' }],
});
const second = planTask({
  ...{ id: 'T-002', files: ['SRC/orders/order.ts'], dependsOn: ['T-001'] },
  identifiers: [{ kind: 'error code', purpose: 'payment declined', value: 'ERR-002' }],
});
const third = planTask({ id: 'T-003', files: ['docs/'] });

function cardOf(files: Readonly<Record<string, string>>, id: string): string {
  return (files['tasks.md'] ?? '').split(/^## /mu).find((card) => card.startsWith(id)) ?? '';
}

describe('renderHandoff: the files, identifiers and order of a card', () => {
  const files = renderHandoff(withTasks([first, second, third]), masker);

  it('RF-634 a card lists the files and folders it expects to change', () => {
    expect(cardOf(files, 'T-001')).toContain(
      '\nExpected files:\n\n- src/orders/order.ts\n- tests/orders/\n',
    );
  });

  it('RF-634 a card lists the identifiers the plan allocated to it, and says to use only those', () => {
    const card = cardOf(files, 'T-002');

    expect(card).toContain('\nShared identifiers (allocated by the plan; use only these):\n\n');
    expect(card).toContain('\n- error code ERR-002: payment declined\n');
    expect(card).not.toContain('ERR-001');
  });

  it('RF-634 a card names the cards it waits for, as links', () => {
    expect(cardOf(files, 'T-002')).toContain('\nDepends on: [T-001](tasks.md#t-001)\n');
    expect(cardOf(files, 'T-001')).toContain('\nDepends on: none\n');
  });

  it('RF-634 a card without identifiers or files says so', () => {
    const card = cardOf(files, 'T-003');

    expect(card).toContain('\nShared identifiers: none\n');
    expect(cardOf(renderHandoff(withTasks([planTask()]), masker), 'T-001')).toContain(
      '\nExpected files:\n\nNone stated.\n',
    );
  });

  it('RF-634 file names and purposes from the planner show as text and are masked', () => {
    const hostile = `<img src=x onerror=1> [x](javascript:alert(1)) key ${fakeOpenAiKey}`;
    const task = planTask({
      files: [hostile],
      identifiers: [{ kind: 'port', purpose: hostile, value: '5001' }],
    });

    const text = renderHandoff(withTasks([task]), masker)['tasks.md'] ?? '';

    expect(dangerousIn(text)).toBeUndefined();
    expect(text).not.toContain(fakeOpenAiKey.slice(8, 30));
  });
});

describe('renderHandoff: the parallel groups of the roadmap', () => {
  it('RF-634 the roadmap lists, per phase, the groups of cards that can run together', () => {
    const roadmap = renderHandoff(withTasks([first, second, third]), masker)['roadmap.md'] ?? '';

    expect(roadmap).toContain('\nParallel groups:\n\n');
    expect(roadmap).toContain(
      '\n- Group 1: [T-001](tasks.md#t-001), [T-003](tasks.md#t-003)\n- Group 2: [T-002](tasks.md#t-002)\n',
    );
  });

  it('RF-634 the roadmap says what a group is', () => {
    const roadmap = renderHandoff(withTasks([first]), masker)['roadmap.md'] ?? '';

    expect(roadmap).toContain('Cards in one group can be built at the same time');
  });

  it('RF-634 a phase with no cards lists no groups', () => {
    const roadmap = renderHandoff(withTasks([]), masker)['roadmap.md'] ?? '';

    expect(roadmap).not.toContain('Parallel groups:');
  });
});

describe('renderHandoff: the operations section of AGENTS.md', () => {
  const agents = renderHandoff(withTasks([first]), masker)['AGENTS.md'] ?? '';
  const section = agents.split(/^## /mu).find((part) => part.startsWith('Operations')) ?? '';

  it('RF-636 an AI-assisted build has an operations section', () => {
    expect(section).not.toBe('');
  });

  it.each([
    ['merge one pull request at a time', 'Merge one pull request at a time'],
    ['from a branch up to date with main', 'a branch that is up to date with main'],
    ['continuous-integration fixes first', 'continuous integration go first in the queue'],
    ['a check running long after its workflow finished is re-run', 're-run, not waited on'],
    ['never skip git hooks', 'Never skip git hooks'],
    ['after a rejected push fetch and push again', 'After a rejected push, fetch and push again'],
    ['never edit a script while it runs', 'Never edit a script while it is running'],
    ['reserve port ranges per agent', 'Reserve a port range for each agent'],
    ["check the machine's excluded ranges", "machine's excluded port ranges"],
    ['a register of known flaky tests with an owner card', 'register of known flaky tests'],
  ])('RF-636 it says to %s', (_, phrase) => {
    expect(section).toContain(phrase);
  });

  it('RF-636 each flaky test in the register has an owner card', () => {
    expect(section).toContain('each with an owner card');
  });

  it('RF-634 it tells an agent to take shared identifiers from its card only', () => {
    expect(section).toContain('only from the card');
  });

  it('RF-636 a build that is not AI-assisted has no AGENTS.md and so no operations section', () => {
    const files = renderHandoff(withTasks([first], false), masker);

    expect(Object.keys(files)).not.toContain('AGENTS.md');
    expect(Object.values(files).join('\n')).not.toContain('flaky');
  });
});
