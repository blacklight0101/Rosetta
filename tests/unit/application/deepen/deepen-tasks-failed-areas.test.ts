import { describe, expect, it } from 'vitest';
import { roundTasks } from '../../../../src/application/deepen/deepen-tasks.js';
import type { RoundPlan } from '../../../../src/domain/deepen/round-plan.js';
import { agentCodeMap } from '../../../support/agent-fixtures.js';

// RF-209, RST-1303, EV-10: the reader task of a failed area reads the whole area again, and when
// the area ended on a repeated call it is given a note, because the same prompt gives the same loop.

const empty: RoundPlan = { judge: [], reread: [], outOfScope: [], gaps: [], failedAreas: [] };
const orders = agentCodeMap.areas.find((area) => area.name === 'orders');

describe('roundTasks for failed areas', () => {
  it('RF-209 a failed area is read again over every file of the area, with the next task number', () => {
    const plan = {
      ...empty,
      failedAreas: [{ area: 'orders', failure: 'failed (RST-1303)', unread: [] }],
    };

    const tasks = roundTasks(plan, agentCodeMap, 4);

    expect(tasks.map((task) => [task.agentTaskId, task.area.name])).toEqual([
      ['reader-004', 'orders'],
    ]);
    expect(tasks[0]?.area.files).toEqual(orders?.files);
  });

  it('RST-1303 an area that ended on a repeated call is given a note with the files not read in full', () => {
    const unread = ['src/Orders/Order.cs'];
    const plan = {
      ...empty,
      failedAreas: [{ area: 'orders', failure: 'failed (RST-1303)', unread }],
    };

    const [task] = roundTasks(plan, agentCodeMap, 1);

    expect(task?.retryNote).toEqual({ unread });
  });

  it('RF-209 an area that failed another way is read again with no note', () => {
    const failedAreas = [{ area: 'orders', failure: 'invalid output (RST-1300)', unread: [] }];

    const [task] = roundTasks({ ...empty, failedAreas }, agentCodeMap, 1);

    expect(task?.retryNote).toBeUndefined();
  });

  it('RF-209 an unread file of a failed area is not read twice: the failed area is read whole', () => {
    const plan = {
      ...empty,
      gaps: [{ path: 'src/Orders/Order.cs', area: 'orders', tokens: 5 }],
      failedAreas: [{ area: 'orders', failure: 'failed (RST-1303)', unread: [] }],
    };

    const tasks = roundTasks(plan, agentCodeMap, 1);

    expect(tasks.map((task) => task.area.name)).toEqual(['orders']);
    expect(tasks[0]?.area.files).toEqual(orders?.files);
  });
});
