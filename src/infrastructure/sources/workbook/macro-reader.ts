import type { MacroLimits } from './macro-limits.js';
import type { MacroProject } from './macro-model.js';

export function readMacroProject(bytes: Uint8Array, limits: MacroLimits): MacroProject {
  return {
    state: 'unreadable',
    reason: `pending ${String(bytes.length)} ${String(limits.maxModules)}`,
    codePage: 1252,
    encoding: 'windows-1252',
    modules: [],
    formControls: [],
  };
}
