import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { failure, json, type Answer, type RenderedPage } from './fake-api.js';
import { openEnded } from './ended-run-helpers.js';
import { projectOf } from './project-fixtures.js';
import {
  cloudRoles,
  deepenEstimate,
  estimatePath,
  measures,
  startPath,
  understanding,
  understandingPath,
} from './understanding-fixtures.js';

// RF-209, RF-143, RF-132, DEC-209 (P8-79): the Deepen panel reads the project, so on a project of
// kind `upload` or `workbook` whose roles send code to a cloud provider it shows the private-code
// confirmation from the start, beside the cloud consent: Start Deepen waits for both, the start
// sends it and is never refused for a box that was not shown. A GitHub project, or roles that are
// all local, show no such box. When the project cannot be read, the box shows once the server asks
// for it (RST-1521).

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const projectPath = '/api/projects/p-1';
const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });
const posts = (page: Pick<RenderedPage, 'calls'>) =>
  page.calls.filter((call) => call.method === 'POST' && call.path.endsWith('/deepen'));
const consentBox = /I understand; send masked excerpts to/u;
const noticeName = /private\.$/u;
const codeBox = /^I understand that my own code from OrderDesk will be sent to OpenAI$/u;
const workbookBox = /^I understand that cell values, formulas and macros from Ledger/u;
const fallbackBox = /my own code from this project/u;
const switchName = /every role to Ollama/u;
const accepted = json(202, { id: 'run-new', stage: 'understand' });
const upload = projectOf('p-1', 'OrderDesk', { sourceKind: 'upload', sourceUrl: '', source: null });

const startButton = (): HTMLButtonElement => {
  const button = screen.getByRole('button', { name: 'Start Deepen' });
  if (!(button instanceof HTMLButtonElement)) throw new Error('Not a button.');
  return button;
};

interface Served {
  readonly project?: Answer;
  readonly estimate?: Answer;
  readonly start?: Answer;
  readonly more?: Readonly<Record<string, Answer>>;
}

async function opened(served: Served) {
  const page = await openEnded({
    extra: {
      [understandingPath]: understanding(measures()),
      [estimatePath]: served.estimate ?? deepenEstimate({ roles: cloudRoles }),
      [startPath]: served.start ?? accepted,
      ...(served.project === undefined ? {} : { [`GET ${projectPath}`]: served.project }),
      ...served.more,
    },
  });
  fireEvent.click(await within(turn()).findByRole('button', { name: 'Deepen this run' }));
  await screen.findByTestId('deepen-first-round');
  return page;
}

async function confirmStart(): Promise<void> {
  fireEvent.click(startButton());
  const dialog = await screen.findByRole('dialog', { name: 'Start this Deepen?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and start' }));
}

describe('RF-209 the private-code box of the Deepen panel', () => {
  it('RF-209 a zip project shows the private-code box before the first start and holds Start for it', async () => {
    const page = await opened({ project: json(200, upload) });

    const box = await screen.findByLabelText(codeBox);
    expect(screen.getByRole('region', { name: noticeName }).textContent).toContain('OrderDesk');
    fireEvent.click(screen.getByLabelText(consentBox));
    expect(startButton().disabled).toBe(true);
    expect(startButton().title).toContain('private code');
    fireEvent.click(box);
    expect(startButton().disabled).toBe(false);
    await confirmStart();

    await waitFor(() => {
      expect(posts(page)).toHaveLength(1);
    });
    expect(posts(page)[0]?.body).toMatchObject({ cloudConsent: true, privateCodeConfirmed: true });
  });

  it('RF-209 a workbook project shows the box with the workbook wording', async () => {
    const ledger = projectOf('p-1', 'Ledger', { sourceKind: 'workbook', sourceUrl: '' });
    await opened({ project: json(200, ledger) });

    expect(await screen.findByLabelText(workbookBox)).toBeTruthy();
  });
});

describe('RF-209 where the Deepen panel shows no private-code box', () => {
  it('RF-209 a GitHub project shows no private-code box and sends no such field', async () => {
    const page = await opened({ project: json(200, projectOf('p-1', 'OrderDesk')) });
    await waitFor(() => {
      expect(page.calls.some((call) => call.path === projectPath)).toBe(true);
    });

    fireEvent.click(screen.getByLabelText(consentBox));
    expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
    await confirmStart();

    await waitFor(() => {
      expect(posts(page)).toHaveLength(1);
    });
    expect(posts(page)[0]?.body).not.toHaveProperty('privateCodeConfirmed');
  });

  it('RF-209 a zip project whose roles are all local shows no private-code box', async () => {
    const page = await opened({ project: json(200, upload), estimate: deepenEstimate() });
    await waitFor(() => {
      expect(page.calls.some((call) => call.path === projectPath)).toBe(true);
    });

    expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
    expect(startButton().disabled).toBe(false);
  });
});

describe('RF-209 the switch to Ollama in the Deepen panel', () => {
  it('RF-209 the switch to Ollama saves every role on Ollama and reads the estimate again', async () => {
    let saved = false;
    const page = await opened({
      project: () => json(200, upload),
      estimate: () => (saved ? deepenEstimate() : deepenEstimate({ roles: cloudRoles })),
      more: {
        [`PUT ${projectPath}/settings`]: () => {
          saved = true;
          return json(200, upload);
        },
      },
    });
    const notice = await screen.findByRole('region', { name: noticeName });

    fireEvent.click(within(notice).getByRole('button', { name: switchName }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
    });
    expect(page.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
    expect(screen.queryByLabelText(consentBox)).toBeNull();
  });
});

describe('RF-209 the switch to Ollama and the private-code tick', () => {
  it('RF-209 the switch to Ollama clears the private code tick, so the start does not send it', async () => {
    let saved = false;
    const page = await opened({
      project: () => json(200, upload),
      estimate: () => (saved ? deepenEstimate() : deepenEstimate({ roles: cloudRoles })),
      more: {
        [`PUT ${projectPath}/settings`]: () => {
          saved = true;
          return json(200, upload);
        },
      },
    });
    fireEvent.click(await screen.findByLabelText(codeBox));
    const notice = screen.getByRole('region', { name: noticeName });

    fireEvent.click(within(notice).getByRole('button', { name: switchName }));
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: noticeName })).toBeNull();
      expect(startButton().disabled).toBe(false);
    });
    await confirmStart();

    await waitFor(() => {
      expect(posts(page)).toHaveLength(1);
    });
    expect(posts(page)[0]?.body).not.toHaveProperty('privateCodeConfirmed');
  });
});

describe('RF-132 when the project cannot be read', () => {
  it('RF-132 shows the private-code box once the server asks, holds Start and then sends it', async () => {
    const answer: Answer = (call) => {
      const given =
        typeof call.body === 'object' && call.body !== null && 'privateCodeConfirmed' in call.body;
      return given ? accepted : failure(400, 'RST-1521');
    };
    const page = await opened({ start: answer });
    fireEvent.click(screen.getByLabelText(consentBox));
    expect(screen.queryByLabelText(fallbackBox)).toBeNull();

    await confirmStart();
    const box = await screen.findByLabelText(fallbackBox);

    expect(startButton().disabled).toBe(true);
    fireEvent.click(box);
    await confirmStart();
    await waitFor(() => {
      expect(posts(page).at(-1)?.body).toMatchObject({
        cloudConsent: true,
        privateCodeConfirmed: true,
      });
    });
  });
});
