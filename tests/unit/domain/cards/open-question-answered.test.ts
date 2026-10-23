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
    ['What does `unit_cost` store?', 'unit_cost = 12.5', 'unit_cost'],
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
    'expect',
    'expects',
    'expected',
    'third party',
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
    'whenever',
    'but',
    'without',
    'between',
    'than',
    'then',
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

describe('rows and values that are not a header', () => {
  const closed = 'Status\nOpen\nClosed';

  it.each([
    ['Laptop,Qty,5'],
    ['Laptop,5,Qty'],
    ['Asset tag,Description\n| Laptop | Qty |'],
    ['Asset tag,Description\nLaptop,Qty'],
  ])('RF-243 P5-02 keeps a data row that holds the name: %j', (cited) => {
    expect(nameAnsweredByCitedLines('What does "Qty" mean', cited)).toBeUndefined();
  });

  it('RF-243 P5-02 keeps a value of a column, and refuses the header only', () => {
    expect(nameAnsweredByCitedLines('What does "Closed" mean', closed)).toBeUndefined();
    expect(nameAnsweredByCitedLines('What does the "Open" column contain', closed)).toBeUndefined();
    expect(nameAnsweredByCitedLines('What does the "Status" column contain', closed)).toBe(
      'Status',
    );
    expect(
      nameAnsweredByCitedLines('What does the "Status" column contain', 'Open\nStatus\nClosed'),
    ).toBeUndefined();
  });

  it('RF-243 P5-02 reads a header row without numbers in its first line only', () => {
    expect(nameAnsweredByCitedLines('What does "Qty" mean', 'Asset tag,Qty,Cost')).toBe('Qty');
    expect(nameAnsweredByCitedLines('What does "Qty" mean', 'Asset tag\nQty')).toBeUndefined();
  });
});

describe('assignments that do not define the name', () => {
  it.each([['Qty = Qty + 1'], ['qty_new = rs("QTY")'], ['x = Qty + 1'], ['Total = Qty * Price']])(
    'RF-243 P5-02 keeps: %s',
    (line) => {
      expect(nameAnsweredByCitedLines('What does `Qty` hold', line)).toBeUndefined();
      expect(nameAnsweredByCitedLines('What does `qty_new` hold', line)).toBeUndefined();
    },
  );

  it('RF-243 P5-02 counts an assignment of a literal to the name alone', () => {
    expect(nameAnsweredByCitedLines('What does `Qty` hold', 'Qty = 5')).toBe('Qty');
  });
});

describe('TODO and FIXME lines', () => {
  it('RF-243 P5-02 does not count a TODO line with no question mark', () => {
    expect(
      nameAnsweredByCitedLines('What does `ResetAll` do', 'Sub ResetAll() TODO'),
    ).toBeUndefined();
  });

  it('RF-243 P5-02 does not count a FIXME line with no question mark', () => {
    expect(
      nameAnsweredByCitedLines('What does `ResetAll` do', 'Sub ResetAll() FIXME'),
    ).toBeUndefined();
  });
});
