import { describe, expect, it } from 'vitest';
import { withUnreadRanges } from '../../../../src/application/agent/unread-ranges-note.js';

// P5-36: the note a Deepen task over database objects is sent: the lines of each object, in a data block.

const tools = { renderBlock: (_source: string, text: string) => `[BLOCK]\n${text}\n[/BLOCK]` };

describe('database objects note', () => {
  it('P5-36 asks for the columns written, the filters and the casts, and lists the lines in a data block', () => {
    const out = withUnreadRanges('Task.', {
      unreadRanges: [{ path: 'db/a.sql', ranges: [{ startLine: 14, endLine: 16 }], objects: true }],
      tools,
    });

    expect(out).toContain('[BLOCK]\ndb/a.sql:14-16\n[/BLOCK]');
    expect(out).toMatch(/column/u);
    expect(out).toMatch(/filter/u);
    expect(out).toMatch(/cast/u);
  });

  it('P5-36 leaves the task alone without objects, and keeps the note of partly read files apart', () => {
    expect(withUnreadRanges('Task.', { tools })).toBe('Task.');
    const partly = withUnreadRanges('Task.', {
      unreadRanges: [{ path: 'a.cs', ranges: [{ startLine: 5, endLine: 9 }] }],
      tools,
    });
    expect(partly).toContain('a.cs:5-9');
    expect(partly).not.toMatch(/database objects/u);
  });
});
