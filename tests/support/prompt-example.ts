// P3-117: the planner prompts show the form of the answer with placeholders in angle brackets. A
// test that needs the example to parse as an answer fills those placeholders with values the
// answer's checks accept; the form of the example (its keys and its nesting) stays as written.

const filled: Readonly<Record<string, unknown>> = {
  sources: ['FEAT-001'],
  riskClass: 'none',
  adds: [],
  probes: [],
  approach: 'other',
  action: 'keep',
  kind: 'port',
  card: 'FEAT-001',
};

function fill(value: unknown, key?: string): unknown {
  if (key !== undefined && key in filled) return filled[key];
  if (Array.isArray(value)) return value.map((each) => fill(each));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([name, each]) => [name, fill(each, name)]),
    );
  }
  if (typeof value === 'string') return value.replaceAll(/<[^>]*>/gu, 'x');
  return value;
}

/** The fenced JSON example of a prompt with its placeholders filled in, as answer text. */
export function filledExampleOf(prompt: string): string {
  const example = /```json\r?\n([\s\S]*?)\r?\n```/u.exec(prompt)?.[1] ?? '{}';
  return JSON.stringify(fill(JSON.parse(example)));
}
