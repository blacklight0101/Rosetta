/** What the helper may ask of the host: the platform, the environment and whether a file exists. */
export interface BashLookup {
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  exists(path: string): boolean;
}

/** The bash that runs workflow steps in the tests. Not implemented yet (P2-56 red stage). */
export function resolveBash(lookup: BashLookup): string {
  throw new Error(`resolveBash is not implemented (${lookup.platform})`);
}
