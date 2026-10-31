import { describe, expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { facts, projectId, source, sourceId, step } from './journey-fixtures.js';

// RF-646, RF-615, DEC-179: after an understand run that can be deepened the journey recommends Deepen
// first and says that answers given now will be used by it; the questions are asked after the last
// Deepen, or at once when the user chooses not to Deepen.

const asking = (over: Parameters<typeof source>[0] = {}) =>
  facts({ source: source({ openQuestions: 2, deepens: 0, ...over }), briefSaved: false });

describe('RF-646 the journey and Deepen', () => {
  it('RF-646 recommends Deepen first and says answers given now will be used by it', () => {
    const view = journeyOf(asking(), projectId);

    expect(view.action).toEqual({
      kind: 'deepen',
      label: 'Deepen this run first',
      href: `/runs/${sourceId}`,
    });
    expect(step(view, 'questions')).toMatchObject({ here: true });
    expect(step(view, 'questions').detail).toContain('answers given now will be used by it');
  });
});

describe('RF-646 the journey and a running Deepen', () => {
  it('RF-646 P6-19 says a Deepen is running instead of recommending one', () => {
    const view = journeyOf(asking({ deepening: true }), projectId);

    expect(view.action).toBeUndefined();
    expect(step(view, 'questions')).toMatchObject({ here: true });
    expect(step(view, 'questions').detail).toContain('the Deepen that is running');
  });

  it('RF-646 P6-19 asks for the answers at once when the user skips a running Deepen', () => {
    const view = journeyOf(asking({ deepening: true }), projectId, true);

    expect(view.action).toMatchObject({ kind: 'answer', label: 'Answer 2 questions' });
  });

  it('RF-646 asks for the answers after the last Deepen', () => {
    const view = journeyOf(asking({ deepens: 1 }), projectId);

    expect(view.action).toMatchObject({ kind: 'answer', label: 'Answer 2 questions' });
  });

  it('RF-646 asks for the answers on the page of a Deepen', () => {
    const view = journeyOf(asking({ deepens: 1, isDeepen: true }), projectId);

    expect(view.action).toMatchObject({ kind: 'answer' });
  });

  it('RF-646 asks for the answers at once when the user chose not to Deepen', () => {
    const view = journeyOf(asking(), projectId, true);

    expect(view.action).toMatchObject({ kind: 'answer', label: 'Answer 2 questions' });
    expect(view.secondary).toMatchObject({ label: 'Go on with the defaults' });
  });

  it('RF-646 recommends nothing when no question is open', () => {
    const view = journeyOf(asking({ openQuestions: 0 }), projectId);

    expect(view.action?.kind).not.toBe('deepen');
  });
});
