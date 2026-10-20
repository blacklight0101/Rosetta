import { readFile } from 'node:fs/promises';
import { DEFAULT_MACRO_LIMITS } from '../../src/infrastructure/sources/workbook/macro-limits.js';
import { readMacroProject } from '../../src/infrastructure/sources/workbook/macro-reader.js';

// P3-45: run by a test in a child process with a small heap, so a file that would make `cfb` use
// memory or time without end kills the child (a non-zero exit) instead of the test run.
// Usage: node --max-old-space-size=256 --import ./scripts/register-ts.mjs <this file> <project file>

const path = process.argv[2];
if (path === undefined) throw new Error('A project file is needed');
const project = readMacroProject(await readFile(path), DEFAULT_MACRO_LIMITS);
process.stdout.write(`${project.state}	${project.reason ?? ''}`);
