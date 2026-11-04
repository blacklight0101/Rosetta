import { fireEvent, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-436, P8-57: the settings page says what the save did to "Parallel readers" when the reader left
// a local model, shows the value that was stored, and its help text states the rule.

const route = '/api/projects/p-1';
const settingsRoute = `${route}/settings`;
const demo = projectOf('p-1', 'octo/demo');
const line = 'Parallel readers set from 1 to 4, because the reader is no longer a local model.';

/** The project as the save answers it: the reader on Anthropic and the given parallel readers. */
function storedOnAnthropic(parallelism: number, extra: Record<string, unknown> = {}) {
  const template = templateSettings();
  return projectOf('p-1', 'octo/demo', {
    settingsVersion: 2,
    settings: {
      ...template,
      providers: {
        ...template.providers,
        anthropic: {
          kind: 'anthropic',
          keySource: 'user-then-server',
          toolMode: 'native',
          timeoutSeconds: 120,
          maxRetries: 3,
        },
      },
      roles: {
        ...template.roles,
        reader: { ...template.roles.reader, provider: 'anthropic', model: 'claude-haiku-4-5' },
      },
      agents: { parallelism },
    },
    ...extra,
  });
}

function renderSettings(answer: Response) {
  return renderPage(
    <ProjectSettingsPage />,
    { [`GET ${route}`]: json(200, demo), [`PUT ${settingsRoute}`]: answer },
    undefined,
    { projectId: 'p-1' },
  );
}

function readers(): HTMLInputElement {
  const field = screen.getByLabelText('Parallel readers');
  if (!(field instanceof HTMLInputElement)) throw new Error('Parallel readers is not an input.');
  return field;
}

async function switchReaderToAnthropicAndSave(): Promise<void> {
  await screen.findByRole('heading', { name: 'Project settings' });
  fireEvent.change(screen.getByLabelText('Reader provider'), { target: { value: 'anthropic' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
}

it('RF-436 after a switch from Ollama to Haiku with 1 reader the page shows the line and the stored 4', async () => {
  renderSettings(json(200, storedOnAnthropic(4, { parallelismChange: { from: 1, to: 4 } })));

  await switchReaderToAnthropicAndSave();

  await screen.findByText(line);
  expect(screen.getByText('Settings saved.')).not.toBeNull();
  expect(readers().value).toBe('4');
});

it('RF-436 the page says nothing about parallel readers when the save changed nothing', async () => {
  renderSettings(json(200, storedOnAnthropic(1)));

  await switchReaderToAnthropicAndSave();

  await screen.findByText('Settings saved.');
  expect(screen.queryByText(/Parallel readers set from/u)).toBeNull();
  expect(readers().value).toBe('1');
});

it('RF-436 the line goes away with the next edit, and the saved message with it', async () => {
  renderSettings(json(200, storedOnAnthropic(4, { parallelismChange: { from: 1, to: 4 } })));
  await switchReaderToAnthropicAndSave();
  await screen.findByText(line);

  fireEvent.input(screen.getByLabelText('Parallel readers'), { target: { value: '2' } });

  expect(screen.queryByText(line)).toBeNull();
  expect(screen.queryByText('Settings saved.')).toBeNull();
  expect(readers().value).toBe('2');
});

it('RF-436 an edit put back to the saved values does not bring the line or the saved message back', async () => {
  renderSettings(json(200, storedOnAnthropic(4, { parallelismChange: { from: 1, to: 4 } })));
  await switchReaderToAnthropicAndSave();
  await screen.findByText(line);

  fireEvent.input(screen.getByLabelText('Parallel readers'), { target: { value: '2' } });
  fireEvent.input(screen.getByLabelText('Parallel readers'), { target: { value: '4' } });

  expect(screen.queryByText(line)).toBeNull();
  expect(screen.queryByText('Settings saved.')).toBeNull();
  expect(readers().value).toBe('4');
});

it('RF-436 the help text of Parallel readers states the rule', async () => {
  renderSettings(json(200, demo));
  await screen.findByRole('heading', { name: 'Project settings' });

  const help = (readers().getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

  expect(help).toContain(
    'A local reader defaults to 1; switching to a hosted provider while it is still 1 makes it 4; a value other than 1 is never changed.',
  );
});
