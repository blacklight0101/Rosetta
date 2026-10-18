// P2-13: the model names and the answer the full-understand journeys use to steer the model double
// (e2e-provider.ts). A project that starts with the defaults reads with `heldReaderModel`, and its
// Controllers reader is held until the run is stopped (the Stop journeys); a project whose reader
// model is any other name is not held, so a journey can run every area to the end.

/** The reader model of a project that starts with the defaults. */
export const heldReaderModel = 'gemma4:e4b';

/** A reader model that is not held: the run replays the recorded webforms run to the end. */
export const fullRunModel = 'e2e-full';

/** The reader and summariser model that replays the run whose cards are merged (RF-250). */
export const consolidateModel = 'e2e-consolidate';

/** The answer given to OQ-001; a reader asked again with it is answered from the recorded re-run. */
export const answerToOq001 =
  'Yes, sold-out items stay on the home page; the shop wants them shown.';

/** The words of that answer by which the double knows the re-run (RF-241). */
export const answerMarker = 'sold-out items stay';
