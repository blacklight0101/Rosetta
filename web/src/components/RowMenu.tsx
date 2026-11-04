import type { JSX, RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

// design-system.md section 14 (History, row menu), P8-89: the "More actions" button of a table row and the
// menu it opens. The button has `aria-haspopup="menu"` and `aria-expanded`; the menu holds links and buttons
// as `menuitem`. ArrowDown or ArrowUp on the button opens it (at the first or the last item); the arrows,
// Home and End move within it. Escape, a click elsewhere, a scroll or leaving the menu with Tab closes it, and
// the focus returns to the button so that a dialog an item opens gives it back there. An item that cannot be
// used is `aria-disabled` and says why under its name. The panel is `position: fixed`, so the scrolling box
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
  items[index]?.focus();
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

interface FlipParts {
  readonly open: boolean;
  readonly menu: RefObject<HTMLDivElement | null>;
  readonly trigger: RefObject<HTMLButtonElement | null>;
  readonly setPlace: (change: (current: Place | undefined) => Place | undefined) => void;
}

/** The panel opens under the button; one that would end below the viewport opens above it instead. */
function useFlipAbove({ open, menu, trigger, setPlace }: FlipParts): void {
  useLayoutEffect(() => {
    const panel = menu.current?.getBoundingClientRect();
    const button = trigger.current?.getBoundingClientRect();
    if (!open || panel === undefined || button === undefined) return;
    if (panel.bottom <= window.innerHeight) return;
    const above = Math.max(4, button.top - 4 - panel.height);
    setPlace((current) => (current === undefined ? current : { ...current, top: above }));
  }, [open]);
}

/** Where the menu stands, how it opens and closes, and where the focus goes when it does. */
function usePopup(): Popup {
  const [place, setPlace] = useState<Place | undefined>();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const landing = useRef<'first' | 'last'>('first');
  const open = place !== undefined;
  const close = (): void => {
    setPlace(undefined);
  };
  useFlipAbove({ open, menu, trigger, setPlace });
  useEffect(() => {
    if (!open) return undefined;
    focusItem(menu.current, landing.current);
    // A press on the button itself is left to its click, which toggles; closing here would let the click reopen.
    const outside = (event: Event): void => {
      const { target } = event;
      const inside = (box: Element | null): boolean =>
        target instanceof Node && box?.contains(target) === true;
      if (target instanceof Node && !inside(menu.current) && !inside(trigger.current)) close();
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  const openAt = (first: 'first' | 'last'): void => {
    if (trigger.current === null) return;
    landing.current = first;
    const box = trigger.current.getBoundingClientRect();
    setPlace({ top: box.bottom + 4, right: Math.max(0, window.innerWidth - box.right) });
  };
  const toggle = (): void => {
    if (open) close();
    else openAt('first');
  };
  const closeAndReturn = (): void => {
    close();
    trigger.current?.focus();
  };
  return { place, trigger, menu, toggle, openAt, closeAndReturn, close };
}

// RNF-010
export function RowMenu(props: RowMenuProps): JSX.Element {
  const { place, trigger, menu, toggle, openAt, closeAndReturn, close } = usePopup();
  const open = place !== undefined;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndReturn();
    } else if (event.key === 'Tab') {
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
