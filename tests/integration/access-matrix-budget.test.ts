import { describeAccessMatrix } from '../support/access-matrix.js';
import { matrixAreas } from '../support/access-matrix-rows.js';

// RF-1105, RF-1009: the access matrix rows of the budget routes: caps, totals and cost (RF-1106, DEC-107, RF-1010, RF-428).
// tests/integration/access-matrix.test.ts checks that the areas together cover every route.

describeAccessMatrix(matrixAreas.budget);
