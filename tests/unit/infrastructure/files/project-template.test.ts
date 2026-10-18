import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { loadProjectTemplate } from '../../../../src/infrastructure/files/project-template.js';
import { templateSettings } from '../../../support/project-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-010, data-model.md section 10: the default settings and ignore rules ship as files in
// `templates/`; a template that does not pass the schema stops the server instead of being used.

const temp = useTempRoot('rst-template-');

describe('loadProjectTemplate', () => {
  it('RF-010 the shipped template is valid and carries the shipped ignore rules', () => {
    const rules = templateSettings.scan.ignoreRules;

    expect(rules).toContain('*.pfx');
    expect(rules).toContain('*.mdf');
    expect(rules.endsWith('\n')).toBe(true);
  });

  it('RF-010 the template defaults match data-model.md section 3.1', () => {
    expect(templateSettings).toMatchObject({
      schemaVersion: 1,
      scan: {
        maxFileBytes: 1_000_000,
        areaTokenBudget: 60_000,
        excerptMaxLines: 400,
        allowDenied: [],
      },
      agents: { parallelism: 4 },
      budget: { allowUnpriced: false },
      output: { transcripts: true },
    });
    expect(Object.keys(templateSettings.roles)).toEqual([
      'reader',
      'verifier',
      'planner',
      'summariser',
    ]);
  });

  it('RF-002 an invalid template is refused with RST-1000', async () => {
    const folder = join(temp.path, 'templates');
    await mkdir(folder);
    await writeFile(join(folder, 'project-settings.json'), '{"schemaVersion": 1}');
    await writeFile(join(folder, 'ignore-rules.txt'), '*.key\n');

    await expect(loadProjectTemplate(folder)).rejects.toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });
  });

  it('RF-002 a missing template file is refused with RST-1000', async () => {
    await expect(loadProjectTemplate(join(temp.path, 'nowhere'))).rejects.toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });
  });
});

describe('loadProjectTemplate: output limits', () => {
  it('RF-604 the planner may write a whole package: its output limit is 16384, inside the allowed range', () => {
    const { planner, reader } = templateSettings.roles;

    expect(planner.maxOutputTokens).toBe(16_384);
    expect(planner.maxOutputTokens).toBeLessThanOrEqual(32_768);
    expect(reader.maxOutputTokens).toBe(4096);
  });
});
