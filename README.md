# Mallo — pesäpallo analytics

I'd long wondered what a pesäpallo site would look like. Working on a different project, I explored the viability of a tool like this 
and then enlisted an agent to built it. An analytics engine and site for Finnish baseball (pesäpallo), built on data
from the official results stite [pesistulokset.fi](https://www.pesistulokset.fi/).
There is no sabermetrics/analytics site anywhere for pesäpallo — this project
is an attempt to be the first, borrowing what works from the basketball and
baseball analytics canon and my own long-running sims both from text-sim games and real-life experiments from baseball to college football rankings and others.

- **[DARKO](https://www.darko.app/)** → **PARE** (*Painotettu ja Regressoitu
  Ennuste*): daily-updating Bayesian projections of every player's true
  talent per stat (exponential decay over the full game log + regression to
  league mean). Naming convention: descriptive initialisms in the
  WAR/OPS+/xBA tradition — PARE, eTEHO+/eKL% (*ennustettu*), kTEHO+
  (*kenttäkorjattu*) — never player/club names (Tahko is a Superpesis club).
- **[Baseball Savant](https://baseballsavant.mlb.com/)** → player pages with
  percentile sliders across the skill profile.
- **FanGraphs / Baseball-Reference** → honest rate stats with real
  denominators, league-indexed **TEHO+** (100 = league average), sortable
  leaderboards, season-by-season career tables.

  My other projects are on [ronbronson.dev](ronbronson.dev)
