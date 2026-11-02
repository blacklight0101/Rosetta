import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { draftOf } from '../../../web/src/lib/plan-setup/draft.js';
import type { StackOffer } from '../../../web/src/api/plan-schemas.js';
import { PlanStackStep } from '../../../web/src/pages/PlanStackStep.js';
import { catalogue, unsavedBrief } from './plan-setup-fixtures.js';

// P7-30, RF-609, RF-645: a typed stack answer that names only a platform is flagged next to the
// field, and the catalogue's technologies of that platform are offered as choices.

const layers = [
  'language-runtime',
  'backend-framework',
  'front-end',
  'database',
  'data-access',
  'testing',
  'hosting',
];

const offer = {
  layers: layers.map((layer) => ({
    layer,
    proposals: [],
    keepLegacy: true,
    vague:
      layer === 'front-end'
        ? [
            {
              words: ['.net', 'dotnet'],
              proposals: [
                { choice: 'Razor Pages', why: 'Server-rendered pages.' },
                { choice: 'Blazor Server', why: 'Server components.' },
              ],
            },
          ]
        : [],
  })),
} as unknown as StackOffer;

function show(choice: string): { change: ReturnType<typeof vi.fn> } {
  const draft = {
    ...draftOf(unsavedBrief.brief),
    stack: { 'front-end': { layer: 'front-end', choice, custom: true } },
  };
  const change = vi.fn();
  render(
    <PlanStackStep
      draft={draft}
      catalogue={catalogue}
      change={change}
      problems={{}}
      load={{ status: 'idle' }}
      offer={offer}
      waitingForConsent={false}
      askAgain={() => undefined}
    />,
  );
  return { change };
}

describe('a platform-only stack answer', () => {
  it('P7-30 says the answer is not specific and offers the platform technologies', () => {
    const { change } = show('.NET');

    expect(screen.getByText(/names a platform, not a technology/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Blazor Server' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Razor Pages' }));
    const next = change.mock.calls[0]?.[0] as { stack: Record<string, { choice: string }> };
    expect(next.stack['front-end']?.choice).toBe('Razor Pages');
  });

  it('P7-30 says nothing about a concrete technology', () => {
    show('Blazor Server');

    expect(screen.queryByText(/names a platform, not a technology/u)).toBeNull();
  });
});
