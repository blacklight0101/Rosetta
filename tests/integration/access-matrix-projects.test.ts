import { describeAccessMatrix } from '../support/access-matrix.js';
import { matrixAreas } from '../support/access-matrix-rows.js';

// RF-1105, RF-1009: the access matrix rows of projects, their runs and estimate, and the administrator's view of a workspace.
// tests/integration/access-matrix.test.ts checks that the areas together cover every route.

describeAccessMatrix(matrixAreas.projects);
