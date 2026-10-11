// RF-101: the counts recorded for every readable file.

const charactersPerToken = 4;

/** Lines as the reader counts them: a final line break does not start another line. */
export function countLines(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

/** About four characters per token, the same estimate the provider adapters use (RF-421). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / charactersPerToken);
}
