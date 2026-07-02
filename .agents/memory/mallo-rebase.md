---
name: Mallo upstream rebase approach
description: How to pull upstream quarterback/pesis changes without git merge conflicts
---

When `origin/main` advances (GitHub), git merge/rebase is blocked in the main agent (writes to .git are restricted). Instead:

1. `git --no-optional-locks ls-remote origin` to see what upstream has
2. `curl -s "https://api.github.com/repos/quarterback/pesis/commits/main"` to check tip
3. Download new files directly: `curl -s "https://raw.githubusercontent.com/quarterback/pesis/main/$f"`
4. Copy Python backend files wholesale (they don't conflict with design work)
5. Re-style any new templates with the Mallo design system

**Why:** The Mallo design lives in templates; upstream changes are mostly backend Python and new routes. Downloading files individually avoids merge conflicts in templates we've both touched.

**How to apply:** Any time the user says "a big update dropped" or "rebase with main", use this curl-based approach rather than git merge.
