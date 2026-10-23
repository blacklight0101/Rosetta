import { screen } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { json } from './fake-api.js';
import { projectOf } from './project-fixtures.js';
import { projectPath } from './start-run-fixtures.js';
import { ready, renderStart } from './start-run-helpers.js';

// RF-150, RF-152, P3-108, EV-23: the source card of a workbook project says when its workbooks were
// rendered by an older renderer, because the original files are not kept and a scan cannot render them.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const notice = 'Rendered with an older renderer: upload the workbook again.';
const stored = { fileName: 'Pricing.xlsx', uploadedAt: '2026-10-19T08:00:00.000Z', workbooks: 3 };

async function open(older: boolean): Promise<void> {
  renderStart({
    [`GET ${projectPath}`]: json(
      200,
      projectOf('p-1', 'Pricing', {
        sourceKind: 'workbook',
        sourceUrl: '',
        source: stored,
        renderedWithOlderRenderer: older,
      }),
    ),
  });
  await ready();
}

it('P3-108 shows the older-renderer notice for workbooks rendered by an older renderer', async () => {
  await open(true);

  expect(screen.getByText(notice)).not.toBeNull();
});

it('P3-108 shows no notice for workbooks at the current renderer', async () => {
  await open(false);

  expect(screen.queryByText(notice)).toBeNull();
});
