import type { ReaderPrompts } from '../../agent/reader-prompts.js';
import type { LabTarget } from '../lab-target.js';

// RF-1406, RF-1409: stub, the targets follow in the next commit.
export function cardSurfaceTargets(current: ReaderPrompts): LabTarget[] {
  return current.surface === undefined ? [] : [];
}
