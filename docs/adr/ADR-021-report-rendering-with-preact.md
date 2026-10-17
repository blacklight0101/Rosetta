# ADR-021: Render the HTML report from Preact components to static HTML

**Date**: 2026-10-17
**Status**: Proposed
**Deciders**: BlackLigth (blacklight0101)

## Context

The report is a multi-page static site that works without JavaScript and carries its own content security policy
(DEC-44, RF-500, RF-1013). Its first version (P1-43) builds each page by joining strings, and every writer escapes
its own text by hand. The dashboard, the open questions, the cost report and, in P3-02 and P3-03, a page per area
and per card are many more pages with the same pieces (tables, definition lists, badges). DEC-52 chose Preact for
"the web UI and the report components" and the ADR index deferred the choice of how the report uses it until the
first P3 report card. Constraints: repository and model text must reach a page only as text (RF-507, ADR-013); no
inline script or style (RF-1013); the same run must give the same bytes; no new runtime dependency without an ADR
(`docs/environments-and-delivery.md` section 7); `preact` 11.0.0 is already a dependency.

## Options Considered

1. **Preact components, rendered to a string by `preact-render-to-string`**: the usual server-side route, one more
   runtime dependency.
2. **Preact components, rendered to a string by a small serialiser of Rosetta's own**: components are plain Preact
   function components written with `h`; `renderStatic` walks the virtual node tree once, when the report is built,
   and writes the HTML. No new dependency.
3. **Keep string templates** and add the new pages the same way.
4. **A Vite server-side build** of the report components into a bundle that the server loads at run time.
5. Do nothing (the dashboard, questions and cost pages are not built).

## Decision

We choose option 2. The report pages are Preact function components under `src/infrastructure/report/site/`,
written with `h` in `.ts` files so the Node build needs no JSX setting. `renderStatic` turns a component tree into
HTML when `BuildReport` runs (build time of the report, not of the application) and `page-shell.ts` puts the
result in the page frame with the meta content security policy. The serialiser escapes every text and attribute
value, writes only the attributes it knows how to write safely (no event handler, no `style`, no `dangerouslySetInnerHTML`;
any of them throws), and links only through the `safeLink` rule of RF-507. The pages ship no Preact: the output is
plain HTML.

## Rationale

- The serialiser is about a hundred and twenty lines and escapes by construction, which makes RF-507 a property of the renderer
  instead of a habit of each writer; the string templates (option 3) rely on every author remembering to escape.
- Components give the pages the reuse the later cards need (P3-02, P3-03) and share the vocabulary of `web/` (DEC-52).
- Option 1 gives the same result with a package the project does not yet use; it needs the owner's decision under
  the package rule and ties the report to the peer range of that package against Preact 11. Option 2 can be replaced
  by it later without touching a component, because only `renderStatic` changes.
- Option 4 adds a build artefact the server must find at run time and cannot be tested without a build.
- Option 5 leaves RF-500 unmet.

## Consequences

**Positive**
- One place escapes and refuses unsafe markup; a test for it covers every page.
- No dependency is added; the report build stays a plain function over a model, testable without a browser.

**Negative**
- Rosetta owns a hundred and twenty lines of serialiser (void elements, attribute names, boolean attributes) and must test them.
- Components use `h` calls instead of JSX; they read less like the components of `web/`.

## References

- RF-500, RF-507, RF-1013; DEC-44, DEC-52; ADR-005, ADR-013; `docs/data-model.md` section 3.17.
- Card P3-01, issue 77.
