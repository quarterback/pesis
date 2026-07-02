# Handoff: Mallo — pesäpallo analytics visual overhaul

## Overview
This is a full visual redesign of the live pesäpallo analytics site (currently "Kärki",
served by the Flask app in `pesis/web/`). It is **renamed to Mallo** and re-skinned into one
cohesive design system with an auto-switching **light ("Card-warm")** and **dark ("Terminal")**
theme. The stat vocabulary, routes, and data model are unchanged — this is styling + a few
small template additions, not a rewrite of the analytics engine.

Design references: DARKO (calm, projection-forward), Baseball Savant (percentile sliders),
FanGraphs / Baseball-Reference (honest, dense, sortable tables).

## About the design files
The files in this bundle are **design references** — HTML/CSS prototypes showing the intended
look and behavior. Your task is to **recreate this design in the existing codebase's environment**:
a server-rendered **Flask + Jinja2** app with a single CSS file, no build step, no JS framework
(see `pesis/web/app.py` and `pesis/web/templates/*.html`). Do **not** introduce React/Vue/etc.

The good news: this design was authored to match that environment. `mallo.css` is written to be a
near **drop-in replacement** for the `<style>` block in `base.html`, and it reuses the class names
the existing templates already use (`.card`, `.tile`, `.pctrow`, `.track`, `.fill`, `.badge` with
`b0`–`b6`, `table`, `.filters`). Most of the work is: swap the stylesheet, rename Kärki→Mallo, add a
theme-toggle button, and apply the small per-template diffs below.

## Fidelity
**High-fidelity.** Final colors, typography scale, spacing, radii, and interactions. Recreate
pixel-faithfully. The one deliberate placeholder is the **typeface** (see Fonts) — the design uses
system stand-ins until the client drops in Fontspace faces; the swap is two CSS lines and no layout
changes.

---

## Files in this bundle
| File | What it is | How to use |
| --- | --- | --- |
| `mallo.css` | The production stylesheet — tokens + both themes + every component. | Replace the `<style>…</style>` block in `base.html` with `<link rel="stylesheet" href="/static/mallo/mallo.css">` and serve this file from `/static/mallo/`. |
| `theme-toggle.js` | ~90-line vanilla theme toggle (localStorage + OS default). | Serve from `/static/mallo/`, include with `<script defer>` in `base.html`. Optional — the CSS auto-switches with the OS without it. |
| `Mallo.dc.html` | The full interactive visual reference (all screens, both themes). | Open in a browser to see the intended result. **Reference only** — do not ship it. It uses a prototyping runtime; the real markup lives in your Jinja templates. |
| `README.md` | This document. | — |

> `Mallo.dc.html` is organized as stacked "turns": **turn 1** = three explored directions (1a/1b/1c),
> **turn 2** = the chosen unified light+dark system, **turn 3** = a live prototype (working theme
> toggle, league dropdown, sortable stats), **turn 4** = the remaining page types. Turns 2–4 are the
> source of truth for the final look.

---

## Fonts (client will supply Fontspace faces)
The whole system reads **two** CSS variables, with a third optional:
- `--font-display` — a **heavy grotesque** (weights 700–900). Wordmark `Mallo.`, page titles (`h1`),
  big stat numbers (`.tile .value`, callout `.v`). This defines the site's character.
- `--font-mono` — a **monospace** (weights 400–700) with **tabular/lining figures** (critical so stat
  columns align). Every number, column header, and micro-label.
- `--font-body` — optional 3rd face for reading text; currently a system stack, which is a fine default.

To swap: uncomment the two `@font-face` blocks at the top of `mallo.css`, point `src` at the files
under `/static/fonts/`, and uncomment the font names in the `:root` variables. Nothing else changes —
metrics-driven layout reflows automatically.

**Count needed: 2 required (display + mono), 3 if a custom body face is wanted.**

---

## Integration steps
1. Serve `mallo.css` + `theme-toggle.js` from a static dir (e.g. `pesis/web/static/mallo/`). Flask:
   `app = Flask(__name__)` already serves `/static/…` if a `static/` folder exists next to the app,
   or set `static_folder`.
2. In `base.html`: replace the inline `<style>` with the stylesheet link; set `<html lang="fi">`
   (JS will add `data-theme`); rename the brand; add the nav `.navwrap` + theme toggle; wrap the page
   body. Diff below.
3. Apply the per-template diffs (leaderboard, player, projections, league, baseball, about, empty).
4. Backend: the league/sex selector and live sorting are **new UI** — wire them to query params
   (details in "Interactions" + "Backend notes"). Everything else maps to existing context variables.

---

## Screens / views (with Jinja diffs)

### `base.html` — shell (header, nav, theme, layout)
```html
<!doctype html>
<html lang="fi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% block title %}Mallo{% endblock %} · Mallo pesäpalloanalytiikka</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='mallo/mallo.css') }}">
  <script src="{{ url_for('static', filename='mallo/theme-toggle.js') }}" defer></script>
</head>
<body>
  <header>
    <span class="brand">Mallo<span class="dot">.</span></span>
    <div class="navwrap">
      <nav>
        <a href="/"            class="{{ 'active' if active=='stats' }}">Tilastot</a>
        <a href="/projections" class="{{ 'active' if active=='proj' }}">TAHKO-ennusteet</a>
        <a href="/league"      class="{{ 'active' if active=='league' }}">Sarjataulukko</a>
        <a href="/about"       class="{{ 'active' if active=='about' }}">About</a>
      </nav>
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="Vaihda teema">
        <span class="ico"></span><span class="lbl"></span>
      </button>
    </div>
  </header>
  <main>{% block content %}{% endblock %}</main>
  <footer>Mallo — pesäpalloanalytiikka · data: pesistulokset.fi API</footer>
</body>
</html>
```
- The wordmark is `Mallo` + a `.dot` span (the period picks up `--brand-dot`).
- Wrap each page's inner content in `<div class="page">…</div>` **except** leaderboard/standings, which
  use full-width `.controls` / `.filters` / table bands (they draw their own 26px gutters).
- Pass `active` from each route (`render_template(..., active='stats')`) for nav highlighting.

### `leaderboard.html` — Tilastot (hero screen)
Layout: `.controls` band (league dropdown + sex segmented + season dropdown) → `h1` + `.sub` → `.filters` sort
pills → full-width table. Table columns unchanged from today (`#, Pelaaja, Joukkue, O, Vuorot, K, L,
T, Tehot, KL%, TEHO+`) **plus** a dynamic last column showing the sorted stat (as today).
```html
{% block content %}
<div class="controls">
  <span class="lab">Sarja</span>
  {# league dropdown — see "Interactions"; a native <select> is the minimal version: #}
  <select class="sel" onchange="location=this.value">
    {% for s in series_list %}
      <option value="?series={{ s.id }}&year={{ season.year }}" {{ 'selected' if s.id==season.series_id }}>{{ s.name }}</option>
    {% endfor %}
  </select>
  <div class="seg">
    <a href="?sex=M&…" class="{{ 'on' if sex=='M' }}">Miehet</a>
    <a href="?sex=N&…" class="{{ 'on' if sex=='N' }}">Naiset</a>
  </div>
  <span class="spacer"></span>
  <span class="lab">Kausi</span>
  {# Seasons span the FULL league history (first season → 2026 = 30+ entries), so this MUST be a
     dropdown, never a row of buttons. Native <select> is the robust choice (scrolls, keyboard-
     accessible); if you want the custom popover to match the Sarja tree, use
     <div class="dropwrap"> + <button class="seldrop"> + <div class="menu right scroll">. #}
  <select class="sel" onchange="location=this.value">
    {% for s in seasons %}
      <option value="?year={{ s.year }}&stat={{ stat }}" {{ 'selected' if s.year==season.year }}>{{ s.year }}</option>
    {% endfor %}
  </select>
</div>

<div class="page" style="padding-bottom:6px">
  <h1>{{ season.series }} {{ season.year }}</h1>
  <p class="sub">Vähintään 40 lyöntivuoroa. TEHO+ = tehot / vuoro suhteessa sarjan keskiarvoon (100 = keskiverto).</p>
</div>

<div class="filters">
  <span class="lab">Järjestä</span>
  {# Render a HUMAN label, never the raw stat key. Define this map once (in the route
     or a Jinja context processor) and reuse it for the pills AND the .extra column header:
     STAT_LABELS = {'teho_plus':'TEHO+','teho_plus_adj':'TEHO+ adj','tehot':'Tehot',
                    'kl_pct':'KL%','saatto_pct':'Saatto%','eten_pct':'Eten%',
                    'kunnarit':'Kunnarit','palo_rate':'Palo%'} #}
  {% for s in stats %}
    <a href="?stat={{ s }}&year={{ season.year }}" class="{{ 'active' if s==stat }}">{{ stat_labels[s] }}</a>
  {% endfor %}
</div>

<table>
  <thead><tr>
    <th>#</th><th class="name">Pelaaja</th><th class="name">Joukkue</th>
    <th>O</th><th>Vuorot</th><th>K</th><th>L</th><th>T</th><th>Tehot</th><th>KL%</th><th>TEHO+</th>
    <th class="extra">{{ stat_labels[stat] }}</th>
  </tr></thead>
  <tbody>
    {% for l in lines %}
    <tr class="{{ 'leader' if loop.first }}">
      <td><span class="rank">{{ loop.index }}</span></td>
      <td class="name"><a class="player" href="/player/{{ l.player_id }}">{{ l.name }}</a></td>
      <td class="name team">{{ l.team }}</td>
      <td class="num">{{ l.games }}</td><td class="num">{{ l.turns_at_bat }}</td>
      <td class="num">{{ l.kunnarit }}</td><td class="num">{{ l.lyodyt }}</td><td class="num">{{ l.tuodut }}</td>
      <td class="num">{{ l.tehot }}</td><td class="num">{{ l.kl_pct | rate }}</td>
      <td>
        <div class="teho-cell">
          <span class="val">{{ l.teho_plus }}</span>
          <span class="bar"><i style="width: {{ [ (l.teho_plus / 2.1) | round | int, 100] | min }}%"></i></span>
        </div>
      </td>
      <td class="num extra">{{ l[stat] | rate if l[stat] is float else l[stat] }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>
{% endblock %}
```
- **In-cell TEHO+ bar**: width = `teho_plus / 210 * 100`, capped at 100 (`210` ≈ the top of the scale;
  tune if you like). Use `.teho-cell` markup shown.
- **Leader row** gets `class="leader"` (subtle tint + a rank chip in light / accent rank in dark).
- Everything else is the existing `metrics.leaderboard()` output.

### `player.html` — player page
Layout: `h1` + `.pmeta` → 5 `.tiles` (make TEHO+ the `hero` tile) → percentile card → `.split`
(career table | trajectory). Percentile buckets use the existing `pct_bucket()` → classes `b0`–`b6`.
```html
{% block content %}
<div class="page">
  <h1>{{ player.name }}</h1>
  <p class="pmeta">{{ line.team }}{% if line.age %} · {{ line.age }} v{% endif %} · kausi {{ line.year }}
    · <a href="/player/{{ player.id }}/baseball">Baseball translation →</a></p>

  <div class="tiles">
    <div class="tile"><div class="label">Ottelut</div><div class="value">{{ line.games }}</div></div>
    <div class="tile"><div class="label">Kunnarit</div><div class="value">{{ line.kunnarit }}</div></div>
    <div class="tile"><div class="label">Tehot K+L+T</div><div class="value">{{ line.tehot }}</div></div>
    <div class="tile hero"><div class="label">TEHO+</div><div class="value">{{ line.teho_plus or "—" }}</div></div>
    {% if proj.teho_plus_proj %}
    <div class="tile"><div class="label">TAHKO enn.</div><div class="value">{{ proj.teho_plus_proj }}</div></div>
    {% endif %}
  </div>

  <h2>Prosenttipisteet {{ line.year }} <span class="muted">(sarjan vakiopelaajien joukossa)</span></h2>
  <div class="card">
    {% for stat, label in pct_stats %}
    {% set pct = line["pct_" ~ stat] %}
    <div class="pctrow">
      <div class="label">{{ label }}</div>
      <div class="track">
        {% if pct is not none %}{% set b = pct_bucket(pct) %}
          <div class="fill b{{ b }}" style="width: {{ [pct,3] | max }}%"></div>
          <div class="badge b{{ b }}" style="left: {{ [pct,3] | max }}%">{{ pct }}</div>
        {% endif %}
      </div>
      <div class="value">{{ line[stat] | rate }}</div>
    </div>
    {% endfor %}
    <p class="legend">Vaalea = sarjan häntäpää · tumma = kärki. Numero = prosenttipiste.</p>
  </div>

  <div class="split">
    <div>
      <h2>Kaudet</h2>
      <div class="card">
        <table>
          <thead><tr><th class="name">Kausi</th><th>Ikä</th><th>Vuorot</th><th>K</th><th>L</th><th>T</th><th>KL%</th><th>TEHO+</th><th>adj</th></tr></thead>
          <tbody>
            {% for s in career %}
            <tr><td class="name">{{ s.year }}</td><td>{{ s.age or "—" }}</td><td>{{ s.turns_at_bat }}</td>
                <td>{{ s.kunnarit }}</td><td>{{ s.lyodyt }}</td><td>{{ s.tuodut }}</td>
                <td>{{ s.kl_pct | rate }}</td><td>{{ s.teho_plus }}</td><td>{{ s.teho_plus_adj or "—" }}</td></tr>
            {% endfor %}
          </tbody>
        </table>
      </div>
    </div>
    <div>
      <h2>TEHO+ urakehitys</h2>
      <div class="card">
        {# reuse the existing sparkline() helper; give the <svg> class "traj",
           the polyline class "line", the end <circle> class "dot", axis line class "axis" #}
        <svg class="traj" viewBox="0 0 {{ spark.width }} {{ spark.height }}" preserveAspectRatio="none">
          <line class="axis" x1="0" y1="{{ spark.height - 5 }}" x2="{{ spark.width }}" y2="{{ spark.height - 5 }}"/>
          <polyline class="line" points="{{ spark.points }}"/>
          <circle class="dot" cx="{{ spark.end[0] }}" cy="{{ spark.end[1] }}" r="4"/>
        </svg>
      </div>
    </div>
  </div>
</div>
{% endblock %}
```
- The percentile card, tiles, and career table already exist today — only class tweaks (`hero` tile,
  `.muted` on the h2 note, `.legend`) and the `.split` two-column wrapper are new.
- Trajectory: keep the server-side `sparkline()` helper. If you want a richer chart later, D3 or a
  tiny inline-SVG line generator can replace it — style hooks are `.traj .line/.dot/.axis/text`.

### `projections.html` — TAHKO-ennusteet
No structural change — it's the table pattern. Add `class="extra"` to the final `TEHO+ (enn.)` header
and cell so the projected index reads as the emphasized column, and `class="leader"` on `loop.first`.

### `league.html` — Sarjataulukko (standings + park factors + weather)
Standings table gains two treatments:
- **Signed run differential**: `<td class="num {{ 'pos' if t.run_diff >= 0 else 'neg' }}">{{ "%+d" % t.run_diff }}</td>`
  (positive is on-brand accent, negative is muted).
- **Playoff-odds bar** (only when `as_of` is set):
```html
<td>
  <div class="odds">
    <span class="val">{{ t.odds }}</span>
    <span class="bar"><i style="width: {{ t.odds | replace('%','') }}%"></i></span>
  </div>
</td>
```
`Kenttäkertoimet` and `Tuuli ja kunnarit` are plain tables — the base table styles cover them; bold
the `PF` cell (`style="font-weight:700"`), tint values >100 with `style="color:var(--accent)"` if you
want the accent to signal a hitter's park.

### `baseball.html` — Baseball translation (English, shareable)
Layout: `h1` + `.pmeta` → a **callout row** (3 cards) → skill-mapping table → prose method note.
```html
{% block content %}
<div class="page">
  <h1>{{ t.name }}, for baseball fans</h1>
  <p class="pmeta">{{ t.team }} · {{ t.series }} {{ t.year }} · age {{ t.age }} · English on purpose.</p>
  <div class="callrow" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
    <div class="callout"><div class="k">wRC+ equivalent (TEHO+)</div><div class="v accent">{{ t.teho_plus }}</div></div>
    <div class="callout"><div class="k">Reads like</div><div class="v">{{ t.tier_label }}</div></div>
    <div class="callout"><div class="k">One MLB month, volume</div><div class="v" style="font-size:16px">{{ t.pace_line }}</div></div>
  </div>
  <h2>Skill-by-skill translation <span class="muted">(same percentile, MLB scale)</span></h2>
  <div class="card">
    <table>
      <thead><tr><th class="name">Pesäpallo stat</th><th>Value</th><th>Pctile</th><th>MLB analog</th><th>Translated</th></tr></thead>
      <tbody>
        {% for r in t.rows %}
        <tr><td class="name">{{ r.label }}</td><td class="num">{{ r.value }}</td><td class="num">{{ r.pctile }}</td>
            <td class="num">{{ r.analog }}</td><td class="num" style="color:var(--accent);font-weight:700">{{ r.translated }}</td></tr>
        {% endfor %}
      </tbody>
    </table>
  </div>
  <div class="prose"><p>{{ t.method_note }}</p></div>
</div>
{% endblock %}
```
Wire the field names to whatever `translate.translate_player()` returns; the layout is what matters.

### `about.html` + any text page
Wrap the copy in `<div class="prose">`. First paragraph gets `class="lead"`. Bold key terms with
`<strong>`; inline code with `<code>`. That's the whole text-page pattern.
```html
{% block content %}
<div class="page">
  <h1>What is Mallo?</h1>
  <p class="pmeta">The first analytics site for pesäpallo. English here, Finnish everywhere else.</p>
  <div class="prose">
    <p class="lead">…</p>
    <p><strong>TAHKO</strong> …</p>
  </div>
</div>
{% endblock %}
```

### `empty.html`
```html
<div class="empty"><div class="big">Ei dataa vielä</div><p>Aja <code>python -m pesis demo</code> tai konfiguroi API-avain.</p></div>
```

---

## Interactions & behavior
- **Theme toggle**: `theme-toggle.js` sets `<html data-theme="light|dark">`, persists to
  `localStorage["mallo-theme"]`, and follows the OS when unset. `mallo.css` already reacts to both
  the attribute and `@media (prefers-color-scheme)`. Button shows the current mode's icon (sun/moon).
- **League dropdown (division tree)**: the reference (turn 3) shows a custom popover with two columns
  (Miehet / Naiset) × five tiers (Superpesis, Ykköspesis, Suomensarja, Maakuntasarja, Aluesarja),
  selection highlighted. Minimal server-rendered version = a native `<select>` per the leaderboard
  diff. If you build the popover, it's a button + absolutely-positioned `.menu` (markup/classes in
  `mallo.css`: `.dropwrap`, `.seldrop`, `.menu`, `.menu .col/.colh`, `.menuback`) toggled by a few
  lines of vanilla JS; each item is a link to `?series=…&sex=…`.
- **Sort pills** (`.filters a`): already query-param driven today (`?stat=`). Clicking re-requests the
  page sorted by that stat; the sorted stat is echoed in the `.extra` last column. `palo_rate` sorts
  ascending (lower is better) — `metrics.leaderboard()` already handles the `NEGATIVE` set.
- **Sex segmented** (`.seg a`): only two options, so a segmented control is right — query-param links, active one gets `.on`.
- **Season dropdown** (`select.sel`, or a `.menu.right.scroll` popover): the season list is the **full league
  history** (first season → 2026), far too many for buttons — always a dropdown. Query-param / file per season.
- **Row → player**: the player name is an `<a class="player">` to `/player/<id>` (already wired).
- Hover: table rows tint (`--hover`); player-name links shift to `--accent`; menu items tint.

## State management
Server-rendered — "state" is URL query params: `series`, `sex`, `year`, `stat` (leaderboard);
`year`, `as_of` (league). The only client state is the **theme** (localStorage) and, if you build it,
the **dropdown open/closed** flag. No data fetching beyond the existing routes.

## Backend notes (new UI needs small backend support)
- **Leagues / divisions & sex**: today `seasons` has a `series` name and the app keys on `year`. To
  power the dropdown you need to (a) expose the list of series (leagues/divisions) and their sex, and
  (b) filter `metrics.*` by the selected `series_id`/`sex`. This is a data/query change, not a design
  one — the design just needs `series_list` (id, name, sex) and a `season.series_id` in context. Until
  that lands, ship the dropdown with the single available series (the reference flags non-Superpesis
  tiers with a demo note — replicate with a `.sub.note` line if you show tiers you don't yet have data for).
- **Everything else** maps 1:1 to existing `app.py` context: `lines`, `line`, `career`, `proj`,
  `spark`, `pct_stats`, `pct_bucket`, `stat`, `stats`, `seasons`, `table`, `parks`, `weather`, `t`.

---

## Design tokens
All tokens live at the top of `mallo.css`. Summary (light / dark):

**Brand palette (both themes):** apricot `#f9dbbd` · candy `#ffa5ab` · rose `#da627d` ·
berry `#a53860` · bordeaux `#450920`.

**Percentile ramp** (bucket 0→6, tail→elite):
- Light: `#e6ddd2 #f4d8c2 #ffc7bb #ffa5ab #da627d #a53860 #450920`
- Dark:  `#3c2731 #5f2c3c #8c3a54 #bd4d6d #da627d #ff909b #ffc6ac`

**Surfaces / ink (light):** page `#f2ece4` · card/app `#fbf8f4` / `#ffffff` · ink `#2a1118` ·
secondary `#7c7069` · muted `#a89c92` · label `#b1a498` · hairline `#f3ece2` · accent `#a53860`.

**Surfaces / ink (dark):** page `#0d0a0d` · app `#161016` · bar `#0f0a0f` · surface `#1a121a` ·
ink `#f2e4e0` · secondary `#a08b91` · muted `#8a747c` · hairline `#221820` · accent `#ffa5ab`.

**Radii:** cards/tiles 11–13px · app 16px (light) / 12px (dark) · pills 999px · badges 12px · tracks 5px.
**Type scale:** h1/wordmark 24–27px (display 800, tracking −.02/−.035em) · big stat 26–28px (mono 700) ·
body 15px/1.5 · table 13px · column headers 9.5px mono uppercase tracking .09em · micro-labels 9–10px mono.
**Shadows:** cards light `0 1px 4px rgba(90,40,55,.05)`, none in dark; dark uses accent glows on bars.

## Assets
- **Icons**: sun/moon are inline SVG in `theme-toggle.js` (no icon font).
- **Team logos**: not in scope — the `Joukkue` column is text today. If you add crests later, a 16px
  slot before the team name is the natural spot.
- **Fonts**: client-supplied Fontspace faces (see Fonts) → `/static/fonts/`. No fonts are bundled here.
- No raster images are used anywhere in the design.
