import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import type { WorkingItem } from '../lib/live-run/working-now.js';

// RF-1015, DEC-137: "Working now": up to three agents in plain words, each with its role colour.
// The words come from the events and are shown as text.

function roleClass(role: string): string {
  return ['verifier', 'planner', 'summariser'].includes(role) ? role : 'reader';
}

function Item({ item }: { readonly item: WorkingItem }): JSX.Element {
  return (
    <li class="rst-now__item">
      <span class={`rst-now__avatar rst-now__avatar--${roleClass(item.role)}`} aria-hidden="true">
        <Glyph name={item.role === 'verifier' ? 'check' : 'brackets'} />
      </span>
      <div class="rst-now__body">
        <b class="rst-now__title">{item.title}</b>
        <p class="rst-now__text">{item.text}</p>
      </div>
    </li>
  );
}

// RF-1015
export function WorkingNow(props: {
  readonly items: readonly WorkingItem[];
  readonly waitingNote: string;
}): JSX.Element {
  const { items } = props;
  return (
    <section class="rst-card rst-now" aria-labelledby="rst-now-title">
      <header class="rst-now__head">
        <h2 id="rst-now-title" class="rst-now__heading">
          Working now
        </h2>
        <span class="rst-now__count">
          {items.length === 0 ? 'none' : `${String(items.length)} at work`}
        </span>
      </header>
      {items.length === 0 ? (
        <p class="rst-settings__note">{props.waitingNote}</p>
      ) : (
        <ul class="rst-now__list">
          {items.map((item) => (
            <Item key={item.key} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
