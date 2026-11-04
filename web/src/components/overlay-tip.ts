import type { RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

// RNF-010, design-system.md section 5.1, P8-89: the overlay Tooltip, for a tip too long to sit in the flow
// beside its trigger. It is `position: fixed` like the row menu, so it moves nothing of the table and the
// scrolling box of a table never clips it; it stands under its trigger, or above when there is no room under
// it, inside the viewport, and it follows a scroll or a resize while it is open.

const GAP = 4;
const EDGE = 8;

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
  readonly onMouseLeave: (event: { readonly currentTarget: HTMLElement }) => void;
  /** For the trigger. */
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
}

// RNF-010
export function useOverlayTip(): OverlayTip {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const open = (hovered || focused) && !dismissed;
  // A layout effect: the tip stands in its place before the browser first paints it.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const follow = (): void => {
      if (anchor.current !== null && tip.current !== null) place(anchor.current, tip.current);
    };
    follow();
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => {
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [open]);
  return {
    open,
    dismissed,
    anchor,
    tip,
    onMouseEnter: () => {
      setHovered(true);
    },
    onMouseLeave: (event) => {
      setHovered(false);
      if (!event.currentTarget.contains(document.activeElement)) setDismissed(false);
    },
    onFocus: () => {
      setFocused(true);
      setDismissed(false);
    },
    onBlur: () => {
      setFocused(false);
      setDismissed(false);
    },
    onKeyDown: (event) => {
      if (event.key === 'Escape') setDismissed(true);
    },
  };
}
