// RF-200, RF-425: the limits of the `areas` a request names, in one place for the body of
// POST /api/projects/:id/runs, the query of GET /api/projects/:id/estimate and the request-line
// limit of the server, so a request the schema allows is never refused by a size limit that was
// set separately. An area name is a path inside the code map, so 128 characters is generous; the
// owner's first test selected 42 areas of about 60 characters.

export const MAX_AREAS = 200;
export const MAX_AREA_NAME = 128;

/** The most JSON bytes one UTF-16 unit of a string takes: a `\u00XX` escape (also each half of a pair). */
const JSON_BYTES_PER_UNIT = 6;
/** The JSON around the areas: `{"stage":"understand","areas":[],"cloudConsent":false}` with room to spare. */
const BODY_FRAME_BYTES = 128;
/** One name in the array: two quotes and a comma. */
const NAME_FRAME_BYTES = 3;

/** The body limit of the start route (bytes): the largest body the start schema allows. */
export const START_BODY_LIMIT_BYTES =
  BODY_FRAME_BYTES + MAX_AREAS * (MAX_AREA_NAME * JSON_BYTES_PER_UNIT + NAME_FRAME_BYTES);

/** Node's default for the request line and headers together. */
const DEFAULT_HEADER_BYTES = 16_384;
/** `&areas=` before each name. */
const QUERY_PARAMETER_BYTES = 7;
/** An ASCII character that needs escaping in a URL (`/`, `#`, a space) takes three characters. */
const URL_CHARS_PER_UNIT = 3;

/**
 * The header limit of the server (bytes): the default plus the largest estimate query made of
 * ASCII path characters. A name with non-ASCII letters takes up to nine characters per unit and
 * can still be refused by this limit with a 431 before it reaches the schema.
 */
export const MAX_HEADER_BYTES =
  DEFAULT_HEADER_BYTES + MAX_AREAS * (QUERY_PARAMETER_BYTES + MAX_AREA_NAME * URL_CHARS_PER_UNIT);
