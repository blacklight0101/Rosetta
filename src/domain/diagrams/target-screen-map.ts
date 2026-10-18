import type { TargetUx } from '../planning/target-ux.js';

// RF-626, RF-508: the target screen map (stub of the red step).

// RF-626
export function targetScreenMap(ux: TargetUx, mask: (text: string) => string): string {
  return mask('flowchart LR') + ''.repeat(ux.screens.length * 0) + '\n';
}
