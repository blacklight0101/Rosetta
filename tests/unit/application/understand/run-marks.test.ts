import { describe, expect, it } from 'vitest';
import { runMarks } from '../../../../src/application/understand/run-marks.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import { entry } from '../../../support/code-map-builders.js';

// Q-25, RNF-004: a run is marked for flows or screens when some area it reads is, so the manifest
// names the prompt fragments a task used and no other.

const files = [
  entry('Orders/Checkout.aspx', 10, { artefactKinds: ['page'] }),
  entry('Api/OrdersController.cs', 10, { artefactKinds: ['controller'] }),
  entry('Services/Prices.cs'),
];

const task = (agentTaskId: string, name: string, paths: readonly string[]) => ({
  agentTaskId,
  area: {
    name,
    files: paths,
    estimatedTokens: 30,
    mapLevel: 'coarse',
    origin: 'folder',
  } satisfies Area,
});

const orders = task('reader-001', 'Orders', ['Orders/Checkout.aspx']);
const api = task('reader-002', 'Api', ['Api/OrdersController.cs']);
const services = task('reader-003', 'Services', ['Services/Prices.cs']);
const codeMap = { files, symbols: [] };

describe('the marks of a run', () => {
  it('Q-25 a run of libraries only is marked for neither', () => {
    expect(runMarks([services], codeMap)).toEqual({ flows: false, screens: false });
  });

  it('RF-261 one area with a page marks the run for screens, and for flows as a page is an entry', () => {
    expect(runMarks([services, orders], codeMap)).toEqual({ flows: true, screens: true });
  });

  it('RF-260 an area with only a controller marks the run for flows and not for screens', () => {
    expect(runMarks([services, api], codeMap)).toEqual({ flows: true, screens: false });
  });

  it('Q-25 only the planned tasks count: a run with no task is marked for neither', () => {
    expect(runMarks([], codeMap)).toEqual({ flows: false, screens: false });
  });
});
