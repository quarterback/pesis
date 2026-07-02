"""UI string table: Finnish default, English toggle.

One flat dict, key → {fi, en}. Missing English falls back to Finnish, and a
missing key renders the key itself (so a typo is visible, not silent).
Long-form owner-voice pages (About) and the baseball translation page are
English-only by design and don't go through this table.
"""

from __future__ import annotations

DEFAULT_LANG = "fi"
LANGS = ("fi", "en")

S: dict[str, dict[str, str]] = {
    # chrome
    "site.tagline": {"fi": "pesäpalloanalytiikka", "en": "pesäpallo analytics"},
    "nav.projections": {"fi": "PARE-ennusteet", "en": "PARE projections"},
    "nav.standings": {"fi": "Sarjataulukko", "en": "Standings"},
    "nav.search": {"fi": "Haku", "en": "Search"},
    "nav.glossary": {"fi": "Sanasto", "en": "Glossary"},
    "nav.stats": {"fi": "Tilastot", "en": "Stats"},

    # shared table headers
    "th.player": {"fi": "Pelaaja", "en": "Player"},
    "th.team": {"fi": "Joukkue", "en": "Team"},
    "th.games": {"fi": "O", "en": "G"},
    "th.turns": {"fi": "Vuorot", "en": "Turns"},
    "th.age": {"fi": "Ikä", "en": "Age"},
    "th.season": {"fi": "Kausi", "en": "Season"},
    "th.date": {"fi": "Pvm", "en": "Date"},
    "th.opponent": {"fi": "Vastustaja", "en": "Opponent"},
    "th.points": {"fi": "Pisteet", "en": "Points"},
    "th.runs": {"fi": "Juoksut", "en": "Runs"},
    "th.result": {"fi": "Tulos", "en": "Score"},
    "th.periods": {"fi": "Jaksot", "en": "Periods"},
    "th.stadium": {"fi": "Stadion", "en": "Stadium"},
    "th.remaining": {"fi": "Jäljellä", "en": "Left"},
    "th.playoff_pct": {"fi": "Pudotuspelit-%", "en": "Playoff %"},
    "th.wins": {"fi": "V", "en": "W"},
    "th.super_wins": {"fi": "Vs", "en": "Ws"},
    "th.super_losses": {"fi": "Ts", "en": "Ls"},
    "th.losses": {"fi": "T", "en": "L"},
    "th.stat": {"fi": "Tilasto", "en": "Stat"},
    "th.formula": {"fi": "Kaava", "en": "Formula"},
    "th.note": {"fi": "Huom.", "en": "Note"},
    "th.last_season": {"fi": "Viimeisin kausi", "en": "Last season"},
    "th.score": {"fi": "Pisteet", "en": "Score"},

    # leaderboard
    "lb.sub": {"fi": "Vähintään 40 lyöntivuoroa. TEHO+ = tehot/vuoro suhteessa sarjan keskiarvoon (100 = keskiverto).",
               "en": "Minimum 40 turns at bat. TEHO+ = production per turn indexed to league average (100)."},
    "lb.csv": {"fi": "Lataa CSV ↓", "en": "Download CSV ↓"},


    "lb.analytics_sub": {"fi": "Mallo-mittarit eivät ole tulospalvelun kopioita: ne indeksoivat etenemisen, palojen välttämisen ja kotiin vievät kärkilyönnit sarjaan (100 = keskiarvo).",
                         "en": "Mallo metrics are not copied box-score columns: they index advancement, out avoidance and lead-runner-to-home attempts to the league (100 = average)."},
    "stat.spark_index": {"fi": "SPARK", "en": "SPARK"},
    "stat.adv_plus": {"fi": "ADV+", "en": "ADV+"},
    "stat.runner_plus": {"fi": "RUN+", "en": "RUN+"},
    "stat.out_avoid_plus": {"fi": "OUT+", "en": "OUT+"},
    "stat.money_kl_plus": {"fi": "KOTI-KL+", "en": "HOME-AH+"},
    "stat.money_kl_pct": {"fi": "Kotiutus-KL%", "en": "Lead-runner home AH%"},
    "gl.mallo": {"fi": "Mallo-analytiikka", "en": "Mallo analytics"},
    "gl.mallo_sub": {"fi": "Nämä rivit rakennetaan tulospalvelun säilytetystä ottelukohtaisesta datasta, mutta ne eivät toista julkaistuja laskureita. 100 = sarjakeskiarvo, yli 100 parempi.",
                     "en": "These rows are built from the preserved match-level data, but they do not repeat published counters. 100 = league average; above 100 is better."},

    # projections
    "proj.title": {"fi": "PARE-ennusteet", "en": "PARE projections"},
    "proj.sub": {"fi": "PARE = Painotettu ja Regressoitu Ennuste: päivittyvä arvio jokaisen pelaajan todellisesta tasosta — koko urahistoria eksponentiaalisesti painotettuna + regressio sarjakeskiarvoon. Ei mielivaltaisia \"viimeiset N ottelua\" -rajauksia.",
                 "en": "PARE (weighted & regressed projection): a daily-updating estimate of every player's true talent — the full career log exponentially decayed + regressed to league average. No arbitrary \"last N games\" windows."},

    # league page
    "lg.points_rule": {"fi": "Pisteet: 3 suora voitto · 2 voitto supervuorossa tai kotiutuslyöntikilpailussa · 1 tappio niissä · 0 suora tappio.",
                       "en": "Points: 3 straight win · 2 win via super inning or scoring contest · 1 loss in those · 0 straight loss."},
    "lg.asof_hint": {"fi": "Lisää ?as_of=YYYY-MM-DD osoitteeseen nähdäksesi pudotuspelitodennäköisyydet kesken kauden.",
                     "en": "Add ?as_of=YYYY-MM-DD to the URL for mid-season playoff odds."},
    "lg.asof_sub": {"fi": "Tilanne {d} · pudotuspeliprosentit 2000 simuloinnista (4 paikkaa).",
                    "en": "As of {d} · playoff odds from 2,000 simulations (4 spots)."},
    "lg.fangraph_title": {"fi": "Pudotuspelitodennäköisyys kauden aikana", "en": "Playoff odds over the season"},
    "lg.fangraph_note": {"fi": "(simuloitu viikoittain)", "en": "(simulated weekly)"},
    "lg.fangraph_sub": {"fi": "Neljä parasta väreissä, muut harmaina. Jokainen piste = kauden tilanne sinä päivänä, 300 simulointia jäljellä olleesta ohjelmasta. Vie hiiri käyrien päälle nähdäksesi kaikkien joukkueiden todennäköisyydet.",
                        "en": "Top four in color, the rest muted. Each point = the season as of that day, 300 simulations of the remaining schedule. Hover for every team's odds."},
    "lg.parks_title": {"fi": "Kenttäkertoimet", "en": "Park factors"},
    "lg.parks_note": {"fi": "(100 = neutraali juoksuympäristö)", "en": "(100 = neutral run environment)"},
    "lg.rpg": {"fi": "Juoksua/ottelu", "en": "Runs/game"},
    "lg.weather_title": {"fi": "Tuuli ja kunnarit", "en": "Wind and home runs"},
    "lg.wind": {"fi": "Tuuli", "en": "Wind"},
    "lg.k_per_turn": {"fi": "Kunnarit/vuoro", "en": "HR/turn"},
    "lg.weather_sub": {"fi": "Sää joka ottelusta suoraan tulospalvelun datasta — kenttäkertoimia tai säävaikutuksia ei ole aiemmin julkaistu pesäpallosta.",
                       "en": "Weather comes per match from the results service — park factors and weather effects have never been published for pesäpallo before."},

    # player page
    "pl.season": {"fi": "kausi", "en": "season"},
    "pl.baseball_link": {"fi": "Baseball translation 🇺🇸", "en": "Baseball translation 🇺🇸"},
    "pl.games": {"fi": "Ottelut", "en": "Games"},
    "pl.homeruns": {"fi": "Kunnarit", "en": "Home runs"},
    "pl.tehot": {"fi": "Tehot (K+L+T)", "en": "Tehot (K+L+T)"},
    "pl.pct_title": {"fi": "Prosenttipisteet", "en": "Percentile ranks"},
    "pl.pct_note": {"fi": "(sarjan vakiopelaajien joukossa)", "en": "(among qualified players in the league)"},
    "pl.pct_sub": {"fi": "Punainen = sarjan häntäpää, sininen = kärki. Numero = prosenttipiste.",
                   "en": "Red = league tail, blue = elite. Number = percentile."},
    "pl.basekl_title": {"fi": "Kärkilyönnit pesittäin", "en": "Advance hits by base"},
    "pl.basekl_note": {"fi": "(mihin pesään kärki eteni)", "en": "(which base the lead runner reached)"},
    "pl.tries": {"fi": "yritystä", "en": "tries"},
    "pl.career_title": {"fi": "Urakehitys", "en": "Career trajectory"},
    "pl.seasons_title": {"fi": "Kaudet", "en": "Seasons"},
    "pl.log_title": {"fi": "Ottelut", "en": "Game log"},
    "pl.home": {"fi": "koti", "en": "home"},
    "pl.away": {"fi": "vieras", "en": "away"},
    "pl.comps_title": {"fi": "Vertailukelpoiset kaudet", "en": "Comparable seasons"},
    "pl.comps_note": {"fi": "(1000 = identtinen)", "en": "(1000 = identical)"},
    "pl.proj_title": {"fi": "PARE-ennuste", "en": "PARE projection"},
    "pl.proj_estimate": {"fi": "Ennuste", "en": "Projection"},
    "pl.proj_observed": {"fi": "Havaittu (painotettu)", "en": "Observed (weighted)"},
    "pl.proj_n": {"fi": "Efektiivinen otos", "en": "Effective sample"},
    "pl.proj_sub": {"fi": "Ennuste = eksponentiaalisesti painotettu havainto regressoituna sarjakeskiarvoon. Pieni otos → lähellä keskiarvoa; iso otos → lähellä havaittua.",
                    "en": "Projection = exponentially weighted observation regressed to league average. Small sample → near the mean; big sample → near the observed."},

    # stat labels (percentile rows, career minis)
    "stat.kl_pct": {"fi": "Kärkilyönti-%", "en": "Advance-hit %"},
    "stat.saatto_pct": {"fi": "Saatto-%", "en": "Escort %"},
    "stat.eten_pct": {"fi": "Etenemis-%", "en": "Advance %"},
    "stat.kunnari_rate": {"fi": "Kunnarit / vuoro", "en": "HR / turn"},
    "stat.lyoty_rate": {"fi": "Lyödyt / vuoro", "en": "Batted-in / turn"},
    "stat.palo_rate": {"fi": "Palot / vuoro", "en": "Outs / turn"},
    "stat.tehot_per_turn": {"fi": "Tehot / vuoro", "en": "Tehot / turn"},
    "stat.kl_base0": {"fi": "KL 1. pesälle", "en": "AH to 1st"},
    "stat.kl_base1": {"fi": "KL 2. pesälle", "en": "AH to 2nd"},
    "stat.kl_base2": {"fi": "KL 3. pesälle", "en": "AH to 3rd"},
    "stat.kl_base3": {"fi": "KL kotipesään", "en": "AH home"},

    # team page
    "tm.players": {"fi": "Pelaajat", "en": "Players"},
    "tm.matches": {"fi": "Ottelut", "en": "Matches"},
    "tm.wl": {"fi": "Voitot–Tappiot", "en": "W–L"},
    "tm.rundiff": {"fi": "Juoksut ±", "en": "Run diff"},

    # match page
    "mt.periods": {"fi": "jaksot", "en": "periods"},
    "mt.tiebreak": {"fi": "(ratkaisu supervuorossa/kotiutuslyöntikilpailussa)",
                    "en": "(decided in super inning / scoring contest)"},
    "mt.attendance": {"fi": "yleisö", "en": "attendance"},

    # search
    "se.title": {"fi": "Pelaajahaku", "en": "Player search"},
    "se.placeholder": {"fi": "Pelaajan nimi…", "en": "Player name…"},
    "se.button": {"fi": "Hae", "en": "Search"},
    "se.none": {"fi": "Ei osumia haulle", "en": "No results for"},

    # empty
    "empty.title": {"fi": "Ei dataa vielä", "en": "No data yet"},

    # glossary
    "gl.title": {"fi": "Sanasto", "en": "Glossary"},
    "gl.sub": {"fi": "Tilastot ja kaavat. K = kunnarit, L = lyödyt juoksut, T = tuodut juoksut, V = lyöntivuorot, Y = yritykset.",
               "en": "Stats and formulas. K = home runs (kunnarit), L = runs batted home (lyödyt), T = runs scored (tuodut), V = turns at bat, Y = attempts."},
    "gl.base": {"fi": "Peruslinja", "en": "Base line"},
    "gl.indices": {"fi": "Indeksit", "en": "Indices"},
    "gl.pare": {"fi": "PARE-ennusteet", "en": "PARE projections"},
    "gl.other": {"fi": "Sarjataulukko & muut", "en": "Standings & other"},
}


def t(key: str, lang: str = DEFAULT_LANG) -> str:
    entry = S.get(key)
    if not entry:
        return key
    return entry.get(lang) or entry.get(DEFAULT_LANG) or key
