/* eslint-disable @typescript-eslint/no-unused-vars -- stub of the test commit (DEC-191) */
// RF-1404: stub, the behaviour comes with the feature commit.

export interface ReadDataBlock {
  readonly source: string;
  readonly excerpts: readonly {
    readonly path: string;
    readonly startLine: number;
    readonly endLine: number;
  }[];
  readonly text: string;
}

// RF-1404
export function readDataBlocks(_message: string): ReadDataBlock[] {
  return [];
}
