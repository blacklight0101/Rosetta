import { describe, expect, it } from 'vitest';
import {
  allText,
  cardsOf,
  decisionsOf,
  entryOf,
  packageOf,
  plain,
} from '../../support/plan-method-harness.js';

// RF-608..RF-612, ADR-018, DEC-76, DEC-79: the package follows the planning brief. The style, each
// chosen stack layer and the migration strategy have a decision record, the project context shapes
// the roadmap, and an AI-assisted build gets its agent instructions. Structure tests over real
// packages written from the recorded planner answer.

describe('RF-608 the style and its decision record', () => {
  const answers = {
    architecture: {
      style: 'hexagonal',
      recommended: ['hexagonal', 'clean'],
      evidence: ['FEAT-001'],
    },
  } as const;

  it('RF-608 the chosen style has a decision with the options considered, the evidence and the reason', async () => {
    const files = await packageOf(answers);

    const hexagonal = entryOf('hexagonal');
    const clean = entryOf('clean');
    const decision = decisionsOf(files).find(([, text]) =>
      text.includes(`Architecture style: ${hexagonal.title}`),
    );
    expect(decision?.[1]).toContain('## Options considered');
    expect(decision?.[1]).toContain(`${hexagonal.title} (chosen)`);
    expect(decision?.[1]).toContain(clean.title);
    expect(decision?.[1]).toContain('Source cards: [FEAT-001](../sources.md#feat-001)');
    expect(decision?.[1]).toContain('## Decision');
  });

  it('RF-608 the target architecture names the style, links its decision and says how to check it', async () => {
    const files = await packageOf(answers);

    const path = decisionsOf(files).find(([, text]) => text.includes('Architecture style: '))?.[0];
    const architecture = plain(files['architecture.md']);
    expect(path).toBeDefined();
    expect(architecture).toContain(`](${path ?? ''})`);
    expect(architecture).toContain(entryOf('hexagonal').check);
  });
});

describe('RF-609 the stack and its decision records', () => {
  const stack = [
    { layer: 'database', choice: 'PostgreSQL 17', custom: false },
    { layer: 'language-runtime', choice: 'C# on .NET 10', custom: true },
  ] as const;

  it('RF-609 each chosen layer has a decision record and a layer not chosen has none', async () => {
    const files = await packageOf({ stack });

    const titles = decisionsOf(files).map(([, text]) => text.split('\n')[0] ?? '');
    expect(titles.filter((title) => title.includes('Technology for the'))).toHaveLength(2);
    expect(titles.join('\n')).toContain('Technology for the database layer: PostgreSQL 17');
    expect(titles.join('\n')).toContain(
      'Technology for the language and runtime layer: C# on .NET 10',
    );
    expect(allText(files)).not.toContain('Technology for the hosting layer');
  });

  it('RF-609 the task cards use the chosen technologies and link their decisions', async () => {
    const files = await packageOf({ stack });

    const database = decisionsOf(files).find(([, text]) =>
      text.includes('Technology for the database layer'),
    )?.[0];
    // P5-08: the technology line is the same for every card, so it is written once before the cards.
    const tasks = plain(files['tasks.md']);
    const shared = tasks.slice(0, tasks.indexOf('\n## T-'));
    expect(shared).toMatch(/\nTechnology: .*database: PostgreSQL 17/u);
    expect(shared).toContain('language and runtime: C# on .NET 10');
    expect(shared).toContain(`](${database ?? ''})`);
    for (const card of cardsOf(files)) expect(card).not.toContain('Technology:');
  });

  it('RF-609 with no layer chosen the cards name no technology', async () => {
    const files = await packageOf({});

    expect(plain(files['tasks.md'])).not.toContain('Technology:');
  });
});

describe('RF-610 the migration strategy', () => {
  const cases = [
    ['strangler-fig', 'Strangler Fig', 'one part at a time'],
    ['parallel-change', 'Parallel Change', 'beside the old'],
    ['rewrite', 'Full rewrite', 'single cut-over'],
  ] as const;

  it.each(cases)(
    'RF-610 %s orders the roadmap and has a decision record',
    async (id, name, rule) => {
      const files = await packageOf({ migration: id });

      const roadmap = plain(files['roadmap.md']);
      expect(roadmap).toContain('## Migration strategy');
      expect(roadmap).toContain(rule);
      for (const [, , other] of cases.filter(([each]) => each !== id)) {
        expect(roadmap).not.toContain(other);
      }
      const decision = decisionsOf(files).find(([, text]) => text.includes('Migration strategy: '));
      expect(decision?.[1]).toContain(name);
      expect(decision?.[1]).toContain('## Options considered');
      expect(roadmap).toContain(`](${decision?.[0] ?? ''})`);
    },
  );

  it('RF-610 without an answer the roadmap follows Strangler Fig, the default', async () => {
    const files = await packageOf({});

    expect(plain(files['roadmap.md'])).toContain('one part at a time');
  });

  it('RF-610 the phases keep the planner order after the strategy section', async () => {
    const files = await packageOf({ migration: 'rewrite' });

    const roadmap = plain(files['roadmap.md']);
    expect(roadmap.indexOf('## Migration strategy')).toBeLessThan(roadmap.indexOf('## Phase 1'));
    expect(roadmap.indexOf('## Phase 1')).toBeLessThan(roadmap.indexOf('## Phase 2'));
  });
});

describe('RF-611 the project context', () => {
  const context = {
    teamSize: 2,
    experience: 'Two juniors and one senior',
    deadline: 'by 1 March 2027',
    keepIntegrations: ['SAP export'],
    dataMigration: 'A nightly copy',
  };

  it('RF-611 the answered context is in the roadmap and the phases and cards carry sizes', async () => {
    const files = await packageOf({ context });

    const roadmap = plain(files['roadmap.md']);
    expect(roadmap).toContain('Team size: 2');
    expect(roadmap).toContain('Experience: Two juniors and one senior');
    expect(roadmap).toContain('Deadline: by 1 March 2027');
    expect(roadmap).toContain('Integrations that stay: SAP export');
    expect(roadmap).toContain('Data migration: A nightly copy');
    expect(roadmap).toMatch(/\nSize: 11 points in 6 task cards; about 6 points per person\n/u);
    expect(roadmap).toMatch(/\nSize: 9 points in 5 task cards; about 5 points per person\n/u);
    expect(
      cardsOf(files).map((card) => /\nSize: (\w) \((\d) points?\)\n/u.exec(card)?.slice(1)),
    ).toEqual([
      ['M', '2'],
      ['S', '1'],
    ]);
  });

  it('RF-611 a smaller team gets more points per person in the same phase', async () => {
    const files = await packageOf({ context: { ...context, teamSize: 1 } });

    expect(plain(files['roadmap.md'])).toContain(
      'Size: 11 points in 6 task cards; about 11 points per person',
    );
  });

  it('RF-611 an unanswered context is not stated in the roadmap and is an open question with its default', async () => {
    const files = await packageOf({});

    const roadmap = plain(files['roadmap.md']);
    expect(roadmap).toContain('Team size: not stated');
    expect(roadmap).toContain('Deadline: not stated');
    expect(roadmap).not.toContain('per person');
    const questions = plain(files['open-questions.md']);
    expect(questions).toContain('| context.teamSize |');
    expect(questions).toContain('| context.deadline |');
  });
});

describe('RF-612 the build method for an AI-assisted team', () => {
  const answers = {
    principles: ['solid', 'tdd'],
    stack: [{ layer: 'database', choice: 'PostgreSQL 17', custom: false }],
    buildMethod: { aiAssisted: true },
  } as const;

  it('RF-612 AGENTS.md holds the chosen principles and stack as rules, plan before build and human review', async () => {
    const files = await packageOf(answers);

    const agents = plain(files['AGENTS.md']);
    expect(agents).toContain(entryOf('solid').rule);
    expect(agents).toContain(entryOf('tdd').rule);
    expect(agents).toContain('database: PostgreSQL 17');
    expect(agents).toMatch(/^## Plan before building$/mu);
    expect(agents).toMatch(/^## Human review$/mu);
    expect(agents).toContain('every pull request');
    expect(agents).not.toContain(entryOf('kiss').rule);
    expect(plain(files['README.md'])).toContain('](AGENTS.md)');
  });

  it('RF-612 the task cards are rated by difficulty for builders', async () => {
    const files = await packageOf(answers);

    const ratings = cardsOf(files).map(
      (card) => /\nDifficulty: (\d+) \((.+) model tier\)\n/u.exec(card)?.[1],
    );
    expect(ratings).toEqual(['9', '4']);
    expect(plain(files['AGENTS.md'])).toContain('Difficulty 1 to 5');
  });

  it('RF-612 without AI-assisted build the package has no AGENTS.md and no rating', async () => {
    const files = await packageOf({ ...answers, buildMethod: { aiAssisted: false } });

    expect(Object.keys(files)).not.toContain('AGENTS.md');
    expect(allText(files)).not.toContain('Difficulty:');
    expect(allText(files)).not.toContain('AGENTS.md');
    expect(Object.keys(files)).toContain('conventions.md');
  });
});
