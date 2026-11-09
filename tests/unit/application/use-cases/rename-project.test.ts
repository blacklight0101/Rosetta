import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { amy, bob, projectHarness, type ProjectHarness } from '../../../support/project-harness.js';

// RF-010, RF-1105, P8-134, DEC-222: Rename project from the row menu of the projects list. The name
// is checked as the name of a zip or workbook project is checked when it is created (RST-2000), and
// another user's project id answers "not found" like an unknown one; a refusal changes nothing.

const later = Date.parse('2026-11-08T10:00:00.000Z');

async function uploadOf(test: ProjectHarness, name = 'OrderDesk'): Promise<string> {
  const made = await test.createProject.createUpload({ actor: amy, name });
  if (!made.ok) throw new Error('The project was not created');
  return made.value.project.id;
}

describe('RenameProject', () => {
  it('RF-010 the owner renames a project: the trimmed name and the update time change, nothing else', async () => {
    const test = projectHarness();
    const made = await test.createProject.execute({ actor: amy, url: 'https://github.com/o/r' });
    if (!made.ok) throw new Error('The project was not created');
    const before = made.value.project;
    test.clock.set(new Date(later).toISOString());

    const outcome = await test.renameProject.execute({
      actor: amy,
      projectId: before.id,
      name: '  Order Desk legacy \t',
    });

    const expected = { ...before, name: 'Order Desk legacy', updatedAt: later };
    expect(outcome).toEqual({ ok: true, value: expected });
    expect(await test.projects.find(amy.userId, before.id)).toEqual(expected);
  });

  it("RF-1105 another user's project id answers not found and the name stays", async () => {
    const test = projectHarness();
    const id = await uploadOf(test);

    const outcome = await test.renameProject.execute({ actor: bob, projectId: id, name: 'Mine' });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect((await test.projects.find(amy.userId, id))?.name).toBe('OrderDesk');
  });

  it('RF-1105 an unknown project id answers not found, whatever the name', async () => {
    const test = projectHarness();

    const outcome = await test.renameProject.execute({
      actor: amy,
      projectId: '00000000-0000-4000-a000-00000000ffff',
      name: '',
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});

describe('RenameProject refusals', () => {
  it.each([
    ['empty', ''],
    ['blank', '  \t '],
    ['too long', 'x'.repeat(201)],
    ['holding a control character', 'Order\u0000Desk'],
    ['holding a line break', 'Order\nDesk'],
  ])('RF-010 refuses a name that is %s with RST-2000 and changes nothing', async (_what, name) => {
    const test = projectHarness();
    const id = await uploadOf(test);
    const before = await test.projects.find(amy.userId, id);

    const outcome = await test.renameProject.execute({ actor: amy, projectId: id, name });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.requestInvalid });
    expect(await test.projects.find(amy.userId, id)).toEqual(before);
  });

  it('RF-010 accepts a name of exactly 200 characters, as creation does', async () => {
    const test = projectHarness();
    const id = await uploadOf(test);

    const outcome = await test.renameProject.execute({
      actor: amy,
      projectId: id,
      name: 'x'.repeat(200),
    });

    expect(outcome.ok && outcome.value.name).toBe('x'.repeat(200));
  });
});
