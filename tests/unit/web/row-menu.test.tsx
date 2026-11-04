import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RowMenu } from '../../../web/src/components/RowMenu.js';

// RNF-010, RF-1012, P8-99, design-system.md section 14 (row menu): the menu of a table row opens whole in the
// viewport, above its button when it would end below, and closes on Escape wherever the focus is, on a click
// elsewhere and on choosing an item. A scroll or resize closes it only when the button moved: the event of a
// scroll that ended before the menu opened may still be on its way and must not close it.

const viewport = { width: 360, height: 780 };
let button = { top: 686, left: 275, width: 32, height: 32 };
const panelHeight = 80;
let chosen = 0;

const rect = (top: number, left: number, width: number, height: number): DOMRect =>
  ({
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) satisfies DOMRect;

beforeEach(() => {
  chosen = 0;
  button = { top: 686, left: 275, width: 32, height: 32 };
  vi.stubGlobal('innerWidth', viewport.width);
  vi.stubGlobal('innerHeight', viewport.height);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.getAttribute('role') === 'menu') return rect(button.top + 36, 131, 176, panelHeight);
    return rect(button.top, button.left, button.width, button.height);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderMenu(): HTMLElement {
  render(
    <div>
      <input aria-label="Elsewhere" />
      <RowMenu
        label="More actions for octo/demo"
        items={[
          {
            label: 'Project settings',
            onSelect: () => {
              chosen += 1;
            },
          },
          { label: 'Delete project…' },
        ]}
      />
    </div>,
  );
  return screen.getByRole('button', { name: 'More actions for octo/demo' });
}

const panel = (): HTMLElement => screen.getByRole('menu');

it('RNF-010 a menu that would end below the viewport opens above its button', () => {
  fireEvent.click(renderMenu());

  const top = Number.parseFloat(panel().style.top);
  expect(top + panelHeight).toBeLessThanOrEqual(button.top);
  expect(top).toBeGreaterThanOrEqual(0);
});

it('RNF-010 a menu with room below opens under its button', () => {
  button = { ...button, top: 100 };
  fireEvent.click(renderMenu());

  expect(Number.parseFloat(panel().style.top)).toBe(button.top + button.height + 4);
});

it('RNF-010 the first item holds the focus as soon as the menu is in the DOM', () => {
  fireEvent.click(renderMenu());

  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Project settings' }));
});

it('RF-1012 Escape closes the menu while the focus is elsewhere and returns it to the button', () => {
  const trigger = renderMenu();
  fireEvent.click(trigger);
  screen.getByLabelText('Elsewhere').focus();

  fireEvent.keyDown(document.body, { key: 'Escape' });

  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('RF-1012 a click elsewhere closes the menu', () => {
  fireEvent.click(renderMenu());

  fireEvent.mouseDown(screen.getByLabelText('Elsewhere'));

  expect(screen.queryByRole('menu')).toBeNull();
});

it('RF-1012 choosing an item closes the menu and runs it', () => {
  const trigger = renderMenu();
  fireEvent.click(trigger);

  fireEvent.click(screen.getByRole('menuitem', { name: 'Project settings' }));

  expect(screen.queryByRole('menu')).toBeNull();
  expect(chosen).toBe(1);
  expect(document.activeElement).toBe(trigger);
});

it('RNF-010 a scroll or resize event while the button has not moved leaves the menu open', () => {
  fireEvent.click(renderMenu());

  fireEvent.scroll(window);
  fireEvent(window, new Event('resize'));

  expect(screen.getByRole('menu')).toBeTruthy();
});

it('RNF-010 a scroll that moves the button closes the menu', () => {
  fireEvent.click(renderMenu());
  button = { ...button, top: button.top - 120 };

  fireEvent.scroll(window);

  expect(screen.queryByRole('menu')).toBeNull();
});

it('RNF-010 a resize that changes the viewport closes the menu', () => {
  fireEvent.click(renderMenu());
  vi.stubGlobal('innerHeight', 600);

  fireEvent(window, new Event('resize'));

  expect(screen.queryByRole('menu')).toBeNull();
});

it('RNF-010 focusing an item never scrolls the page under the menu', () => {
  const focus = vi.spyOn(HTMLElement.prototype, 'focus');

  fireEvent.click(renderMenu());
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });

  focus.mockClear();
  fireEvent.keyDown(panel(), { key: 'ArrowDown' });
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Delete project…' }));
  expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
});

type Held = readonly [EventTarget, string, unknown, boolean];

const captureOf = (options: unknown): boolean => {
  if (typeof options === 'object' && options !== null && 'capture' in options) {
    return options.capture === true;
  }
  return options === true;
};

/** Follows what the document and the window hold, as an element would be removed: same listener, same capture. */
function watchListeners(): () => string[] {
  const held: Held[] = [];
  for (const target of [document, window]) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
      held.push([target, type, listener, captureOf(options)]);
      add(type, listener, options);
    });
    vi.spyOn(target, 'removeEventListener').mockImplementation((type, listener, options) => {
      const removed: Held = [target, type, listener, captureOf(options)];
      const at = held.findIndex((one) => one.every((part, index) => part === removed[index]));
      if (at >= 0) held.splice(at, 1);
      remove(type, listener, options);
    });
  }
  return () =>
    held
      .filter(([, type]) => ['keydown', 'mousedown', 'resize', 'scroll'].includes(type))
      .map(([target, type]) => `${target === window ? 'window' : 'document'} ${type}`)
      .sort();
}

const closeWays: readonly (readonly [string, (trigger: HTMLElement) => void])[] = [
  ['Escape', () => fireEvent.keyDown(document.body, { key: 'Escape' })],
  ['a click elsewhere', () => fireEvent.mouseDown(screen.getByLabelText('Elsewhere'))],
  ['its button', (trigger) => fireEvent.click(trigger)],
  ['Tab', () => fireEvent.keyDown(panel(), { key: 'Tab' })],
  ['leaving the page', cleanup],
];

it.each(closeWays)('RNF-010 closing the menu by %s leaves no listener behind', (_way, closeIt) => {
  const held = watchListeners();
  const trigger = renderMenu();

  fireEvent.click(trigger);
  expect(held()).toEqual([
    'document keydown',
    'document mousedown',
    'window resize',
    'window scroll',
  ]);

  closeIt(trigger);

  expect(held()).toEqual([]);
});
