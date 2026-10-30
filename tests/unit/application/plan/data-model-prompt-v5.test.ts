import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// P7-13, RF-623, EV-31, EV-40, EV-75: the data-model prompt v5 adds what the code now checks, so the
// planner is told before it is corrected: no table for what stores nothing, one table for a table and
// its plural, one name for a type, a length that fits the listed values, no column that describes work.

const text = () => readFile('prompts/planner/data-model.v5.md', 'utf8');

describe('prompts/planner/data-model.v5.md: what the planner is told (P7-13)', () => {
  it('RF-623 writes no table for a configuration, view model, registration, glossary or workbook file', async () => {
    const prompt = await text();

    expect(prompt).toMatch(/configuration/iu);
    expect(prompt).toMatch(/view model/iu);
    expect(prompt).toMatch(/registration/iu);
    expect(prompt).toMatch(/workbook file/iu);
    expect(prompt).toMatch(/no table/iu);
  });

  it('RF-623 writes one table for an entity and for the plural of its name', async () => {
    expect(await text()).toMatch(/plural/iu);
  });

  it('RF-623 uses the one name of a type that databaseTypes lists, never a synonym or a deprecated type', async () => {
    const prompt = await text();

    expect(prompt).toMatch(/synonym/iu);
    expect(prompt).toMatch(/deprecated/iu);
    expect(prompt).toContain('varchar(max)');
  });

  it('RF-623 sizes a character column for the longest value a card lists', async () => {
    expect(await text()).toMatch(/longest value/iu);
  });

  it('RF-623 writes no column that describes work', async () => {
    expect(await text()).toMatch(/describes work|what is done with/iu);
  });

  it('RF-623 takes a type from the legacy column claim when it names one', async () => {
    expect(await text()).toMatch(/legacy column claim/iu);
  });

  it('RF-623 keeps v4 and the answer format', async () => {
    const v4 = await readFile('prompts/planner/data-model.v4.md', 'utf8');

    expect(v4.length).toBeGreaterThan(100);
    expect(await text()).toContain('"tables"');
  });
});
