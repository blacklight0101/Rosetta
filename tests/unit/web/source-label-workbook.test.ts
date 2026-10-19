import { expect, it } from 'vitest';
import { sourceLabel } from '../../../web/src/lib/source-label.js';

// RF-150, RFC-005 section 4.9: how a workbook project reads in the list and the header.

const when = { fileName: 'Pricing.xlsx', uploadedAt: '2026-10-19T08:00:00.000Z' };

it('RF-150 a workbook project reads name (Excel, N workbooks, date)', () => {
  expect(
    sourceLabel({
      name: 'Pricing',
      sourceKind: 'workbook',
      source: { ...when, workbookCount: 3 },
    }),
  ).toBe('Pricing (Excel, 3 workbooks, 19 Oct 2026)');
});

it('RF-150 one workbook is singular', () => {
  expect(
    sourceLabel({ name: 'Pricing', sourceKind: 'workbook', source: { ...when, workbookCount: 1 } }),
  ).toBe('Pricing (Excel, 1 workbook, 19 Oct 2026)');
});

it('RF-150 a workbook project with no source says so, and a count not yet known is left out', () => {
  expect(sourceLabel({ name: 'Pricing', sourceKind: 'workbook', source: null })).toBe(
    'Pricing (Excel, no source)',
  );
  expect(sourceLabel({ name: 'Pricing', sourceKind: 'workbook', source: when })).toBe(
    'Pricing (Excel, 19 Oct 2026)',
  );
});

it('RF-128 the zip and GitHub labels are unchanged', () => {
  expect(sourceLabel({ name: 'a/b', sourceKind: 'github', source: null })).toBe('a/b');
  expect(sourceLabel({ name: 'OrderDesk', sourceKind: 'upload', source: when })).toBe(
    'OrderDesk (zip, 19 Oct 2026)',
  );
});
