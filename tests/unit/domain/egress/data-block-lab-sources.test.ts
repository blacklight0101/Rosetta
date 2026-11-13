import { describe, expect, it } from 'vitest';
import { renderDataBlock } from '../../../../src/domain/egress/data-block.js';
import { scanDataBlocks } from '../../../../src/domain/egress/data-block-scan.js';
import { TAG } from '../../../support/data-block-tags.js';

// RF-145, RF-1404: the lab's judge gets the case, the answer and the hand label as blocks of their
// own sources, labelled as repository content because they are untrusted.

describe('the judge data blocks', () => {
  it.each(['lab_source', 'lab_answer', 'lab_label'] as const)(
    'RF-145 RF-1404 %s is a well-formed block labelled as repository content',
    (source) => {
      const rendered = renderDataBlock({ source, excerpts: [], text: 'text' }, TAG);

      expect(rendered).toContain('"label":"repository-content"');
      expect(scanDataBlocks(rendered).ok).toBe(true);
    },
  );
});
