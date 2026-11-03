import { render, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { draftOf, type Draft } from '../../../web/src/lib/plan-setup/draft.js';
import { PlanStackStep } from '../../../web/src/pages/PlanStackStep.js';
import { catalogue, planOptions, unsavedBrief } from './plan-setup-fixtures.js';

// RF-645, RF-609 (P8-22, UX-02): a saved stack choice is always shown on reload: an offered one selects
// its radio, any other is the "Your own" answer with its text filled, whatever its `custom` flag.

function show(stack: Draft['stack']): void {
  render(
    <PlanStackStep
      draft={{ ...draftOf(unsavedBrief.brief), stack }}
      catalogue={catalogue}
      change={() => undefined}
      problems={{}}
      load={{ status: 'ready', options: planOptions } as never}
      waitingForConsent={false}
      askAgain={() => undefined}
    />,
  );
}

const group = (name: string): HTMLElement => screen.getByRole('radiogroup', { name });
const own = (name: string): HTMLInputElement =>
  within(group(name)).getByRole<HTMLInputElement>('radio', { name: /^Type your own answer/u });

describe('the Stack step on a saved brief', () => {
  it('RF-645 an offered saved choice selects its radio and not the own answer', () => {
    show({ database: { layer: 'database', choice: 'database B', custom: false } });

    const radio = within(group('Database')).getByRole<HTMLInputElement>('radio', {
      name: /^database B/u,
    });
    expect(radio.checked).toBe(true);
    expect(own('Database').checked).toBe(false);
  });

  it('RF-645 a saved choice that is not offered, with custom false, is the own answer with its text', () => {
    show({ database: { layer: 'database', choice: 'SQL Server 2022', custom: false } });

    expect(own('Database').checked).toBe(true);
    expect(within(group('Database')).getByDisplayValue('SQL Server 2022')).toBeTruthy();
  });

  it('RF-645 a typed saved choice is the own answer with its text', () => {
    show({ testing: { layer: 'testing', choice: 'xUnit on .NET 8', custom: true } });

    expect(own('Testing').checked).toBe(true);
    expect(within(group('Testing')).getByDisplayValue('xUnit on .NET 8')).toBeTruthy();
  });
});
