import type { JSX } from 'preact';
import { microsToDollars } from '../lib/usd.js';
import type { ServerMonth } from './admin-month.js';

// RF-1106, design-system.md section 14: the server's month to date against its monthly cap. The
// bar turns to the warning colour from 80%; the figures beside it say the same in words, so colour
// never carries the meaning alone.

const dollars = (micros: bigint): string => microsToDollars(micros.toString());

// RF-1106
export function ServerMeter({ month }: { readonly month: ServerMonth }): JSX.Element {
  const used = dollars(month.usedMicros);
  const cap = dollars(month.capMicros);
  return (
    <div
      class="rst-meter"
      role="meter"
      aria-label="Server spend this month"
      aria-valuemin={0}
      aria-valuemax={Number(cap)}
      aria-valuenow={Number(used)}
      aria-valuetext={`$${used} of $${cap}`}
    >
      <div class="rst-meter__figures">
        <span>Server, this month</span>
        <span>
          <strong>{`$${used}`}</strong> <span class="rst-meter__of">{`of $${cap}`}</span>
        </span>
      </div>
      <div class="rst-meter__track">
        <span
          class={month.warn ? 'rst-meter__fill rst-meter__fill--warn' : 'rst-meter__fill'}
          style={{ inlineSize: `${String(month.percent)}%` }}
        />
      </div>
    </div>
  );
}
