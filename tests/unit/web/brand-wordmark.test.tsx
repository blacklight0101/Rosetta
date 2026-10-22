import { render } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { AuthLayout } from '../../../web/src/components/AuthLayout.js';
import { Header } from '../../../web/src/components/Header.js';

// DEC-161, P1-181: the app header and the sign-in page show the 32 px icon (with its 2x source)
// before the live wordmark text. The name is written next to the icon, so the icon is decorative.

const expected = {
  src: '/assets/brand/rosetta-icon-32.png',
  srcset: '/assets/brand/rosetta-icon-64.png 2x',
  alt: '',
  width: '32',
  height: '32',
};

function iconOf(root: Element): Record<string, string | null> | undefined {
  const icon = root.querySelector('a.rst-wordmark img');
  if (icon === null) return undefined;
  return Object.fromEntries(Object.keys(expected).map((name) => [name, icon.getAttribute(name)]));
}

it('DEC-161 shows the icon and the wordmark text in the signed-in header', () => {
  const { container } = render(
    <Header user={{ displayName: 'Ana', role: 'user' }} theme="system" onTheme={() => undefined} />,
  );

  expect(iconOf(container)).toEqual(expected);
  expect(container.querySelector('a.rst-wordmark')?.textContent).toBe('Rosetta');
});

it('DEC-161 shows the icon and the wordmark text on the sign-in page frame', () => {
  const { container } = render(<AuthLayout end={null}>body</AuthLayout>);

  expect(iconOf(container)).toEqual(expected);
  expect(container.querySelector('a.rst-wordmark')?.textContent).toBe('Rosetta');
});
