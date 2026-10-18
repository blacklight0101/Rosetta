import { describe, expect, it } from 'vitest';
import { REPORT_CSP } from '../../../../src/infrastructure/report/report-security.js';
import { renderReplayHtml } from '../../../../src/infrastructure/report/replay-html.js';
import { auditHtml } from '../../../support/html-audit.js';
import { hostileText, plainReplay, reportModel } from '../../../support/report-fixtures.js';

// RF-506, RF-507, RF-1013: the "Run replay" page. Without JavaScript it is the whole timeline as a
// list; one external script adds play, pause and step. Nothing inline, nothing from the text.

function pageOf(replay = plainReplay()) {
  return auditHtml(renderReplayHtml(reportModel({ replay })));
}

const stepsOf = (page: ReturnType<typeof pageOf>) => [
  ...page.document.querySelectorAll('ol[data-replay-steps] > li'),
];

describe('renderReplayHtml without JavaScript', () => {
  it('RF-506 lists every step of the run in order, with its time, label, text and running cost', () => {
    const items = stepsOf(pageOf());

    expect(items.map((item) => item.getAttribute('data-seq'))).toEqual(['1', '2', '3']);
    expect(items[1]?.textContent.replace(/\s+/gu, ' ').trim()).toBe(
      '+2.0 s Turn Turn 2: 100 tokens in, 10 out $0.0010 220 tokens',
    );
    expect(items[1]?.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-10-12T10:00:04.000Z',
    );
  });

  it('RF-506 shows the agents that were spawned with their area, role, model, state, turns and cards', () => {
    const rows = [...pageOf().document.querySelectorAll('table tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()),
    );

    expect(rows).toEqual([['orders', 'reader', 'model-a', 'Done', '1', '1']]);
  });

  it('RF-506 summarises the run: steps, duration and cost', () => {
    const text = pageOf().document.body.textContent.replace(/\s+/gu, ' ');

    expect(text).toContain('3 steps');
    expect(text).toContain('4.0 s');
    expect(text).toContain('$0.0015');
    expect(text).toContain('330 tokens');
  });

  it('RF-506 hides the controls, which do nothing without the script', () => {
    const controls = pageOf().document.querySelector('[data-replay-controls]');

    expect(controls?.hasAttribute('hidden')).toBe(true);
    expect(
      [...(controls?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim()),
    ).toEqual(['Play', 'Pause', 'Step', 'Restart']);
    expect(controls?.querySelector('[role="status"]')).not.toBeNull();
  });

  it('RF-506 says so when the run recorded no events', () => {
    const page = pageOf(plainReplay({ steps: [], agents: [], durationMs: 0 }));

    expect(stepsOf(page)).toHaveLength(0);
    expect(page.document.body.textContent).toContain('This run recorded no events.');
    expect(page.document.querySelector('[data-replay-controls]')).toBeNull();
  });
});

describe('renderReplayHtml with JavaScript', () => {
  it('RF-506 loads one script from the report folder, deferred, and nothing inline', () => {
    const page = pageOf();

    expect(page.scripts).toEqual(['replay.js']);
    expect(page.document.querySelector('script')?.hasAttribute('defer')).toBe(true);
    expect(page.inlineStyles).toBe(0);
    expect(page.styleElements).toBe(0);
  });

  it('RF-506 gives the script what it needs in attributes: the step count and the cost labels', () => {
    const page = pageOf();
    const list = page.document.querySelector('ol[data-replay-steps]');

    expect(list?.getAttribute('data-total')).toBe('3');
    expect(stepsOf(page)[0]?.getAttribute('data-cost')).toBe('$0.0005');
  });
});

describe('renderReplayHtml page rules', () => {
  it('RF-1013 carries the content security policy and the no-referrer policy', () => {
    const page = pageOf();

    expect(page.csp).toBe(REPORT_CSP);
    expect(page.referrer).toBe('no-referrer');
  });

  it('RF-506 links to the report and marks the replay as the current page', () => {
    const page = pageOf();

    expect(page.document.querySelector('nav a[aria-current="page"]')?.textContent).toBe(
      'Run replay',
    );
    expect(
      [...page.document.querySelectorAll('nav a')].map((link) => link.getAttribute('href')),
    ).toEqual(['report.html', 'questions.html', 'replay.html', 'cost.html']);
  });
});

const hostile = plainReplay({
  steps: [
    {
      seq: 1,
      at: '2026-10-12T10:00:00.000Z',
      offsetMs: 0,
      kind: 'verdict',
      label: 'Verdict',
      text: `${hostileText} [lines](https://github.com/octo/demo/blob/abc/a.cs#L1)`,
      tokens: 0,
      costMicros: 0,
    },
  ],
  agents: [
    {
      agentTaskId: 'task-x',
      area: hostileText,
      role: 'reader',
      model: hostileText,
      state: 'Done',
      turns: 1,
      cards: 0,
    },
  ],
});

describe('renderReplayHtml and untrusted text', () => {
  it('RF-507 shows a script element, an onerror attribute and a javascript link as text', () => {
    const page = pageOf(hostile);
    const step = stepsOf(page)[0];

    expect(step?.textContent).toContain(hostileText);
    expect(page.scripts).toEqual(['replay.js']);
    expect(page.handlers).toEqual([]);
    expect(page.document.querySelectorAll('img')).toHaveLength(0);
    expect(page.foreignLinks).toEqual([]);
  });

  it('RF-507 keeps the one link to github.com and no other', () => {
    const links = [...pageOf(hostile).document.querySelectorAll('ol a')];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://github.com/octo/demo/blob/abc/a.cs#L1',
    ]);
    expect(links[0]?.getAttribute('rel')).toBe('noopener noreferrer nofollow');
  });

  it('RF-507 shows an agent area and model as text too', () => {
    const cells = [...pageOf(hostile).document.querySelectorAll('table tbody td')];

    expect(cells[0]?.textContent).toBe(hostileText);
    expect(cells[2]?.textContent).toBe(hostileText);
    expect(cells[0]?.children).toHaveLength(0);
  });
});
