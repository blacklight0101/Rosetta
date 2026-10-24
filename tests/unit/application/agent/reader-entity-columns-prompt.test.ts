import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadReaderPrompts } from '../../../../src/infrastructure/prompts/prompt-files.js';

// P5-37, RF-202: the reader prompt v9 asks an entity card to state each column with its type,
// nullability, default, key and foreign key, what is missing (a primary key, a unique constraint the
// code relies on) and the cascades; v8 stays unchanged and lacks the rules.

const v9 = () => readFile('prompts/reader/area.v9.md', 'utf8');

describe('prompts/reader/area.v9.md', () => {
  it('RF-202 is the reader system prompt the loader gives', async () => {
    const prompts = await loadReaderPrompts('prompts');

    expect(prompts.system).toMatchObject({ name: 'reader/area.v9.md', version: 'v9' });
    expect(prompts.system.text).toBe(await v9());
  });

  it('RF-202 asks for a column claim with type, nullability and default, citing the line', async () => {
    const text = await v9();

    expect(text).toContain('Column <Table>.<name>: <type>, NOT NULL or NULL');
    expect(text).toMatch(/default <value>/u);
    expect(text).toMatch(/primary key/iu);
    expect(text).toMatch(/foreign key/iu);
    expect(text).toMatch(/one claim for each column/iu);
  });

  it('RF-202 asks for a claim about a missing primary key or unique constraint the code relies on', async () => {
    const text = await v9();

    expect(text).toMatch(/no primary key/iu);
    expect(text).toMatch(/unique constraint/iu);
    expect(text).toMatch(/looks up a row by name/iu);
  });

  it('RF-202 asks for the tables a cascade delete reaches', async () => {
    expect(await v9()).toMatch(/cascade[^.]*every table it reaches/iu);
  });

  it('RF-202 says a missing constraint of a table is a claim of the ENT card, not an OQ card', async () => {
    expect(await v9()).toMatch(/not an `OQ` card/u);
  });

  it('RNF-004 keeps v8 unchanged and without the rules', async () => {
    const old = await readFile('prompts/reader/area.v8.md', 'utf8');

    expect(old).not.toContain('Column <Table>');
  });
});
