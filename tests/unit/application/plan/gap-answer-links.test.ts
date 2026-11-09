import { describe, expect, it } from 'vitest';
import { parseGapAnswer } from '../../../../src/application/plan/gap-answer.js';
import { linkListWarnings } from '../../../../src/application/plan/gap-round-notes.js';
import { scenario } from '../../../support/task-card-fixtures.js';

// P8-95, RF-627, ADR-013, EV-95: a gap answer may link an item of its block to a task card the plan
// already has, by the card's `T-` id, instead of writing a card that repeats its work. The `links`
// list is untrusted text like the cards: each link is read on its own, and one that cannot be read
// is reported by its position in `links`, the field and a fixed reason, never with answer text.

const card = {
  title: 'Serve catalog item pictures',
  phase: 2,
  requirements: [12],
  acceptanceCriteria: [scenario],
  invariant: 'A picture is served only from the picture folder.',
  riskClass: 'none',
  adds: [],
  probes: [],
  files: ['src/pictures/'],
  dependsOn: [],
  builds: ['feature:F-006'],
};

const flows = ['flow:FLOW-002', 'flow:FLOW-009'];

describe('parseGapAnswer: links to cards of the plan', () => {
  it('RF-627 P8-95 reads each link with its position, card id and the item ids it names', () => {
    const answer = {
      tasks: [card],
      links: [
        { task: 'T-004', builds: flows },
        { task: 'T-002', builds: ['screen:SCRN-006'] },
      ],
    };

    const read = parseGapAnswer('```json\n' + JSON.stringify(answer) + '\n```');

    expect(read?.drafts).toHaveLength(1);
    expect(read?.links).toEqual([
      { position: 1, task: 'T-004', builds: flows },
      { position: 2, task: 'T-002', builds: ['screen:SCRN-006'] },
    ]);
    expect(read?.linkProblems).toEqual([]);
  });

  it('RF-627 P8-95 an answer with only links and no card is an answer', () => {
    const read = parseGapAnswer(
      JSON.stringify({ tasks: [], links: [{ task: 'T-004', builds: flows }] }),
    );

    expect(read?.drafts).toEqual([]);
    expect(read?.links).toEqual([{ position: 1, task: 'T-004', builds: flows }]);
  });

  it('RF-627 P8-95 an answer without a links list reads as before', () => {
    const read = parseGapAnswer(JSON.stringify({ tasks: [card] }));

    expect(read).not.toHaveProperty('links');
    expect(read).not.toHaveProperty('linkProblems');
  });
});

describe('parseGapAnswer: links that do not read as a whole', () => {
  it('RF-627 ADR-013 a link that cannot be read is reported by position and field, and the others stay', () => {
    const answer = {
      tasks: [],
      links: [
        'T-004',
        { task: 4, builds: flows },
        { task: 'T-004', builds: 'flow:FLOW-002' },
        { task: 'T-004', builds: flows },
      ],
    };

    const read = parseGapAnswer(JSON.stringify(answer));

    expect(read?.links).toEqual([{ position: 4, task: 'T-004', builds: flows }]);
    expect(read?.linkProblems).toEqual([
      { position: 1, field: 'link', reason: 'has the wrong type or shape', builds: [] },
      { position: 2, field: 'task', reason: 'has the wrong type or shape', builds: flows },
      { position: 3, field: 'builds', reason: 'has the wrong type or shape', builds: [] },
    ]);
    expect(JSON.stringify(read?.linkProblems)).not.toContain('T-004');
  });

  it('RF-627 P7-14 an answer that is not JSON as a whole still reads its links', () => {
    const broken = `{"tasks": [${JSON.stringify(card)}, {"title": "x", "requirements": [ none ]}], "links": [{"task": "T-004", "builds": ["flow:FLOW-002"]}]}`;

    const read = parseGapAnswer(broken);

    expect(read?.salvaged).toBe(true);
    expect(read?.drafts).toHaveLength(1);
    expect(read?.links).toEqual([{ position: 1, task: 'T-004', builds: ['flow:FLOW-002'] }]);
  });
});

describe('parseGapAnswer: a links value it cannot take whole', () => {
  it('RF-627 P8-96 a links value that is not a list is dropped, and the log says so without its text', () => {
    const read = parseGapAnswer(JSON.stringify({ tasks: [card], links: { task: 'T-004' } }));

    expect(read?.drafts).toHaveLength(1);
    expect(read?.links).toBeUndefined();
    expect(read?.linksNotList).toBe(true);
    const lines = linkListWarnings('gap answer', read ?? {});
    expect(lines).toEqual(['The "links" value of the gap answer was not a list and was dropped.']);
    expect(lines.join(' ')).not.toContain('T-004');
  });

  it('RF-627 P8-96 reads the first 100 links and drops each one past them, with a count in the log', () => {
    const many = Array.from({ length: 103 }, () => ({ task: 'T-004', builds: flows }));

    const read = parseGapAnswer(JSON.stringify({ tasks: [], links: many }));

    expect(read?.links).toHaveLength(100);
    expect(read?.links?.at(-1)?.position).toBe(100);
    expect(read?.linksPastMax).toBe(3);
    expect(linkListWarnings('second gap answer', read ?? {})).toEqual([
      '3 links of the second gap answer past the first 100 were dropped.',
    ]);
  });

  it('RF-627 P8-96 exactly 100 links are all read, with no log line', () => {
    const hundred = Array.from({ length: 100 }, () => ({ task: 'T-004', builds: flows }));

    const read = parseGapAnswer(JSON.stringify({ tasks: [], links: hundred }));

    expect(read?.links).toHaveLength(100);
    expect(read?.linksPastMax).toBeUndefined();
    expect(linkListWarnings('gap answer', read ?? {})).toEqual([]);
  });
});
