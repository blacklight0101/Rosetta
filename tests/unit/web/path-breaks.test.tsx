import { render } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { BreakableText } from '../../../web/src/components/BreakableText.js';
import { breakablePieces } from '../../../web/src/lib/path-breaks.js';
import { toolText } from '../../../web/src/lib/live-run/tool-text.js';
import { formatCitationRef } from '../../../web/src/lib/live-run/citation-label.js';

// RNF-010, design-system.md section 10 (P3-62, owner test 2026-10-20): a long path wraps at "/" and
// before ":", never in the middle of a word; a citation of one line reads `file:27`.

describe('RNF-010 where a long path may wrap', () => {
  it('RNF-010 offers a break after each "/" and before the ":" of a line range', () => {
    expect(breakablePieces('Catalog/Models/Edit.aspx.cs:40-80')).toEqual([
      'Catalog/',
      'Models/',
      'Edit.aspx.cs',
      ':40-80',
    ]);
  });

  it('RNF-010 offers no break inside a plain word, and none at a colon that is not a line range', () => {
    expect(breakablePieces('reading')).toEqual(['reading']);
    expect(breakablePieces('failed: no such file')).toEqual(['failed: no such file']);
  });

  it('RNF-010 keeps the whole text when the pieces are joined', () => {
    const text = 'src/a/b.ts:1-2 and docs/x.md:7';

    expect(breakablePieces(text).join('')).toBe(text);
  });

  it('RNF-010 draws the pieces as one text with a wrap point between them, as text nodes', () => {
    const { container } = render(<BreakableText text="docs/dependencies.md:27" />);

    expect(container.textContent).toBe('docs/dependencies.md:27');
    expect(container.querySelectorAll('wbr')).toHaveLength(2);
    expect(container.querySelector('script')).toBeNull();
  });

  it('RF-507 shows markup in a path as text', () => {
    const { container } = render(<BreakableText text="a/<b>x</b>/c.ts" />);

    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('a/<b>x</b>/c.ts');
  });
});

describe('RF-1004 a citation of one line', () => {
  it('RF-1004 reads file:27, not file:27-27', () => {
    expect(formatCitationRef({ path: 'docs/dependencies.md', startLine: 27, endLine: 27 })).toBe(
      'docs/dependencies.md:27',
    );
  });

  it('RF-1004 keeps the range of several lines', () => {
    expect(formatCitationRef({ path: 'a.cs', startLine: 27, endLine: 30 })).toBe('a.cs:27-30');
  });
});

describe('RF-1002 a tool call on one line', () => {
  it('RF-1002 writes the range of one line as file:27, and several lines as file:27-30', () => {
    const one = { path: 'docs/dependencies.md', startLine: 27, endLine: 27 };

    expect(toolText('read_file', one)).toBe('read_file docs/dependencies.md:27');
    expect(toolText('read_file', { ...one, endLine: 30 })).toBe(
      'read_file docs/dependencies.md:27-30',
    );
  });
});
