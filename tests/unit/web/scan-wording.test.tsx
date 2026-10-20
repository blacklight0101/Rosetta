import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/live-run/journey.js';
import { AgentsGrid } from '../../../web/src/pages/AgentsGrid.js';
import { ev, startedData, stateAfter } from './live-run-fixtures.js';

// RF-150, RF-128 (P3-68): the scan texts of the run page name the code or workbooks for a zip or a
// workbook project, and keep "the repository" for a GitHub project.

const scanOf = (source: Record<string, unknown> | undefined) =>
  stateAfter(
    ev(1, 'run.started', {
      ...startedData,
      stage: 'scan',
      ...(source === undefined ? {} : { source }),
    }),
  );

const zip = { kind: 'upload', url: '', fileName: 'OrderDesk.zip', snapshotHash: null } as const;
const workbook = {
  kind: 'workbook',
  url: '',
  workbooks: ['Pricing.xlsx'],
  snapshotHash: null,
} as const;

const stepDetail = (state: ReturnType<typeof scanOf>): string | undefined =>
  journeyOf({ stage: 'scan', phase: { kind: 'running' }, state, tiles: [] })[0]?.detail;

it('RF-1015 the scan of a GitHub project reads the repository', () => {
  expect(stepDetail(scanOf(undefined))).toBe('reading the repository');
  render(<AgentsGrid state={scanOf(undefined)} />);
  expect(screen.getByText(/A scan reads the repository without a model\./u)).not.toBeNull();
});

it.each([
  ['a zip', zip],
  ['workbooks', workbook],
])('RF-1015 the scan of %s reads the code or workbooks, not the repository', (_name, source) => {
  expect(stepDetail(scanOf(source))).toBe('reading the code or workbooks');
  render(<AgentsGrid state={scanOf(source)} />);
  expect(screen.getByText(/A scan reads the code or workbooks without a model\./u)).not.toBeNull();
  expect(screen.queryByText(/repository/u)).toBeNull();
});
