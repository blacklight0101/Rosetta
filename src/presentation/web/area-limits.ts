// RF-200, RF-425: the limits of the `areas` a request names, in one place for the body of
// POST /api/projects/:id/runs and the query of GET /api/projects/:id/estimate, so a request the
// schema allows is never refused by a size limit that was set separately.

export const MAX_AREAS = 200;
export const MAX_AREA_NAME = 1024;

/** The body limit of the start route (bytes). */
export const START_BODY_LIMIT_BYTES = 1024;
