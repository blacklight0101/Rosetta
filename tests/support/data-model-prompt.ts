import { readFile } from 'node:fs/promises';

/** The shipped data-model prompt, as the call sends it. */
export function promptFixture(): Promise<string> {
  return readFile('prompts/planner/data-model.v3.md', 'utf8');
}
