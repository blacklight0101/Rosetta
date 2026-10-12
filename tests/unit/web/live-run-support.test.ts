import { describe, expect, it } from 'vitest';
import { parseRunEvent } from '../../../web/src/api/run-events.js';
import { citationHref } from '../../../web/src/lib/live-run/claim-links.js';
import { elapsedLabel } from '../../../web/src/lib/live-run/elapsed.js';
import { ev, sourceState, wire } from './live-run-fixtures.js';

// RF-1004, RF-1006, RF-1002: the small pieces under the live run page.

describe('parseRunEvent', () => {
  it('RF-1006 reads the envelope of a valid event', () => {
    const event = ev(7, 'agent.turn', { turn: 2 }, 'reader-001');

    expect(parseRunEvent(wire(event))).toEqual(event);
  });

  it('RF-1006 reads an event whose type it does not know', () => {
    expect(parseRunEvent(wire(ev(8, 'a.type.of.the.future')))).toMatchObject({
      seq: 8,
      type: 'a.type.of.the.future',
    });
  });

  it('RF-1006 refuses text that is not an event', () => {
    expect(parseRunEvent('not json')).toBeUndefined();
    expect(parseRunEvent('{"seq":0,"type":"x","at":"t","runId":"r","data":{}}')).toBeUndefined();
    expect(parseRunEvent('{"seq":1,"type":"x","at":"t","runId":"r"}')).toBeUndefined();
    expect(parseRunEvent('[]')).toBeUndefined();
  });
});

describe('citationHref', () => {
  const citation = { path: 'Catalog/Edit.aspx.cs', startLine: 40, endLine: 80 };

  it('RF-1004 links the cited lines on GitHub at the commit of the run', () => {
    expect(citationHref(sourceState, citation)).toBe(
      'https://github.com/octo/demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/Catalog/Edit.aspx.cs#L40-L80',
    );
  });

  it('RF-1004 links a single line as one line and encodes the path', () => {
    expect(citationHref(sourceState, { path: 'My Docs/a#b.cs', startLine: 5, endLine: 5 })).toBe(
      'https://github.com/octo/demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/My%20Docs/a%23b.cs#L5',
    );
  });

  it('RF-1004 puts the sub-folder of the source before the path', () => {
    expect(citationHref({ ...sourceState, subpath: 'src/app' }, citation)).toContain(
      '/blob/3f786850e387550fdab836ed7e6dc881de23001b/src/app/Catalog/Edit.aspx.cs#L40-L80',
    );
  });

  it('RF-1004 gives no link before the commit is known or for an unusable path or owner', () => {
    expect(citationHref(undefined, citation)).toBeUndefined();
    expect(citationHref({ ...sourceState, commitSha: undefined }, citation)).toBeUndefined();
    expect(citationHref({ ...sourceState, commitSha: 'main' }, citation)).toBeUndefined();
    expect(citationHref(sourceState, { ...citation, path: '../secret' })).toBeUndefined();
    expect(citationHref({ ...sourceState, owner: 'a/b' }, citation)).toBeUndefined();
    expect(citationHref(sourceState, { ...citation, startLine: 9, endLine: 3 })).toBeUndefined();
  });
});

describe('elapsedLabel', () => {
  it('RF-1002 shows minutes, seconds and tenths since the start of the run', () => {
    expect(elapsedLabel('2026-10-12T10:00:00.000Z', '2026-10-12T10:06:42.140Z')).toBe('06:42.1');
    expect(elapsedLabel('2026-10-12T10:00:00.000Z', '2026-10-12T10:00:00.000Z')).toBe('00:00.0');
  });

  it('RF-1002 shows the clock time when the start is unknown or the event is earlier', () => {
    expect(elapsedLabel(undefined, '2026-10-12T10:06:42.140Z')).toBe('10:06:42');
    expect(elapsedLabel('2026-10-12T10:07:00.000Z', '2026-10-12T10:06:42.140Z')).toBe('10:06:42');
  });
});
