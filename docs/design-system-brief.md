# Rosetta: design system brief (input for a design tool)

| | |
|---|---|
| **Status** | Proposed (written 2026-10-09) <!-- FILL: add "sent to <design tool> on YYYY-MM-DD"; after the round trip: "Superseded YYYY-MM-DD: the result is docs/design-system.md v2 and the files in docs/design/board/; where they differ, they win on every point; kept for history only" --> |
| **Sent to** | <!-- FILL: the design tool, e.g. Claude Design, and the person who ran it --> |
| **Folded back into** | [design-system.md](design-system.md) (v2); board exported to `docs/design/board/` |

<!-- FILL: This brief is the only thing the design tool sees, so it must stand alone: product context, users and
devices, brand inputs, hard constraints, the current v1 draft, the screens to mock up, the component list and the
states to design, and exactly what to return in which format. Write it after the v1 draft of docs/design-system.md
exists. Nothing in this brief is a requirement: behaviour is governed by docs/spec/requirements.md, the ADRs and
docs/decision-log.md. Keep the owner's voice ("I want back ..."); the design tool answers the owner. -->

## What this is and what I want back

<!-- FILL: Two or three sentences on what Rosetta is, who uses it and what it replaces, if anything. -->

Below is the design system I have drafted (tokens, layout, input, component inventory, patterns, accessibility).
**Please improve it** and return:

1. A refined **token set** as CSS custom properties for light and dark, with WCAG 2.1 AA contrast verified for
   every text and background pair and for every status badge, delivered as one token file.
2. A **type scale and spacing scale** <!-- FILL: "tuned for two densities: desktop and touch" or "for one
   density" -->.
3. **Component specs** for the inventory in Appendix B (variants, states, sizes, ARIA, keyboard), plus any
   component you think is missing for this domain.
4. **Mockups** of the screens in Appendix A at <!-- FILL: the resolutions of every device class -->, light and
   dark.
5. <!-- FILL: optional, e.g. a print layout for a document or label, or delete -->
6. A **critique** of the draft: what is over-engineered, what is missing for these users and devices, what will
   not work with the chosen UI technology.

Return the tokens as a code block or file, the component specs as tables, and the mockups as HTML or images. I will
export the board to `docs/design/board/` and fold the result back into `docs/design-system.md` as v2.

## Product context

<!-- FILL: The problem, the main flows in one paragraph each (link to docs/process-flows.md), what the product must
feel like (calm, fast, dense, playful, ...), and anything the users complain about today that the design must fix.
No internal jargon without a one-line explanation. -->

## Hard constraints (do not change)

<!-- FILL: The fixed technical and product constraints. Examples of the kind: the UI technology and whether a
component library is allowed; network limits (for example no CDN, fonts and icons self-hosted); theme rules (light
default, how dark is chosen, whether the OS preference is followed); languages and scripts that must render from
one font; accessibility level; minimum touch target; formats that never follow the UI culture; naming of tokens,
classes and components. -->

- <!-- FILL: example, replace --> UI technology: <!-- FILL -->; plain CSS with custom properties; no UI component
  library.
- <!-- FILL: example, replace --> Accessibility: WCAG 2.1 AA; 44 px minimum touch targets; hover is never the only
  affordance.

## Users and devices

| Persona | Where | Device | What they do | Pain today |
|---|---|---|---|---|
| <!-- FILL: example row, replace --> Primary user | office | desktop 1920 x 1080, mouse and keyboard | records and tracks work items | too many clicks per item |
| <!-- FILL: example row, replace --> Administrator | office | desktop | maintains users, roles and catalogues | settings scattered and hard-coded |

## Brand inputs

<!-- FILL: What exists and what is still pending approval: logo and its use, primary and accent colours (with hex
values if known, marked "to approve" when not final), typefaces, tone of voice, any brand guide link. Say which
colours may carry meaning and which are for the logo only. If there is no brand, say so and ask for a neutral
proposal. -->

## Current draft

<!-- FILL: Paste the v1 draft of docs/design-system.md sections 1 to 13 here verbatim (the design tool does not
see the repository), or attach the file and say so. -->

## Appendix A: screens to mock up

<!-- FILL: Every key screen with its route, its content and its primary action. Mark the two or three that matter
most in bold. Include the state screens (empty, loading, error with correlation id, offline or reconnecting, an
external system unreachable). -->

| Screen | Route | Content and primary action |
|---|---|---|
| <!-- FILL: example row, replace --> **Work item list** | `/items` | filter bar, grid with status badges, paging; primary action "New item" |
| <!-- FILL: example row, replace --> States | - | empty, loading, error with correlation id and retry, reconnecting banner |

## Appendix B: components

<!-- FILL: The component inventory of docs/design-system.md section 5 as a list with one line of purpose each, so
the tool can spec them; mark the ones that are domain-specific. -->

| Component | Purpose |
|---|---|
| <!-- FILL: example row, replace --> Button | actions; primary, secondary, ghost, danger; busy state |
| <!-- FILL: example row, replace --> Status badge | one badge per state of Appendix C |

## Appendix C: states to design

<!-- FILL: Every state the user sees on a badge or step (from the state machines in the RFC and the spec), with one
line on what it means for the user and whether it needs their action. -->

| State | Meaning | Needs a person |
|---|---|---|
| <!-- FILL: example row, replace --> `Draft` | created, not submitted | the author |
| <!-- FILL: example row, replace --> `Failed` | refused by the other system | a supervisor |

## Appendix D: ancestry you may reuse

<!-- FILL: An earlier product whose tokens, theme switch, header controls or icons may be ported, with what to keep
and what to change; or "none". -->

## Deliverables expected back (checklist)

- [ ] Token file (light and dark, every density), with the contrast of every pair
- [ ] Type and spacing scales
- [ ] Component specs for Appendix B
- [ ] Mockups for Appendix A at every listed resolution, light and dark
- [ ] Critique of the draft
- [ ] <!-- FILL: optional extra deliverable, or delete -->
