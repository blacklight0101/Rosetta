import { describe, expect, it } from 'vitest';
import { questionOptions } from '../../../web/src/lib/plan-setup/question-options.js';
import { catalogue, planOptions } from './plan-setup-fixtures.js';

// RF-609, EV-65: the page shows the description of a stack option beside its name.

describe('the stack options of Plan setup', () => {
  it('RF-609 shows the description the planner gave, and keeps the name as the title', () => {
    const database = planOptions.stack.find((each) => each.layer === 'database');
    const options = {
      ...planOptions,
      stack: [
        {
          layer: 'database',
          options: ['PostgreSQL 17', 'SQL Server 2019'],
          descriptions: ['Open source and close to the SQL.', 'Keeps the legacy dialect.'],
        },
      ],
    };

    const shown = questionOptions('stack.database', { catalogue, options });

    expect(database).toBeDefined();
    expect(shown.slice(0, 2).map((each) => each.title)).toEqual([
      'PostgreSQL 17',
      'SQL Server 2019',
    ]);
    expect(shown.slice(0, 2).map((each) => each.description)).toEqual([
      'Open source and close to the SQL.',
      'Keeps the legacy dialect.',
    ]);
  });
});
