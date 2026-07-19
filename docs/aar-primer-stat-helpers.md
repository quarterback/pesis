# AAR — onboarding primer, ⓘ stat helpers, PR #26 triage

*Session: 2026-07-19. Branch: `claude/batting-average-merge-conflict-pz7uaj`.*

## What this session did

- **Triaged PR #26 ("Add analytics handoff AAR").** The owner suspected it was
  the stuck batting-average fix. It is not: the branch
  (`codex/research-new-analytics-for-site`) is a July 2 Codex snapshot whose
  content already landed on main through other PRs (the AAR docs are on main
  verbatim; metrics/lukkari/value code exists in newer form). Its
  `translate.py` still carries the pre-fix quantile AVG mapping, so merging it
  would reintroduce the bug and fight the static-site architecture.
  **Recommendation: close PR #26 unmerged.** The real fix was PR #28
  (`a8f01e7e`, linear KL%→AVG recenter), merged 2026-07-15 and verified live
  in mallo.fi's exported data.
- **Added the Opas/Primer page** (`site/js/primer.js`, route `#/primer`).
  Two audience tracks × two languages, four variants total:
  - `for=baseball` (default EN): what sabermetrics-style analysis is doing
    here, the rules in brief, the box score decoded (KL% ≈ AVG on a ~.530
    scale, lyödyt ≈ RBI, tuodut ≈ R), Mallo stats mapped to MLB analogs
    (TEHO+ ≈ wRC+, VYK ≈ WAR, PARE ≈ Steamer/ZiPS, LRA ≈ ERA), positions.
  - `for=pesis` (default FI): where sabermetrics came from (James, the 2002
    A's, spread to basketball/soccer/hockey), what it offers pesäpallo, the
    baseball vocabulary in plain language, how the ⚾ translation works.
  - Nav link "Opas", "new here?" pointer on the default leaderboard.
- **Added ⓘ stat helpers site-wide** (`STAT_INFO` in `site/js/app.js`).
  `infoBtn(key)` renders a small ⓘ; a capture-phase document click handler
  opens a positioned popover (stat name, FI line, EN line, link to the
  primer) and keeps `makeTable` header sorting intact. Buttons are injected
  automatically into `makeTable` headers and manually into player-page
  tiles, percentile bars and base-split bars. Popover closes on outside
  click and on route change (`loading()`).
- **Rewrote all site copy in plain prose after owner feedback.** Two rounds:
  the owner rejected clipped, punchy AI-style fragments ("The skill is
  placement."). Final register is an mlb.com-style explainer — complete
  sentences, neutral tone, no taglines. This preference is recorded in
  CLAUDE.md and applies to all future user-facing copy.
- **Fixed mobile readability.** Primer entries render as a stacked
  definition list (`.plist`/`.prow` in `mallo.css`) instead of 3-column
  `.gloss` tables, which squeezed unreadably at phone widths. Verified zero
  horizontal overflow at 390 px. ⓘ tap target grows to 18 px on small
  screens.
- **Bumped the service worker** (`site/sw.js`) to `mallo-v2` and added
  `primer.js` to the shell list. The SW app-shell cache was why the owner
  saw a stale site earlier in the session; any change to shell files needs a
  cache-name bump to reach installed PWA clients.

## How it was verified

Headless Chromium (Playwright, `executablePath: '/opt/pw-browsers/chromium'`)
against `python3 -m http.server` in `site/`: all four primer variants render,
popovers open with correct content and close on outside click/navigation,
header sorting still works, lukkari and projections pages carry helpers, no
console errors, no horizontal overflow at 390 px. `node --check` on all
touched JS.

## Not covered / open items

1. **PR #26 is still open.** Closing it needs the owner (recommended above).
2. **Glossary (Kaava) tables still use the 3-column `.gloss` layout** on
   mobile. It fits without overlap but is cramped; the primer's `.plist`
   pattern could replace it.
3. **STAT_INFO covers ~40 stats** but misses a few table columns
   (`lukkari_games`, `runs_allowed`, `games`) that seemed self-explanatory.
4. **No guided tour.** The owner floated a "demo guided mode" as an
   alternative; helpers + primer were built instead. A step-through tour of
   a player page remains an option.
5. **Primer content is hand-maintained in two languages** — edits must be
   made in all four variant functions in `primer.js`.
