import type { RefObject } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

// RNF-010, design-system.md section 5.1, P8-89: the overlay Tooltip, for a tip too long to sit in the flow
// beside its trigger. It is `position: fixed` like the row menu, so it moves nothing of the table and the
// scrolling box of a table never clips it; it stands under its trigger, or above when there is no room under
// it, inside the viewport, and it follows a scroll or a resize while it is open. P8-129: while it is open,
// Escape pressed anywhere closes it (WCAG 1.4.13: a browser sends no key to a trigger that is only hovered,
// so the listener sits on the document, as for the cost figures, P8-117), and it closes a moment after the
// pointer leaves, so a pointer that crosses a corner on its way from the trigger onto the tip keeps it open.

const GAP = 4;
const EDGE = 8;
/** How long a tip stays open after the pointer leaves it; a return within it counts as never leaving. */
const CLOSE_DELAY_MS = 200;

interface TipPlace {
  readonly left: number;
  readonly top: number;
}

const within = (wanted: number, size: number, room: number): number =>
  Math.max(EDGE, Math.min(wanted, room - size - EDGE));

// RNF-010
export function tipPlace(
  anchor: { readonly left: number; readonly top: number; readonly bottom: number },
  tip: { readonly width: number; readonly height: number },
  view: { readonly width: number; readonly height: number },
): TipPlace {
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - tip.height;
  const wanted = below + tip.height + EDGE > view.height && above >= EDGE ? above : below;
  return {
    left: within(anchor.left, tip.width, view.width),
    top: within(wanted, tip.height, view.height),
  };
}

function place(anchor: HTMLElement, tip: HTMLElement): void {
  const root = document.documentElement;
  const { left, top } = tipPlace(anchor.getBoundingClientRect(), tip.getBoundingClientRect(), {
    width: root.clientWidth,
    height: root.clientHeight,
  });
  tip.style.left = `${String(left)}px`;
  tip.style.top = `${String(top)}px`;
}

export interface OverlayTip {
  readonly open: boolean;
  readonly dismissed: boolean;
  readonly anchor: RefObject<HTMLSpanElement | null>;
  readonly tip: RefObject<HTMLSpanElement | null>;
  /** For the box that holds the trigger and the tip. */
  readonly onMouseEnter: () => void;
  readonly onMouseLeave: () => void;
  /** For the trigger. */
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

/** While the tip is open: it stands beside its trigger, follows a scroll or a resize, and Escape closes it. */
function useOpenTip(
  open: boolean,
  anchor: RefObject<HTMLSpanElement | null>,
  tip: RefObject<HTMLSpanElement | null>,
  dismiss: () => void,
): void {
  // A layout effect: the tip stands in its place before the browser first paints it.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const follow = (): void => {
      if (anchor.current !== null && tip.current !== null) place(anchor.current, tip.current);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss();
    };
    follow();
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, anchor, tip, dismiss]);
}

/** A close that waits a moment, cancelled when the pointer comes back; never left running after unmount. */
function useLateClose(close: () => void): {
  readonly start: () => void;
  readonly cancel: () => void;
} {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  useEffect(() => cancel, [cancel]);
  return {
    start: () => {
      cancel();
      timer.current = setTimeout(close, CLOSE_DELAY_MS);
    },
    cancel,
  };
}

// RNF-010
export function useOverlayTip(): OverlayTip {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const open = (hovered || focused) && !dismissed;
  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);
  useOpenTip(open, anchor, tip, dismiss);
  const leaving = useLateClose(() => {
    setHovered(false);
  });
  return {
    open,
    dismissed,
    anchor,
    tip,
    onMouseEnter: () => {
      leaving.cancel();
      setHovered(true);
      // A tip closed with Escape opens again on the next hover, unless its trigger keeps the focus.
      if (!focused) setDismissed(false);
    },
    onMouseLeave: leaving.start,
    onFocus: () => {
      setFocused(true);
      setDismissed(false);
    },
    onBlur: () => {
      setFocused(false);
      setDismissed(false);
    },
    onKeyDown: (event) => {
      if (event.key === 'Escape') dismiss();
    },
  };
}
