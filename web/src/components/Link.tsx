import type { ComponentChildren, JSX } from 'preact';
import { navigate } from '../app/router.js';

// A link to a page of this application. A plain click moves within the page; a click with a
// modifier key, a middle click or a new-window target keeps the browser's own behaviour.

export interface LinkProps {
  readonly href: string;
  readonly children: ComponentChildren;
  readonly class?: string;
  readonly current?: boolean;
}

const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export function Link(props: LinkProps): JSX.Element {
  return (
    <a
      href={props.href}
      class={props.class}
      aria-current={props.current === true ? 'page' : undefined}
      onClick={(event) => {
        if (!isPlainClick(event) || !props.href.startsWith('/')) return;
        event.preventDefault();
        navigate(props.href);
      }}
    >
      {props.children}
    </a>
  );
}
