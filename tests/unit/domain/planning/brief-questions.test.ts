import { describe, expect, it } from 'vitest';
import { defaultedQuestions } from '../../../../src/domain/planning/brief-questions.js';
import {
  buildBrief,
  type BriefAnswers,
  type PlanningBrief,
} from '../../../../src/domain/planning/planning-brief.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-604, DEC-80: every brief question that took its default is listed with the default used.

function saved(answers: BriefAnswers): PlanningBrief {
  return { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-10-12T09:30:00.000Z' };
}

describe('defaultedQuestions', () => {
  it('RF-604 lists every question of an unanswered brief, in question order', () => {
    const questions = defaultedQuestions(saved({}), shippedCatalogue);

    expect(questions.map((question) => question.id)).toEqual([
      'principles',
      'architecture',
      'migration',
      'stack.language-runtime',
      'stack.backend-framework',
      'stack.front-end',
      'stack.database',
      'stack.data-access',
      'stack.testing',
      'stack.hosting',
      'context.teamSize',
      'context.experience',
      'context.deadline',
      'context.keepIntegrations',
      'context.dataMigration',
      'buildMethod',
    ]);
  });

  it('RF-604 gives each defaulted question the default the package used', () => {
    const questions = defaultedQuestions(saved({}), shippedCatalogue);

    expect(questions).toContainEqual({
      id: 'migration',
      question: 'How should the team move from the legacy system to the new one?',
      answer: 'Strangler Fig: replace the legacy system one part at a time',
    });
    expect(questions).toContainEqual(
      expect.objectContaining({ id: 'architecture', answer: 'Layered (N-tier)' }),
    );
    expect(questions).toContainEqual({
      id: 'stack.front-end',
      question: 'Which technology should the front end layer use?',
      answer: 'None chosen; the package names no technology for this layer.',
    });
    expect(questions[0]?.answer).toMatch(/^The catalogue defaults: .*KISS.*\.$/u);
  });
});

describe('defaultedQuestions: answered and unknown questions', () => {
  it('RF-604 lists nothing for a question that was answered', () => {
    const brief = saved({
      principles: [],
      architecture: { style: 'clean' },
      migration: 'rewrite',
      buildMethod: { aiAssisted: true },
    });

    const ids = defaultedQuestions(brief, shippedCatalogue).map((question) => question.id);

    expect(ids).not.toContain('principles');
    expect(ids).not.toContain('migration');
    expect(ids).not.toContain('buildMethod');
  });

  it('RF-604 keeps a question id it does not know, with the id as its question', () => {
    const brief = { ...saved({}), defaulted: ['later.question'] };

    expect(defaultedQuestions(brief, shippedCatalogue)).toEqual([
      {
        id: 'later.question',
        question: 'later.question',
        answer: 'Not stated; the roadmap assumes nothing about it.',
      },
    ]);
  });
});
