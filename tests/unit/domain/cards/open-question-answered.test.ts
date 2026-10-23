import { describe, expect, it } from 'vitest';
import { nameAnsweredByCitedLines } from '../../../../src/domain/cards/open-question-answered.js';

// RF-243, P5-02 (EV-09): a question that asks what a header or a module is, when a cited line DEFINES
// the name, is refused. A refused question is a lost owner question, so each guard below has a case
// that only that guard keeps.

const sheet = 'A: Asset tag\nB: Description\nD: Qty\nE: Unit cost';
const qty = '"Qty"';

describe('questions a definition in the cited lines answers', () => {
  it.each([
    ['What does column D ("Qty") represent in the Assets sheet?', sheet, 'Qty'],
    ["What does the 'Unit cost' column mean?", sheet, 'Unit cost'],
    ['What does "Qty" mean?', 'Asset tag,Qty,Unit cost', 'Qty'],
    ['What does "Qty" mean?', 'Asset tag | Qty | Unit cost', 'Qty'],
    ['What does "Qty" mean?', 'column D = Qty', 'Qty'],
    [
      'What is the role of the modResetCounters module?',
      'Attribute VB_Name = "modResetCounters"',
      'modResetCounters',
    ],
    ['What does the `ResetAll` sub do?', 'Public Sub ResetAll()\n  Clear\nEnd Sub', 'ResetAll'],
    [
      'What does the class `AssetRepository` do?',
      'public class AssetRepository',
      'AssetRepository',
    ],
    ['What does `Qty` hold?', 'Const Qty = 5', 'Qty'],
    ['What does `unit_cost` store?', 'unit_cost = price * rate', 'unit_cost'],
    ['What is the "Qty" column used for?', "' Qty: quantity on hand", 'Qty'],
    ['What is the purpose of the `ResetAll` routine', 'Function ResetAll()', 'ResetAll'],
  ])('RF-243 P5-02 refuses: %s', (question, cited, name) => {
    expect(nameAnsweredByCitedLines(question, cited)).toBe(name);
  });

  it.each([
    // the verifier's false refusals (round 1)
    ['What does "Qty" mean in the Madrid warehouse when stock is reserved?', sheet],
    ['What does "Qty" mean in Q4 when the import fails?', sheet],
    ['What does `modLoans` do?', 'Call modLoans.Calc'],
    ['What does `status` contain?', 'If x Then status = 1'],
    ['What does "OK" mean?', 'Return "OK"'],
    ['What does the sheet "Loans" represent?', 'Sheets("Loans").Range("A1")'],
    ['What does the modLoans module do?', '-- TODO modLoans handles overdue? ask Ana'],
    ['What does the name (Qty) mean in the legacy report?', sheet],
    // genuine questions
    ['Why is the "Qty" column capped at 99 units per asset?', sheet],
    ['Who in the finance team approves a change of the "Unit cost" column?', sheet],
    ['What does the "Weight" column mean to the warehouse?', sheet],
    ['How many assets are loaded in production each month?', sheet],
  ])('RF-243 P5-02 keeps: %s', (question, cited) => {
    expect(nameAnsweredByCitedLines(question, cited)).toBeUndefined();
  });
});

describe('questions of another shape or with a tail', () => {
  it('RF-243 P5-02 keeps a question whose shape is not a meaning question', () => {
    expect(nameAnsweredByCitedLines('Is the "Qty" column ever blank?', sheet)).toBeUndefined();
    expect(nameAnsweredByCitedLines('How is "Qty" calculated', sheet)).toBeUndefined();
  });

  it('RF-243 P5-02 keeps a question with a tail that is not a sheet, module or file', () => {
    expect(nameAnsweredByCitedLines('What does "Qty" mean in Q4', sheet)).toBeUndefined();
  });

  it.each([
    'why',
    'reason',
    'business',
    'user',
    'team',
    'volume',
    'agreed',
    'expected',
    'production',
    'who',
    'external',
    'system',
    'vendor',
    'partner',
    'integration',
    'interface',
    'service',
    'api',
  ])('RF-243 P5-02 keeps a question that carries the word of intent "%s"', (word) => {
    expect(
      nameAnsweredByCitedLines(`What does the ${word} ${qty} column mean`, sheet),
    ).toBeUndefined();
  });
});

describe('words of intent and conditions', () => {
  it.each([
    'when',
    'if',
    'while',
    'unless',
    'after',
    'before',
    'during',
    'where',
    'because',
    'with',
    'for',
    'per',
  ])('RF-243 P5-02 keeps a question with the condition word "%s"', (word) => {
    expect(
      nameAnsweredByCitedLines(`What does ${qty} ${word} the warehouse mean`, sheet),
    ).toBeUndefined();
  });
});

describe('lines that are not definitions', () => {
  it('RF-243 P5-02 does not count a line with a question mark, a TODO or a FIXME', () => {
    expect(
      nameAnsweredByCitedLines('What does "Qty" mean', "' Qty: what is this?"),
    ).toBeUndefined();
    expect(
      nameAnsweredByCitedLines('What does `ResetAll` do', "Sub ResetAll() ' TODO"),
    ).toBeUndefined();
    expect(
      nameAnsweredByCitedLines('What does `ResetAll` do', "Sub ResetAll() ' fixme"),
    ).toBeUndefined();
  });

  it('RF-243 P5-02 does not count a longer name or a name in a string', () => {
    expect(
      nameAnsweredByCitedLines('What does `ResetAll` do', 'Sub ResetAllNow()'),
    ).toBeUndefined();
    expect(
      nameAnsweredByCitedLines('What does `ResetAll` do', 'x = "Sub ResetAll()"'),
    ).toBeUndefined();
  });
});
