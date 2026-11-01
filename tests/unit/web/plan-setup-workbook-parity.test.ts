import { describe, expect, it } from 'vitest';
import {
  workbookOptions as domainOptions,
  workbookQuestionIds,
} from '../../../src/domain/planning/workbook-setup.js';
import { workbookOptions as pageOptions } from '../../../web/src/lib/plan-setup/workbook-questions.js';

// RF-648, RF-649, RF-650: the page keeps its own copy of the options (the web code imports nothing
// from src). This test fails when the two copies drift apart.

describe('the workbook options of the domain and of Plan setup', () => {
  it.each(['IIS on Windows Server', 'Containers on a cloud platform', ''])(
    'RF-648 RF-649 RF-650 are the same for the hosting %j',
    (hosting) => {
      for (const question of workbookQuestionIds) {
        expect(pageOptions(question, hosting)).toEqual(domainOptions(question, hosting));
      }
    },
  );
});
