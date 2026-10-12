import { fireEvent, render, screen, within } from '@testing-library/preact';
import { expect, it, vi } from 'vitest';
import { Shell } from '../../../web/src/components/Shell.js';
import type { NavGroup } from '../../../web/src/app/navigation.js';

// design-system.md sections 3 and 5: the signed-in shell is a header (wordmark, totals slot, user,
// theme toggle), side navigation in groups and the main region.

const navigation: readonly NavGroup[] = [
  {
    id: 'main',
    items: [
      { path: '/projects', label: 'Projects', current: true },
      { path: '/settings', label: 'Settings and keys', current: false },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [{ path: '/admin/users', label: 'Users and caps', current: false }],
  },
];
const user = { displayName: 'Ana Ruiz', role: 'user' } as const;

it('RNF-010 has a banner header, a labelled navigation and a main region', () => {
  render(
    <Shell user={user} navigation={navigation} theme="system" onTheme={vi.fn()}>
      <h1>Projects</h1>
    </Shell>,
  );
  expect(screen.getByRole('banner')).not.toBeNull();
  expect(screen.getByRole('navigation', { name: 'Main' })).not.toBeNull();
  expect(
    within(screen.getByRole('main')).getByRole('heading', { name: 'Projects' }),
  ).not.toBeNull();
});

it('RNF-010 offers a skip link to the main region first in the page', () => {
  render(
    <Shell user={user} navigation={navigation} theme="system" onTheme={vi.fn()}>
      <p>x</p>
    </Shell>,
  );
  const skip = screen.getByRole('link', { name: 'Skip to content' });
  expect(skip.getAttribute('href')).toBe(`#${screen.getByRole('main').id}`);
});

it('RF-1010 renders the totals slot in the header, beside the user', () => {
  render(
    <Shell
      user={user}
      navigation={navigation}
      theme="system"
      onTheme={vi.fn()}
      totals={<span data-testid="sample-totals">Your total</span>}
    >
      <p>x</p>
    </Shell>,
  );
  const slot = screen.getByTestId('header-totals');
  expect(within(slot).getByTestId('sample-totals')).not.toBeNull();
  expect(within(screen.getByRole('banner')).getByText('Ana Ruiz')).not.toBeNull();
});

it('RNF-010 shows the role of the user as a badge and the project repository when given', () => {
  render(
    <Shell
      user={{ displayName: 'BlackLigth', role: 'admin' }}
      repository="dotnet-architecture/eShopModernizing"
      navigation={navigation}
      theme="system"
      onTheme={vi.fn()}
    >
      <p>x</p>
    </Shell>,
  );
  expect(screen.getByTestId('status-badge').textContent).toBe('admin');
  expect(screen.getByTestId('header-repository').textContent).toBe(
    'dotnet-architecture/eShopModernizing',
  );
});

it('RNF-010 renders the navigation groups with a heading for the named ones only', () => {
  render(
    <Shell user={user} navigation={navigation} theme="system" onTheme={vi.fn()}>
      <p>x</p>
    </Shell>,
  );
  expect(screen.getByTestId('nav-group-main').querySelector('.rst-nav__heading')).toBeNull();
  expect(screen.getByTestId('nav-group-admin').textContent).toContain('Administration');
});

it('RNF-010 marks the current page with aria-current', () => {
  render(
    <Shell user={user} navigation={navigation} theme="system" onTheme={vi.fn()}>
      <p>x</p>
    </Shell>,
  );
  expect(screen.getByRole('link', { name: 'Projects' }).getAttribute('aria-current')).toBe('page');
  expect(
    screen.getByRole('link', { name: 'Settings and keys' }).getAttribute('aria-current'),
  ).toBeNull();
});

it('RNF-010 renders banners above the content', () => {
  render(
    <Shell
      user={user}
      navigation={navigation}
      theme="system"
      onTheme={vi.fn()}
      banners={<p data-testid="a-banner">Live updates paused</p>}
    >
      <p>x</p>
    </Shell>,
  );
  expect(within(screen.getByTestId('shell-banners')).getByTestId('a-banner')).not.toBeNull();
});

it('RNF-010 asks for the next theme when the toggle is pressed', () => {
  const onTheme = vi.fn();
  render(
    <Shell user={user} navigation={navigation} theme="system" onTheme={onTheme}>
      <p>x</p>
    </Shell>,
  );
  fireEvent.click(screen.getByRole('button', { name: /theme/i }));
  expect(onTheme).toHaveBeenCalledWith('light');
});
