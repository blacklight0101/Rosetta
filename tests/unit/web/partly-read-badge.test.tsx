import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { RunEndBadge } from '../../../web/src/components/RunEndBadge.js';
import { StatusBadge } from '../../../web/src/components/StatusBadge.js';

// P7-02, DEC-194, design-system section 6: a capped run that left areas unread reads "Partly read".

it('P7-02 shows Partly read for a CapReached run with unread areas', () => {
  render(<RunEndBadge endState="CapReached" unreadAreas={3} />);

  expect(screen.getByTestId('status-badge').textContent).toBe('Partly read');
});

it('P7-02 shows Cap reached for a CapReached run that read every area', () => {
  render(<RunEndBadge endState="CapReached" unreadAreas={0} />);

  expect(screen.getByTestId('status-badge').textContent).toBe('Cap reached');
});

it('P7-02 gives Partly read the warn tone with a glyph', () => {
  render(<StatusBadge list="RunPartlyRead" value="PartlyRead" />);
  const badge = screen.getByTestId('status-badge');

  expect(badge.getAttribute('data-tone')).toBe('warn');
  expect(badge.querySelector('svg')).not.toBeNull();
});

// RF-230 (P8-93, UX-23, artboard P8Run): a run that ended with areas read below the coverage bar
// reads "Partly read: 16% of your code" beside its title, also when it ended Completed.

it('RF-230 a Completed run with partly read areas shows the percent of the code read', () => {
  render(<RunEndBadge endState="Completed" partlyReadAreas={2} readShare={0.16} />);

  expect(screen.getByTestId('status-badge').textContent).toBe('Partly read: 16% of your code');
});

it('RF-230 the badge says only Partly read while the share of the code is not known', () => {
  render(<RunEndBadge endState="Completed" partlyReadAreas={1} readShare={undefined} />);

  expect(screen.getByTestId('status-badge').textContent).toBe('Partly read');
});

it('RF-230 a run that read above the bar keeps Completed', () => {
  render(<RunEndBadge endState="Completed" partlyReadAreas={0} readShare={0.95} />);

  expect(screen.getByTestId('status-badge').textContent).toBe('Completed');
});

it('RF-230 a run that failed keeps Failed whatever the coverage says', () => {
  render(<RunEndBadge endState="Failed" partlyReadAreas={2} readShare={0.16} />);

  expect(screen.getByTestId('status-badge').textContent).toBe('Failed');
});
