import { describe, expect, it } from 'vitest';
import { nameAnsweredByCitedLines } from '../../../../src/domain/cards/open-question-answered.js';

// RF-243, P5-02 (EV-09): a question that asks what a header or a module is, when the cited lines hold
// the name, is refused; a question about intent, or about a name the lines do not hold, stands.

const sheetLines = 'A: Asset tag\nB: Description\nC: Location\nD: Qty\nE: Unit cost';
const moduleLines =
  'Attribute VB_Name = "modResetCounters"\nSub ResetAll()\n  Range("A1").Clear\nEnd Sub';

describe('questions the cited lines answer', () => {
  it.each([
    ['What does column D ("Qty") represent in the Assets sheet?', sheetLines, 'Qty'],
    ["What does the 'Unit cost' column mean?", sheetLines, 'Unit cost'],
    ['What is the role of the modResetCounters module?', moduleLines, 'modResetCounters'],
    ['What does the module `modResetCounters` do?', moduleLines, 'modResetCounters'],
  ])('RF-243 P5-02 refuses: %s', (question, cited, name) => {
    expect(nameAnsweredByCitedLines(question, cited)).toBe(name);
  });

  it.each([
    ['Why is the "Qty" column capped at 99 units per asset?', sheetLines],
    ['Who in the finance team approves a change of the "Unit cost" column?', sheetLines],
    ['What does the "Weight" column mean to the warehouse?', sheetLines],
    ['What is the business reason for the modResetCounters module?', moduleLines],
    ['How many assets are loaded in production each month?', sheetLines],
  ])('RF-243 P5-02 keeps a genuine question: %s', (question, cited) => {
    expect(nameAnsweredByCitedLines(question, cited)).toBeUndefined();
  });
});
