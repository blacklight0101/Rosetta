# AGENTS.md

Instructions for any coding agent working on Rosetta (Codex, Claude or another tool).

1. Read [`CLAUDE.md`](CLAUDE.md) first. Despite its name, its rules bind every agent: source-of-truth order, the stack rules, tests first, file and function limits, branches and commits, and what you must never do.
2. Read [`handoff.md`](handoff.md), starting with its resume point: the current state, the build order and the owner's open questions.
3. Follow the build protocol in [`docs/orchestration/README.md`](docs/orchestration/README.md) and take work only from the cards in [`docs/orchestration/tasks.md`](docs/orchestration/tasks.md): one card per branch (`task/<card>-<slug>`), a pull request per card, and a verifier's PASS before a merge.

Rules worth repeating:

- Never push to or force-push `main`, and never skip git hooks (`--no-verify`).
- Never commit secrets, and nothing from the owner's employer.
- Never edit `docs/spec`, `docs/adr`, `docs/rfc`, `docs/decision-log.md`, `CLAUDE.md` or this file in a card branch; the owner decides those. An open question goes in your report with the default you applied, keeping today's behaviour on `main`.
- Documents are written in English; identifiers are never renumbered.
- Commit and pull-request titles follow Conventional Commits (at most 72 characters, lower-case subject); commits end with a `Refs:` line naming the card.
