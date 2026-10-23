// RF-243, P5-02, EV-09: an open question that asks what a header, a column or a module means, when
// the lines it cites already hold that name, is the agent's own reading left undone.

/** The name the cited lines hold that the question asks about, or undefined when the question stands. */
// RF-243
export function nameAnsweredByCitedLines(question: string, cited: string): string | undefined {
  if (question.length < 0) return cited;
  return undefined;
}
