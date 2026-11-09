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
    expect(step(view, 'questions').detail).toContain(
      'answers given now will be used by the Deepen',
    );
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

// RF-1021 (P8-84): the run page knows the coverage of its run, as Your turn does: Deepen is the next
// step only while the run read its own code below the bar; a page that does not know (the project
// page) keeps the rule of RF-646.
describe('RF-1021 the journey and the coverage bar', () => {
  it('RF-1021 at the bar or above the journey asks the questions and never says Deepen first', () => {
    const view = journeyOf(asking(), projectId, false, { belowBar: false });

    expect(view.action).toMatchObject({ kind: 'answer', label: 'Answer 2 questions' });
    expect(step(view, 'questions').detail).toBe('2 open questions, asked by the understand');
  });

  it('RF-1021 below the bar the journey recommends Deepen first, as Your turn does', () => {
    const view = journeyOf(asking(), projectId, false, { belowBar: true });

    expect(view.action).toMatchObject({ kind: 'deepen', label: 'Deepen this run first' });
  });

  it('RF-1021 below the bar Deepen stays the next step with no question open or a brief saved', () => {
    const none = journeyOf(
      facts({ source: source({ openQuestions: 0, deepens: 0 }), briefSaved: false }),
      projectId,
      false,
      { belowBar: true },
    );
    const saved = journeyOf(
      facts({ source: source({ openQuestions: 2, deepens: 0 }) }),
      projectId,
      false,
      { belowBar: true },
    );

    expect(none.action).toMatchObject({ kind: 'deepen' });
    expect(saved.action).toMatchObject({ kind: 'deepen' });
  });

  it('RF-1021 RF-646 below the bar a skipped or made Deepen is not recommended again', () => {
    const skipped = journeyOf(asking(), projectId, true, { belowBar: true });
    const made = journeyOf(asking({ deepens: 1 }), projectId, false, { belowBar: true });

    expect(skipped.action).toMatchObject({ kind: 'answer' });
    expect(made.action).toMatchObject({ kind: 'answer' });
  });
});

describe('RF-1007 the Questions step says who asked the questions', () => {
  it('RF-1007 reads "asked by the understand" while no Deepen has ended', () => {
    const view = journeyOf(asking(), projectId);

    expect(step(view, 'questions').detail).toBe(
      '2 open questions, asked by the understand: answers given now will be used by the Deepen',
    );
    expect(step(view, 'questions').detail).not.toContain('after the last Deepen');
  });

  it('RF-1007 reads "asked by the understand" when the user chose not to Deepen', () => {
    const view = journeyOf(asking(), projectId, true);

    expect(step(view, 'questions').detail).toBe('2 open questions, asked by the understand');
  });

  it('RF-1007 reads "asked after the last Deepen" once a Deepen has ended', () => {
    const view = journeyOf(asking({ deepens: 1 }), projectId);

    expect(step(view, 'questions').detail).toBe('2 open questions, asked after the last Deepen');
  });

  it('RF-1007 reads "asked after the last Deepen" on the page of a Deepen', () => {
    const view = journeyOf(asking({ deepens: 1, isDeepen: true }), projectId);

    expect(step(view, 'questions').detail).toBe('2 open questions, asked after the last Deepen');
  });
});
