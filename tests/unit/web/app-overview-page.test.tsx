import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { renderLive, runPath, runRow, runUuid } from './live-run-helpers.js';

// RF-264, RF-507: the overview of the application on the page of an ended understand run. It comes
// first, before the open questions, every statement links its cards, and model text is shown as text.

const hostile =
  '<script>window.__pwned = 1</script> <img src=x onerror=alert(1)> [x](javascript:alert(1))';

const overview = {
  state: 'full',
  sections: [
    {
      id: 'application',
      statements: [{ text: 'A small shop front.', cards: [{ id: 'FEAT-001', type: 'FEAT' }] }],
    },
    {
      id: 'features',
      statements: [
        {
          text: 'Orders are placed at checkout.',
          cards: [
            { id: 'FEAT-001', type: 'FEAT' },
            { id: 'ENT-001', type: 'ENT' },
          ],
        },
      ],
    },
  ],
  notCovered: ['Vendor: third-party code; nothing about the application was read from it.'],
  questions: [{ cardId: 'OQ-001', section: 'features' }],
};

const questions = [
  {
    cardId: 'OQ-001',
    question: 'Who may cancel?',
    context: 'Orders/Order.cs:3-5 Cancel.',
    answer: '',
    state: 'Open',
    dependents: 2,
  },
  {
    cardId: 'OQ-002',
    question: 'Which tax rate?',
    context: 'Billing/Tax.cs:1-4 Rate.',
    answer: '',
    state: 'Open',
    dependents: 0,
  },
];

const ended = runRow({ queueState: 'Ended', endState: 'Completed' });

function endedPage(body: Response, withQuestions = true) {
  return renderLive({
    [`GET ${runPath}`]: ended,
    [`GET ${runPath}/overview`]: body,
    [`GET ${runPath}/answers`]: json(200, { questions: withQuestions ? questions : [] }),
  });
}

const overviewRegion = (): Promise<HTMLElement> =>
  screen.findByRole('region', { name: 'Overview of the application' });

describe('the overview on the page of an ended run', () => {
  it('RF-264 shows the overview first and the open questions after it, in their own tab', async () => {
    endedPage(json(200, { overview }));

    await overviewRegion();

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]?.textContent).toBe('Overview');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]?.textContent).toMatch(/^Your questions/u);
    expect(screen.queryByRole('region', { name: 'Open questions' })).toBeNull();
    fireEvent.click(tabs[1] as HTMLElement);
    expect(await screen.findByRole('region', { name: 'Open questions' })).toBeTruthy();
  });

  it('RF-264 comes before every other part of the page, the downloads and the report included', async () => {
    endedPage(json(200, { overview }));

    const region = await overviewRegion();
    const later = [
      screen.getByRole('group', { name: 'Downloads' }),
      screen.getByRole('region', { name: 'Report' }),
    ];
    for (const part of later) {
      expect(region.compareDocumentPosition(part) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe('the overview and its cards', () => {
  it('RF-264 lists each statement under its section with links to its cards', async () => {
    endedPage(json(200, { overview }));

    const region = await overviewRegion();
    const features = await within(region).findByRole('region', { name: 'Main features' });
    expect(features.textContent).toContain('Orders are placed at checkout.');
    const links = within(features).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['FEAT-001', 'ENT-001']);
    expect(links[0]?.getAttribute('href')).toBe(`/runs/${runUuid}/files/cards/FEAT/FEAT-001.md`);
    expect(within(region).getByText(/Vendor: third-party code/u)).toBeTruthy();
  });

  it('RF-264 links each question to the section of the overview it concerns and the link opens it', async () => {
    endedPage(json(200, { overview }));
    await overviewRegion();
    fireEvent.click(screen.getByRole('tab', { name: /^Your questions/u }));

    const link = await screen.findByRole('link', { name: 'Main features' });

    expect(link.getAttribute('href')).toBe('#overview-features');
    const second = screen.getAllByTestId('open-question')[1];
    expect(second?.querySelector('.rst-p168-concerns')).toBeNull();
    fireEvent.click(link);
    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(document.getElementById('overview-features')?.textContent).toBe('Main features');
  });
});

describe('the overview of a thin run or none', () => {
  it('RF-264 a thin overview says the run cannot explain the application and the next step', async () => {
    const thin = {
      state: 'thin',
      notice: 'This run cannot explain the application yet. Next step: run again.',
      sections: [],
      notCovered: [],
      questions: [],
    };
    endedPage(json(200, { overview: thin }), false);

    const notice = await screen.findByTestId('overview-notice');

    expect(notice.textContent).toContain('cannot explain the application yet');
    expect(notice.textContent).toContain('Next step');
  });

  it('RF-264 a run that wrote no overview says so instead of leaving a gap', async () => {
    endedPage(json(200, { overview: null }), false);

    await waitFor(() => {
      expect(screen.getByText('This run wrote no overview.')).toBeTruthy();
    });
  });

  it('RF-264 a failed read shows the error and the rest of the page stays', async () => {
    endedPage(failure(500, 'RST-1000'), true);

    const region = await overviewRegion();

    await waitFor(() => {
      expect(within(region).getByTestId('error-banner')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Your questions/u }));
    expect(await screen.findByRole('region', { name: 'Open questions' })).toBeTruthy();
  });
});

describe('the overview and hostile text', () => {
  it('RF-507 HTML, scripts and links in a statement are shown as text', async () => {
    const bad = {
      ...overview,
      sections: [
        {
          id: 'application',
          statements: [{ text: hostile, cards: [{ id: 'FEAT-001', type: 'FEAT' }] }],
        },
      ],
      notCovered: [hostile],
    };
    endedPage(json(200, { overview: bad }), false);

    const region = await overviewRegion();
    await waitFor(() => {
      expect(region.textContent).toContain('<script>window.__pwned = 1</script>');
    });

    expect(region.querySelector('script, img')).toBeNull();
    expect(region.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(Reflect.get(window, '__pwned')).toBeUndefined();
  });
});

describe('the overview and long text', () => {
  it('RF-507 a very long statement does not widen the page', async () => {
    const long = 'x'.repeat(5000);
    const wide = {
      ...overview,
      sections: [
        { id: 'users', statements: [{ text: long, cards: [{ id: 'FEAT-001', type: 'FEAT' }] }] },
      ],
    };
    endedPage(json(200, { overview: wide }), false);

    const region = await overviewRegion();

    await waitFor(() => {
      expect(region.textContent).toContain(long);
    });
    expect(region.querySelector('.rst-p168-statements')).not.toBeNull();
  });

  it('RF-264 a run that is not an understand run shows no overview', async () => {
    renderLive({
      [`GET ${runPath}`]: runRow({ stage: 'scan', queueState: 'Ended', endState: 'Completed' }),
    });

    await screen.findByTestId('run-status');

    expect(screen.queryByRole('region', { name: 'Overview of the application' })).toBeNull();
  });
});
