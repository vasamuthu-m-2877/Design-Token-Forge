# DTF Vision Docs

A versioned, iterative vision tree. Each round (`v0.x-*`) is a complete snapshot
of the strategic picture: thesis, problem, architecture, surfaces, journeys,
wireframes, business model, roadmap, risks, open questions.

## How to use

1. Read the current version (start with [v0.1-map](v0.1-map/)).
2. Mark sections inline with one of:
   - `[KEEP]` — approved, freeze it
   - `[REWORK]` — wrong direction, redo
   - `[EXPAND]` — right direction, go deeper
   - `[CUT]` — drop it
   - `> COMMENT: ...` — inline note
3. Hand back. Next round (`v0.2-review/`) responds to every mark, preserves
   `[KEEP]`s verbatim, reworks the rest.
4. Repeat until every section is `[KEEP]`. Final round graduates out of
   `vision/` into canonical `docs/` (positioning, roadmap, architecture).

## Versions

| Version | Status | Summary |
|---|---|---|
| [v0.1-map](v0.1-map/) | superseded for changed sections (see v0.2) | First full map, shallow depth across all 10 sections |
| [v0.2-map](v0.2-map/) | **draft** — awaiting review | Foundation tier added; 21 findings from walkthrough + 2 probes folded in. Delta-only — inherits unchanged sections from v0.1 |

## Conventions

- Wireframes use ASCII boxes + Mermaid (no Figma round-trips during iteration).
- Each section is its own file so reviews can happen in parallel.
- Open questions live in `09-open-questions.md`, not buried in prose.
- Risks live in `08-risks.md`, called out honestly, not hidden.
