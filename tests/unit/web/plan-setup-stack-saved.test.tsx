import { render, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { briefViewSchema } from '../../../web/src/api/plan-schemas.js';
import { answersOf, draftOf, type Draft } from '../../../web/src/lib/plan-setup/draft.js';
import { PlanStackStep } from '../../../web/src/pages/PlanStackStep.js';
import { parseBriefAnswers } from '../../../src/application/planning/planning-brief-schema.js';
import { buildBrief } from '../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../support/planning-brief-harness.js';
import { catalogue, planOptions, unsavedBrief } from './plan-setup-fixtures.js';

// RF-645, RF-609 (P8-22, UX-02): a saved stack choice is always shown on reload: an offered one selects
// its radio, any other is the "Your own" answer with its text filled, whatever its `custom` flag.

/** The body of a save as the server reads it. */
const sent = (body: unknown): NonNullable<ReturnType<typeof parseBriefAnswers>> => {
  const parsed = parseBriefAnswers(body);
  if (parsed === undefined) throw new Error('the save body was refused');
  return parsed;
};

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

describe('saving a saved stack without a change', () => {
  it('RF-645 stores the same five-layer stack the brief already held', () => {
    const first = buildBrief(
      {
        stack: [
          { layer: 'language-runtime', choice: 'TypeScript', custom: true },
          {
            layer: 'backend-framework',
            choice: 'backend-framework B',
            custom: false,
            offered: ['backend-framework A', 'backend-framework B'],
          },
          {
            layer: 'database',
            choice: 'Keep the legacy technology',
            custom: false,
            offered: ['database A', 'database B', 'Keep the legacy technology'],
          },
          { layer: 'testing', choice: 'Vitest', custom: false },
          { layer: 'hosting', choice: 'On-premise', custom: true, offered: ['hosting A'] },
        ],
      },
      shippedCatalogue,
    );
    const saved = briefViewSchema.parse({
      saved: true,
      outOfDate: false,
      brief: { ...first, savedAt: '2026-10-12T09:00:00.000Z' },
    });

    const again = buildBrief(sent(answersOf(draftOf(saved.brief))), shippedCatalogue);

    expect(again.stack).toEqual(first.stack);
    expect(first.stack).toHaveLength(5);
  });
});
