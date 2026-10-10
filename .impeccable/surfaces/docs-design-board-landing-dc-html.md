---
version: 1
slug: "docs-design-board-landing-dc-html"
primary_target: "docs/design/board/Landing.dc.html"
related_targets: []
---

# Landing page (RF-1200, RF-1201)

Scope: the public landing page at `/`. Visitor mode: Persuade. Audience: the owner's teachers now (they sign in with the teacher account); written so prospective customers (developers and tech leads with inherited legacy code) can read it later. Action: Sign in; secondary Request access (only when a contact address is configured). Proof: a labelled sample run of eShopLegacyWebForms; no invented customers, quotes or numbers. World: the approved v1 tokens (design-system.md), dark theme leading.

## Direction contract

THESIS: The page proves Rosetta by letting the visitor watch a run: agents reading, a verifier judging every claim against cited lines, spend climbing against a cap. It refuses the category default of a headline over three feature cards and a screenshot.

OWN-WORLD: The v1 tokens in the dark theme: ground #0D1413, surfaces #141D1C/#1B2625, teal brand #45B8B0, role colours reader teal, verifier violet #A98BF0, summariser blue #84B9F2, verdict colours ok #63CC88, danger #FF8E84, warn #F2BA5C. System sans, tabular numerals, mono only for paths and code. Lanes, verdict badges, a cost meter and an event stream are the component language.

STORY: The visitor sees agents at work, understands that every claim is checked against the code and that cost is capped, scrolls through how it works (pipeline), evidence (a claim beside its cited lines), cost, security, technology and who built it, then signs in.

FIRST VIEWPORT: Header with wordmark, four anchor links, Request access and Sign in. A two-column band: a 56px headline on the left; lede and the primary Sign in on the right. Below, full width, the replay window: a bar with live dot, repository and stage, a Sample run badge and the cost meter ($0.39 of $2.00); body with five agent lanes and claim counts on the left, the event stream on the right. Primary action top right and beside the lede.

FORM: Live replay as hero (my rank 2 of 7; seed key 6260d331).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: the replay plays (lanes advance, events arrive, verdict badges resolve, the meter fills) on first view and pauses on hover or focus; with reduced motion it renders the finished state.
