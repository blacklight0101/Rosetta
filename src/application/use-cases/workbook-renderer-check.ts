import type { Logger } from '../ports/logger.js';
import type { UploadStore } from '../ports/upload-store.js';
import type { Project } from '../projects/project.js';

// RF-150, RF-152, P3-108: tells whether the workbooks a project holds were rendered by an older
// renderer than the server's. The original files are deleted when a batch ends (RF-152), so a scan
// cannot render them again; the page asks the user to upload the workbooks again instead.

export interface WorkbookRendererCheckDependencies {
  readonly uploads: Pick<UploadStore, 'read'>;
  /** The renderer version this server writes (`WORKBOOK_RENDERER_VERSION`). */
  readonly currentVersion: string;
  readonly logger: Logger;
}

export class WorkbookRendererCheck {
  private readonly deps: WorkbookRendererCheckDependencies;

  constructor(deps: WorkbookRendererCheckDependencies) {
    this.deps = deps;
  }

  /** True when the stored render of a workbook project carries another version than the current one. */
  // RF-152
  async isOlder(project: Project): Promise<boolean> {
    if (project.sourceKind !== 'workbook' || project.upload === undefined) return false;
    try {
      const snapshot = await this.deps.uploads.read(project.upload.snapshotKey);
      if (snapshot?.kind !== 'workbook') return false;
      return snapshot.rendererVersion !== this.deps.currentVersion;
    } catch (error) {
      // A corrupt or unreadable snapshot must not make the project page fail.
      await this.deps.logger.log({
        level: 'warn',
        logger: 'sources',
        message: 'The stored workbook snapshot could not be read to check its renderer.',
        data: { reason: error instanceof Error ? error.message : 'unknown' },
      });
      return false;
    }
  }
}
