# ADR-002: Build Rosetta as a TypeScript command-line tool on Node.js

**Date**: 2026-10-09
**Status**: Amended
**Deciders**: BlackLigth (blacklight0101)

## Context

Rosetta must run on a developer's own machine against a local folder, talk to several AI providers, parse code in
many languages and produce files, including a static HTML report (RF-001, RF-500, RNF-001, RNF-011). It has no users
to authenticate and no shared data (DEC-14). The owner is a .NET developer studying a master whose architecture
module uses TypeScript; learning is a stated goal. Claude agents do most of the building (DEC-22), so mainstream,
well-documented tooling matters.

## Options Considered

1. TypeScript on Node.js, a CLI with no server or database.
2. .NET 10 (C#) console application.
3. Python CLI.
4. A hosted web application with a server and database.
5. Do nothing: no tool, keep analysing by hand.

## Decision

We choose option 1. Rosetta is a TypeScript (strict, ES modules) command-line application on the Node.js LTS line,
distributed from source in R1, with no server process and no database; every result is a file in the output folder.

## Rationale

- First-party SDKs exist for OpenAI and Anthropic, and Ollama exposes an OpenAI-compatible and a native HTTP API,
  all usable from TypeScript (RF-401..RF-404).
- tree-sitter has maintained Node bindings and grammars for most legacy languages, which the language packs need
  (ADR-004).
- The same language renders the HTML report and runs the CLI; one toolchain, one test framework (Vitest).
- The master teaches architecture in TypeScript, so the project doubles as practice; agents write TypeScript well.
- Option 2 lost on fewer agent and tree-sitter examples and on the learning goal, though C# remains the owner's
  strongest language; option 3 lost on weaker typing for a growing codebase; option 4 adds hosting, accounts and
  data protection for no user benefit; option 5 leaves the problem in RFC-001 section 1 unsolved.

## Consequences

**Positive**
- One small runtime on Windows, macOS and Linux; no infrastructure to run or pay for.
- Strict typing lets builders and the verifier catch contract drift between ports and adapters.

**Negative**
- The owner learns a new ecosystem while reviewing agent-built code.
- Native tree-sitter bindings need a build toolchain or prebuilt binaries on Windows; the language pack card must
  check this early (or use the WebAssembly build).
- No npm package in R1 (Q-08): users clone the repository.

## References

- DEC-08, DEC-14, DEC-22; Q-08, Q-09.
- RF-001, RF-007, RF-500, RF-501, RF-800, RF-801; RNF-001, RNF-011.
- ADR-003, ADR-004.

## Notes

- 2026-10-10: amended by DEC-46, DEC-47 and ADR-012 - Rosetta now also starts a local web server on the loopback
  interface for the live web UI; still no hosted service and no database. Input is a public GitHub snapshot, not a
  local folder (DEC-48).
- 2026-10-11: amended by DEC-59 and ADR-014 - the command-line interface is out of scope; Rosetta is a web
  application written in TypeScript on Node.js, shipped as one container image. The language, runtime and toolchain
  choices of this ADR stand; the CLI distribution, exit codes and terminal output do not.
