import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { loadCatalogue } from '../../../../src/infrastructure/prompts/catalogue-files.js';
import { failureOf } from '../../../support/failure-of.js';
import { useTempRoot } from '../../../support/temp-root.js';

// P7-23, RF-639, RF-645, RNF-004, DEC-190, DEC-200: the default tier models of Claude Code and Codex
// are a catalogue file, versioned by its name, and no model name is a literal in code.

const file = 'agent-models.v1.yaml';

describe('the agent models file of the catalogue', () => {
  it('RNF-004 is shipped in the catalogue folder with the version of its name', async () => {
    expect(await readdir('prompts/catalogue')).toContain(file);
  });

  it('RF-639 names the Claude Code aliases and the Codex models for each tier', async () => {
    const document: unknown = parse(await readFile(join('prompts/catalogue', file), 'utf8'));

    expect(document).toEqual({
      'claude-code': { smallest: 'haiku', middle: 'sonnet', largest: 'opus' },
      codex: { smallest: 'gpt-5-mini', middle: 'gpt-5-codex', largest: 'gpt-5' },
    });
  });

  it('RF-639 the loaded catalogue offers the names of the file', async () => {
    const { agentModels } = await loadCatalogue('prompts');

    expect(agentModels.claudeCode.middle).toBe('sonnet');
    expect(agentModels.codex.largest).toBe('gpt-5');
  });
});

describe('a changed agent models file', () => {
  const temp = useTempRoot('rst-catalogue-models-');
  const path = (): string => join(temp.path, 'catalogue', file);

  it('RF-639 a changed model name is offered with no code change', async () => {
    await cp('prompts/catalogue', join(temp.path, 'catalogue'), { recursive: true });
    await writeFile(path(), (await readFile(path(), 'utf8')).replace('sonnet', 'sonnet-next'));

    const loaded = await loadCatalogue(temp.path);

    expect(loaded.agentModels.claudeCode.middle).toBe('sonnet-next');
    expect(loaded.agentModels.codex.middle).toBe('gpt-5-codex');
  });

  it('RF-639 a missing agent models file is refused with RST-1000', async () => {
    await cp('prompts/catalogue', join(temp.path, 'catalogue'), { recursive: true });
    await rm(path());

    expect(await failureOf(loadCatalogue(temp.path))).toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });
  });

  it.each([
    ['a tier that is missing', 'largest: opus', ''],
    ['an extra tier', 'largest: opus', 'largest: opus\n  extra: x'],
    ['a name with a backtick', 'middle: sonnet', 'middle: "son`net"'],
  ])('RF-639 %s is refused with RST-1000', async (_label, from, to) => {
    await cp('prompts/catalogue', join(temp.path, 'catalogue'), { recursive: true });
    await writeFile(path(), (await readFile(path(), 'utf8')).replace(from, to));

    expect(await failureOf(loadCatalogue(temp.path))).toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });
  });
});
