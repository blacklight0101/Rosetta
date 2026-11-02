import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ClaimStatus } from '../../src/domain/cards/card-vocabulary.js';
import type { FileEntry } from '../../src/domain/code-map/file-entry.js';
import type { PlanContent, PlanTask } from '../../src/domain/planning/plan-content.js';
import type { SourceCard } from '../../src/domain/planning/plan-sources.js';
import { planOf } from './coverage-fixtures.js';
import { planTask } from './task-card-fixtures.js';

// P8-06, EV-32: the scan of eShopModernizing (paths, languages, lines and artefact kinds only) and
// the two recorded eShop plans of the evaluation of 2026-11-02 (Haiku and Ollama): their task cards
// with requirements and expected files, their requirements with source cards, and the paths each of
// those source cards cites. Read from tests/fixtures/planner.

interface RecordedPlan {
  readonly requirements: readonly { readonly id: string; readonly sources: readonly string[] }[];
  readonly tasks: readonly {
    readonly id: string;
    readonly title: string;
    readonly requirements: readonly string[];
    readonly files: readonly string[];
  }[];
  readonly cards: readonly { readonly id: string; readonly paths: readonly string[] }[];
}

const folder = join('tests', 'fixtures', 'planner');

/** The files of the eShopModernizing scan. */
export async function eshopScanFiles(): Promise<FileEntry[]> {
  const text = await readFile(join(folder, 'eshop-modules-scan.json'), 'utf8');
  const parsed = JSON.parse(text) as {
    files: Omit<FileEntry, 'estimatedTokens' | 'mapLevel'>[];
  };
  return parsed.files.map((each) => ({ ...each, estimatedTokens: each.lines, mapLevel: 'coarse' }));
}

/** A supported source card whose one claim cites these paths. */
export function citingCard(
  id: string,
  paths: readonly string[],
  status: ClaimStatus = 'Supported',
): SourceCard {
  return {
    id,
    type: 'FEAT',
    title: id,
    summary: id,
    area: '(root)',
    claims: [
      {
        claimId: `${id}.c1`,
        text: 'A claim.',
        citations: paths.map((path) => ({ path, startLine: 1, endLine: 2 })),
        status,
      },
    ],
  };
}

export interface RecordedEshopPlan {
  readonly content: PlanContent;
  readonly cards: readonly SourceCard[];
}

/** One of the two recorded plans as a plan content and its source cards. */
export async function recordedEshopPlan(model: 'haiku' | 'ollama'): Promise<RecordedEshopPlan> {
  const text = await readFile(join(folder, 'eshop-recorded-plans.json'), 'utf8');
  const plan = (JSON.parse(text) as Record<'haiku' | 'ollama', RecordedPlan>)[model];
  const tasks: PlanTask[] = plan.tasks.map((each) =>
    planTask({ ...each, requirements: [...each.requirements], files: [...each.files] }),
  );
  const requirements = plan.requirements.map((each) => ({
    ...{ id: each.id, title: each.id, statement: each.id },
    sources: [...each.sources],
  }));
  const cards = plan.cards.map((each) => citingCard(each.id, each.paths));
  return { content: { ...planOf(tasks), requirements }, cards };
}
