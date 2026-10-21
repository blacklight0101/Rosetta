import { fireEvent, render, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import type { RunState } from '../../../web/src/lib/live-run/run-state.js';
import { StatusBadge } from '../../../web/src/components/StatusBadge.js';
import { EventLog } from '../../../web/src/pages/EventLog.js';
import { ev, startedData, stateAfter } from './live-run-fixtures.js';

// RF-1002, RF-507, RNF-010 (P3-62, owner test 2026-10-20): the event log. Usage lines read in dollars
// and tokens and are grouped; a verdict line has the badge of the claims list and a reason that
// can be opened in full; times count from the start of the run with a plus sign; paths wrap at "/".

const usage = (seq: number, role: string, costMicros?: number, agent = 'reader-001') =>
  ev(
    seq,
    'usage.recorded',
    {
      ...{ callId: `c#${String(seq)}`, role, provider: 'ollama', model: 'qwen3.5:9b' },
      tokens: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 0 },
      ...(costMicros === undefined ? {} : { costMicros }),
    },
    agent,
  );

const judged = (seq: number, status: string, reason: string) =>
  ev(seq, 'verify.claim.judged', { claimId: 'BR-001.c1', status, reason }, 'reader-001');

const start = ev(1, 'run.started', startedData);
const usageLines = (lines: RunState['log']) =>
  lines.filter((line) => line.type === 'usage.recorded');

it('RF-1003 never writes micro-dollars, and gives dollars and tokens', () => {
  const state = stateAfter(start, usage(2, 'verifier', 1_500));

  const [line] = usageLines(state.log);
  expect(line?.text).not.toMatch(/micro/iu);
  expect(line?.text).toBe('verifier · 1 call · 120 tokens · $0.0015');
});

it('RF-1003 groups the usage lines that follow each other for one role into one line', () => {
  const state = stateAfter(
    start,
    usage(2, 'verifier', 1_000),
    usage(3, 'verifier', 500),
    usage(4, 'verifier', 0),
  );

  const lines = usageLines(state.log);
  expect(lines).toHaveLength(1);
  expect(lines[0]?.text).toBe('verifier · 3 calls · 360 tokens · $0.0015');
  expect(state.log.map((line) => line.type)).toEqual(['run.started', 'usage.recorded']);
});

it('RF-1003 keeps a line for each role and after any other event', () => {
  const state = stateAfter(
    start,
    usage(2, 'reader', 0),
    usage(3, 'verifier', 0),
    ev(4, 'agent.turn', { turn: 1, inputTokens: 1, outputTokens: 1 }, 'reader-001'),
    usage(5, 'verifier', 0),
  );

  expect(usageLines(state.log).map((line) => line.text)).toEqual([
    'reader · 1 call · 120 tokens · $0.00',
    'verifier · 1 call · 120 tokens · $0.00',
    'verifier · 1 call · 120 tokens · $0.00',
  ]);
});

it('RF-427 adds only the calls that have a price when some do and some do not', () => {
  const state = stateAfter(start, usage(2, 'reader'), usage(3, 'reader', 500));

  expect(usageLines(state.log)[0]?.text).toBe('reader · 2 calls · 240 tokens · $0.0005');
});

it('RF-427 says the model has no price when the event leaves the cost out', () => {
  const state = stateAfter(start, usage(2, 'reader'));

  expect(usageLines(state.log)[0]?.text).toBe('reader · 1 call · 120 tokens · no price');
});

function lineOf(claimId: string): HTMLElement {
  const item = screen.getByText(claimId).closest('li');
  if (item === null) throw new Error(`no log line for ${claimId}`);
  return item;
}

function logOf(...events: readonly RunEvent[]) {
  const state = stateAfter(...events);
  return render(<EventLog lines={state.log} startedAt={state.startedAt} />);
}

it('RF-1002 uses the badge of the claims list for Supported and for Rejected', () => {
  logOf(start, judged(2, 'Supported', 'The lines do it.'), judged(3, 'Rejected', 'They do not.'));

  const badges = screen.getAllByTestId('status-badge');
  const wanted = (value: 'Supported' | 'Rejected') => {
    const { container } = render(<StatusBadge list="ClaimStatus" value={value} />);
    return container.firstElementChild?.className;
  };
  expect(badges.map((badge) => badge.textContent)).toEqual(['Rejected', 'Supported']);
  expect(badges[0]?.className).toBe(wanted('Rejected'));
  expect(badges[1]?.className).toBe(wanted('Supported'));
  expect(badges[0]?.className).not.toBe(badges[1]?.className);
});

it('RF-1002 shows the claim and the whole reason when the reason is short', () => {
  logOf(start, judged(2, 'Supported', 'The cited lines call `Save()` once.'));

  const item = lineOf('BR-001.c1');
  expect(item.textContent).toContain('The cited lines call Save() once.');
  expect(item.querySelector('code')?.textContent).toBe('Save()');
  expect(within(item).queryByRole('button')).toBeNull();
});

it('RF-1002 cuts a reason of 2,000 characters and opens it in full on request', () => {
  const reason = `${'word '.repeat(399)}end.`;
  expect(reason.length).toBeGreaterThan(1_900);
  logOf(start, judged(2, 'Rejected', reason));

  const item = lineOf('BR-001.c1');
  expect(item.textContent).not.toContain('end.');
  expect(item.textContent).not.toContain('...');
  const open = within(item).getByRole('button', { name: 'Show the full reason' });
  expect(open.getAttribute('aria-expanded')).toBe('false');

  fireEvent.click(open);

  expect(item.textContent).toContain(reason);
  const close = within(item).getByRole('button', { name: 'Show less' });
  expect(close.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(close);
  expect(item.textContent).not.toContain('end.');
});

it('RF-507 shows a reason with markup as text', () => {
  logOf(start, judged(2, 'Unverified', 'It says <b>bold</b> and <script>1</script>'));

  expect(document.querySelector('.rst-live-log b')).toBeNull();
  expect(document.querySelector('.rst-live-log script')).toBeNull();
  expect(screen.getByRole('log').textContent).toContain('<b>bold</b>');
});

describe('RF-1002 the times and paths of the event log', () => {
  it('RF-1002 writes each time as time since the start, with a plus sign', () => {
    logOf(start, ev(5, 'scan.completed', { files: 3, areas: 1 }));

    const times = [...document.querySelectorAll('time')].map((time) => time.textContent);
    expect(times).toEqual(['+00:04.0', '+00:00.0']);
  });

  it('RNF-010 lets a path in a line wrap at "/" and before ":", never inside a word', () => {
    logOf(
      start,
      ev(
        2,
        'agent.tool.called',
        {
          turn: 1,
          tool: 'read_file',
          args: { path: 'Catalog/Edit.aspx.cs', startLine: 4, endLine: 9 },
        },
        'reader-001',
      ),
    );

    const text = document.querySelector('.rst-live-log__text');
    expect(text?.querySelectorAll('wbr').length).toBeGreaterThanOrEqual(2);
  });
});

it('RF-1002 shows a verdict that has no claim id as the plain text of its line', () => {
  const event = ev(2, 'verify.claim.judged', { status: 'Supported', reason: 'ok' }, 'reader-001');
  const state = stateAfter(start, event);

  expect(state.log.at(-1)?.detail).toBeUndefined();
  logOf(start, event);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByRole('log').textContent).toContain('Supported');
});

it('RF-1002 shows a status the claims list does not know as its own word, without a badge', () => {
  logOf(start, judged(2, 'Maybe', 'Not sure.'));

  expect(screen.queryByTestId('status-badge')).toBeNull();
  expect(lineOf('BR-001.c1').textContent).toContain('Maybe');
  expect(lineOf('BR-001.c1').textContent).toContain('Not sure.');
});

it('RF-1002 shows a verdict without a reason as the claim and its badge alone', () => {
  const event = ev(2, 'verify.claim.judged', { claimId: 'BR-001.c1', status: 'Supported' });
  logOf(start, event);

  expect(screen.queryByTestId('log-reason')).toBeNull();
  expect(lineOf('BR-001.c1').textContent).toContain('Supported');
});

it('RF-1002 says the log keeps only the newest 1,000 events once it is full', () => {
  const full = stateAfter(...Array.from({ length: 1_000 }, (_, i) => ev(i + 1, 'scan.completed')));
  const { unmount } = render(<EventLog lines={full.log} startedAt={undefined} />);
  expect(screen.getByText(/Only the newest 1,000 events are kept\./u)).toBeTruthy();
  unmount();

  render(<EventLog lines={full.log.slice(1)} startedAt={undefined} />);
  expect(screen.queryByText(/Only the newest/u)).toBeNull();
});

describe('RF-1002 a cut reason never splits a surrogate pair (P3-68)', () => {
  const loneHigh = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u;
  const shownOf = (reason: string): string => {
    logOf(start, judged(2, 'Rejected', reason));
    return screen.getByTestId('log-reason').textContent;
  };

  it('RF-1002 stops before an emoji that would be cut in half at 200', () => {
    const shown = shownOf(`${'a'.repeat(199)}😀${'b'.repeat(99)}`);

    expect(shown).toBe(`${'a'.repeat(199)}…`);
    expect(shown).not.toMatch(loneHigh);
  });

  it('RF-1002 keeps an emoji that ends exactly at 200', () => {
    const shown = shownOf(`${'a'.repeat(198)}😀${'b'.repeat(100)}`);

    expect(shown).toBe(`${'a'.repeat(198)}😀…`);
  });
});
