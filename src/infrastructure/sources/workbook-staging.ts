import type {
  PublishedWorkbooks,
  PublishRequest,
  ReceiveRequest,
  StagedFile,
  WorkbookStaging,
} from '../../application/ports/workbook-staging.js';
import type { WorkbookLimits } from './workbook/workbook-limits.js';
import type { SpaceReservation } from './space-reservation.js';

// RF-150, RF-151, RF-152, RFC-005 section 4.2: the staging area of a workbook batch over the data folder.

export interface DiskWorkbookStagingOptions {
  readonly dataDir: string;
  readonly reservation: SpaceReservation;
  readonly limits?: Partial<WorkbookLimits>;
  /** How long the body may stay silent. */
  readonly stallMs?: number;
  /** How long reading and rendering a batch may take. */
  readonly publishTimeoutMs?: number;
}

const notYet = (what: string): Promise<never> =>
  Promise.reject(new Error(`not implemented: ${what}`));

export class DiskWorkbookStaging implements WorkbookStaging {
  private readonly options: DiskWorkbookStagingOptions;

  constructor(options: DiskWorkbookStagingOptions) {
    this.options = options;
  }

  open(limitBytes: number): Promise<string> {
    return notYet(`open ${this.options.dataDir} ${String(limitBytes)}`);
  }

  receive(id: string, request: ReceiveRequest): Promise<StagedFile> {
    return notYet(`receive ${id} ${request.fileName}`);
  }

  publish(id: string, request: PublishRequest): Promise<PublishedWorkbooks> {
    return notYet(`publish ${id} ${request.projectId}`);
  }

  discard(id: string): Promise<void> {
    return notYet(`discard ${id}`);
  }
}
