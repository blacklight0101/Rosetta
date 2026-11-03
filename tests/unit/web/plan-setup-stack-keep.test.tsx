import { fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { describe, expect, it } from 'vitest';
import { briefViewSchema } from '../../../web/src/api/plan-schemas.js';
import { answersOf, draftOf, type Draft } from '../../../web/src/lib/plan-setup/draft.js';
import { PlanStackStep } from '../../../web/src/pages/PlanStackStep.js';
import { parseBriefAnswers } from '../../../src/application/planning/planning-brief-schema.js';
import { buildBrief } from '../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../support/planning-brief-harness.js';
import { catalogue, planOptions, unsavedBrief } from './plan-setup-fixtures.js';

// RF-645, RF-609 (P8-22): the "Keep the legacy technology" card is an option of the layer, so a layer
// answered with it is stored as a pick, and the stored brief reloads with its radio selected.

const KEEP = /^Keep the legacy technology/u;
/** The body of a save as the server reads it. */
const sent = (body: unknown): NonNullable<ReturnType<typeof parseBriefAnswers>> => {
  const parsed = parseBriefAnswers(body);
  if (parsed === undefined) throw new Error('the save body was refused');
  return parsed;
};

const group = (name: string): HTMLElement => screen.getByRole('radiogroup', { name });
const keepRadio = (name: string): HTMLInputElement =>
  within(group(name)).getByRole<HTMLInputElement>('radio', { name: KEEP });
const ownRadio = (name: string): HTMLInputElement =>
  within(group(name)).getByRole<HTMLInputElement>('radio', { name: /^Type your own answer/u });

function Page(props: {
  readonly start: Draft;
  readonly seen: Draft[];
}): ReturnType<typeof PlanStackStep> {
  const [draft, setDraft] = useState(props.start);
  return (
    <PlanStackStep
      draft={draft}
      catalogue={catalogue}
      change={(next) => {
        props.seen.push(next);
        setDraft(next);
      }}
      problems={{}}
      load={{ status: 'ready', options: planOptions } as never}
      waitingForConsent={false}
      askAgain={() => undefined}
    />
  );
}

const emptyDraft = (): Draft => draftOf(briefViewSchema.parse(unsavedBrief).brief);

describe('the Stack step: the Keep the legacy technology card', () => {
  it('RF-645 a layer answered with the Keep card is stored as a pick and reloads with its radio', () => {
    const seen: Draft[] = [];
    const first = render(<Page start={emptyDraft()} seen={seen} />);
    fireEvent.click(keepRadio('Database'));
    const last = seen.at(-1);
    expect(last).toBeDefined();
    first.unmount();

    const stored = buildBrief(sent(answersOf(last ?? emptyDraft())), shippedCatalogue);
    const entry = stored.stack.find((each) => each.layer === 'database');
    expect(entry).toMatchObject({ choice: 'Keep the legacy technology', custom: false });

    const saved = briefViewSchema.parse({
      saved: true,
      outOfDate: false,
      brief: { ...stored, savedAt: '2026-10-12T09:00:00.000Z' },
    });
    render(<Page start={draftOf(saved.brief)} seen={[]} />);
    expect(keepRadio('Database').checked).toBe(true);
    expect(ownRadio('Database').checked).toBe(false);
  });
});
