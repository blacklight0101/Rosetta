import type { OutputWriter } from '../../application/ports/output-writer.js';
import type { ReportWriter } from '../../application/ports/report-writer.js';
import type { RunScope } from '../../application/ports/run-events.js';
import type { ReportModel } from '../../application/report/report-model.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { runPath } from '../files/workspace-paths.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { loadReportAssets } from './report-assets.js';
import { renderReplayHtml } from './replay-html.js';
import { renderReportHtml } from './report-html.js';
import { renderReportMarkdown } from './report-markdown.js';
import { renderCostHtml } from './site/cost-page.js';
import { renderQuestionsHtml } from './site/questions-page.js';

// RF-504, RF-506, RF-1013, DEC-112, data-model.md section 3.17: writes the report of a run into the
// `report/` folder of its run folder, through the workspace guard: `report.md`, the same report as
// escaped static HTML, the "Run replay" page, and the stylesheet and script the pages load. Every
// text is masked before it is written (RNF-003); the same report always gives the same bytes.

export interface FileReportWriterOptions {
  readonly writer: OutputWriter;
  readonly masker: TextMasker;
  /** The folder with `report.css` and `replay.js` (`templates/report/`). */
  readonly assetsFolder: string;
}

const FOLDER = 'report';

export class FileReportWriter implements ReportWriter {
  private readonly options: FileReportWriterOptions;

  constructor(options: FileReportWriterOptions) {
    this.options = options;
  }

  // RF-504, RF-506
  async write(scope: RunScope, model: ReportModel): Promise<readonly string[]> {
    const { masker } = this.options;
    const assets = await loadReportAssets(this.options.assetsFolder);
    // The pages are made of repository and model text, so they are masked; the two assets are the
    // files of `templates/report/`, written as they are.
    const files: Readonly<Record<string, string>> = {
      'cost.html': masker.mask(renderCostHtml(model)).text,
      'questions.html': masker.mask(renderQuestionsHtml(model)).text,
      'replay.html': masker.mask(renderReplayHtml(model)).text,
      'replay.js': assets['replay.js'],
      'report.css': assets['report.css'],
      'report.html': masker.mask(renderReportHtml(model)).text,
      'report.md': renderReportMarkdown(model, masker),
    };
    const folder = `${runPath(scope.projectId, scope.runKey)}/${FOLDER}`;
    const written: string[] = [];
    for (const [name, text] of Object.entries(files)) {
      await this.writeOne(scope.userId, `${folder}/${name}`, text);
      written.push(`${FOLDER}/${name}`);
    }
    return written;
  }

  /**
   * One file, whole or not at all. A refusal or a failure of the disk is RST-1701 with its cause;
   * files already written by this build stay, so a build that stops half way is repeated (it
   * writes the same bytes again) rather than undone.
   */
  private async writeOne(userId: string, path: string, text: string): Promise<void> {
    try {
      const result = await this.options.writer.writeText({ userId, path }, text);
      if (result.ok) return;
      throw new RosettaError(ERROR_CODES.reportWriteFailed, result.error.message, {
        cause: result.error,
      });
    } catch (error) {
      if (error instanceof RosettaError) throw error;
      throw new RosettaError(ERROR_CODES.reportWriteFailed, undefined, { cause: error });
    }
  }
}
