import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import type { BuildMethod } from '../../../../src/domain/planning/build-method.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-640, RF-644, DEC-177, DEC-03: the section "Lessons from running a build" of orchestration.md:
// the always-present items, the item for Claude Code, the items for a Windows platform and a .NET
// stack, and no employer or project name. People building get no orchestration.md at all.

const masker = new SecretMasker();
const windowsParts: readonly RegExp[] = [
  /reserved TCP port ranges/iu,
  /command-line length limit of `npx`/iu,
  /a build locked by a running app is built in another configuration or after stopping the app/iu,
  /container engine stops with its Linux subsystem/iu,
  /overnight system restarts/iu,
];
const claudeCode: BuildMethod = { aiAssisted: true, agentTool: { kind: 'claude-code' } };
const codex: BuildMethod = { aiAssisted: true, agentTool: { kind: 'codex' } };

function filesOf(
  method: BuildMethod,
  stack: readonly { layer: 'language-runtime' | 'hosting'; choice: string }[] = [],
): Readonly<Record<string, string>> {
  const base = handoffOf('Plain text.');
  return renderHandoff(
    {
      ...base,
      brief: { ...base.brief, buildMethod: method },
      choices: {
        ...base.choices,
        stack: stack.map((each) => ({ ...each, name: each.layer, decision: 'ADR-001' })),
      },
    },
    masker,
  );
}

function lessonsOf(
  method: BuildMethod = claudeCode,
  stack: readonly { layer: 'language-runtime' | 'hosting'; choice: string }[] = [],
): string {
  const text = filesOf(method, stack)['orchestration.md'] ?? '';
  const part = text.split('## Lessons from running a build')[1];
  return part === undefined ? '' : (part.split('\n## ')[0] ?? '');
}

const always: readonly [string, RegExp][] = [
  [
    'CI is the authority, read from the exit code',
    /continuous integration.*authority.*exit code/isu,
  ],
  [
    'a flaky test becomes a card, heading before data',
    /flaky.*heading renders before data loads/isu,
  ],
  ['verifier minors that are wording', /minor.*wording.*follow-up card/isu],
  ['owner review changes are recorded', /hands-on review.*decision.*withdrawn.*requirement ids/isu],
  [
    'owner bug report traced, reproduced, fixed',
    /bug report.*logs.*failing test.*follow-up card/isu,
  ],
  ['secrets-scan patterns written self-safe', /self-safe.*Passwor\[d\]=/isu],
  ['parallel cards collide in shared files', /collide.*shared files.*union.*clean full build/isu],
  ['date navigation tests first and last date', /date navigation.*first and last/isu],
  [
    'verifiers work in the worktree',
    /verifiers work only in the branch's worktree.*main checkout/isu,
  ],
  ['a feature branch is built to try', /build a feature branch.*try/isu],
  [
    'agent hygiene',
    /never skip or override hooks.*explicit path.*bare stash.*id they started.*lifecycle scripts/isu,
  ],
  ['one writer per seat', /one writer per seat.*lease file/isu],
  [
    'evaluate on real inputs in a separate stack',
    /real inputs.*separate stack.*own ports.*id per finding/isu,
  ],
  ['freeze scope near a deadline', /deadline.*scope.*journey.*wrong content.*loses data/isu],
  ['show the work at the end of a phase', /shown at the end of a phase/iu],
  ['session end updates the hand-off', /session end.*living hand-off.*stale claims/isu],
  [
    'clean-up after every merge',
    /clean-up after every merge.*worktrees and branches.*running container/isu,
  ],
];

describe('orchestration.md lessons', () => {
  it.each(always)('RF-644 always present: %s', (_name, pattern) => {
    expect(lessonsOf()).toMatch(pattern);
    expect(lessonsOf(codex)).toMatch(pattern);
  });

  it('RF-644 the section has the exact heading and every item is one bullet of at most two sentences', () => {
    const text = filesOf(claudeCode)['orchestration.md'] ?? '';
    expect(text).toMatch(/^## Lessons from running a build$/mu);
    for (const line of lessonsOf()
      .split('\n')
      .filter((each) => each.startsWith('- '))) {
      expect(line.split(/\.\s/u).length).toBeLessThanOrEqual(2);
    }
  });

  it('RF-644 the Claude Code item appears only when the brief names Claude Code', () => {
    const item = /agent definitions load only from the session's project folder/iu;
    expect(lessonsOf(claudeCode)).toMatch(item);
    expect(lessonsOf(codex)).not.toMatch(item);
    expect(
      lessonsOf({ aiAssisted: true, agentTool: { kind: 'other', name: 'Tool-X' } }),
    ).not.toMatch(item);
    expect(lessonsOf({ aiAssisted: true })).not.toMatch(item);
  });

  it('RF-644 the Windows items appear only for a Windows platform', () => {
    const windows = lessonsOf(claudeCode, [{ layer: 'hosting', choice: 'Windows Server' }]);
    for (const part of windowsParts) {
      expect(windows).toMatch(part);
      expect(lessonsOf(claudeCode, [{ layer: 'hosting', choice: 'Linux container' }])).not.toMatch(
        part,
      );
      expect(lessonsOf()).not.toMatch(part);
    }
  });
});

describe('orchestration.md Windows keying (DEC-190)', () => {
  it('RF-644 DEC-190 a stack answer naming IIS gets the Windows items', () => {
    const iis = lessonsOf(claudeCode, [{ layer: 'hosting', choice: 'IIS 10' }]);
    for (const part of windowsParts) {
      expect(iis).toMatch(part);
    }
  });

  it('RF-644 DEC-190 Windows Authentication alone gets no Windows items', () => {
    const auth = lessonsOf(claudeCode, [
      { layer: 'hosting', choice: 'Linux containers with Windows Authentication via Kerberos' },
    ]);
    for (const part of windowsParts) {
      expect(auth).not.toMatch(part);
    }
  });

  it('RF-644 DEC-190 each Windows item states only its fact, in the trimmed wording', () => {
    const windows = lessonsOf(claudeCode, [{ layer: 'hosting', choice: 'Windows Server' }]);
    const bullets = windows.split('\n').filter((each) => each.startsWith('- '));
    expect(bullets).toEqual(
      expect.arrayContaining([
        '- Windows has reserved TCP port ranges.',
        '- The command-line length limit of `npx` applies to long argument lists.',
        '- A build locked by a running app is built in another configuration or after stopping the app.',
        '- The container engine stops with its Linux subsystem.',
        '- Overnight system restarts end running processes.',
      ]),
    );
  });
});

describe('orchestration.md lessons for a matching brief', () => {
  it('RF-644 the .NET item appears only for a .NET stack', () => {
    const item = /another configuration or after stopping the preview/iu;
    expect(lessonsOf(claudeCode, [{ layer: 'language-runtime', choice: 'C# on .NET 10' }])).toMatch(
      item,
    );
    expect(
      lessonsOf(claudeCode, [{ layer: 'language-runtime', choice: 'TypeScript' }]),
    ).not.toMatch(item);
    expect(lessonsOf()).not.toMatch(item);
  });

  it('RF-644 the section is absent when people build', () => {
    expect(filesOf({ aiAssisted: false })['orchestration.md']).toBeUndefined();
    expect(Object.values(filesOf({ aiAssisted: false })).join('\n')).not.toContain(
      'Lessons from running a build',
    );
  });

  it('RF-644 DEC-03 names no employer and no other project', () => {
    const everything = lessonsOf(claudeCode, [
      { layer: 'hosting', choice: 'Windows Server' },
      { layer: 'language-runtime', choice: '.NET' },
    ]);
    expect(everything.length).toBeGreaterThan(500);
    expect(everything).not.toMatch(
      /mission foods|missionfoods|equipmentflow|staffsurvey|centrallogs|classarena|solardashboard|beachdefense|ghostofkiev|arbitragefinder|blueprint/iu,
    );
  });
});
