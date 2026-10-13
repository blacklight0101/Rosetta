import { createContext } from 'preact';
import { useContext, useEffect } from 'preact/hooks';

// RF-1003, RF-1010, DEC-49: a page that follows a run tells the signed-in shell what the run has
// spent against its cap, so the "This run" meter of the top bar shows it while the run is active and
// goes when the page stops publishing (the run ended, or the user left the page).

export interface RunMeterReading {
  readonly costMicros: number;
  readonly capMicros: number;
}

export const RunMeterContext = createContext<(reading: RunMeterReading | undefined) => void>(
  () => undefined,
);

/** Publishes the reading while it is defined; takes it back when it is not, and on leaving. */
// RF-1003
export function usePublishRunMeter(reading: RunMeterReading | undefined): void {
  const publish = useContext(RunMeterContext);
  const costMicros = reading?.costMicros;
  const capMicros = reading?.capMicros;
  useEffect(() => {
    publish(
      costMicros === undefined || capMicros === undefined ? undefined : { costMicros, capMicros },
    );
  }, [publish, costMicros, capMicros]);
  useEffect(
    () => () => {
      publish(undefined);
    },
    [publish],
  );
}
