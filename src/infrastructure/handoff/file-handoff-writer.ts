import type { HandoffWriter } from '../../application/ports/handoff-writer.js';
import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { byCodeUnit } from '../../domain/code-map/code-unit-order.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { markdownEscaper } from '../cards/markdown-text.js';
import { runPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { dataModelMarkdown } from './handoff-data-model-markdown.js';
import { decisionFile, handoffFiles } from './handoff-links.js';
import { agentsMarkdown, conventionsMarkdown } from './handoff-method-markdown.js';
import { prdMarkdown } from './handoff-prd-markdown.js';
import {
  openQuestionsMarkdown,
  readmeMarkdown,
  risksMarkdown,
  sourcesMarkdown,
} from './handoff-list-markdown.js';
import {
  architectureMarkdown,
  decisionMarkdown,
  entityMappingMarkdown,
  requirementsMarkdown,
} from './handoff-plan-markdown.js';
import { roadmapMarkdown } from './handoff-roadmap-markdown.js';
import { trdMarkdown } from './handoff-trd-markdown.js';
import { tasksMarkdown } from './handoff-task-markdown.js';

// RF-601, RF-603, RNF-003, data-model.md section 3.17: writes the hand-off package of a plan run
// into the `handoff/` folder of its run folder, through the workspace guard. Every file is plain
// Markdown (Mermaid inside fences); every piece of text is masked and escaped as it is written,
// and the finished file is masked once more as a last guard. The same package gives the same
// bytes. Each file is written whole or not at all; a refusal or a disk failure is RST-1804.

export interface FileHandoffWriterOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
}

const FOLDER = 'handoff';

/** Every file of the package by its path inside `handoff/`. */
// RF-601, RF-603
export function renderHandoff(
  handoff: HandoffPackage,
  masker: TextMasker,
): Readonly<Record<string, string>> {
  const esc = markdownEscaper(masker);
  const decisions = Object.fromEntries(
    handoff.content.decisions.map((decision) => [
      decisionFile(decision.id),
      decisionMarkdown(decision, esc),
    ]),
  );
  return {
    [handoffFiles.readme]: readmeMarkdown(handoff, esc),
    [handoffFiles.prd]: prdMarkdown(handoff, esc),
    [handoffFiles.trd]: trdMarkdown(handoff, esc, masker),
    [handoffFiles.requirements]: requirementsMarkdown(handoff, esc),
    [handoffFiles.architecture]: architectureMarkdown(handoff, esc, masker),
    ...decisions,
    [handoffFiles.entities]: entityMappingMarkdown(handoff, esc),
    [handoffFiles.dataModel]: dataModelMarkdown(handoff.dataModel, esc, masker),
    [handoffFiles.roadmap]: roadmapMarkdown(handoff, esc),
    [handoffFiles.tasks]: tasksMarkdown(handoff, esc),
    [handoffFiles.risks]: risksMarkdown(handoff, esc),
    [handoffFiles.openQuestions]: openQuestionsMarkdown(handoff, esc),
    [handoffFiles.sources]: sourcesMarkdown(handoff, esc),
    [handoffFiles.conventions]: conventionsMarkdown(handoff, esc),
    ...(handoff.brief.buildMethod.aiAssisted
      ? { [handoffFiles.agents]: agentsMarkdown(handoff, esc) }
      : {}),
  };
}

export class FileHandoffWriter implements HandoffWriter {
  private readonly options: FileHandoffWriterOptions;

  constructor(options: FileHandoffWriterOptions) {
    this.options = options;
  }

  // RF-601, RF-603
  async write(scope: RunScope, handoff: HandoffPackage): Promise<readonly string[]> {
    const { masker } = this.options;
    const files = Object.entries(renderHandoff(handoff, masker)).sort(([a], [b]) =>
      byCodeUnit(a, b),
    );
    const folder = `${runPath(scope.projectId, scope.runKey)}/${FOLDER}`;
    const written: string[] = [];
    for (const [name, text] of files) {
      await this.writeOne(scope.userId, `${folder}/${name}`, masker.mask(text).text);
      written.push(`${FOLDER}/${name}`);
    }
    return written;
  }

  private async writeOne(userId: string, path: string, text: string): Promise<void> {
    try {
      const result = await this.options.writer.writeText({ userId, path }, text);
      if (result.ok) return;
      throw new RosettaError(ERROR_CODES.handoffWriteFailed, result.error.message, {
        cause: result.error,
      });
    } catch (error) {
      if (error instanceof RosettaError) throw error;
      throw new RosettaError(ERROR_CODES.handoffWriteFailed, undefined, { cause: error });
    }
  }
}
