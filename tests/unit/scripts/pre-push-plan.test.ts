/* eslint-disable n/no-missing-import -- the rule does not resolve .mjs; scripts/pre-push-tests.d.mts declares the module */
import { describe, expect, it } from 'vitest';
// The planner is plain JavaScript; scripts/pre-push-tests.d.mts declares it for TypeScript.
import {
  classify,
  planPrePushTests,
  runPlan,
  type PrePushPlan,
} from '../../../scripts/pre-push-tests.mjs';

const base = 'origin/main';
const flatten = (plan: PrePushPlan): string[] => plan.steps.flat();
const wholeUnit = { mode: 'full', steps: [['run', '--project', 'unit']] };

describe('pre-push file classification', () => {
  it('RNF-005 classifies source, documentation and shared configuration', () => {
    expect(classify('src/domain/budget/utc-periods.ts')).toBe('code');
    expect(classify('tests/unit/scripts/x.test.ts')).toBe('code');
    expect(classify('docs/environments-and-delivery.md')).toBe('doc');
    expect(classify('handoff.md')).toBe('doc');
    for (const file of [
      'vitest.config.ts',
      'package.json',
      'lefthook.yml',
      'tests/support/temp-root.ts',
      'tests/unit/web/setup.ts',
      'scripts/pre-push-tests.mjs',
      'web/vite.config.ts',
    ]) {
      expect(classify(file)).toBe('other');
    }
  });
});

describe('pre-push plan', () => {
  it('RNF-005 a related run takes the unit and web projects and never the integration project', () => {
    const plan = planPrePushTests({ base, changed: ['src/domain/budget/utc-periods.ts'] });

    expect(plan.mode).toBe('related');
    expect(plan.steps).toHaveLength(1);
    expect(flatten(plan)).toEqual(
      expect.arrayContaining(['--project', 'unit', '--project', 'web', '--changed', base]),
    );
    expect(flatten(plan)).not.toContain('integration');
  });

  it('RNF-005 a documentation-only push runs the documentation consistency tests and no others', () => {
    const plan = planPrePushTests({ base, changed: ['docs/environments-and-delivery.md'] });

    expect(plan.mode).toBe('related');
    expect(plan.steps).toEqual([
      [
        'run',
        '--project',
        'unit',
        '--project',
        'integration',
        'tests/unit/docs',
        'tests/integration/docs',
      ],
    ]);
  });

  it('RNF-005 a push with source and documentation changes runs both selections', () => {
    const plan = planPrePushTests({ base, changed: ['src/a.ts', 'docs/b.md'] });

    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toContain('--changed');
    expect(plan.steps[1]).toContain('tests/unit/docs');
  });

  it('RNF-005 an empty change runs no tests', () => {
    expect(planPrePushTests({ base, changed: [] })).toMatchObject({ mode: 'none', steps: [] });
  });
});

describe('pre-push fallbacks', () => {
  it('RNF-005 no base or an unreadable diff falls back to the whole unit project', () => {
    expect(planPrePushTests({ base: null, changed: ['src/a.ts'] })).toMatchObject(wholeUnit);
    expect(planPrePushTests({ base, changed: null })).toMatchObject(wholeUnit);
  });

  it('RNF-005 more than 25 changed files fall back to the whole unit project', () => {
    const changed = Array.from({ length: 26 }, (_, index) => `src/part-${String(index)}.ts`);

    expect(planPrePushTests({ base, changed }).mode).toBe('full');
  });

  it('RNF-005 a configuration, test-support or script change falls back to the whole unit project', () => {
    const plan = planPrePushTests({ base, changed: ['src/a.ts', 'tests/support/temp-root.ts'] });

    expect(plan).toMatchObject(wholeUnit);
  });
});

describe('pre-push run', () => {
  it('RNF-005 runPlan runs the steps in order and fails the push on a failing step', async () => {
    const calls: string[][] = [];
    const plan = planPrePushTests({ base, changed: ['src/a.ts', 'docs/b.md'] });
    const failing = await runPlan(plan, {
      spawnChild: (command, args) => {
        expect(command).toBe(process.execPath);
        calls.push([...args]);
        return Promise.resolve(1);
      },
    });

    expect(failing).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]?.endsWith('vitest.mjs')).toBe(true);
    expect(calls[0]).toContain('--changed');
  });

  it('RNF-005 runPlan returns zero when every step passes', async () => {
    const plan = planPrePushTests({ base, changed: ['src/a.ts', 'docs/b.md'] });
    let spawns = 0;
    const passing = await runPlan(plan, {
      spawnChild: () => {
        spawns += 1;
        return Promise.resolve(0);
      },
    });

    expect(passing).toBe(0);
    expect(spawns).toBe(2);
  });

  it('RNF-005 runPlan runs nothing for an empty plan', async () => {
    const none = await runPlan(planPrePushTests({ base, changed: [] }), {
      spawnChild: () => {
        throw new Error('no step should run');
      },
    });

    expect(none).toBe(0);
  });
});
