import { fireEvent, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-423, RF-422, P2-26: a role cap is stored in budget.roles and has no field on the settings
// page. A stored role cap above the run cap never applies (the run cap stops the run first), so
// the page says so next to the caps, and the notice follows the run cap as it is typed.

const route = '/api/projects/p-1';

/** A project whose stored settings give the reader a role cap of `roles` (micros and tokens). */
function withRoles(roles: Record<string, { maxCostMicros?: number; maxTokens?: number }>) {
  const base = templateSettings();
  return projectOf('p-1', 'octo/demo', {
    settings: { ...base, budget: { ...base.budget, roles } },
  });
}

function renderWith(roles: Record<string, { maxCostMicros?: number; maxTokens?: number }>) {
  return renderPage(
    <ProjectSettingsPage />,
    { [`GET ${route}`]: json(200, withRoles(roles)) },
    undefined,
    {
      projectId: 'p-1',
    },
  );
}

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });

function type(label: string, value: string): void {
  const field = screen.getByLabelText(label, { exact: true });
  fireEvent.input(field, { target: { value } });
}

const costNotice =
  'Reader cost cap of $1.00 is above the run cost cap of $0.50, so the run cap always stops first.';
const tokenNotice =
  'Reader token cap of 3,000,000 is above the run token cap of 2,000,000, so the run cap always stops first.';

it('RF-423 a stored role cost cap above the run cost cap shows a notice', async () => {
  renderWith({ reader: { maxCostMicros: 1_000_000 } });
  await loaded();

  expect(screen.getByText(costNotice)).not.toBeNull();
});

it('RF-423 a stored role token cap above the run token cap shows a notice', async () => {
  renderWith({ reader: { maxTokens: 3_000_000 } });
  await loaded();

  expect(screen.getByText(tokenNotice)).not.toBeNull();
});

it('RF-423 a role cap at or below the run cap shows no notice', async () => {
  renderWith({ reader: { maxCostMicros: 500_000, maxTokens: 1_000 } });
  await loaded();

  expect(screen.queryByText(/always stops first/u)).toBeNull();
});

it('RF-423 the notice follows the run cap as it is typed', async () => {
  renderWith({ reader: { maxCostMicros: 1_000_000 } });
  await loaded();

  type('Run cost cap (USD)', '2');
  expect(screen.queryByText(costNotice)).toBeNull();

  type('Run cost cap (USD)', '0.25');
  expect(
    screen.getByText(
      'Reader cost cap of $1.00 is above the run cost cap of $0.25, so the run cap always stops first.',
    ),
  ).not.toBeNull();
});

// RF-423, P2-26: a token cap equal to the run cap is not above it, so no notice.
it('RF-423 a role token cap equal to the run token cap shows no notice', async () => {
  renderWith({ reader: { maxTokens: 2_000_000 } });
  await loaded();

  expect(screen.queryByText(/always stops first/u)).toBeNull();
});

// RF-423, P2-26: a negative run cap gives no role notices at all (never "$-1").
it('RF-423 a negative run cost cap shows no role notice', async () => {
  renderWith({ reader: { maxCostMicros: 1_000_000 } });
  await loaded();

  type('Run cost cap (USD)', '-1');

  expect(screen.queryByText(/always stops first/u)).toBeNull();
});

// RF-423, P2-26: both sides of the notice are written at the same precision.
it('RF-423 a cost cap a fraction of a cent above the run cap names both sides in the same form', async () => {
  renderWith({ reader: { maxCostMicros: 1_004_000 } });
  await loaded();

  type('Run cost cap (USD)', '1');

  expect(
    screen.getByText(
      'Reader cost cap of $1.004 is above the run cost cap of $1.00, so the run cap always stops first.',
    ),
  ).not.toBeNull();
});
