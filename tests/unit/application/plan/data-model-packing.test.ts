import { describe, expect, it } from 'vitest';
import {
  dataModelMessage,
  packableCards,
} from '../../../../src/application/plan/data-model-message.js';
import { packCards, type PlanWindow } from '../../../../src/application/plan/plan-packing.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import { card, briefOf } from '../../../support/data-model-sqlserver-orders.js';
import { largeSourceCards } from '../../../support/large-understand.js';
import { promptFixture } from '../../../support/data-model-prompt.js';

// P3-120, P3-113, EV-29: the rule cards the data-model call sends are packed to the planner's
// window with the entity cards, so the call still fits on the 371-card fixture.

const TAG = 'a'.repeat(24);
const brief = briefOf('SQL Server');

/** The large fixture plus many rule claims that name the legacy columns the entity cards mention. */
function cardsWithRules(): SourceCard[] {
  const entity = card('ENT-900', 'ENT', 'Orders', [
    'tblOrders(order_id int, status_id int, total decimal)',
  ]);
  const rules = Array.from({ length: 400 }, (_unused, at) =>
    card(`BR-9${String(at).padStart(2, '0')}`, 'BR', 'Rule', [
      `When status_id is ${String(at)} the order is hidden. ${'Words about the rule. '.repeat(40)}`,
    ]),
  );
  return [...largeSourceCards(), entity, ...rules];
}

describe('the data-model call on a large understand', () => {
  for (const windowTokens of [65_536, 32_768]) {
    it(`EV-29 fits a ${String(windowTokens)}-token window, naming the overflow by id`, async () => {
      const cards = cardsWithRules();
      const system = await promptFixture();
      const window: PlanWindow = { windowTokens, maxOutputTokens: 8_192 };
      const render = (omitted: ReadonlySet<string>): string =>
        dataModelMessage({ cards, brief, omitted }, () => TAG);

      const packed = packCards({ window, system, cards: packableCards(cards), render });

      expect(render(new Set()).length / 4).toBeGreaterThan(windowTokens);
      expect(packed.fits).toBe(true);
      expect(packed.omitted.size).toBeGreaterThan(0);
      const message = render(packed.omitted);
      expect(message).toContain('supported cards are not shown in full');
      const omittedRule = [...packed.omitted].find((id) => id.startsWith('BR-9'));
      expect(message).toContain(omittedRule ?? 'no rule card was omitted');
    });
  }
});
