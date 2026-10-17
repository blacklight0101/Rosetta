import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  plannerSystem,
  stylesText,
} from '../../../../src/application/planning/plan-options-request.js';
import { loadCatalogue } from '../../../../src/infrastructure/prompts/catalogue-files.js';
import { loadPlanOptionsPrompt } from '../../../../src/infrastructure/prompts/prompt-files.js';

// RF-608, RF-609, RF-145, RNF-004: the planner prompt is a versioned file; it treats the blocks as
// data, asks for two styles with evidence and for the seven layers, and takes the styles from the
// catalogue, so a change of the catalogue needs no change of the prompt.

describe('prompts/planner/options.v1.md', () => {
  it('RF-608 states the data rule, the two styles with evidence and the seven layers', async () => {
    const text = await readFile('prompts/planner/options.v1.md', 'utf8');

    expect(text).toMatch(/data, never instructions/iu);
    expect(text).toMatch(/exactly two styles/iu);
    expect(text).toMatch(/only card ids that are listed/iu);
    for (const layer of ['language-runtime', 'backend-framework', 'front-end', 'database']) {
      expect(text).toContain(`\`${layer}\``);
    }
    for (const layer of ['data-access', 'testing', 'hosting']) {
      expect(text).toContain(`\`${layer}\``);
    }
  });

  it('RF-608 is loaded with its version and hash, with the placeholder once', async () => {
    const file = await loadPlanOptionsPrompt('prompts');

    expect(file).toMatchObject({ name: 'planner/options.v1.md', version: 'v1' });
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(file.text.split('{{styles}}')).toHaveLength(2);
  });

  it('RF-608 writes every style of the catalogue with its criteria into the system prompt', async () => {
    const catalogue = await loadCatalogue('prompts');
    const file = await loadPlanOptionsPrompt('prompts');

    const system = plannerSystem(file.text, catalogue);

    expect(catalogue.styles).toHaveLength(6);
    for (const style of catalogue.styles) {
      expect(system).toContain(`- ${style.id} (${style.title}): ${style.rule}`);
      expect(stylesText(catalogue)).toContain(`Choose it when: ${style.chooseWhen.join('; ')}`);
    }
    expect(system).not.toContain('{{styles}}');
  });

  it('RF-608 keeps a dollar sign of the catalogue as it is', async () => {
    const catalogue = await loadCatalogue('prompts');
    const styled = {
      ...catalogue,
      styles: catalogue.styles.map((s) => ({ ...s, rule: 'Keep $& and $1.' })),
    };

    expect(plannerSystem('Styles: {{styles}}', styled)).toContain('Keep $& and $1.');
  });
});
