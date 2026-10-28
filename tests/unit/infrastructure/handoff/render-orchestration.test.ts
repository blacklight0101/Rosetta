import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { orchestrationSections } from '../../../../src/infrastructure/handoff/handoff-orchestration-markdown.js';
import type { BuildMethod } from '../../../../src/domain/planning/build-method.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-612, RF-640, P6-07, DEC-03: orchestration.md is the build protocol of an AI-assisted build:
// roles, the band table with the models, the retry ladder, the card status flow, the merge rules,
// the red test first, the report and verdict formats and the hard-rule greps. It is the second
// file of the README reading order and is absent when people build.

const masker = new SecretMasker();
const claudeCode: BuildMethod = { aiAssisted: true, agentTool: { kind: 'claude-code' } };

function filesOf(method: BuildMethod): Readonly<Record<string, string>> {
  const base = handoffOf('Plain text.');
  return renderHandoff({ ...base, brief: { ...base.brief, buildMethod: method } }, masker);
}

function textOf(method: BuildMethod = claudeCode): string {
  return filesOf(method)['orchestration.md'] ?? '';
}

describe('orchestration.md', () => {
  it('RF-640 is written for an AI-assisted build and absent when people build', () => {
    expect(Object.keys(filesOf(claudeCode))).toContain('orchestration.md');
    expect(Object.keys(filesOf({ aiAssisted: false }))).not.toContain('orchestration.md');
    expect(filesOf({ aiAssisted: false })['README.md']).not.toContain('orchestration.md');
  });

  it('RF-640 is second in the README reading order, after AGENTS.md', () => {
    const readme = filesOf(claudeCode)['README.md'] ?? '';
    const order = readme.split('## Reading order')[1]?.split('\n## ')[0] ?? '';
    const links = [...order.matchAll(/\]\(([^)#]+)\)/gu)].map((match) => match[1]);

    expect(links.slice(0, 2)).toEqual(['AGENTS.md', 'orchestration.md']);
    expect(order).toMatch(/^2\. \[orchestration\.md\]\(orchestration\.md\)$/mu);
  });

  it('RF-640 AGENTS.md points to orchestration.md', () => {
    expect(filesOf(claudeCode)['AGENTS.md']).toContain('](orchestration.md)');
  });

  it('RF-640 names the roles: orchestrator as the main session, a builder per tier, an independent verifier', () => {
    const text = textOf();

    expect(text).toMatch(/^## Roles$/mu);
    expect(text).toMatch(/orchestrator/iu);
    expect(text).toContain('main session');
    expect(text).toContain('never as a subagent');
    expect(text).toMatch(/builder per tier/iu);
    expect(text).toMatch(/independent verifier/iu);
    expect(text).toContain('never verifies its own work');
  });
});

describe('orchestration.md part 2', () => {
  it('RF-640 RF-612 the band table lists the bands with the models of the chosen tool', () => {
    const text = textOf();

    expect(text).toMatch(/^## Bands and models$/mu);
    expect(text).toContain(
      '| Difficulty | Builder tier | Builder model | Verifier tier | Verifier model |',
    );
    expect(text).toContain('| 1 to 5 | smallest | haiku | middle | sonnet |');
    expect(text).toContain('| 6 to 8 | middle | sonnet | middle | sonnet |');
    expect(text).toContain('| 9 to 10 | largest | opus | largest | opus |');
  });

  it('RF-640 the band table uses the models the brief names and marks an unnamed tier', () => {
    const named = textOf({
      aiAssisted: true,
      agentTool: { kind: 'codex' },
      models: { smallest: 'small-x', largest: 'big-x' },
    });

    expect(named).toContain('small-x');
    expect(named).toContain('big-x');
    expect(named).toContain('| 6 to 8 | middle | not named | middle | not named |');
  });

  it('RF-640 a named escalation model is used only with the owner approval; none is invented', () => {
    const none = textOf();
    const named = textOf({ ...claudeCode, models: { escalation: 'huge-x' } });

    expect(none).not.toContain('huge-x');
    expect(none).toContain('the owner decides');
    expect(named).toContain('huge-x');
    expect(named).toMatch(/only with the owner's approval/iu);
  });
});

describe('orchestration.md part 3', () => {
  it('RF-640 the retry ladder goes one band up on the second failure and never down', () => {
    const text = textOf();

    expect(text).toMatch(/^## Retry ladder$/mu);
    expect(text).toMatch(/first failure.*same builder/iu);
    expect(text).toMatch(/second failure.*fresh builder one band up/iu);
    expect(text).toContain('never down');
    expect(text).toMatch(/third failure.*owner/iu);
  });

  it('RF-640 the card status flow lists every status and the blocked reasons', () => {
    const text = textOf();

    expect(text).toMatch(/^## Card status flow$/mu);
    for (const status of ['Todo', 'In progress', 'In review', 'Done', 'Blocked (<reason>)']) {
      expect(text).toContain(status);
    }
    expect(text).toContain('```mermaid');
  });

  it('RF-640 RF-636 the merge rules include CI, the verdict, a current branch, needs-owner and squash', () => {
    const text = textOf();

    expect(text).toMatch(/^## Merge rules$/mu);
    expect(text).toMatch(/continuous integration is green/iu);
    expect(text).toMatch(/verifier's verdict is PASS/iu);
    expect(text).toMatch(/up to date/iu);
    expect(text).toContain('`needs-owner`');
    expect(text).toContain('the specification, the ADRs, the decision log or the agent files');
    expect(text).toMatch(/squash/iu);
  });
});

describe('orchestration.md part 4', () => {
  it('RF-640 the red test comes first, as its own commit before the code', () => {
    const text = textOf();

    expect(text).toMatch(/^## Red test first$/mu);
    expect(text).toMatch(/failing test.*before/iu);
    expect(text).toContain('`test:` commit');
  });

  it('RF-640 the report and verdict formats are given as blocks', () => {
    const text = textOf();

    expect(text).toMatch(/^## Report and verdict formats$/mu);
    for (const field of [
      'TASK:',
      'DONE:',
      'NOT DONE / DEVIATIONS:',
      'VERIFY:',
      'OPEN QUESTIONS:',
    ]) {
      expect(text).toContain(field);
    }
    for (const field of ['VERDICT:', 'FINDINGS:', 'BLOCKING', 'MAJOR', 'MINOR']) {
      expect(text).toContain(field);
    }
  });

  it('RF-640 the hard-rule greps the verifier runs include the package own rules', () => {
    const text = textOf();

    expect(text).toMatch(/^## Hard-rule greps$/mu);
    expect(text).toContain('`eval(`');
    expect(text).toContain('`rejectUnauthorized`');
    expect(text).toContain('Plain text.');
  });
});

describe('orchestration.md part 5', () => {
  it('RF-640 the writer is a list of sections that later cards can append to', () => {
    const text = textOf();
    const headings = [...text.matchAll(/^## (.+)$/gmu)].map((match) => match[1]);

    expect(orchestrationSections.length).toBeGreaterThanOrEqual(8);
    expect(headings).toHaveLength(orchestrationSections.length);
    expect(text).toMatch(/^# orchestration\.md$/mu);
  });

  it('RF-640 DEC-03 names no employer, no other project and no id of this product repository', () => {
    const text = textOf({ ...claudeCode, models: { escalation: 'huge-x' } });

    expect(text).not.toMatch(
      /mission foods|missionfoods|equipmentflow|staffsurvey|centrallogs|arbitragefinder|blacklight|blackligth|rosetta/iu,
    );
    expect(text).not.toMatch(/\b(?:DEC|RF|RNF)-\d+\b/u);
  });
});
