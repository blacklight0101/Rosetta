import { describe, expect, it } from 'vitest';
import { roundTasks } from '../../../../src/application/deepen/deepen-tasks.js';
import type { RoundPlan } from '../../../../src/domain/deepen/round-plan.js';
import { agentCodeMap } from '../../../support/agent-fixtures.js';

// RF-209, EV-04: the coverage pass task of a partly read file is told which lines to read.

const empty: RoundPlan = { judge: [], reread: [], outOfScope: [], gaps: [], failedAreas: [] };
const path = 'src/Orders/Order.cs';

describe('roundTasks for partly read files', () => {
  it('RF-209 a task over a partly read file carries its unread ranges', () => {
    const unreadRanges = [{ startLine: 21, endLine: 80 }];
    const plan = { ...empty, gaps: [{ path, area: 'orders', tokens: 5, unreadRanges }] };

    const [task] = roundTasks(plan, agentCodeMap, 1);

    expect(task?.area.files).toEqual([path]);
    expect(task?.unreadRanges).toEqual([{ path, ranges: unreadRanges }]);
  });

  it('RF-209 a task over files no task read carries no ranges', () => {
    const plan = { ...empty, gaps: [{ path, area: 'orders', tokens: 5 }] };

    const [task] = roundTasks(plan, agentCodeMap, 1);

    expect(task?.unreadRanges).toBeUndefined();
  });
});
