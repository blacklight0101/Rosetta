import { describe, expect, it } from 'vitest';
import { renderDataBlock, type DataBlock } from '../../../../src/domain/egress/data-block.js';
import { scanDataBlocks } from '../../../../src/domain/egress/data-block-scan.js';
import { TAG } from '../../../support/data-block-tags.js';

// RF-145, RF-609: what the scan found of the legacy stack goes to the planner as a data block of
// its own source; file names come from the repository, so the block is repository content.

const summary: DataBlock = {
  source: 'scan_summary',
  excerpts: [],
  text: '{"languages":[{"language":"csharp","files":2,"lines":200}]}',
};

describe('the scan summary block', () => {
  it('RF-145 RF-609 is a well-formed block labelled as repository content', () => {
    const rendered = renderDataBlock(summary, TAG);
    const scan = scanDataBlocks(rendered);

    expect(rendered).toContain('"label":"repository-content"');
    expect(rendered).toContain('"source":"scan_summary"');
    expect(scan.ok).toBe(true);
  });
});
