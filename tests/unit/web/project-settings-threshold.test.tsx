import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { failure, json, renderPage } from './fake-api.js';
import { projectOf } from './project-fixtures.js';

// RF-436, DEC-117, P8-16: the server refuses a run cap below the confirm threshold and the refusal
// shows next to the threshold field with its code (the start page no longer holds the caps).

const route = '/api/projects/p-1';
const settingsRoute = `${route}/settings`;

it('RF-436 DEC-117 a run cap below the confirm threshold is refused next to the threshold field with its code', async () => {
  const { calls } = renderPage(
    <ProjectSettingsPage />,
    {
      [`GET ${route}`]: json(200, projectOf('p-1', 'octo/demo')),
      [`PUT ${settingsRoute}`]: failure(400, 'RST-1005', [
        { field: 'budget.confirmAboveCostMicros', code: 'RST-1003' },
      ]),
    },
    undefined,
    { projectId: 'p-1' },
  );
  await screen.findByRole('heading', { name: 'Project settings' });
  fireEvent.input(screen.getByLabelText('Run cost cap (USD)'), { target: { value: '0.20' } });

  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  const threshold = screen.getByLabelText('Ask before a run estimated above (USD)');
  await waitFor(() => {
    expect(threshold.getAttribute('aria-invalid')).toBe('true');
  });
  const described = (threshold.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
  expect(described).toContain('RST-1003');
  expect(screen.getByLabelText('Run cost cap (USD)').getAttribute('aria-invalid')).not.toBe('true');
  expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
  expect(screen.queryByText('Settings saved.')).toBeNull();
  expect(screen.queryAllByRole('alert')).toEqual([]);
});
