import { MAX_AREA_NAME_LENGTH } from '../../domain/code-map/area.js';

// RF-200, RF-425: the limits of the `areas` a request names, in one place for the body of
// POST /api/projects/:id/runs and of POST /api/projects/:id/estimate, so a request the schema
// allows is never refused by a size limit that was set separately. An area name can be as long as
// the code map allows (a folder path), so the limit is the code map's own and cannot drift from it.

export const MAX_AREAS = 200;
export const MAX_AREA_NAME = MAX_AREA_NAME_LENGTH;

/** The most JSON bytes one UTF-16 unit of a string takes: a `\u00XX` escape (also each half of a pair). */
const JSON_BYTES_PER_UNIT = 6;
/** The JSON around the areas: `{"stage":"understand","areas":[],"cloudConsent":false}` with room to spare. */
const BODY_FRAME_BYTES = 128;
/** One name in the array: two quotes and a comma. */
const NAME_FRAME_BYTES = 3;

/** The body limit of the start and estimate routes (bytes): the largest body their schema allows. */
export const START_BODY_LIMIT_BYTES =
  BODY_FRAME_BYTES + MAX_AREAS * (MAX_AREA_NAME * JSON_BYTES_PER_UNIT + NAME_FRAME_BYTES);
