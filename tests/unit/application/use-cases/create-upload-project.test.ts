import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { newProjectSettings } from '../../../support/project-fixtures.js';
import { amy, bob, projectHarness } from '../../../support/project-harness.js';

// RF-128, RF-1105: a project of kind upload has a name and no source yet; its settings are those of
// a GitHub project.

describe('CreateProject.createUpload', () => {
  it('RF-128 stores an upload project with the name, no address and the default settings', async () => {
    const test = projectHarness();

    const outcome = await test.createProject.createUpload({ actor: amy, name: 'OrderDesk' });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.created).toBe(true);
    expect(outcome.value.project).toMatchObject({
      userId: amy.userId,
      name: 'OrderDesk',
      sourceKind: 'upload',
      sourceUrl: '',
      ref: '',
      subpath: '',
      settings: newProjectSettings,
      settingsVersion: 1,
    });
    expect(outcome.value.project.upload).toBeUndefined();
    expect(await test.projects.find(amy.userId, outcome.value.project.id)).toEqual(
      outcome.value.project,
    );
  });

  it('RF-128 trims the name', async () => {
    const test = projectHarness();

    const outcome = await test.createProject.createUpload({ actor: amy, name: '  Order Desk \t' });

    expect(outcome.ok && outcome.value.project.name).toBe('Order Desk');
  });
});

describe('CreateProject.createUpload refusals', () => {
  it.each([
    ['empty', ''],
    ['blank', '  \t '],
    ['too long', 'x'.repeat(201)],
    ['holding a control character', 'Order\u0000Desk'],
    ['holding a line break', 'Order\nDesk'],
  ])('RF-128 refuses a name that is %s and stores nothing', async (_what, name) => {
    const test = projectHarness();

    const outcome = await test.createProject.createUpload({ actor: amy, name });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.requestInvalid });
    expect(await test.projects.list(amy.userId)).toEqual([]);
  });

  it('RF-128 accepts a name of exactly 200 characters', async () => {
    const test = projectHarness();

    const outcome = await test.createProject.createUpload({ actor: amy, name: 'x'.repeat(200) });

    expect(outcome.ok).toBe(true);
  });

  it('RF-128 two uploads with the same name are two projects of their owner', async () => {
    const test = projectHarness();

    const first = await test.createProject.createUpload({ actor: amy, name: 'OrderDesk' });
    const second = await test.createProject.createUpload({ actor: amy, name: 'OrderDesk' });
    await test.createProject.createUpload({ actor: bob, name: 'OrderDesk' });

    expect(first.ok && second.ok && first.value.project.id !== second.value.project.id).toBe(true);
    expect(await test.projects.list(amy.userId)).toHaveLength(2);
    expect(await test.projects.list(bob.userId)).toHaveLength(1);
  });
});

describe('CreateProject.createUpload for workbooks', () => {
  it('RF-150 stores a workbook project with the name, no address and the default settings', async () => {
    const test = projectHarness();

    const outcome = await test.createProject.createUpload({
      actor: amy,
      name: 'Pricing',
      sourceKind: 'workbook',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.project).toMatchObject({
      userId: amy.userId,
      name: 'Pricing',
      sourceKind: 'workbook',
      sourceUrl: '',
      ref: '',
      subpath: '',
      settings: newProjectSettings,
    });
    expect(outcome.value.project.upload).toBeUndefined();
  });

  it('RF-150 refuses a bad name for a workbook project too', async () => {
    const test = projectHarness();

    const outcome = await test.createProject.createUpload({
      actor: amy,
      name: ' ',
      sourceKind: 'workbook',
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.requestInvalid });
  });
});
