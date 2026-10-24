import { describe, expect, it } from 'vitest';
import { addSecretRisks } from '../../../../src/domain/planning/secret-risks.js';

// P5-34, RF-608: the risks of the plan, then one for each file that holds a masked secret, with
// its path and its lines and never the value. The wording is a prompt file; the domain fills it.

const template = 'A plain-text secret is written in {{path}} (line numbers: {{lines}}). Move it.';

describe('the risks of the masked secrets', () => {
  it('P5-34 adds one risk per file, numbered after the planner risks, with no source card', () => {
    const risks = addSecretRisks(
      [{ id: 'RISK-001', text: 'The rule is read twice.', sources: ['BR-001'] }],
      [
        { path: 'School/App.config', lines: [7, 12] },
        { path: 'Api/appsettings.json', lines: [3] },
      ],
      template,
    );

    expect(risks.map((risk) => risk.id)).toEqual(['RISK-001', 'RISK-002', 'RISK-003']);
    expect(risks[1]).toEqual({
      id: 'RISK-002',
      text: 'A plain-text secret is written in School/App.config (line numbers: 7, 12). Move it.',
      sources: [],
    });
    expect(risks[2]?.text).toContain('Api/appsettings.json (line numbers: 3)');
  });

  it('P5-34 adds nothing for a project with no masked secret', () => {
    const risks = [{ id: 'RISK-001', text: 'x', sources: [] }];

    expect(addSecretRisks(risks, [], template)).toBe(risks);
  });

  it('P5-34 lists at most twenty lines of a file and says how many are left out', () => {
    const lines = Array.from({ length: 25 }, (_, index) => index + 1);

    const [risk] = addSecretRisks([], [{ path: 'a.config', lines }], template);

    expect(risk?.text).toContain('1, 2, 3');
    expect(risk?.text).toContain('20 and 5 more');
    expect(risk?.text).not.toContain('21');
  });
});
