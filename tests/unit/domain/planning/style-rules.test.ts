import { describe, expect, it } from 'vitest';
import { architectureStyleIds } from '../../../../src/domain/planning/catalogue.js';
import {
  addStyleRisks,
  checkStyle,
  styleRoles,
} from '../../../../src/domain/planning/style-rules.js';
import type { DraftComponent } from '../../../../src/domain/planning/plan-draft.js';

// RF-608, DEC-76, ADR-018: each style's roles and dependency rule, with a passing and a failing case.

function part(name: string, role: string, dependsOn: string[] = []): DraftComponent {
  return { name, responsibility: 'Does its part.', role, dependsOn };
}

describe('RF-608 the roles of each style are fixed in code', () => {
  it('RF-608 every style has its roles', () => {
    expect(architectureStyleIds.map((id) => styleRoles[id])).toEqual([
      ['presentation', 'business', 'data'],
      ['module', 'shared kernel'],
      ['core', 'port', 'adapter'],
      ['core', 'port', 'adapter'],
      ['producer', 'consumer', 'broker'],
      ['service', 'gateway', 'store'],
    ]);
  });
});

describe('RF-608 layered: no upward and no skipping call', () => {
  const layers = [
    part('Pages', 'presentation', ['Rules']),
    part('Rules', 'business', ['Tables']),
    part('Tables', 'data'),
  ];

  it('RF-608 a clean layered answer has no finding', () => {
    expect(checkStyle('layered', layers)).toEqual({ broken: [], unknownRole: [] });
  });

  it('RF-608 a call from the data layer up to the business layer is broken', () => {
    const check = checkStyle('layered', [
      part('Rules', 'business'),
      part('Tables', 'data', ['Rules']),
    ]);
    expect(check.broken).toEqual([{ from: 'Tables', to: 'Rules', rule: 'upward' }]);
  });

  it('RF-608 a call from presentation straight to data skips a layer', () => {
    const check = checkStyle('layered', [
      part('Pages', 'presentation', ['Tables']),
      part('Rules', 'business'),
      part('Tables', 'data'),
    ]);
    expect(check.broken).toEqual([{ from: 'Pages', to: 'Tables', rule: 'skipping' }]);
  });

  it('RF-608 two components of one layer may call each other', () => {
    const check = checkStyle('layered', [
      part('Orders', 'business', ['Prices']),
      part('Prices', 'business'),
    ]);
    expect(check.broken).toEqual([]);
  });
});

describe('RF-608 hexagonal and clean: the core depends on no adapter', () => {
  for (const style of ['hexagonal', 'clean'] as const) {
    it(`RF-608 ${style} a core that depends on a port and a core is clean`, () => {
      const check = checkStyle(style, [
        part('Orders', 'core', ['Repository port', 'Pricing']),
        part('Pricing', 'core'),
        part('Repository port', 'port'),
        part('Sql repository', 'adapter', ['Repository port']),
      ]);
      expect(check).toEqual({ broken: [], unknownRole: [] });
    });

    it(`RF-608 ${style} a core that depends on an adapter is broken`, () => {
      const check = checkStyle(style, [
        part('Business Core', 'Core', ['Data Access']),
        part('Data Access', 'adapter'),
      ]);
      expect(check.broken).toEqual([
        { from: 'Business Core', to: 'Data Access', rule: 'core-on-adapter' },
      ]);
    });
  }
});

describe('RF-608 modular monolith: a module does not depend on another module', () => {
  it('RF-608 a module on the shared kernel is clean', () => {
    const check = checkStyle('modular-monolith', [
      part('Orders', 'module', ['Kernel']),
      part('Kernel', 'shared kernel'),
    ]);
    expect(check.broken).toEqual([]);
  });

  it('RF-608 a module that depends on another module is broken', () => {
    const check = checkStyle('modular-monolith', [
      part('Orders', 'module', ['Billing']),
      part('Billing', 'module'),
    ]);
    expect(check.broken).toEqual([{ from: 'Orders', to: 'Billing', rule: 'module-on-module' }]);
  });
});

describe('RF-608 event-driven: producers and consumers do not call each other', () => {
  it('RF-608 both through the broker is clean', () => {
    const check = checkStyle('event-driven', [
      part('Checkout', 'producer', ['Bus']),
      part('Mailer', 'consumer', ['Bus']),
      part('Bus', 'broker'),
    ]);
    expect(check.broken).toEqual([]);
  });

  it('RF-608 a producer that calls a consumer, and the reverse, are broken', () => {
    const check = checkStyle('event-driven', [
      part('Checkout', 'producer', ['Mailer']),
      part('Mailer', 'consumer', ['Checkout']),
    ]);
    expect(check.broken).toEqual([
      { from: 'Checkout', to: 'Mailer', rule: 'direct-call' },
      { from: 'Mailer', to: 'Checkout', rule: 'direct-call' },
    ]);
  });
});

describe('RF-608 microservices: no shared store', () => {
  it('RF-608 one store per service is clean', () => {
    const check = checkStyle('microservices', [
      part('Gateway', 'gateway', ['Orders', 'Billing']),
      part('Orders', 'service', ['Orders db']),
      part('Billing', 'service', ['Billing db']),
      part('Orders db', 'store'),
      part('Billing db', 'store'),
    ]);
    expect(check.broken).toEqual([]);
  });

  it('RF-608 two services on one store are both broken', () => {
    const check = checkStyle('microservices', [
      part('Orders', 'service', ['Shared db']),
      part('Billing', 'service', ['Shared db']),
      part('Shared db', 'store'),
    ]);
    expect(check.broken).toEqual([
      { from: 'Orders', to: 'Shared db', rule: 'shared-store' },
      { from: 'Billing', to: 'Shared db', rule: 'shared-store' },
    ]);
  });
});

describe('RF-608 microservices: only services share a store', () => {
  it('RF-608 a gateway and a service on one store is not a shared store', () => {
    const check = checkStyle('microservices', [
      part('Gateway', 'gateway', ['Orders db']),
      part('Orders', 'service', ['Orders db']),
      part('Orders db', 'store'),
    ]);
    expect(check.broken).toEqual([]);
  });
});

describe('RF-608 a dependency listed twice is one finding', () => {
  it('RF-608 a duplicate dependsOn entry gives one broken rule and one risk', () => {
    const check = checkStyle('layered', [
      part('Rules', 'business'),
      part('Tables', 'data', ['Rules', 'Rules']),
    ]);
    expect(check.broken).toEqual([{ from: 'Tables', to: 'Rules', rule: 'upward' }]);
    expect(addStyleRisks([], check, 'Layered')).toHaveLength(1);
  });
});

describe('RF-608 a component without a known role is listed, not guessed', () => {
  it('RF-608 an empty role and a role of another style are listed, and their dependencies are not judged', () => {
    const check = checkStyle('hexagonal', [
      part('Gateway', '', ['Data']),
      part('Business Core', 'service', ['Data']),
      part('Data', 'adapter'),
    ]);
    expect(check).toEqual({
      broken: [],
      unknownRole: [
        { name: 'Gateway', role: '' },
        { name: 'Business Core', role: 'service' },
      ],
    });
  });

  it('RF-608 a role is read without regard to case, hyphens or spaces around it', () => {
    const check = checkStyle('modular-monolith', [
      part('Kernel', ' Shared-Kernel '),
      part('Orders', 'MODULE', ['Kernel']),
    ]);
    expect(check).toEqual({ broken: [], unknownRole: [] });
  });
});

describe('RF-608 a broken rule is also a risk', () => {
  it('RF-608 each broken rule adds one risk after the planner risks, numbered on, with no source card', () => {
    const check = checkStyle('layered', [
      part('Rules', 'business'),
      part('Tables', 'data', ['Rules']),
    ]);
    const planned = [{ id: 'RISK-001', text: 'Late.', sources: ['FEAT-001'] }];

    const risks = addStyleRisks(planned, check, 'Layered (N-tier)');

    expect(risks).toHaveLength(2);
    expect(risks[1]).toMatchObject({ id: 'RISK-002', sources: [] });
    expect(risks[1]?.text).toContain('Tables');
    expect(risks[1]?.text).toContain('Rules');
    expect(risks[1]?.text).toContain('Layered (N-tier)');
  });

  it('RF-608 no broken rule leaves the risks as they were', () => {
    const risks = [{ id: 'RISK-001', text: 'Late.', sources: ['FEAT-001'] }];
    expect(addStyleRisks(risks, { broken: [], unknownRole: [] }, 'Layered')).toBe(risks);
  });
});
