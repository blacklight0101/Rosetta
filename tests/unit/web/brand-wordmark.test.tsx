import { render } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { AuthLayout } from '../../../web/src/components/AuthLayout.js';
import { Header } from '../../../web/src/components/Header.js';

// DEC-161, P1-181: the app header and the sign-in page show the 32 px icon (with its 2x source)
// before the live wordmark text. The name is written next to the icon, so the icon is decorative.

function expectIcon(root: HTMLElement): void {
  const icon = root.querySelector<HTMLImageElement>('a.rst-wordmark img');
  expect(icon?.getAttribute('src')).toBe('/assets/brand/rosetta-icon-32.png');
  expect(icon?.getAttribute('srcset')).toBe('/assets/brand/rosetta-icon-64.png 2x');
  expect(icon?.getAttribute('alt')).toBe('');
  expect(icon?.getAttribute('width')).toBe('32');
  expect(icon?.getAttribute('height')).toBe('32');
  expect(root.querySelector('a.rst-wordmark')?.textContent).toBe('Rosetta');
}

it('DEC-161 shows the icon and the wordmark text in the signed-in header', () => {
  const { container } = render(
    <Header user={{ displayName: 'Ana', role: 'user' }} theme="system" onTheme={() => undefined} />,
  );
  expectIcon(container);
});

it('DEC-161 shows the icon and the wordmark text on the sign-in page frame', () => {
  const { container } = render(<AuthLayout end={null}>body</AuthLayout>);
  expectIcon(container);
});
