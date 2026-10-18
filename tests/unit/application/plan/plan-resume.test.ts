import { describe, expect, it } from 'vitest';
import { joinContinuation } from '../../../../src/application/plan/plan-continuation.js';
import { resumePoint } from '../../../../src/application/plan/json-tail.js';

// RF-604, RF-007 (P3-31): a cut-off answer is backed up to the last complete JSON value boundary
// before the model is asked to go on, and the fragment is accepted only if it starts like JSON, so
// a join is the right JSON or the answer stays cut off; it is never silently altered.

describe('resumePoint', () => {
  it('RF-604 text that ends at a boundary is unchanged', () => {
    expect(resumePoint('{"a": [1,')).toBe('{"a": [1,');
    expect(resumePoint('{"a": "x"')).toBe('{"a": "x"');
    expect(resumePoint('{"a": ')).toBe('{"a": ');
  });

  it('RF-604 a cut inside a value string goes back to before its opening quote', () => {
    expect(resumePoint('{"statement": "Pay the or')).toBe('{"statement": ');
    expect(resumePoint('{"statement": "')).toBe('{"statement": ');
  });

  it('RF-604 a cut inside a key goes back to before the key', () => {
    expect(resumePoint('{"items": [{"id": "A"}, {"ti')).toBe('{"items": [{"id": "A"}, {');
  });

  it('RF-604 an escaped quote does not end the string the cut is in', () => {
    expect(resumePoint('{"a": "say \\"')).toBe('{"a": ');
    expect(resumePoint('{"a": "x, \\"b')).toBe('{"a": ');
  });

  it('RF-604 a quote in prose before the JSON is not read', () => {
    expect(resumePoint('He said "hi. {"a": "x')).toBe('He said "hi. {"a": ');
  });

  it('RF-604 a cut list item string goes back to its quote', () => {
    expect(resumePoint('{"tags": ["red", "dark')).toBe('{"tags": ["red", ');
  });

  it('RF-604 a cut number or word goes back to where it starts', () => {
    expect(resumePoint('{"a": [1, 12')).toBe('{"a": [1, ');
    expect(resumePoint('{"a": [1, -2.5e')).toBe('{"a": [1, ');
    expect(resumePoint('{"a": tr')).toBe('{"a": ');
  });

  it('RF-604 text with no open JSON is unchanged', () => {
    expect(resumePoint('Here is the plan: ')).toBe('Here is the plan: ');
    expect(resumePoint('He said "hi')).toBe('He said "hi');
    expect(resumePoint('{"a": 1}\nThat is all')).toBe('{"a": 1}\nThat is all');
  });
});

describe('joinContinuation: a fragment that does not start like JSON (P3-31)', () => {
  const cut = '{"statement": "Pay the or';
  const items = '{"items": [{"id": "A"}, {"ti';

  it.each([
    ['{"statement": "Make', ' sure that the total is: 5."}'],
    ['{"statement": "Pay the bo', 'ok: due today."}'],
    ['{"statement": "Please', ' ok the deadline, which is: Friday."}'],
    ['{"statement": "dis', 'continuing: legacy"}'],
    ['{"statement": "The user said', ' of course it is: yes"}'],
    [cut, 'Sure! der"}'],
    [cut, 'Understood. der"}'],
    [cut, 'I apologize. Here you go: der"}'],
    [cut, 'Sure, here is the rest der"}'],
    [cut, `Sure, ${'x'.repeat(90)}: der"}`],
    [cut, '...der"}'],
    [items, 'Sure, here is the rest: tle":"two"}]}'],
    [items, 'tle":"two"}]}'],
  ])('RF-604 %j then %j stays cut off, never glued into the text', (earlier, fragment) => {
    expect(joinContinuation(earlier, fragment)).toBe(resumePoint(earlier));
  });

  it('RF-604 a fragment that starts at the boundary is joined', () => {
    expect(joinContinuation(cut, '"Pay the order."}')).toBe('{"statement": "Pay the order."}');
    expect(joinContinuation(items, '"title":"two"}]}')).toBe(
      '{"items": [{"id": "A"}, {"title":"two"}]}',
    );
  });

  it('RF-604 a number cut in the middle is written whole by the model', () => {
    expect(joinContinuation('{"a": [1, 12', '12, 3]}')).toBe('{"a": [1, 12, 3]}');
  });

  it.each(['1]}', '-1]}', 'true]}', 'false]}', 'null]}', '"x"]}', '[1]]}', '{}]}', ']}', ' 1]}'])(
    'RF-604 a fragment that starts with %j is JSON and is joined',
    (fragment) => {
      expect(joinContinuation('{"a": [', fragment)).toBe(`{"a": [${fragment}`);
    },
  );

  it.each(['truth]}', 'trueish]}', 'nullable]}', 'none]}', 'Sure]}', 'x]}', '\n```\n'])(
    'RF-604 a fragment that starts with %j is not JSON and stays cut off',
    (fragment) => {
      expect(joinContinuation('{"a": [', fragment)).toBe('{"a": [');
    },
  );
});

describe('joinContinuation: a repeat that cannot be told from new text (P3-31)', () => {
  it('RF-604 a repeat of a few characters over and over leaves the answer cut off', () => {
    const earlier = '{"a": [1, 1, 1, 1, 1, 1,';
    const zeros = '{"a": [0,0,0,0,0,0,0,0,0,0,0,0,';

    expect(joinContinuation(earlier, ' 1, 1, 1, 1,]}')).toBe(earlier);
    expect(joinContinuation(zeros, '0,0,0,0,0,0,0,0,0,0,0,0,]}')).toBe(zeros);
  });

  it('RF-604 a repeat of natural text is dropped once', () => {
    const earlier = '{"a": [1], "statement": "Pay the order before the end", ';

    expect(joinContinuation(earlier, '"Pay the order before the end", "b": 2}')).toBe(
      '{"a": [1], "statement": "Pay the order before the end", "b": 2}',
    );
  });
});
