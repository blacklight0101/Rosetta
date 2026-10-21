// RF-264 (Q-53), RF-231: the line of "What was not covered" about first-party files no task read.

/** The first-party files no task read, with the token totals the share is worked out from. */
export interface UnreadFiles {
  /** Largest first. */
  readonly files: readonly { readonly path: string; readonly tokens: number }[];
  readonly firstPartyTokens: number;
  readonly firstPartyReadTokens: number;
}

// RF-264
export function unreadFilesLine(unread: UnreadFiles): string | undefined {
  return unread.files.length === 0 ? undefined : undefined;
}
