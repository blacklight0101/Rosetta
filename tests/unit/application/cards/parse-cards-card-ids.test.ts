import { describe, expect, it } from 'vitest';
import { problemPaths } from '../../../support/card-output.js';
import {
  flowObject,
  screenJsonDetail,
  screenObject,
} from '../../../support/flow-screen-fixtures.js';

// RF-260, RF-261: a card id written by an agent is the type, a dash and 1 to 9 digits, nothing else.

const step = { text: 'The order is saved.', citations: ['src/Orders/Checkout.cs:30-48'] };
const badNumbers = ['abc', '1234567890', '001\nx', ''];

const flowWithTarget = (target: string): string =>
  JSON.stringify({ cards: [flowObject({ claims: [{ ...step, target }] })] });

const screenWithFlow = (flow: string): string => {
  const screen = { ...screenJsonDetail, actions: [{ label: 'Pay', flow }] };
  return JSON.stringify({ cards: [screenObject({ screen })] });
};

describe('step target ids', () => {
  it.each(badNumbers.map((number) => [`BR-${number}`]))(
    'RF-260 a step target %j is refused',
    (target) => {
      expect(problemPaths(flowWithTarget(target))).toContain('cards.0.claims.0.target');
    },
  );
});

describe('action flow ids', () => {
  it.each(badNumbers.map((number) => [`FLOW-${number}`]))(
    'RF-261 an action flow %j is refused',
    (flow) => {
      expect(problemPaths(screenWithFlow(flow))).toContain('cards.0.screen.actions.0.flow');
    },
  );
});
