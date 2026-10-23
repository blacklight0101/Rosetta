import { createContext } from 'preact';
import { useContext, useEffect } from 'preact/hooks';
import type { RunMeterReading } from '../lib/live-run/run-meter-reading.js';

// RF-1003, RF-1010, DEC-49: a page that follows a run tells the signed-in shell what the run has
// spent against its cap, so the "This run" meter of the top bar shows it while the run is active and
// goes when the page stops publishing (the run ended, or the user left the page).

export type { RunMeterReading } from '../lib/live-run/run-meter-reading.js';

export const RunMeterContext = createContext<(reading: RunMeterReading | undefined) => void>(
  () => undefined,
);

/** Publishes the reading while it is defined; takes it back when it is not, and on leaving. */
// RF-1003
export function usePublishRunMeter(reading: RunMeterReading | undefined): void {
  const publish = useContext(RunMeterContext);
  const spent = reading?.spent;
  const cap = reading?.cap;
  const unit = reading?.unit;
  useEffect(() => {
    publish(
      spent === undefined || cap === undefined || unit === undefined
        ? undefined
        : { spent, cap, unit },
    );
  }, [publish, spent, cap, unit]);
  useEffect(
    () => () => {
      publish(undefined);
    },
    [publish],
  );
}
