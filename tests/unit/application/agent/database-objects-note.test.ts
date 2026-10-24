import { describe, expect, it } from 'vitest';
import { withDatabaseObjects } from '../../../../src/application/agent/unread-ranges-note.js';

// P5-36: the note a Deepen task over database objects is sent: the lines of each object, in a data block.

const tools = { renderBlock: (_source: string, text: string) => `[BLOCK]\n${text}\n[/BLOCK]` };

describe('database objects note', () => {
  it('P5-36 asks for the columns written, the filters and the casts, and lists the lines in a data block', () => {
    const out = withDatabaseObjects('Task.', {
      databaseObjects: [{ path: 'db/a.sql', ranges: [{ startLine: 14, endLine: 16 }] }],
      tools,
    });

    expect(out).toContain('[BLOCK]\ndb/a.sql:14-16\n[/BLOCK]');
    expect(out).toMatch(/columns/u);
    expect(out).toMatch(/filter/u);
    expect(out).toMatch(/cast/u);
  });

  it('P5-36 leaves the task alone without objects', () => {
    expect(withDatabaseObjects('Task.', { tools })).toBe('Task.');
  });
});
