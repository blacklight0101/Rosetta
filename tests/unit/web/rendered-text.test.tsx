import { render } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { RenderedText } from '../../../web/src/components/RenderedText';

// RF-507 rule 3: a fixture card containing <script>, an onerror attribute and a javascript: link.
// The browser end-to-end test repeats this in a real browser (P1-13); here the DOM is inspected.

const fixture =
  'Reads <script>window.pwned = true</script> and <img src=x onerror="window.pwned = true">. ' +
  '[open](javascript:window.pwned=true) or https://github.com/owner/repo/blob/abc/Orders.cs#L1-L9.';

describe('RF-507 rendering of repository and model text', () => {
  it('RF-507 renders markup in the text as text, with no element, handler or script', () => {
    const { container } = render(<RenderedText text={fixture} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.textContent).toContain('<script>window.pwned = true</script>');
    expect(container.textContent).toContain('onerror="window.pwned = true"');
    expect(Reflect.get(window, 'pwned')).toBeUndefined();
  });

  it('RF-507 keeps only the github.com link as an anchor and never a javascript: one', () => {
    const { container } = render(<RenderedText text={fixture} />);
    const anchors = [...container.querySelectorAll('a')];
    expect(anchors.map((anchor) => anchor.getAttribute('href'))).toEqual([
      'https://github.com/owner/repo/blob/abc/Orders.cs#L1-L9',
    ]);
    expect(anchors[0]?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.textContent).toContain('[open](javascript:window.pwned=true)');
  });
});
