import { describe, expect, it } from 'vitest';
import { REPORT_CSP } from '../../../../src/infrastructure/report/report-security.js';
import { renderQuestionsHtml } from '../../../../src/infrastructure/report/site/questions-page.js';
import { auditHtml } from '../../../support/html-audit.js';
import { hostileText, plainQuestions, reportModel } from '../../../support/report-fixtures.js';

// RF-500, RF-507, RF-1013: `questions.html`, the open questions of the run with their answers.

type Overrides = Parameters<typeof reportModel>[0];

const pageOf = (overrides: Overrides = {}) =>
  auditHtml(renderQuestionsHtml(reportModel(overrides)));

describe('the open questions page', () => {
  it('RF-500 lists every question with its card, state, context and answer', () => {
    const page = pageOf();
    const items = [...page.document.querySelectorAll('#questions > li')];

    expect(items.map((item) => item.querySelector('.state')?.textContent)).toEqual([
      'Open',
      'Answered',
    ]);
    expect(items[0]?.textContent).toContain('OQ-001');
    expect(items[0]?.textContent).toContain('Is a catalog item with zero stock still shown?');
    expect(items[0]?.textContent).toContain('Catalog/List.cs:10-12 filters on price only');
    expect(items[1]?.textContent).toContain('Answer: No, demo only.');
    expect(items[0]?.textContent).not.toContain('Answer:');
  });

  it('RF-500 links each question to its card file of the run folder', () => {
    const links = [...pageOf().document.querySelectorAll('#questions a')].map((link) =>
      link.getAttribute('href'),
    );

    expect(links).toEqual(['../cards/OQ/OQ-001.md', '../cards/OQ/OQ-002.md']);
  });

  it('RF-500 counts the questions and the answers', () => {
    expect(pageOf().document.querySelector('.headline')?.textContent).toBe(
      '2 questions: 1 answered, 1 open.',
    );
  });

  it('RF-500 says so when the run raised no question', () => {
    const page = pageOf({ questions: [] });

    expect(page.document.querySelector('main')?.textContent).toContain(
      'This run raised no open questions.',
    );
    expect(page.document.querySelectorAll('#questions')).toHaveLength(0);
  });
});

describe('the open questions page as a site page', () => {
  it('RF-500 is a page of the report: current in the navigation, with the policy', () => {
    const page = pageOf();

    expect(page.document.querySelector('nav a[aria-current="page"]')?.textContent).toBe(
      'Open questions',
    );
    expect(page.csp).toBe(REPORT_CSP);
    expect(page.referrer).toBe('no-referrer');
  });

  it('RF-507 shows hostile question, context and answer as text', () => {
    const [first = plainQuestions[0]] = plainQuestions;
    const page = pageOf({
      questions: [
        {
          cardId: first?.cardId ?? 'OQ-001',
          question: hostileText,
          context: hostileText,
          answer: hostileText,
        },
      ],
    });

    expect(page.scripts).toEqual([]);
    expect(page.handlers).toEqual([]);
    expect(page.foreignLinks).toEqual([]);
    expect(page.document.querySelectorAll('#questions img, #questions script')).toHaveLength(0);
    expect(page.document.querySelector('#questions')?.textContent).toContain(hostileText);
  });
});
