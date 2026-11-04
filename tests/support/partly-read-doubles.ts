import { ReadRunPartlyRead } from '../../src/application/use-cases/read-run-partly-read.js';
import { MapRunTextFiles } from './report-doubles.js';

// P8-130: a reader of what the run lists need that finds no coverage, so no run reads "Partly read".
export const noPartlyRead = new ReadRunPartlyRead({
  files: new MapRunTextFiles(),
  share: () => Promise.resolve(null),
});
