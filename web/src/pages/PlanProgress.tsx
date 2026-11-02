import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Glyph } from '../components/Glyph.js';
import { tokensLabel } from '../lib/live-run/format.js';
import { callLabel, nextCall, secondsLabel, workingCall } from '../lib/live-run/plan-calls.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1015, RF-1002 (P7-25): the planner at work, in the place the working agents have on an understand
// run. While a planner call runs it shows a moving indicator, the call's name, the time since it
// started and the tokens it has used; between calls it says which call comes next. The time ticks
// once a second; the indicator stands still under reduced motion.

/** The current time, renewed every second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [active]);
  return now;
}

// RF-1015
export function PlanProgress(props: { readonly state: RunState }): JSX.Element {
  const working = workingCall(props.state);
  const now = useNow(working !== undefined);
  const next = nextCall(props.state);
  return (
    <section class="rst-card rst-plan-progress" aria-label="Planner" data-testid="plan-progress">
      <h2 class="rst-live-section__title">Planner</h2>
      {working === undefined ? (
        <p role="status">
          {next === undefined
            ? 'The planner is putting the package together.'
            : `Next: ${callLabel(next)}`}
        </p>
      ) : (
        <p role="status">
          <span class="rst-live-dot">
            <Glyph name="live-dot" />
          </span>{' '}
          <b>{callLabel(working.call)}</b>
          {`: working for ${secondsLabel(working.startedAt, now)}, ${tokensLabel(working.inputTokens + working.outputTokens)} tokens so far`}
        </p>
      )}
    </section>
  );
}
