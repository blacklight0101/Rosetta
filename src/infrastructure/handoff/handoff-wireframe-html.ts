import type { TargetScreen } from '../../domain/planning/target-ux.js';

// RF-626, RF-507: the wireframe of one target screen as a plain HTML file (stub of the red step).

// RF-626
export function wireframeHtml(screen: TargetScreen, mask: (text: string) => string): string {
  return mask(screen.name).slice(0, 0);
}
