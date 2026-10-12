import { fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { Link } from '../../../web/src/components/Link.js';

// RF-1200: `/` is the landing page, which the server renders (and which sends a signed-in visitor
// to their projects), so a link to it is a normal page load; other paths move within the page.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

it('RF-1200 leaves a click on a link to the landing page to the browser', () => {
  render(<Link href="/">Home</Link>);
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });

  screen.getByRole('link', { name: 'Home' }).dispatchEvent(click);

  expect(click.defaultPrevented).toBe(false);
});

it('RNF-010 moves within the page for a plain click on another path', () => {
  render(<Link href="/projects">Projects</Link>);

  fireEvent.click(screen.getByRole('link', { name: 'Projects' }));

  expect(window.location.pathname).toBe('/projects');
});
