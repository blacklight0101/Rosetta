import { describe, expect, it } from 'vitest';
import {
  parseTextAnswer,
  stripThinking,
  textProtocolSystem,
  toolCallBlock,
  toolResultBlock,
} from '../../../../../src/infrastructure/providers/ollama/text-tool-protocol.js';

// RF-205: the JSON-in-text tool protocol for models without native tool calling.

const fence = '```';

describe('thinking text', () => {
  it('RF-205 thinking blocks are left out of the answer', () => {
    expect(stripThinking('<think>plan\nmore</think>\nAnswer.')).toBe('\nAnswer.');
  });

  it('RF-205 an answer cut off inside its thinking keeps no thinking text', () => {
    expect(stripThinking('<think>still thinking')).toBe('');
  });

  it('RF-205 text without thinking is unchanged', () => {
    expect(stripThinking('No thinking here.')).toBe('No thinking here.');
  });
});

describe('thinking tags', () => {
  it('RF-205 the text before an orphan closing tag is thinking and never reaches the answer', () => {
    expect(stripThinking('plan the answer</think>Answer.')).toBe('Answer.');
    expect(stripThinking('plan</thinking>Answer.')).toBe('Answer.');
  });

  it('RF-205 visible text before an orphan closing tag is hidden with the thinking', () => {
    expect(stripThinking('A<think>x</think>B</think>C')).toBe('C');
    expect(stripThinking('<think>a</think>keep</think>z')).toBe('z');
    expect(stripThinking('Part one.</think>Part two.')).toBe('Part two.');
  });

  it('RF-205 thinking tags in any letter case are stripped', () => {
    expect(stripThinking('<THINK>plan</THINK>Answer.')).toBe('Answer.');
    expect(stripThinking('<Think>plan</think>Answer.')).toBe('Answer.');
    expect(stripThinking('Answer.<THINK>still thinking')).toBe('Answer.');
  });

  it('RF-205 the thinking form of the tag is stripped', () => {
    expect(stripThinking('<thinking>plan</thinking>Answer.')).toBe('Answer.');
    expect(stripThinking('<Thinking>plan</THINKING>Answer.')).toBe('Answer.');
    expect(stripThinking('Answer.<thinking>still thinking')).toBe('Answer.');
  });

  it('RF-205 text between two thinking blocks is kept', () => {
    expect(stripThinking('<think>a</think>One.<thinking>b</thinking> Two.')).toBe('One. Two.');
  });
});

describe('parsing a text answer', () => {
  it('RF-205 a tool_call block becomes a tool call and leaves the prose as text', () => {
    const answer = parseTextAnswer(
      `Reading.\n${fence}tool_call\n{"name": "read_file", "arguments": {"path": "a.cs"}}\n${fence}\n`,
    );

    expect(answer).toEqual({
      text: 'Reading.',
      calls: [{ name: 'read_file', arguments: { path: 'a.cs' } }],
    });
  });

  it('RF-205 a json block or a bare object with only name and arguments is a tool call too', () => {
    const fenced = parseTextAnswer(
      `${fence}json\n{"name": "grep", "arguments": {"pattern": "x"}}\n${fence}`,
    );
    const bare = parseTextAnswer('  {"name": "grep", "arguments": {"pattern": "x"}}  ');

    expect(fenced.calls).toEqual([{ name: 'grep', arguments: { pattern: 'x' } }]);
    expect(bare).toEqual({ text: '', calls: [{ name: 'grep', arguments: { pattern: 'x' } }] });
  });

  it('RF-205 a json block with other fields stays text', () => {
    const content = `${fence}json\n{"name": "Product", "arguments": {}, "type": "ENTITY"}\n${fence}`;

    expect(parseTextAnswer(content)).toEqual({ text: content, calls: [] });
  });

  it('RF-205 a tool_call block that is not valid JSON stays text', () => {
    const content = `${fence}tool_call\n{"name": "read_file", "arguments": \n${fence}`;

    expect(parseTextAnswer(content)).toEqual({ text: content, calls: [] });
  });

  it('RF-205 a tool_call block without a tool name stays text', () => {
    const content = `${fence}tool_call\n{"arguments": {"path": "a.cs"}}\n${fence}`;

    expect(parseTextAnswer(content).calls).toEqual([]);
  });
});

describe('thinking in a text answer', () => {
  it('RF-205 a tool call inside upper-case or thinking-form tags is ignored', () => {
    const call = `${fence}tool_call\n{"name": "grep", "arguments": {}}\n${fence}`;

    expect(parseTextAnswer(`<THINK>${call}</THINK>Done.`)).toEqual({ text: 'Done.', calls: [] });
    expect(parseTextAnswer(`<thinking>${call}</thinking>Done.`)).toEqual({
      text: 'Done.',
      calls: [],
    });
    expect(parseTextAnswer(`${call}</think>Done.`)).toEqual({ text: 'Done.', calls: [] });
  });

  it('RF-205 a tool call inside thinking text is ignored', () => {
    const answer = parseTextAnswer(
      `<think>${fence}tool_call\n{"name": "grep", "arguments": {}}\n${fence}</think>Done.`,
    );

    expect(answer).toEqual({ text: 'Done.', calls: [] });
  });
});

describe('rendering the protocol', () => {
  it('RF-205 an earlier tool call is rendered as a tool_call block', () => {
    expect(toolCallBlock({ id: 'call-1', name: 'grep', arguments: { pattern: 'x' } })).toBe(
      `${fence}tool_call\n{"name":"grep","arguments":{"pattern":"x"}}\n${fence}`,
    );
  });

  it('RF-205 a tool result is rendered as a tool_result block with its call id', () => {
    expect(toolResultBlock('call-1', 'line 1\nline 2')).toBe(
      `${fence}tool_result\n{"id":"call-1","content":"line 1\\nline 2"}\n${fence}`,
    );
  });

  it('RF-205 the system prompt gets the protocol with the tool definitions', () => {
    const system = textProtocolSystem('Describe the area.', 'Tools:\n{{tools}}\nEnd.', [
      { name: 'grep', description: 'Searches.', parameters: { type: 'object' } },
    ]);

    expect(system).toBe(
      'Describe the area.\n\nTools:\n[\n  {\n    "name": "grep",\n    "description": "Searches.",\n    "parameters": {\n      "type": "object"\n    }\n  }\n]\nEnd.',
    );
  });

  it('RF-205 without tools the system prompt is sent unchanged', () => {
    expect(textProtocolSystem('Describe the area.', '{{tools}}', [])).toBe('Describe the area.');
  });
});
