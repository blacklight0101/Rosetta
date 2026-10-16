import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import {
  agentStarted,
  ev,
  planned,
  startedData,
  toolCalled,
  toolResult,
} from './live-run-fixtures.js';
import { renderLive } from './live-run-helpers.js';
import { openTabWhenReady } from './live-run-running-helpers.js';

// RF-1005, DEC-51 (P1-38): the coverage map on the live run page fills in from the `read_file`
// events the test pushes into the fake stream: per area a tree of the files read and the area's
// share of the files read, as a meter.

afterEach(() => {
  vi.unstubAllGlobals();
});

const coverage = (): HTMLElement => screen.getByRole('region', { name: 'Coverage map' });
const areaOf = (area: string): HTMLElement =>
  within(coverage()).getByRole('region', { name: `Coverage of ${area}` });

it('RF-1005 shows every planned area, empty, before any file is read', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();
  await openTabWhenReady('All agents');

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(planned(3, 'reader-002', 'Services'));

  await screen.findByRole('region', { name: 'Coverage map' });
  await waitFor(() => {
    expect(areaOf('Services').textContent).toContain('No files read yet');
  });
  expect(areaOf('Catalog').textContent).toContain('No files read yet');
  expect(coverage().textContent).toContain('0 files read');
});

it('RF-1005 fills in the tree of an area and its read share as files are read', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();
  await openTabWhenReady('All agents');

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(planned(3, 'reader-002', 'Services'));
  connection.event(agentStarted(4, 'reader-001', 'Catalog'));
  connection.event(toolCalled(5, 'reader-001', { path: 'Catalog/Views/Edit.aspx' }));
  connection.event(toolResult(6, 'reader-001', true));
  connection.event(toolCalled(7, 'reader-001', { path: 'Catalog/Details.aspx.cs' }));
  connection.event(toolResult(8, 'reader-001', true));
  connection.event(toolCalled(9, 'reader-002', { path: 'Services/CatalogService.cs' }));
  connection.event(toolResult(10, 'reader-002', true));
  connection.event(toolCalled(11, 'reader-002', { path: 'Services/Other.cs' }));

  await waitFor(() => {
    expect(within(areaOf('Services')).getByText('CatalogService.cs')).toBeTruthy();
  });
  const catalog = areaOf('Catalog');
  expect(within(catalog).getByText('Edit.aspx')).toBeTruthy();
  const folders = within(catalog).getAllByRole('list');
  expect(folders.length).toBe(3);
  expect(within(catalog).getByText('Details.aspx.cs')).toBeTruthy();
  expect(catalog.textContent).toContain('2 files read');
  const catalogMeter = within(catalog).getByRole('meter', { name: 'Read share of Catalog' });
  expect(catalogMeter.getAttribute('aria-valuenow')).toBe('67');
  const services = areaOf('Services');
  expect(within(services).queryByText('Other.cs')).toBeNull();
  const servicesMeter = within(services).getByRole('meter', { name: 'Read share of Services' });
  expect(servicesMeter.getAttribute('aria-valuenow')).toBe('33');
  expect(coverage().textContent).toContain('3 files read in 2 areas');
});

it('RF-1005 a scan run has no coverage map', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();
  await openTabWhenReady('All agents');

  connection.event(ev(1, 'run.started', { ...startedData, stage: 'scan' }));

  await screen.findByText(/This run has no agents/u);
  expect(screen.queryByRole('region', { name: 'Coverage map' })).toBeNull();
});

it('RF-1005 RF-1002 the coverage map is held while updates are paused and applies the held reads on Resume', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();
  await openTabWhenReady('All agents');
  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(planned(3, 'reader-002', 'Services'));
  connection.event(agentStarted(4, 'reader-001', 'Catalog'));
  connection.event(toolCalled(5, 'reader-001', { path: 'Catalog/Edit.aspx' }));
  connection.event(toolResult(6, 'reader-001', true));
  await waitFor(() => {
    expect(within(areaOf('Catalog')).getByText('Edit.aspx')).toBeTruthy();
  });
  const before = coverage().innerHTML;
  fireEvent.click(screen.getByRole('button', { name: 'Pause updates' }));

  connection.event(toolCalled(7, 'reader-001', { path: 'Catalog/Details.aspx.cs' }));
  connection.event(toolResult(8, 'reader-001', true));
  connection.event(toolCalled(9, 'reader-002', { path: 'Services/CatalogService.cs' }));
  connection.event(toolResult(10, 'reader-002', true));

  await waitFor(() => {
    expect(screen.getByTestId('pause-count').textContent).toContain('4 events waiting');
  });
  expect(coverage().innerHTML).toBe(before);
  expect(within(areaOf('Catalog')).queryByText('Details.aspx.cs')).toBeNull();
  expect(within(areaOf('Services')).queryByText('CatalogService.cs')).toBeNull();
  expect(coverage().textContent).toContain('1 file read in 1 area');

  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

  await waitFor(() => {
    expect(within(areaOf('Services')).getByText('CatalogService.cs')).toBeTruthy();
  });
  expect(within(areaOf('Catalog')).getByText('Details.aspx.cs')).toBeTruthy();
  expect(coverage().textContent).toContain('3 files read in 2 areas');
});
