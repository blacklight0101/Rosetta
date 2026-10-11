import { describe, expect, it } from 'vitest';
import {
  numberedToolCalls,
  toolCallOf,
} from '../../../../src/infrastructure/providers/tool-call-shape.js';

// RF-205: native and text-protocol tool calls pass the same validation.

describe('tool call validation', () => {
  it('RF-205 accepts a name and an arguments object', () => {
    expect(toolCallOf({ name: 'grep', arguments: { pattern: 'x' } })).toEqual({
      name: 'grep',
      arguments: { pattern: 'x' },
    });
  });

  it('RF-205 accepts arguments sent as a JSON string', () => {
    expect(toolCallOf({ name: 'grep', arguments: '{"pattern": "x"}' })).toEqual({
      name: 'grep',
      arguments: { pattern: 'x' },
    });
  });

  it('RF-205 accepts a call without arguments as an empty object', () => {
    expect(toolCallOf({ name: 'list_area_files' })).toEqual({
      name: 'list_area_files',
      arguments: {},
    });
  });

  it.each([
    ['no name', { arguments: {} }],
    ['an empty name', { name: '', arguments: {} }],
    ['a list of arguments', { name: 'grep', arguments: ['x'] }],
    ['arguments that are not JSON', { name: 'grep', arguments: '{pattern' }],
    ['arguments that are a JSON number', { name: 'grep', arguments: '12' }],
    ['not an object', 'grep'],
  ])('RF-205 refuses a call with %s', (_case, value) => {
    expect(toolCallOf(value)).toBeUndefined();
  });

  it('RF-205 keeps numeric strings, unknown tools and any path for the agent loop to judge', () => {
    expect(
      toolCallOf({ name: 'open_file', arguments: { path: 'src/Nope.cs', startLine: '12' } }),
    ).toEqual({ name: 'open_file', arguments: { path: 'src/Nope.cs', startLine: '12' } });
  });

  it('RF-205 numbers the calls of one answer call-1, call-2 and so on', () => {
    expect(
      numberedToolCalls([
        { name: 'grep', arguments: {} },
        { name: 'read_file', arguments: {} },
      ]).map((call) => call.id),
    ).toEqual(['call-1', 'call-2']);
  });
});
