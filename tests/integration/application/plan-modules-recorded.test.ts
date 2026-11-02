import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGapAnswer } from '../../../src/application/plan/gap-answer.js';
import { gapMessage } from '../../../src/application/plan/gap-message.js';
import { moduleReasons } from '../../../src/application/plan/module-reasons.js';
import {
  DEPLOYMENT_ITEM,
  moduleItems,
  sourcesWithModules,
} from '../../../src/domain/planning/module-coverage.js';
import { coverageOf } from '../../../src/domain/planning/plan-coverage.js';
import { addGapTasks } from '../../../src/domain/planning/plan-gap.js';
import { sourceModules } from '../../../src/domain/planning/source-modules.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../src/infrastructure/handoff/file-handoff-writer.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { featureOnlyDocuments } from '../../support/coverage-fixtures.js';
import { eshopScanFiles, recordedEshopPlan } from '../../support/eshop-modules-fixtures.js';
import { handoffOf } from '../../support/handoff-package-fixture.js';
import { SequenceIdGenerator } from '../../support/sequence-id-generator.js';

// P8-06, RF-601, RF-607, RF-627, EV-32: the two recorded eShopModernizing plans of the evaluation of
// 2026-11-02 (Haiku and Ollama) against the scan of eShopModernizing. Their task cards built no
// WebForms app, no WinForms client and no deployment; now each module of the scan is an item, so
// the gap round asks for them by id, and the recorded gap answer (synthetic,
// tests/recordings/fake/planner-gap-eshop-modules.json) adds the cards under SDD. Every module then
// has a task card or is named in checks.md with the reason.

const webForms = 'module:eShopLegacyWebFormsSolution/src/eShopLegacyWebForms';
const winForms = 'module:eShopLegacyNTier/src/eShopWinForms';
const masker = new SecretMasker();
const ids = new SequenceIdGenerator();
const tags = (): string => ids.dataBlockTag();

async function gapAnswerText(): Promise<string> {
  const path = join('tests', 'recordings', 'fake', 'planner-gap-eshop-modules.json');
  const attempt = (await loadRecording(path)).calls[0]?.attempts[0];
  return attempt !== undefined && 'response' in attempt ? attempt.response.text : '';
}

async function planned(model: 'haiku' | 'ollama') {
  const { content, cards } = await recordedEshopPlan(model);
  const modules = sourceModules(await eshopScanFiles(), cards);
  const items = moduleItems(modules);
  const before = coverageOf(items, content.tasks).modules;
  const answer = parseGapAnswer(await gapAnswerText());
  const documents = { ...featureOnlyDocuments(), modules };
  const taken = addGapTasks(content, answer?.drafts ?? [], before, {
    ...{ specificationDriven: true, itemSources: sourcesWithModules(documents) },
  });
  const after = coverageOf(items, taken.content.tasks).modules;
  const rounds = { asked: true, refused: false, problems: [] };
  const extra = { modules, moduleReasons: moduleReasons(after, rounds, modules) };
  const checks = renderHandoff(handoffOf('Plain text.', undefined, extra), masker)['checks.md'];
  return { content, modules, before, taken, after, checks: checks ?? '' };
}

describe.each(['haiku', 'ollama'] as const)(
  'the recorded %s eShop plan and its modules',
  (model) => {
    it('RF-601 EV-32 the WebForms app, the WinForms client and the deployment are asked for by id', async () => {
      const { content, before } = await planned(model);

      const ids = before.map((each) => each.id);
      expect(ids).toEqual(expect.arrayContaining([webForms, winForms, DEPLOYMENT_ITEM]));
      const message = gapMessage({ items: before, content }, tags);
      for (const id of [webForms, winForms, DEPLOYMENT_ITEM]) {
        expect(message).toContain(`"id": "${id}"`);
      }
    });

    it('RF-607 the gap cards for the modules are kept under SDD and build them', async () => {
      const { taken, after } = await planned(model);

      expect(taken.leftOut).toEqual([]);
      const open = after.map((each) => each.id);
      expect(open).not.toContain(webForms);
      expect(open).not.toContain(winForms);
      expect(open).not.toContain(DEPLOYMENT_ITEM);
    });

    it('RF-601 every module of the scan has a task card or is named in checks.md with the reason', async () => {
      const { modules, taken, checks } = await planned(model);

      const built = new Set(taken.content.tasks.flatMap((task) => task.builds));
      const section = checks.split(/^## /mu).find((part) => part.startsWith('Modules')) ?? '';
      for (const each of modules.modules) {
        const named = section.includes(`| ${each.path} |`);
        expect(built.has(`module:${each.path}`) || named).toBe(true);
      }
      expect(section).toContain('The planner wrote no task card for it');
      expect(section).toContain('eShopLegacyMVCSolution/eShopLegacy.Utilities');
    });
  },
);
