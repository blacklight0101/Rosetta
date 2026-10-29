import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import type { BuildMethod } from '../../../../src/domain/planning/build-method.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { brokenLinks, readingOrderTargets } from '../../../support/package-reading.js';

// RF-640, RF-642, DEC-190, P6-30: the package links `agents/README.md` from its reading order and
// from AGENTS.md only when the folder is written (Claude Code and Codex). Another tool gets the
// roles in prose only, stated in orchestration.md, and no escalation verifier file exists.

const masker = new SecretMasker();
const claudeCode: BuildMethod = { aiAssisted: true, agentTool: { kind: 'claude-code' } };
const codex: BuildMethod = { aiAssisted: true, agentTool: { kind: 'codex' } };
const other: BuildMethod = { aiAssisted: true, agentTool: { kind: 'other', name: 'Some tool' } };
const people: BuildMethod = { aiAssisted: false };

const link = '](agents/README.md)';
const proseOnly = 'gets these roles in prose only';

function filesOf(
  method: BuildMethod,
  models?: BuildMethod['models'],
): Readonly<Record<string, string>> {
  const base = handoffOf('Plain text.');
  const buildMethod = models === undefined ? method : { ...method, models };
  return renderHandoff({ ...base, brief: { ...base.brief, buildMethod } }, masker);
}

describe('the package links the agents folder only when it is written', () => {
  it.each([
    ['Claude Code', claudeCode],
    ['Codex', codex],
  ])('RF-642 P6-30 %s: the reading order and AGENTS.md link agents/README.md', (_name, method) => {
    const files = filesOf(method);
    expect(readingOrderTargets(files)).toContain('agents/README.md');
    expect(files['AGENTS.md']).toContain(link);
    expect(brokenLinks(files)).toEqual([]);
  });

  it.each([
    ['another tool', other],
    ['people building', people],
  ])('RF-642 P6-30 %s: no link to agents/README.md and no folder', (_name, method) => {
    const files = filesOf(method);
    expect(readingOrderTargets(files)).not.toContain('agents/README.md');
    expect(files['AGENTS.md'] ?? '').not.toContain('agents/README.md');
    expect(Object.keys(files).filter((path) => path.startsWith('agents/'))).toEqual([]);
    expect(brokenLinks(files)).toEqual([]);
  });

  it('RF-640 P6-30 the reading order keeps AGENTS.md and orchestration.md first for every AI-assisted tool', () => {
    for (const method of [claudeCode, codex, other]) {
      expect(readingOrderTargets(filesOf(method)).slice(0, 2)).toEqual([
        'AGENTS.md',
        'orchestration.md',
      ]);
    }
  });
});

describe('orchestration.md says what another tool gets', () => {
  it('RF-642 P6-30 another tool is told the roles are in prose only, with no agents folder', () => {
    const text = filesOf(other)['orchestration.md'] ?? '';
    expect(text).toContain(proseOnly);
    expect(text).toContain('`agents/`');
  });

  it('RF-642 P6-30 the same sentence stands for Claude Code and Codex too', () => {
    for (const method of [claudeCode, codex]) {
      expect(filesOf(method)['orchestration.md']).toContain(proseOnly);
    }
  });
});

describe('no escalation verifier definition (DEC-190)', () => {
  it('RF-642 P6-30 an escalation model adds only the builder definition, never a verifier', () => {
    const files = filesOf(claudeCode, { escalation: 'esc-model' });
    const escalation = Object.keys(files).filter((path) => /escalation/iu.test(path));
    expect(escalation).toEqual(['agents/builder-escalation.md']);
    expect(
      Object.keys(files).filter(
        (path) => /verifier/iu.test(path) && /escalation/iu.test(files[path] ?? ''),
      ),
    ).toEqual([]);
  });
});
