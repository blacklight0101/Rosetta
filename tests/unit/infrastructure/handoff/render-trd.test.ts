import { describe, expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';

// RF-622, RF-603, RNF-003, ADR-013, DEC-135: trd.md as it is written. Model and repository text
// shows as text, a secret is masked, a package with nothing for a section says so and links no
// record, and a denylist control is never presented as anything else.

const hostile = [
  '<img src=x onerror=alert(1)> [x](javascript:alert(1)) | cell',
  '# Title',
  '```js',
].join('\n');

const masker = new SecretMasker();

function trdOf(handoff: HandoffPackage): string {
  return renderHandoff(handoff, masker)['trd.md'] ?? '';
}

/** The package with no technical content and no choice made. */
function bare(): HandoffPackage {
  const full = handoffOf('Plain text.');
  return {
    ...full,
    choices: { style: '', migration: '', stack: [] },
    content: {
      ...full.content,
      components: [],
      technical: { integrations: [], security: [], targets: [], environments: [] },
    },
    sources: full.sources.filter((card) => card.type !== 'INT'),
  };
}

describe('trdMarkdown', () => {
  it('RF-622 is written beside the README, which links it', () => {
    const files = renderHandoff(handoffOf('Plain text.'), masker);

    expect(Object.keys(files)).toContain('trd.md');
    expect(files['README.md']).toContain('[Technical requirements document](trd.md)');
  });

  it('RF-622 RF-603 model text adds no HTML, link, heading or fence to trd.md', () => {
    const trd = trdOf(handoffOf(hostile));

    expect(trd).not.toMatch(/<[A-Za-z!/?]/u);
    expect(trd).not.toMatch(/\]\(javascript/u);
    expect(trd).not.toMatch(/^#+ Title/mu);
    expect(trd).not.toMatch(/^```(?!(mermaid)?$)/mu);
    expect(trd).toContain('&lt;img');
  });

  it('RF-622 RF-603 a table cell of trd.md keeps its pipes as text', () => {
    const row = trdOf(handoffOf(hostile))
      .split('\n')
      .find(
        (line) => line.startsWith('| ') && line.includes('onerror') && line.includes('Replace'),
      );

    expect(row?.replaceAll('\\|', '').split('|')).toHaveLength(6);
  });

  it('RF-622 RNF-003 a secret in a technical text is masked', () => {
    expect(trdOf(handoffOf(`Use ${fakeOpenAiKey} here.`))).not.toContain(fakeOpenAiKey);
  });
});

describe('trdMarkdown: sections and controls', () => {
  it('RF-622 a section with nothing to say says so and links no record', () => {
    const trd = trdOf(bare());

    expect(trd).toContain('The cards show no integration.');
    expect(trd).toContain('The cards and the answers name no non-functional target.');
    expect(trd).toContain('No security control was planned.');
    expect(trd.match(/^Decision records: none apply\. \S/gmu)).toHaveLength(7);
    expect(trd).not.toMatch(/^Decision records: \[/mu);
  });

  it('RF-622 DEC-135 a denylist control is named a denylist with the rule that does not depend on input', () => {
    const control = trdOf(handoffOf('Plain text.')).split(/^### /mu)[1] ?? '';

    expect(control).toContain('Approach: denylist. It works by listing forbidden patterns.');
    expect(control).toContain('Invariant: Plain text.');
    expect(control).toContain('Recommendation: Plain text.');
    expect(control).toContain('Decision: [ADR-001](decisions/ADR-001.md)');
  });

  it('RF-622 DEC-135 only the control a planner marked as a denylist gets the denylist wording', () => {
    const full = handoffOf('Plain text.');
    const [control] = full.content.technical.security;
    if (control === undefined) throw new Error('The fixture has no control');
    const other = {
      ...full,
      content: {
        ...full.content,
        technical: {
          ...full.content.technical,
          security: [{ ...control, approach: 'allowlist' as const }],
        },
      },
    };

    expect(trdOf(other)).not.toMatch(/denylist|forbidden patterns/u);
  });
});

describe('trdMarkdown: a control marked other', () => {
  it('RF-622 DEC-135 a control marked other that reads like a denylist still gets the allowlist recommendation', () => {
    const full = handoffOf('Plain text.');
    const [control] = full.content.technical.security;
    if (control === undefined) throw new Error('The fixture has no control');
    const withControl = (description: string): HandoffPackage => ({
      ...full,
      content: {
        ...full.content,
        technical: {
          ...full.content.technical,
          security: [{ ...control, approach: 'other', description, alternative: '' }],
        },
      },
    });

    const hints = [
      'Checks search text against a block list of SQL words.',
      'Rejects a host found on the deny list.',
      'Keeps a blocklist, a blacklist or a denylist of hosts.',
    ].map((text) => trdOf(withControl(text)));
    const rules = [
      'Blocks the account after five failed logins.',
      'Answers 403 Forbidden to a user without the manager role.',
      'Blocked users cannot sign in.',
      'Only the manager role may cancel a paid order.',
    ].map((text) => trdOf(withControl(text)));

    for (const trd of hints) {
      expect(trd).toContain('Approach: other.');
      expect(trd).toContain('Recommendation: Prefer an allowlist of what is permitted');
    }
    for (const trd of rules) expect(trd).not.toContain('Recommendation:');
  });
});
