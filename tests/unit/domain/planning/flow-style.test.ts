import { describe, expect, it } from 'vitest';
import { checkFlowStyle } from '../../../../src/domain/planning/flow-style.js';
import type { MappedFlow } from '../../../../src/domain/planning/target-flows.js';

// RF-608, RF-625, P5-40: the rule of the style is checked over the steps of the target flows, not
// only over the dependencies of the components. A flow that goes from a page straight to data
// access in a layered style skips the business layer.

const components = [
  { name: 'Web pages', responsibility: '', role: 'presentation', dependsOn: ['Rules'] },
  { name: 'Rules', responsibility: '', role: 'business', dependsOn: ['Store'] },
  { name: 'Store', responsibility: '', role: 'data', dependsOn: [] },
  { name: 'Mystery', responsibility: '', role: 'wizard', dependsOn: [] },
];

function flow(cardId: string, ...path: (string | null)[]): MappedFlow {
  return {
    ...{ cardId, title: cardId, trigger: 't', outcome: 'o' },
    steps: path.map((component, index) => ({
      ...{ claimId: `${cardId}.c${String(index + 1)}`, text: 'step', touches: null },
      ...{ component, action: 'a', files: [], inferred: false },
    })),
  };
}

describe('checkFlowStyle', () => {
  it('RF-608 P5-40 lists a step from presentation straight to data in a layered style', () => {
    const broken = checkFlowStyle('layered', components, [flow('FLOW-005', 'Web pages', 'Store')]);

    expect(broken).toEqual([
      { flow: 'FLOW-005', from: 'Web pages', to: 'Store', rule: 'skipping' },
    ]);
  });

  it('RF-608 P5-40 a flow through every layer breaks nothing, and the way back up is a return', () => {
    const path = ['Web pages', 'Rules', 'Store', 'Rules', 'Web pages'];

    expect(checkFlowStyle('layered', components, [flow('FLOW-001', ...path)])).toEqual([]);
  });

  it('RF-608 P5-40 a step with no component or with a component of no role is not judged', () => {
    const steps = flow('FLOW-002', 'Web pages', null, 'Mystery', 'Store');

    expect(checkFlowStyle('layered', components, [steps])).toEqual([]);
  });

  it('RF-608 P5-40 the same break in one flow is listed once', () => {
    const steps = flow('FLOW-003', 'Web pages', 'Store', 'Rules', 'Web pages', 'Store');

    expect(checkFlowStyle('layered', components, [steps])).toHaveLength(1);
  });
});

describe('checkFlowStyle: steps that are not calls', () => {
  const modules = [
    { name: 'Orders', responsibility: '', role: 'module', dependsOn: [] },
    { name: 'Billing', responsibility: '', role: 'module', dependsOn: [] },
  ];
  const hexagon = [
    { name: 'Web adapter', responsibility: '', role: 'adapter', dependsOn: [] },
    { name: 'Core', responsibility: '', role: 'core', dependsOn: [] },
    { name: 'Db port', responsibility: '', role: 'port', dependsOn: [] },
    { name: 'Db adapter', responsibility: '', role: 'adapter', dependsOn: [] },
  ];

  it('RF-608 P5-40 two steps in the same component are not a call, in any style', () => {
    const steps = flow('FLOW-010', 'Orders', 'Orders');

    expect(checkFlowStyle('modular-monolith', modules, [steps])).toEqual([]);
  });

  it('RF-608 P5-40 a call from one module to another is listed', () => {
    const steps = flow('FLOW-011', 'Orders', 'Billing');

    expect(checkFlowStyle('modular-monolith', modules, [steps])).toHaveLength(1);
  });

  it('RF-608 P5-40 the way back to a component already on the path is a return in a hexagonal style', () => {
    const path = ['Web adapter', 'Core', 'Db port', 'Db adapter', 'Db port', 'Core', 'Web adapter'];

    expect(checkFlowStyle('hexagonal', hexagon, [flow('FLOW-012', ...path)])).toEqual([]);
  });

  it('RF-608 P5-40 a core that calls an adapter it has not been called through is still listed', () => {
    const steps = flow('FLOW-013', 'Core', 'Db adapter');

    expect(checkFlowStyle('hexagonal', hexagon, [steps])).toEqual([
      { flow: 'FLOW-013', from: 'Core', to: 'Db adapter', rule: 'core-on-adapter' },
    ]);
  });
});
