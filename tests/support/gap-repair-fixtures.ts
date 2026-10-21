import { withCoverageAnswer } from './coverage-plan-harness.js';
import type { Recording } from '../../src/infrastructure/providers/fake/recording.js';
import type { PlanHarness } from './plan-harness.js';
import { seededUxPlan } from './ux-plan-harness.js';

// Q-54, Q-45: what the tests of the gap call share. The coverage answer links only the first
// feature, so nine items are left without a card, and the gap recording is the test's own.

const linksOne = JSON.stringify({ links: [{ task: 1, builds: ['feature:F-001'] }] });

/** A word that must never appear in a log entry or in a message sent to the planner. */
export const sentinel = 'sentinel-title-0451';

export async function gappedPlan(dataDir: string, gap: Recording): Promise<PlanHarness> {
  return seededUxPlan(dataDir, {
    harness: { coverageRecording: await withCoverageAnswer(linksOne), gapRecording: gap },
  });
}

export const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

export function card(
  title: string,
  builds: string[],
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...{ title, phase: 1, requirements: [1], builds },
    acceptanceCriteria: ['Given a basket of 60, when it is posted, then the order is stored.'],
    ...{ invariant: 'An order posted is an order stored.', riskClass: 'none' },
    ...more,
  };
}

export const operations = [
  ...['operation:placeOrder', 'operation:getOrder', 'operation:listOrders'],
  ...['operation:signIn', 'operation:listCustomers', 'feature:F-002'],
];
export const rest = ['flow:FLOW-001', 'screen:SCRN-001', 'screen:SCRN-003'];

export const answerOf = (...cards: unknown[]): string => JSON.stringify({ tasks: cards });

export function messageOf(
  request: { messages: readonly { content: string }[] } | undefined,
): string {
  return request?.messages.map((each) => each.content).join('\n') ?? '';
}
