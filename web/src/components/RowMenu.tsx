import type { JSX, RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

// design-system.md section 14 (History, row menu), P8-89: the "More actions" button of a table row and the
// menu it opens. The button has `aria-haspopup="menu"` and `aria-expanded`; the menu holds links and buttons
// as `menuitem`. ArrowDown or ArrowUp on the button opens it (at the first or the last item); the arrows,
// Home and End move within it. Escape (wherever the focus is), a click elsewhere, a scroll or resize that
// moves the button, or leaving the menu with Tab closes it, and the focus returns to the button so that a
// dialog an item opens gives it back there. The panel opens under the button, or above it when it would end
// below the viewport. An item that cannot be used is `aria-disabled` and says why under its name. The panel is `position: fixed`, so the scrolling box
// of a table never clips it.

export interface RowMenuItem {
  readonly label: string;
  /** A link, for a download or a page. */
  readonly href?: string;
  readonly download?: boolean;
  readonly onSelect?: () => void;
  /** Why the item cannot be used now; its presence disables it. */
  readonly disabledReason?: string;
  readonly danger?: boolean;
}

export interface RowMenuProps {
  /** The accessible name of the button: "More actions for run 2026...". */
  readonly label: string;
  readonly items: readonly RowMenuItem[];
}

interface Place {
  readonly top: number;
  readonly right: number;
}

function Item(props: { readonly item: RowMenuItem; readonly choose: () => void }): JSX.Element {
  const { item, choose } = props;
  const cls = `rst-menu__item${item.danger === true ? ' rst-menu__item--danger' : ''}`;
  if (item.disabledReason !== undefined) {
    return (
      <button
        type="button"
        role="menuitem"
        class={cls}
        aria-disabled="true"
        title={item.disabledReason}
      >
        {item.label}
        <span class="rst-menu__reason">{item.disabledReason}</span>
      </button>
    );
  }
  if (item.href !== undefined) {
    return (
      <a
        role="menuitem"
        class={cls}
        href={item.href}
        download={item.download === true ? true : undefined}
        onClick={choose}
      >
        {item.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      class={cls}
      onClick={() => {
        choose();
        item.onSelect?.();
      }}
    >
      {item.label}
    </button>
  );
}

type Target = 'next' | 'previous' | 'first' | 'last';

function itemsOf(menu: HTMLElement | null): HTMLElement[] {
  return [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
}

function focusItem(menu: HTMLElement | null, target: Target): void {
  const items = itemsOf(menu);
  const at = items.findIndex((item) => item === document.activeElement);
  const index = {
    first: 0,
    last: items.length - 1,
    next: (at + 1) % items.length,
    previous: (at - 1 + items.length) % items.length,
  }[target];
  // The panel is fixed and already in view: focusing an item must not scroll the page under it.
  items[index]?.focus({ preventScroll: true });
}

const MENU_KEYS: Readonly<Record<string, Target>> = {
  ArrowDown: 'next',
  ArrowUp: 'previous',
  Home: 'first',
  End: 'last',
};

interface Popup {
  readonly place: Place | undefined;
  readonly trigger: RefObject<HTMLButtonElement | null>;
  readonly menu: RefObject<HTMLDivElement | null>;
  readonly toggle: () => void;
  /** Opens the menu and puts the focus on its first or its last item. */
  readonly openAt: (first: 'first' | 'last') => void;
  readonly closeAndReturn: () => void;
  readonly close: () => void;
}

/** Where the button stood, and how big the viewport was, when the menu opened. */
interface Anchor {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

function anchorOf(button: HTMLElement): Anchor {
  const { top, left } = button.getBoundingClientRect();
  return { top, left, width: window.innerWidth, height: window.innerHeight };
}

/** True when the button or the viewport is not where the menu opened, so the panel no longer hangs from it. */
function moved(button: HTMLElement | null, anchor: Anchor | undefined): boolean {
  if (button === null || anchor === undefined) return true;
  const now = anchorOf(button);
  return (
    now.top !== anchor.top ||
    now.left !== anchor.left ||
    now.width !== anchor.width ||
    now.height !== anchor.height
  );
}

interface Parts {
  readonly open: boolean;
  readonly menu: RefObject<HTMLDivElement | null>;
  readonly trigger: RefObject<HTMLButtonElement | null>;
  readonly anchor: RefObject<Anchor | undefined>;
  readonly landing: RefObject<'first' | 'last'>;
  readonly setPlace: (change: (current: Place | undefined) => Place | undefined) => void;
  readonly closeAndReturn: () => void;
  readonly close: () => void;
}

/** The panel opens under the button; one that would end below the viewport opens above it instead. */
function flipAbove({ menu, trigger, setPlace }: Parts): void {
  const panel = menu.current?.getBoundingClientRect();
  const button = trigger.current?.getBoundingClientRect();
  if (panel === undefined || button === undefined || panel.bottom <= window.innerHeight) return;
  const above = Math.max(4, button.top - 4 - panel.height);
  setPlace((current) => (current === undefined ? current : { ...current, top: above }));
}

/**
 * Runs when the panel is in the DOM, before anything is painted: the panel is whole in the viewport and holds
 * the focus from its first frame, and Escape works at once, even when a click moved the focus elsewhere.
 * A scroll or a resize closes it only when the button or the viewport really moved: the event of a scroll that
 * ended before the menu opened may still be on its way, and must not close it.
 */
function useOpenMenu(parts: Parts): void {
  const { open, menu, trigger, anchor, landing, closeAndReturn, close } = parts;
  useLayoutEffect(() => {
    if (!open) return undefined;
    flipAbove(parts);
    focusItem(menu.current, landing.current);
    // A press on the button itself is left to its click, which toggles; closing here would let the click reopen.
    const outside = (event: Event): void => {
      const { target } = event;
      const inside = (box: Element | null): boolean =>
        target instanceof Node && box?.contains(target) === true;
      if (target instanceof Node && !inside(menu.current) && !inside(trigger.current)) close();
    };
    const away = (): void => {
      if (moved(trigger.current, anchor.current)) close();
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeAndReturn();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', away);
    window.addEventListener('scroll', away, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', away);
      window.removeEventListener('scroll', away, true);
    };
  }, [open]);
}

/** Where the menu stands, how it opens and closes, and where the focus goes when it does. */
function usePopup(): Popup {
  const [place, setPlace] = useState<Place | undefined>();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const landing = useRef<'first' | 'last'>('first');
  const anchor = useRef<Anchor | undefined>(undefined);
  const close = (): void => {
    setPlace(undefined);
  };
  const closeAndReturn = (): void => {
    close();
    trigger.current?.focus();
  };
  const open = place !== undefined;
  useOpenMenu({ open, menu, trigger, anchor, landing, setPlace, closeAndReturn, close });
  const openAt = (first: 'first' | 'last'): void => {
    if (trigger.current === null) return;
    landing.current = first;
    anchor.current = anchorOf(trigger.current);
    const box = trigger.current.getBoundingClientRect();
    setPlace({ top: box.bottom + 4, right: Math.max(0, window.innerWidth - box.right) });
  };
  const toggle = (): void => {
    if (open) close();
    else openAt('first');
  };
  return { place, trigger, menu, toggle, openAt, closeAndReturn, close };
}

// RNF-010
export function RowMenu(props: RowMenuProps): JSX.Element {
  const { place, trigger, menu, toggle, openAt, closeAndReturn, close } = usePopup();
  const open = place !== undefined;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') {
      close();
    } else if (event.key in MENU_KEYS) {
      event.preventDefault();
      focusItem(menu.current, MENU_KEYS[event.key] ?? 'first');
    }
  };
  const onButtonKeyDown = (event: KeyboardEvent): void => {
    if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    openAt(event.key === 'ArrowDown' ? 'first' : 'last');
  };
  return (
    <span class="rst-menu">
      <button
        ref={trigger}
        type="button"
        class="rst-menu__button"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={props.label}
        onClick={toggle}
        onKeyDown={onButtonKeyDown}
      >
        <span aria-hidden="true">{'⋯'}</span>
      </button>
      {place === undefined ? null : (
        <div
          ref={menu}
          role="menu"
          class="rst-menu__panel"
          aria-label={props.label}
          style={{ top: `${String(place.top)}px`, right: `${String(place.right)}px` }}
          onKeyDown={onKeyDown}
        >
          {props.items.map((item) => (
            <Item key={item.label} item={item} choose={closeAndReturn} />
          ))}
        </div>
      )}
    </span>
  );
}
