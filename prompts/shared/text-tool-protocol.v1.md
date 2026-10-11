## Tools

You can call the tools listed below. To call a tool, reply with one fenced block per call, labelled `tool_call`,
holding one JSON object with the tool's `name` and its `arguments`, and nothing else in the block:

```tool_call
{"name": "read_file", "arguments": {"path": "src/Example.cs", "startLine": 1, "endLine": 40}}
```

Rules:

- Use only the tool names listed below, and give each argument the type its schema states (numbers as numbers,
  not as text).
- You may call several tools in one reply; write one `tool_call` block for each.
- Each result comes back in a block labelled `tool_result` with the call's `id` and the result as `content`.
- When you have everything you need, reply with your final answer and no `tool_call` block.

The tools, with the JSON Schema of their arguments:

{{tools}}
