import { describe, expect, it } from 'vitest';
import { ReadGate } from '../../../../src/application/agent/read-gate.js';
import { agentCodeMap } from '../../../support/agent-fixtures.js';
import { toolsSetup } from '../../../support/agent-tools-harness.js';

// RF-206, RF-209, EV-38: lines a code map query only lists (the statements of a file) are not a
// read; lines read_file returned are.

const file = 'src/Orders/OrderService.cs';
const entries = agentCodeMap.files.filter((entry) => entry.path === file);

describe('ReadGate and listed lines', () => {
  it('RF-209 EV-38 a path query alone leaves the area not read', async () => {
    const { run } = toolsSetup();
    const gate = new ReadGate(entries);

    gate.note(await run('codemap_query', { path: file }));

    expect(gate.state()).toBe('not-read');
  });

  it('RF-209 EV-38 a read_file call makes the area read', async () => {
    const { run } = toolsSetup();
    const gate = new ReadGate(entries);

    gate.note(await run('codemap_query', { path: file }));
    gate.note(await run('read_file', { path: file, startLine: 1, endLine: 2 }));

    expect(gate.state()).toBe('read');
  });
});
