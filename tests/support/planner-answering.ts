import { recordingOf } from './fake-recordings.js';

// RF-601: a planner answer whose tasks are the given ones, over two requirements of supported
// cards and two phases, as a recording for the fake provider.

const usage = {
  inputTokens: 10,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
} as const;

export function plannerAnswering(tasks: readonly object[]): ReturnType<typeof recordingOf> {
  const text = JSON.stringify({
    summary: 'A web shop that replaces the legacy one.',
    requirements: [
      { title: 'Place an order', statement: 'A customer orders.', sources: ['FEAT-001'] },
      { title: 'Free shipping', statement: 'Over 50 ships free.', sources: ['BR-001'] },
    ],
    components: [{ name: 'Order service', responsibility: 'Stores orders.', dependsOn: [] }],
    phases: [
      { name: 'Orders', goal: 'Orders move.', exitCriteria: ['Orders run.'] },
      { name: 'Reports', goal: 'Reports move.', exitCriteria: ['Reports run.'] },
    ],
    tasks,
  });
  return recordingOf({
    retried: [],
    response: { text, toolCalls: [], usage, finishReason: 'stop' },
  });
}
