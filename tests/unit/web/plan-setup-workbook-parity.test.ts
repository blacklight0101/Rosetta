import { describe, expect, it } from 'vitest';
import {
  workbookOptions as domainOptions,
  workbookQuestionIds,
  workbookWording,
} from '../../../src/domain/planning/workbook-setup.js';
import { catalogue } from './plan-setup-fixtures.js';
import { workbookOptions as pageOptions } from '../../../web/src/lib/plan-setup/workbook-questions.js';

// RF-648, RF-649, RF-650, P8-09: the page keeps no copy of the options; it reads the wording the
// server serves. This test checks that the page's order and recommendation, computed from that
// wording, are the domain's for every hosting answer.

describe('the workbook options of the domain and of Plan setup', () => {
  it.each(['IIS on Windows Server', 'Containers on a cloud platform', 'An intranet host', ''])(
    'RF-648 RF-649 RF-650 are the same for the hosting %j',
    (hosting) => {
      for (const question of workbookQuestionIds) {
        expect(pageOptions(catalogue.wording.workbook, question, hosting)).toEqual(
          domainOptions(question, hosting),
        );
      }
    },
  );

  it('P8-09 the served questions are the three of the brief, with the domain wording', () => {
    expect(workbookWording.questions.map((each) => each.id)).toEqual([...workbookQuestionIds]);
    expect(workbookWording.questions[0]?.label).toBe(
      'How will people sign in to the new application?',
    );
  });
});
