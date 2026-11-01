import { describe, expect, it } from 'vitest';
import { buildBrief } from '../../../src/domain/planning/planning-brief.js';
import { briefViewSchema } from '../../../web/src/api/plan-schemas.js';
import { answersOf, draftOf } from '../../../web/src/lib/plan-setup/draft.js';
import { recordedLines } from '../../../web/src/lib/plan-setup/recorded.js';
import { questionsOf } from '../../../web/src/lib/plan-setup/steps.js';
import { shippedCatalogue } from '../../support/planning-brief-harness.js';
import { catalogue, savedBrief, unsavedBrief } from './plan-setup-fixtures.js';

// P6-26, RF-611, RF-643, DEC-189: the hosted question of Plan setup in the draft. It has no
// recommended option, it writes `context.deployment` only for hosted or not hosted, and it is never
// in the defaulted list, so a brief saved before the question reads unchanged.

const viewWith = (deployment: string | undefined, defaulted: string[] = []) =>
  briefViewSchema.parse({
    ...savedBrief,
    brief: {
      ...savedBrief.brief,
      context: { ...savedBrief.brief.context, ...(deployment === undefined ? {} : { deployment }) },
      defaulted,
    },
  });

const ALL_DEFAULTED = unsavedBrief.brief.defaulted;
const unanswered = draftOf(briefViewSchema.parse(unsavedBrief).brief);
const contextLine = (draft: typeof unanswered) =>
  recordedLines(draft, catalogue).find((each) => each.key === 'Project context');

describe('the draft of the hosted question', () => {
  it('P6-26 a brief on its defaults has no hosted answer and sends no context', () => {
    expect(unanswered.deployment).toBe('');
    expect(answersOf(unanswered)).toEqual({});
  });

  it('P6-26 hosted and not hosted are sent as context.deployment', () => {
    for (const deployment of ['hosted', 'not-hosted'] as const) {
      expect(answersOf({ ...unanswered, deployment }).context).toEqual({ deployment });
    }
  });

  it('P6-26 not stated, chosen or not, sends no key', () => {
    for (const deployment of ['', 'not-stated'] as const) {
      expect(answersOf({ ...unanswered, deployment })).toEqual({});
    }
  });

  it('P6-26 the answer travels with the other context answers', () => {
    const draft = {
      ...unanswered,
      deployment: 'hosted' as const,
      context: { ...unanswered.context, teamSize: '6' },
      answered: ['context.teamSize'],
    };

    expect(answersOf(draft).context).toEqual({ teamSize: 6, deployment: 'hosted' });
  });
});

describe('the hosted question saved and read back', () => {
  it('P6-26 a saved answer is read back and sent again (round trip)', () => {
    for (const deployment of ['hosted', 'not-hosted'] as const) {
      const draft = draftOf(viewWith(deployment, ALL_DEFAULTED).brief);

      expect(draft.deployment).toBe(deployment);
      expect(answersOf(draft).context).toEqual({ deployment });
    }
  });

  it('P6-26 a brief saved before the question reads unchanged and sends nothing', () => {
    const draft = draftOf(viewWith(undefined).brief);

    expect(draft.deployment).toBe('');
    expect(answersOf(draft).context).not.toHaveProperty('deployment');
    expect(answersOf(draftOf(viewWith(undefined, ALL_DEFAULTED).brief))).toEqual({});
  });

  it('P6-26 the web schema keeps the answer and refuses another value', () => {
    expect(viewWith('hosted').brief.context.deployment).toBe('hosted');
    expect(() => viewWith('cloud')).toThrow();
  });
});

describe('the defaulted list', () => {
  it('P6-26 the question is not one of the questions a step answers', () => {
    expect(questionsOf('context')).not.toContain('context.deployment');
    expect(unanswered.answered).not.toContain('context.deployment');
    expect(draftOf(viewWith('hosted').brief).answered).not.toContain('context.deployment');
  });

  it('P6-26 the server never lists it as defaulted, answered or not', () => {
    for (const context of [undefined, { deployment: 'hosted' as const }]) {
      const brief = buildBrief(context === undefined ? {} : { context }, shippedCatalogue);

      expect(brief.defaulted).not.toContain('context.deployment');
    }
  });
});

describe('what I recorded for the hosted question', () => {
  it('P6-26 says the application will be hosted or will not be', () => {
    expect(contextLine({ ...unanswered, deployment: 'hosted' })?.value).toContain('will be hosted');
    expect(contextLine({ ...unanswered, deployment: 'hosted' })?.value).not.toContain('answered');
    expect(contextLine({ ...unanswered, deployment: 'not-hosted' })?.value).toContain(
      'will not be hosted',
    );
  });

  it('P6-26 an answer is no default; not stated adds nothing to the line', () => {
    expect(contextLine({ ...unanswered, deployment: 'hosted' })?.isDefault).toBe(false);
    expect(contextLine({ ...unanswered, deployment: 'not-stated' })).toEqual(
      contextLine(unanswered),
    );
  });

  it('P6-26 the answer follows the count of the other answers', () => {
    const draft = {
      ...unanswered,
      deployment: 'hosted' as const,
      context: { ...unanswered.context, teamSize: '6' },
      answered: ['context.teamSize'],
    };

    expect(contextLine(draft)?.value).toBe('1 of 5 answered; the new application will be hosted');
  });
});
