import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRubric, RUBRIC_FAMILIES } from '../../../../../src/application/lab/judge/rubric.js';

// RF-1407: a rubric is a written file of criteria; every family has one, with grounding.

const labFolder = fileURLToPath(new URL('../../../../../lab/', import.meta.url));
const sha = '0'.repeat(64);

const good = [
  '# Rubric',
  '## grounding - Grounding in the source',
  'Scores 1 to 5.',
  '## coverage - Coverage',
  'text',
  '## secret-detection - A missed secret [veto]',
  'text',
].join('\n');

async function criteriaOf(family: string): Promise<{ id: string; veto: boolean }[]> {
  const text = await readFile(`${labFolder}rubrics/${family}.md`, 'utf8');
  const parsed = parseRubric(family, text, sha);
  return parsed.ok ? [...parsed.value.criteria] : [];
}

describe('a rubric', () => {
  it('RF-1407 lists its criteria with their ids, titles and veto marks', () => {
    const rubric = parseRubric('shared', good, sha);

    expect(rubric.ok && rubric.value.criteria).toEqual([
      { id: 'grounding', title: 'Grounding in the source', veto: false },
      { id: 'coverage', title: 'Coverage', veto: false },
      { id: 'secret-detection', title: 'A missed secret', veto: true },
    ]);
  });

  it('RF-1407 refuses a rubric without grounding, with a repeated id or with fewer than three criteria', () => {
    const noGrounding = good.replace('grounding', 'footing');
    const repeated = `${good}\n## coverage - Again\ntext`;
    const short = '## grounding - G\ntext\n## coverage - C\ntext';

    for (const text of [noGrounding, repeated, short]) {
      expect(parseRubric('reader', text, sha).ok).toBe(false);
    }
  });

  it.each(RUBRIC_FAMILIES)(
    'RF-1407 the %s family has a written rubric with grounding',
    async (family) => {
      const text = await readFile(`${labFolder}rubrics/${family}.md`, 'utf8');
      const digest = createHash('sha256').update(text).digest('hex');

      const rubric = parseRubric(family, text, digest);

      expect(rubric.ok && rubric.value.criteria.map((each) => each.id)).toContain('grounding');
      expect(rubric.ok && rubric.value.criteria.length).toBeGreaterThanOrEqual(3);
    },
  );

  it('RF-1407 the verifier rubric scores agreement with the hand label and the shared one vetoes a missed secret', async () => {
    expect((await criteriaOf('verifier')).map((each) => each.id)).toContain('verdict-correct');
    expect((await criteriaOf('shared')).filter((each) => each.veto).map((each) => each.id)).toEqual(
      ['secret-detection'],
    );
  });
});
