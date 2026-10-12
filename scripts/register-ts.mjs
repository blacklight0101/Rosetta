// P1-13: lets plain Node run the repository's TypeScript (type stripping, tsconfig
// erasableSyntaxOnly) where a script cannot go through Vitest or Playwright. The sources import
// "./x.js" for "./x.ts", which Node does not map, so this registers a resolve hook for it.
// Usage: node --import ./scripts/register-ts.mjs <file.ts>
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- module.register is stable in practice on Node 24 and is the only way to map .js to .ts without a loader package.
import { register } from 'node:module';

register('./ts-resolve-hook.mjs', import.meta.url);
