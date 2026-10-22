import { describe, expect, it } from 'vitest';
import { createCard } from '../../../../src/domain/cards/card.js';
import { actionClaimText, actionClaimTexts } from '../../../../src/domain/cards/screen-claims.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { validScreen } from '../../../support/flow-screen-fixtures.js';

// P3-106, RF-261, RF-626, EV-06: the actions that start one handler are one claim listing the
// controls (the evaluation's Calendar form had 42 buttons and 42 copies of one claim).

const lines = [{ path: 'Calendar.cls', startLine: 1, endLine: 9 }];

function buttons(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    label: `CommandButton${String(index + 1)}`,
    handler: 'ButtonClick',
  }));
}

function actionTexts(actions: readonly { label: string; handler?: string; flow?: string }[]) {
  const made = createCard({
    ...draftOf({
      type: 'SCRN',
      claims: [{ text: 'The form picks a month.', citations: lines }],
      screen: { ...validScreen, fields: [], roles: [], leadsTo: [], actions },
    }),
    id: 'SCRN-001',
    agentTaskId: 't',
  });
  if (!made.ok) throw new Error('fixture');
  return made.value.claims.map((claim) => claim.text).filter((text) => text.startsWith('Action'));
}

describe('P3-106 the actions of one handler are one claim', () => {
  it('EV-06 a 21-button handler gives one claim that lists the controls', () => {
    const texts = actionTexts(buttons(21));

    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('CommandButton1, ');
    expect(texts[0]).toContain('CommandButton21');
    expect(texts[0]).toContain('the handler ButtonClick');
  });

  it('RF-261 one action alone keeps the text it always had', () => {
    expect(actionTexts([{ label: 'Pay', handler: 'PayButton_Click' }])).toEqual([
      'Action Pay starts the handler PayButton_Click.',
    ]);
  });

  it('EV-06 actions with other handlers or flows stay apart, in the order first seen', () => {
    const texts = actionTexts([
      { label: 'A', handler: 'H1' },
      { label: 'B', handler: 'H2' },
      { label: 'C', handler: 'H1' },
      { label: 'D', flow: 'FLOW-001' },
    ]);

    expect(texts).toEqual([
      'Actions A and C start the handler H1.',
      'Action B starts the handler H2.',
      'Action D starts the flow FLOW-001.',
    ]);
  });

  it('RF-626 the texts that can state an action name its own and its group claim', () => {
    const pay = { label: 'Pay', handler: 'PayButton_Click' };
    const second = { label: 'CommandButton2', handler: 'ButtonClick' };
    const all = [...buttons(3), pay];

    expect(actionClaimTexts(all, second)).toEqual([
      actionClaimText(second),
      'Actions CommandButton1, CommandButton2 and CommandButton3 start the handler ButtonClick.',
    ]);
  });
});
