import { describe, expect, it } from 'vitest';
import { assumedGapInput } from '../../../../src/application/estimate/coverage-estimate.js';

// RF-613, RF-627, P9-06, P9-14: a requirement no card lists is an item of the gap block
// (`requirement:<REQ id>`), so the estimate sizes the block with them.

describe('the assumed block of the gap call', () => {
  it('RF-613 P9-14 counts an item for each requirement of the plan beside the 60 package items', () => {
    const { items, content } = assumedGapInput();

    const requirementItems = items.filter((item) => item.kind === 'requirement');
    expect(requirementItems).toHaveLength(content.requirements.length);
    expect(requirementItems[0]?.id).toBe('requirement:REQ-0');
    expect(items).toHaveLength(60 + content.requirements.length);
  });
});
