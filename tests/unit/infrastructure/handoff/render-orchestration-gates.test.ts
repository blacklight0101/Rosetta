import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import type { BuildMethod } from '../../../../src/domain/planning/build-method.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-640, RF-643, P6-08: orchestration.md also carries the human gates taken from the plan, the
// usage throttle (default bands are the team's choice), escalation and stop conditions, the size
// budgets of living files and, only for a hosted application, a recommended delivery flow.

const masker = new SecretMasker();
const claudeCode: BuildMethod = { aiAssisted: true, agentTool: { kind: 'claude-code' } };
const codex: BuildMethod = { aiAssisted: true, agentTool: { kind: 'codex' } };

interface Options {
  readonly method?: BuildMethod;
  readonly deployment?: 'hosted' | 'not-hosted';
  readonly text?: string;
  readonly noPhases?: boolean;
}

function textOf(options: Options = {}): string {
  const base = handoffOf(options.text ?? 'Plain text.');
  const context = {
    ...base.brief.context,
    ...(options.deployment === undefined ? {} : { deployment: options.deployment }),
  };
  const handoff = {
    ...base,
    brief: { ...base.brief, context, buildMethod: options.method ?? claudeCode },
    content: options.noPhases === true ? { ...base.content, phases: [] } : base.content,
  };
  return renderHandoff(handoff, masker)['orchestration.md'] ?? '';
}

function sectionOf(text: string, heading: string): string {
  return text.split(`## ${heading}\n`)[1]?.split('\n## ')[0] ?? '';
}

describe('orchestration.md human gates', () => {
  it('RF-640 lists the gates of the plan: each phase exit and the open questions, opened by a person', () => {
    const section = sectionOf(textOf(), 'Human gates');

    expect(section).toContain('| Gate | Held by | Opens when | Blocks |');
    expect(section).toMatch(/^\| Phase 1 exit: /mu);
    expect(section).toContain('Plain text.');
    expect(section).toMatch(/^\| Open questions \|/mu);
    expect(section).toContain('](open-questions.md)');
    expect(section).toMatch(/orchestrator never opens a gate/iu);
  });

  it('RF-640 names the last phase exit as the end of the build and a plan without phases lists none', () => {
    expect(sectionOf(textOf(), 'Human gates')).toMatch(/Phase 1 exit.*the end of the build/u);

    const none = sectionOf(textOf({ noPhases: true }), 'Human gates');
    expect(none).not.toMatch(/^\| Phase \d+ exit/mu);
    expect(none).toMatch(/names no phase/iu);
    expect(none).toMatch(/^\| Open questions \|/mu);
  });
});

describe('orchestration.md usage throttle', () => {
  it('RF-640 gives the bands as defaults that are the team choice, one agent at a time', () => {
    const section = sectionOf(textOf(), 'Usage throttle');

    expect(section).toMatch(/team's choice/iu);
    expect(section).toMatch(/one agent at a time/iu);
    for (const band of ['below 50%', '50% to 70%', '70% to 85%', '85% or more']) {
      expect(section).toContain(`| ${band} |`);
    }
    expect(section).toMatch(/running agent is not killed/iu);
    expect(section).toMatch(/cannot be read/iu);
  });

  it('RF-640 RF-634 one agent at a time is the default, and parallel groups raise it by a recorded decision', () => {
    const section = sectionOf(textOf(), 'Usage throttle');

    expect(section).not.toMatch(/orchestrator runs one agent at a time/iu);
    expect(section).toMatch(/default bands the orchestrator launches one agent at a time/iu);
    expect(section).toMatch(/in parallel raises this limit by a decision it records/iu);
  });

  it('RF-640 names the usage command only for Claude Code', () => {
    expect(sectionOf(textOf(), 'Usage throttle')).toContain('`/usage`');
    expect(sectionOf(textOf({ method: codex }), 'Usage throttle')).not.toContain('/usage');
  });

  it('RF-640 assumes a weekly window only for Claude Code', () => {
    const claude = sectionOf(textOf(), 'Usage throttle');
    const other = sectionOf(textOf({ method: codex }), 'Usage throttle');

    expect(claude).toMatch(/Above 70% of the weekly window, at most one agent per hour/u);
    expect(other).not.toMatch(/weekly/iu);
    expect(other).toMatch(/Above 70% of the longest usage window/u);
  });
});

describe('orchestration.md escalation and stop conditions', () => {
  it('RF-640 a card never gets the escalation model at plan time; only at the third failure with approval', () => {
    const section = sectionOf(
      textOf({ method: { ...claudeCode, models: { escalation: 'huge-x' } } }),
      'Escalation and stop conditions',
    );

    expect(section).toMatch(/never gets the escalation model/iu);
    expect(section).toMatch(/plan is made/iu);
    expect(section).toMatch(/third failure/iu);
    expect(section).toMatch(/owner's approval/iu);
    expect(section).toMatch(/orchestrator records/iu);
  });

  it('RF-640 with no escalation model named, the section speaks of none and points to the retry ladder', () => {
    const section = sectionOf(textOf(), 'Escalation and stop conditions');

    expect(section).toMatch(/no escalation model is named/iu);
    expect(section).not.toMatch(/\bthe escalation model\b/iu);
    expect(section).toMatch(/retry ladder/iu);
    expect(section).toMatch(/owner decides/iu);
  });

  it('RF-640 invents no way for a card to get the model and repeats no model name', () => {
    const section = sectionOf(
      textOf({ method: { ...claudeCode, models: { escalation: 'huge-x' } } }),
      'Escalation and stop conditions',
    );

    expect(section).not.toContain('huge-x');
    expect(section).not.toMatch(/owner approved/iu);
  });

  it('RF-640 lists the stop conditions', () => {
    const section = sectionOf(textOf(), 'Escalation and stop conditions');

    for (const condition of [
      'a gate is needed',
      'third failure',
      'contradiction between documents',
      'hard-rule violation',
      'fails on the integration branch',
      'cannot reach',
    ]) {
      expect(section).toContain(condition);
    }
    expect(section).toMatch(/exit code/iu);
  });
});

describe('orchestration.md size budgets', () => {
  it('RF-640 states the budget of the AGENTS.md index and of the tool memory file', () => {
    const claude = sectionOf(textOf(), 'Size budgets of living files');
    const other = sectionOf(textOf({ method: codex }), 'Size budgets of living files');

    expect(claude).toMatch(/AGENTS\.md.*about 60 lines/u);
    expect(claude).toMatch(/CLAUDE\.md.*about 150 lines/u);
    expect(claude).toMatch(/move the detail into a file/iu);
    expect(other).toMatch(/AGENTS\.md.*about 60 lines/u);
    expect(other).not.toContain('CLAUDE.md');
  });
});

describe('orchestration.md recommended delivery flow', () => {
  it('RF-643 a hosted application gets the flow, marked as a recommendation', () => {
    const section = sectionOf(textOf({ deployment: 'hosted' }), 'Recommended delivery flow');

    expect(section).toMatch(/recommendation/iu);
    expect(section).toMatch(/record(?:s|ed)? (?:it )?as a decision/iu);
    expect(section).toMatch(/integration branch/iu);
    expect(section).toMatch(/staging/iu);
    expect(section).toMatch(/smoke test/iu);
    expect(section).toContain('`needs-owner`');
    expect(section).toMatch(/merge commit/iu);
    expect(section).not.toMatch(/azure|container apps/iu);
  });

  it('RF-643 the section is absent when the application is not hosted or the brief says nothing', () => {
    for (const deployment of [undefined, 'not-hosted'] as const) {
      const text = textOf(deployment === undefined ? {} : { deployment });

      expect(text).not.toContain('Recommended delivery flow');
    }
  });

  it('RF-643 no orchestration.md at all when people build, hosted or not', () => {
    const base = handoffOf('Plain text.');
    const brief = {
      ...base.brief,
      context: { ...base.brief.context, deployment: 'hosted' as const },
      buildMethod: { aiAssisted: false },
    };

    expect(Object.keys(renderHandoff({ ...base, brief }, masker))).not.toContain(
      'orchestration.md',
    );
  });
});

describe('orchestration.md section list', () => {
  it('RF-640 RF-643 every section has one heading and a hosted brief adds exactly one more', () => {
    const plain = [...textOf().matchAll(/^## (.+)$/gmu)].map((match) => match[1]);
    const hosted = [...textOf({ deployment: 'hosted' }).matchAll(/^## (.+)$/gmu)].map(
      (match) => match[1],
    );

    expect(new Set(hosted).size).toBe(hosted.length);
    expect(hosted).toHaveLength(plain.length + 1);
    expect(plain).toEqual(
      expect.arrayContaining([
        'Human gates',
        'Usage throttle',
        'Escalation and stop conditions',
        'Size budgets of living files',
      ]),
    );
  });
});

describe('orchestration.md new sections with hostile text', () => {
  const hostile = 'evil | <script>alert(1)</script> [x](http://evil.test)\n## Injected heading';

  it('ADR-013 phase names and exit criteria are escaped inside the gate table', () => {
    const text = textOf({ text: hostile, deployment: 'hosted' });
    const section = sectionOf(text, 'Human gates');

    expect(section).not.toMatch(/(?<!\\)<script>/u);
    expect(section).not.toContain('](http://evil.test)');
    expect(text).not.toMatch(/^## Injected heading/mu);
    for (const row of section.split('\n').filter((line) => line.startsWith('| Phase'))) {
      expect(row.replaceAll('\\|', '').split('|')).toHaveLength(6);
    }
  });

  it('DEC-03 the new sections name no employer, no other project and no id of this repository', () => {
    const text = textOf({ deployment: 'hosted' });

    expect(text).not.toMatch(
      /mission foods|missionfoods|equipmentflow|staffsurvey|centrallogs|arbitragefinder|blacklight|blackligth|rosetta/iu,
    );
    expect(text).not.toMatch(/\b(?:DEC|RF|RNF|ADR)-\d+\b/u);
  });
});
