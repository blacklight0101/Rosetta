import type { JSX, RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

// design-system.md section 14 (History, row menu), P8-89: the "More actions" button of a table row and the
// menu it opens. The button has `aria-haspopup="menu"` and `aria-expanded`; the menu holds links and buttons
// as `menuitem`; Escape, a click elsewhere, a scroll or leaving the menu with Tab closes it, and the focus
// returns to the button so that a dialog an item opens gives it back there. An item that cannot be used is
// `aria-disabled` and says why under its name. The panel is `position: fixed`, so the scrolling box of a
// table never clips it.

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

function focusStep(menu: HTMLElement | null, step: 1 | -1): void {
  const items = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  const at = items.findIndex((item) => item === document.activeElement);
  items[(at + step + items.length) % items.length]?.focus();
}

interface Popup {
  readonly place: Place | undefined;
  readonly trigger: RefObject<HTMLButtonElement | null>;
  readonly menu: RefObject<HTMLDivElement | null>;
  readonly toggle: () => void;
  readonly closeAndReturn: () => void;
  readonly close: () => void;
}

/** Where the menu stands, how it opens and closes, and where the focus goes when it does. */
function usePopup(): Popup {
  const [place, setPlace] = useState<Place | undefined>();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = place !== undefined;
  const close = (): void => {
    setPlace(undefined);
  };
  useEffect(() => {
    if (!open) return undefined;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: Event): void => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close();
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
  const toggle = (): void => {
    if (open || trigger.current === null) {
      close();
      return;
    }
    const box = trigger.current.getBoundingClientRect();
    setPlace({ top: box.bottom + 4, right: Math.max(0, window.innerWidth - box.right) });
  };
  const closeAndReturn = (): void => {
    close();
    trigger.current?.focus();
  };
  return { place, trigger, menu, toggle, closeAndReturn, close };
}

// RNF-010
export function RowMenu(props: RowMenuProps): JSX.Element {
  const { place, trigger, menu, toggle, closeAndReturn, close } = usePopup();
  const open = place !== undefined;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndReturn();
    } else if (event.key === 'Tab') {
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusStep(menu.current, event.key === 'ArrowDown' ? 1 : -1);
    }
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
