import { fireEvent, screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { failure, json } from './fake-api.js';
import { cloudEstimate, cloudProject, savedBrief } from './plan-setup-fixtures.js';
import { base, ready, renderPlan } from './plan-setup-helpers.js';
import { projectOf } from './project-fixtures.js';

// RST-1521, EV-86, P8-11: the options call of Plan setup refused for the private code confirmation
// names the screen that fixes it (this one), not the run's "Start the run again".

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const uploadCloud = projectOf('p-1', 'OrderDesk', {
  sourceKind: 'upload',
  sourceUrl: '',
  settings: cloudProject['settings'],
});

it('P8-11 EV-86 the refused options call says to tick the confirmation on Plan setup', async () => {
  renderPlan({
    [`GET ${base}/planning-brief`]: json(200, savedBrief),
    [`GET ${base}`]: json(200, uploadCloud),
    [`GET ${base}/plan-estimate`]: json(200, cloudEstimate),
    [`POST ${base}/plan-options`]: failure(400, 'RST-1521'),
  });
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Architecture' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /I understand; send masked excerpts/u }));
  fireEvent.click(screen.getByRole('checkbox', { name: /^I understand that my own code from/u }));

  const banner = await screen.findByTestId('error-banner');

  expect(banner.textContent).toContain('Plan setup');
  expect(banner.textContent).not.toContain('Start the run again');
});
