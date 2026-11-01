import { describe, expect, it } from 'vitest';
import { checkSectionsOf } from '../../../../src/application/plan/check-sections.js';

// RF-1015 (P7-25): checks.md as the sections the plan run page lists.

describe('checkSectionsOf', () => {
  it('RF-1015 splits the file at its second-level headings and drops the title line', () => {
    const file =
      '# Checks\n\nIntro.\n\n## Plan coverage\n\nEvery item.\n\n| a | b |\n\n## Left out\n\nNothing.\n';

    expect(checkSectionsOf(file)).toEqual([
      { title: 'Plan coverage', text: 'Every item.\n\n| a | b |' },
      { title: 'Left out', text: 'Nothing.' },
    ]);
  });

  it('RF-1015 gives no section for a file without a heading', () => {
    expect(checkSectionsOf('# Checks\n\nNothing here.')).toEqual([]);
  });
});
