import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-612, RF-636, RF-640, DEC-176, P6-06: AGENTS.md of an AI-assisted build is a start-here index
// that comes first in the README reading order. The rules kept in it sit after a marked heading and
// the index above that heading has a line budget; the build protocol is in orchestration.md (P6-07).

const masker = new SecretMasker();
const longRules = '## Rules kept in this file';

function filesOf(aiAssisted: boolean): Readonly<Record<string, string>> {
  const base = handoffOf('Plain text.');
  return renderHandoff({ ...base, brief: { ...base.brief, buildMethod: { aiAssisted } } }, masker);
}

function indexOf(): string {
  return (filesOf(true)['AGENTS.md'] ?? '').split(longRules)[0] ?? '';
}

describe('AGENTS.md as the start-here index', () => {
  it('RF-640 the index above the long rules has at most 60 lines', () => {
    const text = filesOf(true)['AGENTS.md'] ?? '';

    expect(text).toContain(longRules);
    expect(indexOf().trimEnd().split('\n').length).toBeLessThanOrEqual(60);
  });

  it('RF-640 the index has the start-here order, a command table, the rules and the layout', () => {
    const text = indexOf();

    expect(text).toMatch(/^## Start here$/mu);
    expect(text).toMatch(/^## Commands$/mu);
    expect(text).toMatch(/^\| Command \| What it does \| Value \|$/mu);
    expect(text).toMatch(/^## Rules broken most often$/mu);
    expect(text).toMatch(/^## Layout$/mu);
  });

  it('RF-640 a command the stack answers do not give is marked unknown', () => {
    expect(indexOf()).toContain('Unknown: decide it when the stack is set up');
  });

  it('RF-636 the index links the operations and the risk class rules', () => {
    const text = filesOf(true)['AGENTS.md'] ?? '';

    expect(indexOf()).toContain('](#operations)');
    expect(indexOf()).toContain('](#risk-class)');
    expect(text).toMatch(/^## Operations$/mu);
    expect(text).toMatch(/^## Risk class$/mu);
    expect(text.indexOf('## Operations')).toBeGreaterThan(text.indexOf(longRules));
  });

  it('RF-640 AGENTS.md is first in the README reading order of an AI-assisted build', () => {
    const readme = filesOf(true)['README.md'] ?? '';

    const order = readme.split('## Reading order')[1]?.split('\n## ')[0] ?? '';
    const links = [...order.matchAll(/\]\(([^)#]+)\)/gu)].map((match) => match[1]);
    expect(links[0]).toBe('AGENTS.md');
    expect(links.filter((link) => link === 'AGENTS.md')).toHaveLength(1);
    expect(order).toMatch(/^1\. \[AGENTS\.md\]\(AGENTS\.md\)$/mu);
  });

  it('RF-640 a build by people has no AGENTS.md and no link to it', () => {
    const files = filesOf(false);

    expect(Object.keys(files)).not.toContain('AGENTS.md');
    expect(files['README.md']).not.toContain('AGENTS.md');
  });
});

describe('AGENTS.md and orchestration.md', () => {
  it('RF-640 AGENTS.md does not claim its rules move to orchestration.md', () => {
    const text = filesOf(true)['AGENTS.md'] ?? '';
    const kept = text.split(longRules)[1] ?? '';

    expect(text).not.toMatch(/\bmoves? to orchestration/iu);
    expect(text).not.toMatch(/until the build protocol has its own file/iu);
    expect(kept).toMatch(/build protocol .*\]\(orchestration\.md\)/iu);
  });
});
