import { expect, it } from 'vitest';
import { describeAccessMatrix, staticRoot } from '../support/access-matrix.js';
import { matrix, matrixAreas } from '../support/access-matrix-rows.js';
import { createTestServer } from '../support/web-server.js';

// RF-1105, RF-1009, conventions section 7: every route has a row in the access matrix with the answer
// for anonymous, a user, another user, an administrator and an administrator whose password must be
// changed (RF-1102). The routes are read from the server itself, so a route without a row fails.
// The rows live in tests/support/access-matrix-rows.ts, grouped by area; this file runs the public
// and page areas, and access-matrix-<area>.test.ts the others, so Vitest runs them in parallel.

const rows = { ...matrixAreas.public, ...matrixAreas.pages };

describeAccessMatrix(rows, (use) => {
  it('RF-1105 the matrix has a row for every route the server has, and no other', async () => {
    const current = use(createTestServer({ staticRoot }));
    await current.server.ready();

    const routes = current.routes();
    const rowsPerArea = Object.values(matrixAreas).map((area) => Object.keys(area).length);

    expect(routes).toEqual(Object.keys(matrix).sort());
    // No route sits in two areas, so every row runs exactly once across the matrix files.
    expect(rowsPerArea.reduce((sum, count) => sum + count, 0)).toBe(routes.length);
  });
});
