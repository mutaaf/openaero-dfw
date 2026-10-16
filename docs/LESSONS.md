# Lessons

Mistakes already paid for. Every agent reads this before working. Add one dated row when
you learn something a future run must not re-learn; prune rows that no longer apply.

| Date | Lesson | What happened |
|---|---|---|
| 2026-10-16 | A "canvas is not blank" check must hide everything layered over the canvas first | An element screenshot captures the HUD and panels drawn on top, so a dead WebGL canvas still showed many colours. `distinctColours()` now hides overlays; render on = 6 colours, render off = 1. |
| 2026-10-16 | Write expected values from an independent calculation, then verify it | A hand-guessed tile Y (3300) was wrong; the code (3302) was right. Recompute with a separate tool before "fixing" code to match a test. |
| 2026-10-16 | Stub the Esri tile host in tests | Tests must not depend on a third-party server or rate limits. `stubTiles()` serves a 1x1 PNG with CORS headers. |
