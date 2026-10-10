# Product

<!-- impeccable:product-schema 1 -->

Product record for design work (Impeccable). The canonical requirements stay in
[docs/spec/requirements.md](docs/spec/requirements.md); this file summarises the product truth that design depends on.

## Platform

web

## Users

- **Developers and tech leads** who inherit a legacy codebase in any stack and must understand it before replacing
  it. They work at a desk, usually on a laptop or a wide monitor, often in long sessions while a run is in progress.
- **Evaluators**: the owner's teachers at BIG School (Master en Desarrollo con IA), who sign in with a teacher account
  on the hosted URL to try Rosetta and judge the final project (DEC-62, DEC-67).
- **Administrator**: the product owner, who creates accounts, sets caps and server keys, and watches cost (RF-1102,
  RF-1106).
- **Visitors**: people who open the landing page with the shared URL. Today these are the teachers; the page is
  written so it can later address prospective customers without a rewrite (DEC-63).

## Product Purpose

Rosetta takes a public GitHub repository of a legacy system, pins one commit, maps the code without AI, then sends
a team of AI agents through it to write a functional specification (features, business rules, entities,
integrations, open questions). Every claim cites the file and line range it comes from, and a verifier rejects
what the code does not support. From the verified specification it produces a tool-agnostic modernisation hand-off
package. Success: a reader can check any finding against the code in minutes, at a known and capped cost.

## Positioning

Evidence first: no finding without a `path:startLine-endLine` citation, and a two-step verifier (a citation check in
code, then a model judgement) marks every claim supported or rejected, keeping rejected claims visible. The work is
shown live, agent by agent, with the tokens and cost of the whole project always in view. It runs on any provider,
including free local models, and stops at the hand-off: it never rebuilds the system.

## Operating Context

- Pipeline: GitHub URL -> snapshot pinned to a commit -> `scan` (code map) -> `understand` (agents write cards) ->
  verifier -> open questions answered by the user -> `report` (HTML) -> `plan` (hand-off package).
- A web application behind sign-in; one container image runs locally with Docker Compose and hosted for the
  evaluators. Users have private workspaces; runs can wait in a queue.
- Cost: server keys used under caps per run, per user per day and per server per month; users may add their own
  encrypted keys.

## Capabilities and Constraints

- English only (DEC-45). Costs in USD (DEC-54).
- No self sign-up: the administrator creates accounts; the landing page offers Sign in and an optional "Request
  access" e-mail link (Q-20). The landing page is not indexed (RF-1201).
- Repository and model text is rendered as text only; content security policy forbids inline scripts and external
  hosts (RF-507, RF-1013): fonts and assets are self-hosted.
- Accessibility WCAG 2.2 AA (RNF-010); light and dark follow the operating system.

## Brand Commitments

- Name **Rosetta** (working name), code `RST`; a text wordmark (DEC-44).
- The approved visual system is [docs/design-system.md](docs/design-system.md) v1 with
  [docs/design/tokens.css](docs/design/tokens.css) and the board in [docs/design/board/](docs/design/board/) (G-02,
  DEC-56). New screens extend it.
- Voice: precise and evidence-first. Short, plain, confident sentences; every claim is backed by something the tool
  shows (a citation, a verdict, a cost figure).

## Evidence on Hand

- The demo target: Microsoft eShopLegacyWebForms (`dotnet-architecture/eShopModernizing`, MIT).
- The approved board shows the live run, API calls, history and report with sample data.
- No customers, testimonials, press, benchmarks or accuracy figures exist yet. Pages may show demonstration material
  from the eShop demo, labelled "sample run" until a real run replaces it; they never invent customers, quotes,
  prices or numbers.

## Product Principles

1. Prove, don't claim: show the citation, the verdict and the cost instead of describing them.
2. Nothing hidden: rejected claims, failed calls and spend stay visible.
3. The person stays in charge: open questions go to a human; caps stop runs before they overspend.
4. Any stack, any provider: no design assumes C#, one model vendor or a cloud.

## Accessibility & Inclusion

WCAG 2.2 AA for the web UI, landing page and report (RNF-010); every state is carried by text and a glyph, never by
colour alone; keyboard operable; reduced motion respected.
