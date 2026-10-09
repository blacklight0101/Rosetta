# ADR-003: Own the agent loop behind a swappable LLM provider port

**Date**: 2026-10-09
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

Rosetta's agents explore a repository with tools, and every model call must be metered, capped and filtered before
it leaves the machine (DEC-13, DEC-16). The owner wants to start on free local models (Ollama), use existing OpenAI
credit, add Anthropic later and try other services, and wants to learn how agent loops work (DEC-09). Local 7-9B
models may not support native tool calling well (Q-04).

## Options Considered

1. Claude Agent SDK: a complete agent harness with built-in tools and subagents, Claude models only.
2. A multi-provider framework that owns the loop (for example an AI SDK or LangChain).
3. An own agent loop in Rosetta's core, calling models only through an `LlmProvider` port with one adapter per
   provider family: Ollama, OpenAI, OpenAI-compatible (base URL plus key), Anthropic.
4. Do nothing: one hard-wired provider.

## Decision

We choose option 3. The core owns the loop (send, receive tool calls, run read-only tools, repeat until a final
answer, a turn limit or a cap). The port takes a system prompt, messages and tool definitions and returns text, tool
calls and usage (input, output, cached input tokens) in one shape. Each role (`reader`, `verifier`, `planner`,
`summariser`) names its provider and model in configuration. Adapters may implement a text protocol for tool calls
when a model lacks native support (RF-205). A Claude Code plugin run mode reuses the prompts later (R2).

## Rationale

- Only an own loop lets the egress guard and the budget guard sit between every call and every provider without
  exception (ADR-006, ADR-007).
- One adapter for OpenAI-compatible APIs covers OpenRouter, Groq, DeepSeek, Gemini's compatible endpoint and similar
  services, so most new providers need configuration, not code (RF-403).
- A model per role lets cheap local models read and a stronger model verify, the cost lever in RFC-001 section 4.8.
- Owning the loop is the learning goal and gives the master project its provider comparison.
- Option 1 lost on Claude-only access; option 2 hides exactly the loop we must control and adds a large dependency;
  option 4 contradicts DEC-09.

## Consequences

**Positive**
- Any provider, local or cloud; switching is a configuration change.
- Recorded responses at the port make the whole agent behaviour testable offline (ADR-008).

**Negative**
- We write and maintain the loop, retries, tool-call parsing and adapters (RF-400..RF-407).
- Providers differ in tool-call formats, usage fields and caching; a contract test suite must run against every
  adapter.
- Features one vendor offers (server-side tools, caching specifics) are used only through the common subset or
  adapter options.

## References

- DEC-09, DEC-23; Q-04.
- RF-200, RF-201, RF-205, RF-400..RF-407; RFC-001 sections 3 and 4.5.2.
- ADR-006, ADR-007, ADR-008.
