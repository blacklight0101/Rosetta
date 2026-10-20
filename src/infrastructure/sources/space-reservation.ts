// DEC-149, RF-129: the free space the uploads under the data folder may still count on.

export interface SpaceReservationOptions {
  readonly dataDir: string;
  /** Free bytes of the data folder; the file system's by default. */
  readonly freeBytes?: () => Promise<number>;
}

/** Gives the held bytes back; calling it again does nothing. */
export type Release = () => void;

export class SpaceReservation {
  private readonly options: SpaceReservationOptions;

  constructor(options: SpaceReservationOptions) {
    this.options = options;
  }

  reserve(requiredBytes: number): Promise<Release> {
    const folder = this.options.dataDir;
    return Promise.reject(new Error(`not implemented: ${folder} ${String(requiredBytes)}`));
  }
}
