import { act, fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { expect, it } from 'vitest';
import { useFold } from '../../../web/src/pages/use-fold.js';

// RF-1021, P8-114 (#1219): a fold the page opens by itself (the scan runs, the journey starts again)
// follows the page again when the page stops asking for it; a fold the user opened or closed by hand
// keeps the user's choice. The browser fires `toggle` for both kinds of change, so the hook tells them
// apart by comparing the element with the state the page just rendered.
// P8-128 (#1247): the tests read the `open` the hook returns, not only the element the test flipped.

function Probe() {
  const [auto, setAuto] = useState(false);
  const fold = useFold(auto);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setAuto(!auto);
        }}
      >
        Page asks
      </button>
      <details open={fold.open} onToggle={fold.onToggle} data-testid="fold">
        <summary>Fold</summary>
      </details>
      <output data-testid="hook-open">{String(fold.open)}</output>
    </div>
  );
}

const fold = (): HTMLDetailsElement => {
  const element = screen.getByTestId('fold');
  if (!(element instanceof HTMLDetailsElement)) throw new Error('not a details element');
  return element;
};

/** The `open` the hook returned on the last render. */
const hookOpen = (): boolean => screen.getByTestId('hook-open').textContent === 'true';

/** What the browser does after the page set `open`: it fires `toggle` with the element as it is. */
const browserFiresToggle = (): void => {
  fireEvent(fold(), new Event('toggle'));
};

/** The user clicks the summary: the element flips, then the browser fires `toggle`. */
const userToggles = (open: boolean): void => {
  void act(() => {
    fold().open = open;
    browserFiresToggle();
  });
};

const pageAsks = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Page asks' }));
};

it('RF-1021 P8-114 a fold the page opened by itself closes again when the page stops asking', () => {
  render(<Probe />);

  pageAsks();
  browserFiresToggle();
  expect(hookOpen()).toBe(true);
  expect(fold().open).toBe(true);

  pageAsks();
  browserFiresToggle();

  expect(hookOpen()).toBe(false);
  expect(fold().open).toBe(false);
});

it('RF-1021 P8-114 a fold the user opened stays open when the page stops asking', () => {
  render(<Probe />);
  pageAsks();
  browserFiresToggle();

  userToggles(false);
  expect(hookOpen()).toBe(false);
  userToggles(true);
  expect(hookOpen()).toBe(true);
  pageAsks();
  browserFiresToggle();

  expect(hookOpen()).toBe(true);
  expect(fold().open).toBe(true);
});

it('RF-1021 P8-114 a fold the user closed stays closed when the page asks for it open', () => {
  render(<Probe />);

  userToggles(true);
  expect(hookOpen()).toBe(true);
  userToggles(false);
  expect(hookOpen()).toBe(false);
  pageAsks();
  browserFiresToggle();

  expect(hookOpen()).toBe(false);
  expect(fold().open).toBe(false);
});

it('RF-1021 P8-114 a fold the user opened while the page did not ask keeps open through a page ask and release', () => {
  render(<Probe />);

  userToggles(true);
  expect(hookOpen()).toBe(true);
  pageAsks();
  browserFiresToggle();
  pageAsks();
  browserFiresToggle();

  expect(hookOpen()).toBe(true);
  expect(fold().open).toBe(true);
});

it('RF-1021 P8-128 a user flip that lands before the toggle of the page own change is read as the user choice', () => {
  render(<Probe />);

  // The page opens the fold; before the browser fires that `toggle`, the user closes it again. The
  // browser folds both changes into one `toggle`, fired with the element as the user left it.
  pageAsks();
  void act(() => {
    fold().open = false;
  });
  browserFiresToggle();
  expect(hookOpen()).toBe(false);

  pageAsks();
  browserFiresToggle();
  pageAsks();
  browserFiresToggle();

  expect(hookOpen()).toBe(false);
  expect(fold().open).toBe(false);
});
