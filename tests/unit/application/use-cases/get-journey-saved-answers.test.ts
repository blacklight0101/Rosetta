import { describe, expect, it } from 'vitest';
import { account, actor, setup, sourceKey } from '../../../support/journey-setup.js';

// RF-615, DEC-154: a question with an answer saved in answers.md is not open in the journey, a
// cleared answer is open again, and the question is Answered only when a later run reads the answer.

const ref = (projectId: string) => ({ userId: account.id, projectId });

describe('GetJourney: saved answers', () => {
  it('RF-615 a question with a saved answer is not counted as open', async () => {
    const { project, seed, journey } = await setup();
    const understand = await seed({ brief: false, answer: 'Managers only.' });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { source: { openQuestions: 1 } } });
  });

  it('RF-615 no question is open when every question has a saved answer', async () => {
    const { project, seed, journey, answers } = await setup();
    const understand = await seed({ brief: false, answer: 'Managers only.' });
    await answers.recordAnswers(ref(project.id), sourceKey, [
      { cardId: 'OQ-002', answer: 'Net of tax.' },
    ]);

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { source: { openQuestions: 0 } } });
  });

  it('RF-615 a cleared answer counts as open again', async () => {
    const { project, seed, journey, answers } = await setup();
    const understand = await seed({ brief: false, answer: 'Managers only.' });
    await answers.recordAnswers(ref(project.id), sourceKey, [{ cardId: 'OQ-001', answer: '' }]);

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { source: { openQuestions: 2 } } });
  });

  it('RF-615 an answer of blanks only does not count as saved', async () => {
    const { project, seed, journey, answers } = await setup();
    const understand = await seed({ brief: false });
    await answers.recordAnswers(ref(project.id), sourceKey, [{ cardId: 'OQ-001', answer: '   ' }]);

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { source: { openQuestions: 2 } } });
  });
});
