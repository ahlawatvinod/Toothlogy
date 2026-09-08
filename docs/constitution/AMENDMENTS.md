# Constitution Amendments

Changes to [`CONSTITUTION.md`](./CONSTITUTION.md), newest first.
Procedure: Constitution §12.

| Date | Clause | Change | Rationale | Migration impact |
|---|---|---|---|---|
| 2026-09-08 | — | Initial ratification (Phase 0) | Foundation build, Prompt 1 | None — no prior code |

---

## Why this file exists

The Constitution is only useful if it is hard to change quietly. A rule that can
be softened in a diff nobody reads is not a rule.

So the Constitution changes only by **explicit amendment**, recorded here. Code
that contradicts a clause nobody amended is a defect — when code and
Constitution disagree, one of them is wrong, and the disagreement gets resolved
rather than tolerated.

## How to add an amendment

Append a row above and, for anything non-trivial, a section below recording:

1. **Clause amended** — the exact section number and its old text.
2. **Problem** — the concrete situation the old clause made worse. Not "it felt
   restrictive": what actually went wrong, and when.
3. **New text** — the replacement, verbatim.
4. **Migration consequence** — what already-built modules must change, and by
   when. An amendment with no stated migration is incomplete if any code
   depended on the old clause.

Then update the ratification note at the top of `CONSTITUTION.md`.

## What does *not* require an amendment

- Adding a division, module, permission, event or flag to the registry.
- Clarifying wording that does not change meaning.
- Anything in `docs/architecture/`, which describes implementation rather than
  governing it.

If you are unsure whether a change is an amendment: if it would let something
through that the Constitution currently forbids, it is one.
