// Data-model.md section 1: instants shown to a client are ISO 8601 UTC strings with milliseconds
// and `Z`. The domain keeps epoch milliseconds from the Clock port; this is the one place that
// turns them into text for the HTTP answers.

export function formatInstant(epochMs: number): string {
  return new Date(epochMs).toISOString();
}
