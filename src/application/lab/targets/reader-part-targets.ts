import type { ReaderPrompts } from '../../agent/reader-prompts.js';
import type { LabTarget } from '../lab-target.js';

// RF-1406: the targets of the other reader prompts follow (red stub).
export function readerPartTargets(current: ReaderPrompts): LabTarget[] {
  return current.system.text === '' ? [] : [];
}
