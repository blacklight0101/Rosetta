import { render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GalleryPage } from '../../../web/src/gallery/GalleryPage';
import { stateLists } from '../../../web/src/components/badge-specs';

// P1-12 "Delivers": a component gallery page that renders every component in every state.

describe('RNF-010 component gallery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RNF-010 renders every component without a console error', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<GalleryPage />);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('RNF-010 shows a badge for every value of every state list', () => {
    render(<GalleryPage />);
    const expected = Object.values(stateLists).reduce((sum, values) => sum + values.length, 0);
    expect(screen.getAllByTestId('status-badge').length).toBeGreaterThanOrEqual(expected);
  });

  it('RNF-010 has a section for each shared component', () => {
    render(<GalleryPage />);
    for (const name of [
      'Buttons',
      'Fields',
      'Status badges',
      'Error banner',
      'Empty state',
      'Rendered text',
    ]) {
      expect(screen.getByRole('heading', { name })).not.toBeNull();
    }
  });
});
