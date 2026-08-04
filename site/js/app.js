'use strict';
/* ── State ──────────────────────────────────────────────────────────────── */
let META = null;
const _cache = {};

/* ── Helpers ────────────────────────────────────────────────────────────── */
function rate(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' && !Number.isInteger(v))
    return v.toFixed(3).replace(/^0/, '') || '.000';
  return String(v);
}

function pctBucket(pct) {
  if (pct === null || pct === undefined) return null;
  for (let i = 0; i < [10,25,40,60,75,90].length; i++)
    if (pct < [10,25,40,60,75,90][i]) return i;
  return 6;
}

function slugify(s) {
  return (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^\w]+/g,'-').replace(/^-|-$/g,'');
}

/* ── Language ───────────────────────────────────────────────────────────────
   UI language: 'fi' (default) or 'en'. Persisted in localStorage; the FI/EN
   toggle in the nav re-runs the router so every page re-renders. */
let LANG = localStorage.getItem('mallo-lang') === 'en' ? 'en' : 'fi';
function t(fi, en) { return LANG === 'en' ? en : fi; }
window.setLang = function (l) {
  LANG = l === 'en' ? 'en' : 'fi';
  localStorage.setItem('mallo-lang', LANG);
  route();
};

const STAT_LABEL = {
  spark_index:'SPARK', adv_plus:'ADV+', runner_plus:'RUN+',
  out_avoid_plus:'OUT+', money_kl_plus:'KOTI-KL+',
  adv1_pct:'1 %', adv2_pct:'2 %', adv3_pct:'3 %', adv_home_pct:'K %',
  adv1_plus:'1 %+', adv2_plus:'2 %+', adv3_plus:'3 %+', adv_home_plus:'K %+',
  kl_pct:'KL%', saatto_pct:'Saatto%', eten_pct:'Etenemis%',
  kunnari_rate:'Kunnarit/vuoro', lyoty_rate:'Lyödyt/vuoro',
  palo_rate:'Palo%', tehot_per_turn:'Tehot/vuoro',
  kl_base0:'1 % (koti→1)', kl_base1:'2 % (1→2)',
  kl_base2:'3 % (2→3)', kl_base3:'K % (kotiutus)',
  teho_plus:'TEHO+',
  vyk:'VYK', jyk:'JYK', raa:'RAA',
  tehot:'Tehot', kunnarit:'Kunnarit', lyodyt:'Lyödyt', tuodut:'Tuodut',
  turns_at_bat:'Lyöntivuorot', lra:'LRA', lra_minus:'LRA-', lukkari_rp:'RP',
  ekl:'eKL%', esaatto:'eSaatto%', eeten:'eEtenemis%', epalo:'ePalo%', eteho:'eTEHO+',
  def_rv:'PEJ/O', def_koppi_pct:'Koppi-%', def_out_conv:'Poltto-%',
  def_error_cost:'HH-kulu', def_arm_hold:'LE-idx',
  of_koppi_rate:'Koppi-%', lukkari_def_rv:'PEJ',
};

// English label overrides: every Finnish-worded stat is either translated
// into its baseball counterpart (AH = advance hit) or paired with one
// (VYK (WAR)). Shared symbols stay put.
const STAT_LABEL_EN = {
  vyk:'VYK (WAR)', jyk:'JYK (RAR)',
  money_kl_plus:'HOME-AH+',
  kl_pct:'AH%', saatto_pct:'Escort%', eten_pct:'Advance%',
  kunnari_rate:'HR/PA', lyoty_rate:'RBI/PA',
  palo_rate:'Out%', tehot_per_turn:'R+RBI/PA', tehot:'R+RBI',
  kunnarit:'HR', lyodyt:'RBI', tuodut:'R', turns_at_bat:'PA',
  kl_base0:'1 % (home→1st)', kl_base1:'2 % (1st→2nd)',
  kl_base2:'3 % (2nd→3rd)', kl_base3:'K % (scoring)',
  ekl:'eAH%', esaatto:'eEscort%', eeten:'eAdvance%', epalo:'eOut%',
  def_rv:'DRS/G', def_koppi_pct:'Catch%', def_out_conv:'Out conv.',
  def_error_cost:'Error runs', def_arm_hold:'Extra adv.',
  of_koppi_rate:'Catch%', lukkari_def_rv:'DRS',
};
function statLabel(key) {
  return (LANG === 'en' && STAT_LABEL_EN[key]) || STAT_LABEL[key] || key;
}

/* ── Stat helpers — ⓘ popovers ──────────────────────────────────────────────
   One-tap explainer for every stat: what it measures and why it exists.
   infoBtn(key) renders the button anywhere; a capture-phase click handler
   opens the popover (and keeps table-header sorting untouched). */
const STAT_INFO = {
  vyk: { fi: 'Voitot Yli Korvaajan. Pelaajan kokonaisarvo voittoina verrattuna korvaajatason pelaajaan. Korvaajatason pelaaja tarkoittaa pelaajaa, jonka joukkue saisi helposti tilalle esimerkiksi Ykköspesiksestä tai oman joukkueen penkiltä. Taso lasketaan tämän sarjan tuloksista.', en: 'Wins above replacement, a player’s total value in wins compared with a replacement-level player: one a team could easily bring in from the lower league or its own bench. It is the same idea as WAR in baseball.' },
  jyk: { fi: 'Juoksut Yli Korvaajan. Sama vertailu kuin VYK, mitattuna juoksuina: kuinka monta juoksua enemmän pelaaja tuotti kuin korvaajatason pelaaja olisi tuottanut samoilla lyöntivuoroilla.', en: 'Runs above replacement: how many more runs the player produced than a replacement-level player would have in the same turns at bat. VYK measured in runs.' },
  raa: { fi: 'Juoksut yli sarjan keskitason.', en: 'Runs above league average.' },
  spark_index: { fi: 'Tilanteenrakentajan indeksi, joka yhdistää etenemisen lyöjänä, etenijänä ja palojen välttämisen. 100 on sarjan keskitaso.', en: 'A table-setter index combining advancement, baserunning and out avoidance. 100 is league average.' },
  adv_plus: { fi: 'Kärkilyönnit ja saatot jaettuna yrityksillä, sarjaan indeksoituna.', en: 'Lead-runner hits and escorts per attempt, indexed to the league.' },
  runner_plus: { fi: 'Onnistuneet etenemiset per yritys suhteessa sarjaan, kun pelaaja juoksee itse. Kärkietenemiset painavat 80 prosenttia ja takaetenemiset 20 prosenttia.', en: 'Successful advances per attempt relative to the league, as a runner. Advances as the lead runner count for 80 percent and advances as a trailing runner for 20 percent.' },
  out_avoid_plus: { fi: 'Palojen välttäminen: pelaajan omat palot etenijänä suhteessa sarjaan. Yli 100 = palaa keskivertoa harvemmin.', en: 'Out avoidance, based on the player’s own burns as a runner. Over 100 means fewer burns than average.' },
  money_kl_plus: { fi: 'Kotiuttavat kärkilyönnit suhteessa sarjaan.', en: 'Scoring advances relative to the league.' },
  teho_plus: { fi: 'Tuotanto lyöntivuoroa kohden, 100 on sarjan keskitaso. Luku suosii lyöntijärjestyksen loppupään lyöjiä, koska lyödyt ja tuodut syntyvät tilanteista. Vastaa baseballin wRC+:aa.', en: 'Production per turn at bat, where 100 is league average. The number favors the back of the batting order, because runs batted home and runs scored depend on opportunities. It is comparable to wRC+ in baseball.' },
  kl_pct: { fi: 'Kärkilyönnit jaettuna yrityksillä eli lajin lyöntikeskiarvo. Sarjan keskitaso on noin .530.', en: 'Lead-runner hits divided by attempts, the sport’s batting average. The league average is around .530.' },
  saatto_pct: { fi: 'Saatot per yritys: takaetenijän vieminen lyönnillä.', en: 'Escorts per attempt: moving the trailing runner with a hit.' },
  eten_pct: { fi: 'Onnistuneet etenemiset per yritys pelaajan juostessa itse, kärki- ja takaetenemiset yhteenlaskettuina.', en: 'Successful advances per attempt as a runner, lead and trailing advances combined.' },
  kunnari_rate: { fi: 'Kunnarit per lyöntivuoro.', en: 'Home runs per turn.' },
  lyoty_rate: { fi: 'Kotiin lyödyt juoksut lyöntivuoroa kohden. Vastaa baseballin RBI:tä.', en: 'Runs batted home per turn, comparable to RBI.' },
  palo_rate: { fi: 'Pelaajan omat palot etenijänä per lyöntivuoro. Muiden etenijöiden palot vuoron aikana eivät sisälly lukuun. Pienempi on parempi.', en: 'The player’s own burns as a runner per turn at bat. Outs by other runners during the turn are not included. Lower is better.' },
  tehot_per_turn: { fi: 'Tehot (K + L + T) per lyöntivuoro.', en: 'Tehot (K + L + T) per turn.' },
  adv1_pct: { fi: 'Kärjen eteneminen kotipesästä ykköselle per yritys. Virallinen split.', en: 'Lead-runner advances from home to first, per attempt.' },
  adv2_pct: { fi: 'Kärjen eteneminen ykköseltä kakkoselle per yritys.', en: 'Lead-runner advances from first to second, per attempt.' },
  adv3_pct: { fi: 'Kärjen eteneminen kakkoselta kolmoselle per yritys.', en: 'Lead-runner advances from second to third, per attempt.' },
  adv_home_pct: { fi: 'Kotiutusprosentti: kärki kolmoselta kotiin per yritys.', en: 'Scoring rate: lead runner from third to home, per attempt.' },
  adv1_plus: { fi: '1 % sarjaindeksinä. 100 = keskitaso.', en: 'The home→1st split as a league index. 100 = average.' },
  adv2_plus: { fi: '2 % sarjaindeksinä. 100 = keskitaso.', en: 'The 1st→2nd split as a league index. 100 = average.' },
  adv3_plus: { fi: '3 % sarjaindeksinä. 100 = keskitaso.', en: 'The 2nd→3rd split as a league index. 100 = average.' },
  adv_home_plus: { fi: 'Kotiutus sarjaindeksinä. 100 = keskitaso.', en: 'The scoring split as a league index. 100 = average.' },
  kl_base0: { fi: 'Kärjen eteneminen kotipesästä ykköselle per yritys.', en: 'Lead-runner advances from home to first, per attempt.' },
  kl_base1: { fi: 'Kärjen eteneminen ykköseltä kakkoselle per yritys.', en: 'Lead-runner advances from first to second, per attempt.' },
  kl_base2: { fi: 'Kärjen eteneminen kakkoselta kolmoselle per yritys.', en: 'Lead-runner advances from second to third, per attempt.' },
  kl_base3: { fi: 'Kotiutusprosentti: kärki kolmoselta kotiin per yritys.', en: 'Scoring rate: lead runner from third to home, per attempt.' },
  turns_at_bat: { fi: 'Lyöntivuorot. Vastaa baseballin PA-lukua.', en: 'Turns at bat, the same idea as plate appearances.' },
  lra: { fi: 'Päästetyt juoksut lukkariottelua kohden. Vastaa baseballin ERA-lukua.', en: 'Runs allowed per game as lukkari, comparable to ERA.' },
  lra_minus: { fi: 'LRA sarjaindeksinä: 100 = keskitaso, pienempi parempi.', en: 'LRA as a league index: 100 = average, lower is better.' },
  lukkari_rp: { fi: 'Estetyt juoksut yli sarjan keskitason. Peliaika kasvattaa lukua.', en: 'Runs prevented above the league average. Playing time adds to it.' },
  ekl: { fi: 'PARE-ennuste KL%:lle. Koko ura painotettuna niin, että tuoreet ottelut painavat eniten.', en: 'The PARE projection for KL%, weighting the whole career with recent games counting most.' },
  esaatto: { fi: 'PARE-ennuste saattoprosentille.', en: 'PARE projection for escort rate.' },
  eeten: { fi: 'PARE-ennuste etenemisprosentille.', en: 'PARE projection for advancement rate.' },
  epalo: { fi: 'PARE-ennuste paloprosentille. Pienempi on parempi.', en: 'PARE projection for burn rate. Lower is better.' },
  eteho: { fi: 'PARE-ennuste TEHO+:lle eli arvio pelaajan tämänhetkisestä tasosta.', en: 'The PARE projection for TEHO+, an estimate of the player’s current level.' },
  def_rv: { fi: 'Puolustuksen estämät juoksut ottelua kohden verrattuna sarjan keskiarvoon. Lasketaan tilanneodotuksista: jokaisen lyönnin jälkeen verrataan, montako juoksua tilanteesta yleensä syntyy ja montako oikeasti syntyi.', en: 'Defensive runs saved per game versus the league average, from run expectancy: after every delivery we compare how many runs the situation usually produces with what actually happened.' },
  def_koppi_pct: { fi: 'Kopit prosentteina kenttään lyödyistä lyönneistä. Koppi on kenttäpelaajan suoritus, ei palo — se haavoittaa lyöjän ja voi tyhjentää pesät ilman paloa.', en: 'Catches as a share of balls hit into play. A koppi is a fielding act, not an out — it wounds the batter and can clear the bases without recording an out.' },
  def_out_conv: { fi: 'Kuinka suuri osa vastustajan etenemisyrityksistä päättyi polttoon.', en: 'The share of opponent advance attempts that ended in an out.' },
  def_error_cost: { fi: 'Harhaheitoista vastustajalle valuneet juoksut ottelua kohden, tilanneodotuksilla mitattuna.', en: 'Runs handed to the opponent per game through wild throws, measured with run expectancy.' },
  def_arm_hold: { fi: 'Vastustajan lisäetenemiset sarjaindeksinä: kuinka usein etenijä pääsi kaksi pesäväliä tai enemmän. 100 on sarjan keskitaso ja pienempi on parempi.', en: 'Opponent extra advances as a league index: how often a runner gained two or more bases. 100 is league average and lower is better.' },
  of_koppi_rate: { fi: 'Kopit prosentteina takakentän alueelle lyödyistä lyönneistä pelaajan otteluissa. Pelaajakohtainen jako perustuu lyöntien paikkatietoon — arvio, ei virallinen tilasto.', en: 'Catches as a share of balls hit to the outfield zone in the player’s games. The split between players is inferred from hit locations — an estimate, not an official stat.' },
  lukkari_def_rv: { fi: 'Lukkarin puolustusarvo juoksuina suhteessa sarjan keskimääräiseen lukkariin. Etukentän lyhyet lyönnit kuuluvat lukkarille, ja arvo lasketaan niiden tilanneodotuksista. Arvio, joka perustuu lyöntien paikkatietoon.', en: 'The lukkari’s defensive value in runs versus an average lukkari, from run expectancy on short front-field plays. Inferred from hit locations.' },
};

function infoBtn(key) {
  return STAT_INFO[key]
    ? `<button class="ib" type="button" data-info="${key}" aria-label="Selitys">i</button>` : '';
}

function closeStatPop() {
  const p = document.getElementById('statpop');
  if (p) p.remove();
}

function showStatPop(btn, key) {
  closeStatPop();
  const info = STAT_INFO[key];
  if (!info) return;
  const pop = document.createElement('div');
  pop.className = 'statpop';
  pop.id = 'statpop';
  pop.innerHTML = `<div class="t">${statLabel(key)}</div>
    <p>${LANG === 'en' ? info.en : info.fi}</p><p class="en">${LANG === 'en' ? info.fi : info.en}</p>
    <a href="#/primer">${t('Opas', 'Primer')} →</a>`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 24);
  pop.style.width = w + 'px';
  const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
  pop.style.left = left + 'px';
  pop.style.top = (r.bottom + 8 + window.scrollY) + 'px';
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-info]');
  if (b) { e.preventDefault(); e.stopPropagation(); showStatPop(b, b.dataset.info); return; }
  if (!e.target.closest('#statpop')) closeStatPop();
}, true);

// Finnish fielding code → baseball position (shown next to every player).
// null = jokeri (no fielding position) → DH.
const POS_MAP = {
  L:'P', S:'C', '1V':'1B', '2V':'2B', '3V':'3B',
  '3P':'LSS', '2P':'RSS', '3K':'LF', '2K':'RF', J:'DH',
};
const POS_ORDER = ['P','C','1B','2B','3B','LSS','RSS','LF','RF','DH'];
function posLabel(code) { return code ? (POS_MAP[code] || code) : 'DH'; }

// Contact address assembled at runtime — no literal email (and no "@") lives in
// the source, so source/regex scrapers come up empty; only a JS-executing client
// ever sees the real address.
function contactAddr() {
  return ['ron', ['ronbronson', 'com'].join('.')].join(String.fromCharCode(64));
}

// Show "data last refreshed" in the footer from meta.generated (stamped by
// export.py on each daily run). Kept quiet if the timestamp is missing/bad.
function renderUpdated(iso) {
  const el = document.getElementById('updated');
  if (!el) return;
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) { el.textContent = ''; return; }
  const loc = LANG === 'en' ? 'en-GB' : 'fi-FI';
  const date = d.toLocaleDateString(loc,
    { day: 'numeric', month: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  el.textContent = LANG === 'en' ? ` · updated ${date} at ${time}` : ` · päivitetty ${date} klo ${time}`;
  el.title = `Data ajettu ${d.toISOString()}`;
}

async function fetchJSON(url) {
  if (_cache[url]) return _cache[url];
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}: ${url}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('json')) {
    const snippet = (await r.text()).slice(0, 80);
    throw new Error(`Ei JSON-vastausta: ${url} (${snippet})`);
  }
  const d = await r.json();
  _cache[url] = d;
  return d;
}

function qs(params) {
  const o = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
  return params ? o[params] : o;
}

function main() { return document.getElementById('main'); }

function loading() {
  closeStatPop();
  main().innerHTML = `<div class="empty"><div class="big">${t('Ladataan…', 'Loading…')}</div></div>`;
}

/* ── Season selector ─────────────────────────────────────────────────────── */
function groupBySeries(seasons) {
  const groups = {};
  for (const s of seasons) {
    if (!groups[s.series]) groups[s.series] = [];
    groups[s.series].push(s);
  }
  return groups;
}

function seasonSelHtml(allSeasons, curSid, baseHash, extraParam) {
  const groups = groupBySeries(allSeasons);
  let opts = '';
  for (const [seriesName, slist] of Object.entries(groups)) {
    opts += `<optgroup label="${seriesName}">`;
    for (const s of slist) {
      const val = `#${baseHash}?sid=${s.id}${extraParam||''}`;
      opts += `<option value="${val}"${s.id===curSid?' selected':''}>${s.year}</option>`;
    }
    opts += '</optgroup>';
  }
  return `<span class="lab">${t('Kausi', 'Season')}</span>
    <select class="sel" onchange="location.hash=this.value.slice(1)">${opts}</select>`;
}

/* ── Leaderboard controls: Sarja (division) + sex + Kausi ─────────────────── */
// The three imported tiers, top division first.
const TIERS = ['Superpesis', 'Ykköspesis', 'Suomensarja'];

// Default league for landing/nav links: men's Superpesis. nav_seasons order
// alone can't be trusted here — alphabetically "Suomensarja" sorts ahead of
// "Superpesis", and older cached meta.json files predate the export-side
// tier ordering.
function defaultSeasonId() {
  const ns = (META && META.nav_seasons) || [];
  return (ns.find(s => s.series === 'Miesten Superpesis') || ns[0] || {}).id || '';
}

function parseSeries(series) {
  if (series.startsWith('Miesten ')) return { sex: 'M', tier: series.slice(8) };
  if (series.startsWith('Naisten ')) return { sex: 'N', tier: series.slice(8) };
  return { sex: null, tier: series };
}

function leaderboardControls(sid, view) {
  const seasons = META.seasons;
  const cur = seasons.find(s => s.id === sid) || seasons[0];
  const { sex: curSex, tier: curTier } = parseSeries(cur.series);
  const curYear = cur.year;
  // preserve view across series/season switches
  const vq = (view === 'lukkari' || view === 'defense') ? `&view=${view}` : '';
  // Latest season of a league, preferring the year currently shown. META
  // seasons arrive newest-first, so [0] is the league's most recent season.
  const find = (sex, tier) => {
    const inLeague = seasons.filter(s => {
      const p = parseSeries(s.series);
      return p.sex === sex && p.tier === tier;
    });
    return inLeague.find(s => s.year === curYear) || inLeague[0];
  };

  // Sarja — a plain dropdown listing every imported tier for the current sex,
  // so the lower leagues are visible without opening a hidden menu first.
  const tierOpts = TIERS.map(tier => {
    const m = find(curSex, tier);
    if (!m) return '';   // tier never imported for this sex — omit
    return `<option value="#/?sid=${m.id}${vq}"${tier===curTier?' selected':''}>${tier}</option>`;
  }).join('');
  const sarja = `<span class="lab">${t('Sarja', 'League')}</span>
    <select class="sel" onchange="location.hash=this.value.slice(1)">${tierOpts}</select>`;

  // Lyöjät / Lukkarit / Puolustus — batting, pitching and defense boards
  const modeSeg = `<div class="seg">
    <a href="#/?sid=${sid}"${view!=='lukkari'&&view!=='defense'?' class="on"':''}>${t('Lyöjät', 'Batters')}</a>
    <a href="#/?sid=${sid}&view=lukkari"${view==='lukkari'?' class="on"':''}>Lukkarit</a>
    <a href="#/?sid=${sid}&view=defense"${view==='defense'?' class="on"':''}>${t('Puolustus', 'Defense')}</a>
  </div>`;

  // Miehet / Naiset segmented — same tier, other sex
  const seg = ['M', 'N'].map(sex => {
    const m = find(sex, curTier);
    const label = sex === 'M' ? t('Miehet', 'Men') : t('Naiset', 'Women');
    if (!m) return `<a class="disabled" aria-disabled="true" style="opacity:.4;pointer-events:none">${label}</a>`;
    return `<a href="#/?sid=${m.id}${vq}"${sex===curSex?' class="on"':''}>${label}</a>`;
  }).join('');

  // Kausi — years available for the current series (sex + tier)
  const years = seasons
    .filter(s => { const p = parseSeries(s.series); return p.sex === curSex && p.tier === curTier; })
    .sort((a, b) => b.year - a.year);
  const yearOpts = years.map(s =>
    `<option value="#/?sid=${s.id}${vq}"${s.id===sid?' selected':''}>${s.year}</option>`).join('');

  return `<div class="controls">
    ${sarja}
    ${modeSeg}
    <div class="seg">${seg}</div>
    <span class="spacer"></span>
    <span class="lab">${t('Kausi', 'Season')}</span>
    <select class="sel" onchange="location.hash=this.value.slice(1)">${yearOpts}</select>
  </div>`;
}

/* ── Nav ─────────────────────────────────────────────────────────────────── */
function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav || !META) return;
  const hash = location.hash;
  const page = hash.split('?')[0];
  const curSid = parseInt(qs('sid') || '0', 10);

  const defaultSid = defaultSeasonId();
  const statsSid = curSid || defaultSid;
  const onStats = page === '#/' || page === '#/leaderboard' || page === '#/player' || page === '#/team';
  let html = '';
  html += `<a href="#/?sid=${statsSid}"${onStats?' class="active"':''}>${t('Tilastot', 'Stats')}</a>`;
  html += `<a href="#/projections?sid=${defaultSid}"${page==='#/projections'?' class="active"':''}>${t('PARE-ennusteet', 'PARE projections')}</a>`;
  html += `<a href="#/league?sid=${defaultSid}"${page==='#/league'?' class="active"':''}>${t('Sarjataulukko', 'Standings')}</a>`;
  html += `<a href="#/primer"${page==='#/primer'?' class="active"':''}>${t('Opas', 'Primer')}</a>`;
  html += `<a href="#/glossary"${page==='#/glossary'?' class="active"':''}>${t('Kaava', 'Formulas')}</a>`;
  html += `<a href="#/about"${page==='#/about'?' class="active"':''}>About</a>`;
  const other = LANG === 'fi' ? 'en' : 'fi';
  html += `<a href="#" class="langsw" onclick="setLang('${other}');return false" title="${other === 'en' ? 'In English' : 'Suomeksi'}">${other.toUpperCase()}</a>`;
  nav.innerHTML = html;
}

/* ── CSV helper ──────────────────────────────────────────────────────────── */
function downloadCSV(rows, cols, filename) {
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => {
    const v = r[c];
    return v === null || v === undefined ? '' : String(v).includes(',') ? `"${v}"` : v;
  }).join(','));
  const blob = new Blob([lines.join('\r\n')], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* ── pct bar ─────────────────────────────────────────────────────────────── */
function pctBar(pct, label, val) {
  const b = pctBucket(pct);
  const w = pct !== null ? Math.max(pct, 3) : 0;
  const fill = pct !== null
    ? `<div class="fill b${b}" style="width:${w}%"></div>
       <div class="badge b${b}" style="left:${w}%">${pct}</div>` : '';
  return `<div class="pctrow">
    <div class="label">${label}</div>
    <div class="track">${fill}</div>
    <div class="value">${val}</div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Interactive table — click-to-sort columns (toggle direction) + pagination
══════════════════════════════════════════════════════════════════════════ */
const PAGE_SIZES = [10, 20, 50];
function makeTable(mount, cfg) {
  const byKey = {};
  cfg.columns.forEach(c => (byKey[c.key] = c));
  let sortKey = cfg.sort.key, sortDir = cfg.sort.dir || -1;   // -1 desc, +1 asc
  let pageSize = cfg.pageSize || 20, page = 0;

  function sortRows() {
    const col = byKey[sortKey];
    const rows = [...cfg.rows];
    rows.sort((a, b) => {
      let av = col.get(a), bv = col.get(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        av = (av || '').toString().toLowerCase(); bv = (bv || '').toString().toLowerCase();
        return av < bv ? -sortDir : av > bv ? sortDir : 0;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // nulls always last
      if (bv == null) return -1;
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });
    return rows;
  }

  function render() {
    const rows = sortRows();
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (page >= pages) page = pages - 1;
    const start = page * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    const thead = cfg.columns.map(c => {
      const on = c.key === sortKey;
      const arrow = on ? (sortDir < 0 ? ' ↓' : ' ↑') : '';
      const cls = [c.sortable === false ? '' : 'sortable', c.thClass || '', on ? 'sorted' : '']
        .filter(Boolean).join(' ');
      return `<th class="${cls}" data-k="${c.key}">${c.label}${arrow}${infoBtn(c.key)}</th>`;
    }).join('');
    const body = pageRows.map((r, i) => {
      const gi = start + i;
      const tds = cfg.columns.map(c => c.cell(r, gi)).join('');
      return `<tr class="${cfg.rowClass ? cfg.rowClass(r, gi) : ''}">${tds}</tr>`;
    }).join('');
    const from = total ? start + 1 : 0, to = Math.min(start + pageSize, total);
    const sizeOpts = PAGE_SIZES.map(s => `<option value="${s}"${s===pageSize?' selected':''}>${s}</option>`).join('');

    mount.innerHTML = `
      <div class="tbl-card"><table><thead><tr>${thead}</tr></thead><tbody>${body}</tbody></table></div>
      <div class="pager">
        <span class="pinfo">${from}–${to} / ${total}</span>
        <span class="psize">${t('Näytä', 'Show')} <select class="sel">${sizeOpts}</select></span>
        <span class="pnav">
          <button class="pbtn pprev"${page<=0?' disabled':''}>${t('‹ Edell.', '‹ Prev')}</button>
          <span class="ppage">${page+1} / ${pages}</span>
          <button class="pbtn pnext"${page>=pages-1?' disabled':''}>${t('Seur. ›', 'Next ›')}</button>
        </span>
      </div>`;

    mount.querySelectorAll('th.sortable').forEach(th => th.onclick = () => {
      const k = th.dataset.k;
      if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = -1; }
      page = 0; render();
    });
    mount.querySelector('.psize select').onchange = e => { pageSize = +e.target.value; page = 0; render(); };
    mount.querySelector('.pprev').onclick = () => { if (page > 0) { page--; render(); } };
    mount.querySelector('.pnext').onclick = () => { if (page < pages - 1) { page++; render(); } };
  }
  render();
}

/* ══════════════════════════════════════════════════════════════════════════
   LEADERBOARD
══════════════════════════════════════════════════════════════════════════ */
async function showLeaderboard(sid, stat, posFilter) {
  posFilter = posFilter || '';
  const data = await fetchJSON(`data/leaderboard/${sid}.json`);
  const season = data.season;
  const players = data.players;
  // kTEHO+ (teho_plus_adj) stays in the exported data but is no longer shown:
  // park-adjusted TEHO+ tracks raw TEHO+ too closely to earn a column.
  const STATS = (data.stats || ['vyk','jyk','spark_index','adv_plus','runner_plus','out_avoid_plus',
    'money_kl_plus','adv1_pct','adv2_pct','adv3_pct','adv_home_pct',
    'adv1_plus','adv2_plus','adv3_plus','adv_home_plus','teho_plus'])
    .filter(s => s !== 'teho_plus_adj');

  if (!stat || !STATS.includes(stat)) stat = STATS[0];

  // every Mallo metric is "higher = better" (indices centred on 100)
  const LOWER_BETTER = new Set();
  // stats shown as plain numbers (indices + value stats), not .xxx rates
  const INDEX_STATS = new Set(['spark_index','adv_plus','runner_plus','out_avoid_plus',
    'money_kl_plus','adv1_plus','adv2_plus','adv3_plus','adv_home_plus',
    'teho_plus','vyk','jyk','raa']);

  let sorted = [...players].filter(p => p.turns_at_bat >= 40)
    .sort((a,b) => {
      const av = a[stat], bv = b[stat];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return LOWER_BETTER.has(stat) ? av - bv : bv - av;
    });

  // position filter (baseball position); options built from the qualified pool
  const posPresent = POS_ORDER.filter(p => sorted.some(l => posLabel(l.pos) === p));
  // FIELD = kenttäpelaajat: every player with a recorded fielding position,
  // i.e. jokers (pos = null → DH) excluded.
  if (posFilter === 'FIELD') sorted = sorted.filter(l => l.pos != null);
  else if (posFilter) sorted = sorted.filter(l => posLabel(l.pos) === posFilter);
  const posQ = posFilter ? `&pos=${posFilter}` : '';
  const posOpts = [`<option value="">${t('Kaikki', 'All')}</option>`,
    `<option value="FIELD"${posFilter==='FIELD'?' selected':''}>${t('Kenttäpelaajat', 'Fielders')}</option>`].concat(
    posPresent.map(p => `<option value="${p}"${p===posFilter?' selected':''}>${p}</option>`)).join('');
  const posSel = `<span class="lab">${t('Paikka', 'Position')}</span>
    <select class="sel" onchange="location.hash='/?sid=${sid}&stat=${stat}'+(this.value?'&pos='+this.value:'')">${posOpts}</select>`;

  const pills = STATS.map(s =>
    `<a href="#/?sid=${sid}&stat=${s}${posQ}"
       class="${s===stat?'active':''}">${statLabel(s)}</a>`).join('');

  // SPARK + TEHO+ are the always-on anchors; the sorted stat gets its own
  // highlighted column unless it is already one of the anchors.
  const featuredStat = stat;
  const ANCHOR_STATS = ['spark_index', 'teho_plus'];
  const showFeat = !ANCHOR_STATS.includes(stat);
  const maxFeat = Math.max(...sorted.map(x => Math.abs(x[featuredStat] || 0)), 1e-9);
  const sparkMax = Math.max(...sorted.map(x => Math.abs(x.spark_index || 0)), 1e-9);
  const featTh = statLabel(stat);

  const barCell = (v, max) => {
    const w = v == null ? 0 : Math.min(Math.abs(v) / max * 100, 100);
    return `<td><div class="teho-cell"><span class="val">${v??'—'}</span><span class="bar"><i style="width:${w}%"></i></span></div></td>`;
  };
  const cols = [
    {key:'rank', label:'#', sortable:false, get:()=>0, cell:(r,i)=>`<td><span class="rank">${i+1}</span></td>`},
    {key:'name', label:t('Pelaaja', 'Player'), thClass:'name', get:r=>r.name,
     cell:r=>`<td class="name"><a class="player" href="#/player/${r.player_id}">${r.name}</a> <span class="pos">${posLabel(r.pos)}</span></td>`},
    {key:'team', label:t('Joukkue', 'Team'), thClass:'name', get:r=>r.team,
     cell:r=>`<td class="name team"><a href="#/team/${encodeURIComponent(r.team)}?sid=${sid}">${r.team||'—'}</a></td>`},
    {key:'games', label:t('O', 'G'), get:r=>r.games, cell:r=>`<td class="num">${r.games}</td>`},
    {key:'turns_at_bat', label:t('LV', 'PA'), get:r=>r.turns_at_bat, cell:r=>`<td class="num">${r.turns_at_bat}</td>`},
    {key:'spark_index', label:'SPARK', get:r=>r.spark_index, cell:r=>barCell(r.spark_index, sparkMax)},
    {key:'teho_plus', label:'TEHO+', get:r=>r.teho_plus, cell:r=>`<td class="num">${r.teho_plus??'—'}</td>`},
  ];
  if (showFeat) cols.push({key:stat, label:featTh, get:r=>r[stat], cell:r=>{
    const fv=r[stat], isIdx=INDEX_STATS.has(stat);
    const shown = fv==null?'—':isIdx?fv:rate(fv);
    const w = fv==null?0:Math.min(Math.abs(fv)/maxFeat*100,100);
    return `<td><div class="teho-cell"><span class="val">${shown}</span><span class="bar"><i style="width:${w}%"></i></span></div></td>`;
  }});

  const subText = ['vyk','jyk','raa'].includes(stat)
    ? t('VYK = voitot yli korvaajan (pesäpallon WAR-vastine), JYK = juoksut yli korvaajan — kertyviä arvomittareita. Vähintään 40 lyöntivuoroa.',
        'VYK = wins above replacement (pesäpallo’s WAR), JYK = runs above replacement — cumulative value stats. Minimum 40 turns at bat.')
    : ['spark_index','adv_plus','runner_plus','out_avoid_plus','money_kl_plus',
       'adv1_plus','adv2_plus','adv3_plus','adv_home_plus'].includes(stat)
    ? t('Mallo-mittarit: 100 = sarjan keskiarvo, yli 100 parempi. Vähintään 40 lyöntivuoroa.',
        'Mallo metrics: 100 = league average, higher is better. Minimum 40 turns at bat.')
    : t('Vähintään 40 lyöntivuoroa. TEHO+ = tehot/vuoro suhteessa sarjan keskiarvoon (100 = keskiverto).',
        'Minimum 40 turns at bat. TEHO+ = tehot per turn relative to the league average (100 = average).');
  const primerHint = ` <a href="#/primer">${t('Uusi täällä? Lue opas →', 'New here? Read the primer →')}</a>`;

  main().innerHTML = `
    ${leaderboardControls(sid, '')}
    <div class="page" style="padding-bottom:6px">
      <h1>${season.series} ${season.year}</h1>
      <p class="sub">${subText}${primerHint}</p>
    </div>
    <div class="filters">
      <span class="lab">${t('Järjestä', 'Sort')}</span>
      ${pills}
      <span class="spacer"></span>
      ${posSel}
      <a href="#" onclick="dlLB(${sid},'${stat}');return false;">↓ CSV</a>
    </div>
    <div id="lb-table"></div>`;

  makeTable(document.getElementById('lb-table'), {
    columns: cols, rows: sorted, sort: { key: stat, dir: -1 },
    rowClass: (r, gi) => gi === 0 ? 'leader' : '',
  });

  window.dlLB = function(sid, stat) {
    const cols = ['name','team','games','turns_at_bat','vyk','jyk','raa',
                  'spark_index','adv_plus','runner_plus','out_avoid_plus','money_kl_plus',
                  'adv1_pct','adv2_pct','adv3_pct','adv_home_pct','teho_plus','teho_plus_adj'];
    downloadCSV(sorted, cols, `${season.series}-${season.year}-${stat}.csv`);
  };
  window.nav = function(page, sid, stat) {
    location.hash = `/${page}?sid=${sid}&stat=${stat}`;
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   LUKKARIT — pitcher run-prevention leaderboard
══════════════════════════════════════════════════════════════════════════ */
async function showLukkarit(sid) {
  const data = await fetchJSON(`data/lukkari/${sid}.json`);
  const season = data.season;
  const lk = data.lukkarit || [];
  const maxRp = Math.max(...lk.map(l => Math.abs(l.lukkari_rp || 0)), 1e-9);

  const cols = [
    {key:'rank', label:'#', sortable:false, get:()=>0, cell:(r,i)=>`<td><span class="rank">${i+1}</span></td>`},
    {key:'name', label:t('Pelaaja', 'Player'), thClass:'name', get:r=>r.name,
     cell:r=>`<td class="name"><a class="player" href="#/player/${r.player_id}">${r.name}</a> <span class="pos">P</span></td>`},
    {key:'team', label:t('Joukkue', 'Team'), thClass:'name', get:r=>r.team,
     cell:r=>`<td class="name team"><a href="#/team/${encodeURIComponent(r.team)}?sid=${sid}">${r.team||'—'}</a></td>`},
    {key:'lukkari_games', label:t('Ott.', 'G'), get:r=>r.lukkari_games, cell:r=>`<td class="num">${r.lukkari_games}</td>`},
    {key:'runs_allowed', label:t('Päästetyt', 'Allowed'), get:r=>r.runs_allowed, cell:r=>`<td class="num">${r.runs_allowed}</td>`},
    {key:'lra', label:'LRA', get:r=>r.lra, cell:r=>`<td class="num">${r.lra!=null?r.lra.toFixed(2):'—'}</td>`},
    {key:'lra_minus', label:'LRA-', get:r=>r.lra_minus, cell:r=>`<td class="num">${r.lra_minus??'—'}</td>`},
    {key:'lukkari_rp', label:'RP', get:r=>r.lukkari_rp, cell:r=>{
      const w = Math.min(Math.abs(r.lukkari_rp||0)/maxRp*100,100);
      return `<td><div class="teho-cell"><span class="val">${r.lukkari_rp??'—'}</span><span class="bar"><i style="width:${w}%"></i></span></div></td>`;
    }},
  ];

  main().innerHTML = `
    ${leaderboardControls(sid, 'lukkari')}
    <div class="page" style="padding-bottom:6px">
      <h1>${season.series} ${season.year} <span class="muted">· Lukkarit</span></h1>
      <p class="sub">${t('Lukkarin juoksujenesto: RP = juoksut estetty yli sarjan keskiarvon (kertyvä, suurempi parempi). LRA = päästetyt juoksut/ottelu, LRA- indeksinä (100 = keskiarvo, pienempi parempi). Vähintään 3 lukkariottelua. ERA-tyylinen silta kunnes syöttödata on saatavilla.',
        'Run prevention for the lukkari: RP = runs prevented above the league average (cumulative, higher is better). LRA = runs allowed per game, LRA- the same as an index (100 = average, lower is better). Minimum 3 games as lukkari. An ERA-style bridge until pitch data is available.')}</p>
    </div>
    ${lk.length ? `<div id="lk-table"></div>` : `<div class="page"><p class="sub">${t('Ei lukkaridataa tälle kaudelle.', 'No lukkari data for this season.')}</p></div>`}`;

  if (lk.length) makeTable(document.getElementById('lk-table'), {
    columns: cols, rows: lk, sort: { key: 'lukkari_rp', dir: -1 },
    rowClass: (r, gi) => gi === 0 ? 'leader' : '',
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   DEFENSE — team run prevention + inferred player boards (PBP-derived)
══════════════════════════════════════════════════════════════════════════ */
async function showDefense(sid) {
  let data = null;
  try { data = await fetchJSON(`data/defense/${sid}.json`); } catch (e) { /* no PBP for this season */ }
  const season = data?.season
    || META.seasons.find(s => s.id === sid) || META.seasons[0];

  if (!data || !(data.teams || []).length) {
    main().innerHTML = `
      ${leaderboardControls(sid, 'defense')}
      <div class="page">
        <h1>${season.series} ${season.year} <span class="muted">· ${t('Puolustus', 'Defense')}</span></h1>
        <p class="sub">${t('Puolustustilastot lasketaan syöttökohtaisesta ottelodatasta, jota on vasta nykyisiltä kausilta. Tälle kaudelle sitä ei ole.',
          'Defensive stats are computed from play-by-play data, which exists only for recent seasons. None is available for this season.')}</p>
      </div>`;
    return;
  }

  const cov = data.coverage || {};
  const teams = data.teams;
  const maxRv = Math.max(...teams.map(x => Math.abs(x.def_rv || 0)), 1e-9);

  const cols = [
    {key:'rank', label:'#', sortable:false, get:()=>0, cell:(r,i)=>`<td><span class="rank">${i+1}</span></td>`},
    {key:'team', label:t('Joukkue', 'Team'), thClass:'name', get:r=>r.team,
     cell:r=>`<td class="name"><a href="#/team/${encodeURIComponent(r.team)}?sid=${sid}">${r.team}</a></td>`},
    {key:'games', label:t('O', 'G'), get:r=>r.games, cell:r=>`<td class="num">${r.games}</td>`},
    {key:'def_rv', label:statLabel('def_rv'), get:r=>r.def_rv, cell:r=>{
      const w = Math.min(Math.abs(r.def_rv||0)/maxRv*100,100);
      return `<td><div class="teho-cell"><span class="val">${r.def_rv>0?'+':''}${r.def_rv??'—'}</span><span class="bar"><i style="width:${w}%"></i></span></div></td>`;
    }},
    {key:'def_koppi_pct', label:statLabel('def_koppi_pct'), get:r=>r.koppi_pct, cell:r=>`<td class="num">${r.koppi_pct??'—'}</td>`},
    {key:'def_out_conv', label:statLabel('def_out_conv'), get:r=>r.out_conv, cell:r=>`<td class="num">${r.out_conv??'—'}</td>`},
    {key:'def_error_cost', label:statLabel('def_error_cost'), get:r=>r.error_cost, cell:r=>`<td class="num">${r.error_cost??'—'}</td>`},
    {key:'def_arm_hold', label:statLabel('def_arm_hold'), get:r=>r.arm_hold, cell:r=>`<td class="num">${r.arm_hold??'—'}</td>`},
  ];

  const boards = (rows, keyRate) => rows.map((r,i) => `<tr>
      <td><span class="rank">${i+1}</span></td>
      <td class="name"><a class="player" href="#/player/${r.player_id}">${r.name}</a></td>
      <td class="name team">${r.team||'—'}</td>
      <td class="num">${r.n??'—'}</td>
      <td class="num strong">${r[keyRate]??'—'}</td>
    </tr>`).join('');

  const ofBoard = (data.of_koppi || []).length ? `
      <h2>${t('Kopparit: koppiprosentti', 'Outfielders: catch rate')}</h2>
      <p class="sub">${t('Takakentän alueelle lyödyt lyönnit jaettu kopparille lyöntien paikkatiedon perusteella. Arvio, ei virallinen tilasto.',
        'Balls hit to the outfield zone are assigned to an outfielder from hit locations. An estimate, not an official stat.')}</p>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr><th>#</th><th class="name">${t('Pelaaja', 'Player')}</th><th class="name">${t('Joukkue', 'Team')}</th><th>${t('Lyönnit', 'Balls')}</th><th>${statLabel('of_koppi_rate')}${infoBtn('of_koppi_rate')}</th></tr></thead>
          <tbody>${boards(data.of_koppi, 'rate')}</tbody>
        </table>
      </div>` : '';

  const lkBoard = (data.lukkari_def || []).length ? `
      <h2>${t('Lukkarit: etukentän puolustus', 'Lukkaris: front-field defense')}</h2>
      <p class="sub">${t('Etukentän lyhyet lyönnit kuuluvat lukkarille. Arvo lasketaan tilanneodotuksista; jako perustuu lyöntien paikkatietoon.',
        'Short front-field plays belong to the lukkari. Value comes from run expectancy; the split is inferred from hit locations.')}</p>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr><th>#</th><th class="name">${t('Pelaaja', 'Player')}</th><th class="name">${t('Joukkue', 'Team')}</th><th>${t('Lyönnit', 'Balls')}</th><th>${statLabel('lukkari_def_rv')}${infoBtn('lukkari_def_rv')}</th></tr></thead>
          <tbody>${boards(data.lukkari_def, 'def_rv')}</tbody>
        </table>
      </div>` : '';

  main().innerHTML = `
    ${leaderboardControls(sid, 'defense')}
    <div class="page" style="padding-bottom:6px">
      <h1>${season.series} ${season.year} <span class="muted">· ${t('Puolustus', 'Defense')}</span></h1>
      <p class="sub">${t('PEJ/O = puolustuksen estämät juoksut ottelua kohden suhteessa sarjan keskiarvoon, laskettuna tilanneodotuksista. Koppi on kenttäpelaajan suoritus, ei palo.',
        'DRS/G = defensive runs saved per game versus the league average, from run expectancy. A caught fly (koppi) is a fielding act, not an out.')}
        ${t('Perustuu', 'Based on play-by-play from')} ${cov.matches_pbp ?? '?'}/${cov.matches_total ?? '?'} ${t('ottelun syöttödataan.', 'matches.')}</p>
    </div>
    <div id="def-table"></div>
    <div class="page" style="padding-top:0">
      ${(data.zone_map && (data.zone_map.teams || []).length) ? `
      <h2>${t('Puolustuskartta', 'Defensive field map')}</h2>
      <p class="sub">${t('Vastustajien lyönnit jaettuna kenttälohkoihin. Väri kertoo joukkueen koppiprosentin eron sarjan keskiarvoon samassa lohkossa, ja jokainen lohko näyttää koppiprosentin ja lyöntien määrän.',
        'Opponent balls in play by field zone. The color shows the team’s catch rate against the league average in the same zone, and every zone lists the catch rate and the number of balls.')}</p>
      <div class="filters">
        <span class="lab">${t('Joukkue', 'Team')}</span>
        <select class="sel" id="def-map-team">
          ${data.zone_map.teams.map(z => `<option value="${z.team}">${z.team}</option>`).join('')}
        </select>
      </div>
      <div class="card"><div id="def-map"></div></div>` : ''}
      ${data.re_table ? `
      <h2>${t('Tilanneodotukset', 'Run expectancy')}</h2>
      <p class="sub">${t('Montako juoksua vuoroparin loppuun mennessä keskimäärin syntyy kustakin pesätilanteesta ja palomäärästä. Taulukko on laskettu tämän sarjan omista otteluista, ja se on PEJ-luvun perusta.',
        'How many runs a half-inning produces on average from each combination of base runners and outs. The table is measured from this league’s own games, and it is the basis of the PEJ number.')}</p>
      <div class="card" style="padding:0;overflow-x:auto"><div id="re-grid"></div></div>` : ''}
      ${ofBoard}
      ${lkBoard}
    </div>`;

  makeTable(document.getElementById('def-table'), {
    columns: cols, rows: teams, sort: { key: 'def_rv', dir: -1 },
    rowClass: (r, gi) => gi === 0 ? 'leader' : '',
  });

  const zm = data.zone_map;
  if (zm && (zm.teams || []).length && typeof renderFieldMap === 'function') {
    const sel = document.getElementById('def-map-team');
    const draw = () => renderFieldMap(document.getElementById('def-map'), zm,
      sel.value, { league: t('sarja', 'league'), balls: t('lyöntiä', 'balls'),
                   koppi: statLabel('def_koppi_pct') });
    sel.onchange = draw;
    draw();
  }
  if (data.re_table && typeof renderReGrid === 'function') {
    renderReGrid(document.getElementById('re-grid'), data.re_table, {
      bases: t('Pesillä', 'On base'), outs: t('paloa', 'out'),
      loaded: t('täydet', 'loaded'),
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   PROJECTIONS
══════════════════════════════════════════════════════════════════════════ */
async function showProjections(sid) {
  // PARE is forward-looking — projections exist for the current season only, so
  // restrict the selector to this year's series (avoids 404s on historical years).
  const maxYear = Math.max(...META.seasons.map(s => s.year));
  const curSeasons = META.seasons.filter(s => s.year === maxYear);
  if (!curSeasons.some(s => s.id === sid)) sid = curSeasons[0]?.id;

  const data = await fetchJSON(`data/projections/${sid}.json`);
  const projs = data.projections;
  const maxProj = Math.max(...projs.map(p => Math.abs(p.teho_plus_proj || 0)), 1e-9);

  const cols = [
    {key:'rank', label:'#', sortable:false, get:()=>0, cell:(r,i)=>`<td><span class="rank">${i+1}</span></td>`},
    {key:'name', label:t('Pelaaja', 'Player'), thClass:'name', get:r=>r.name,
     cell:r=>`<td class="name"><a class="player" href="#/player/${r.player_id}">${r.name}</a></td>`},
    {key:'ekl', label:statLabel('ekl'), get:r=>r.stats?.kl_pct?.rate, cell:r=>`<td class="num">${rate(r.stats?.kl_pct?.rate)}</td>`},
    {key:'esaatto', label:statLabel('esaatto'), get:r=>r.stats?.saatto_pct?.rate, cell:r=>`<td class="num">${rate(r.stats?.saatto_pct?.rate)}</td>`},
    {key:'eeten', label:statLabel('eeten'), get:r=>r.stats?.eten_pct?.rate, cell:r=>`<td class="num">${rate(r.stats?.eten_pct?.rate)}</td>`},
    {key:'epalo', label:statLabel('epalo'), get:r=>r.stats?.palo_rate?.rate, cell:r=>`<td class="num">${rate(r.stats?.palo_rate?.rate)}</td>`},
    {key:'eteho', label:'eTEHO+', thClass:'extra', get:r=>r.teho_plus_proj, cell:r=>{
      const w = Math.min(Math.abs(r.teho_plus_proj||0)/maxProj*100,100);
      return `<td><div class="teho-cell"><span class="val">${r.teho_plus_proj}</span><span class="bar"><i style="width:${w}%"></i></span></div></td>`;
    }},
  ];

  main().innerHTML = `
    <div class="controls">
      ${seasonSelHtml(curSeasons, sid, '/projections')}
    </div>
    <div class="page" style="padding-bottom:6px">
      <h1>${t('PARE-ennusteet', 'PARE projections')}</h1>
      <p class="sub">${t('Päivittyvä arvio jokaisen pelaajan todellisesta tasosta: koko urahistoria eksponentiaalisesti painotettuna + regressio sarjakeskiarvoon. Ei mielivaltaisia "viimeiset N ottelua" -rajauksia.',
        'A continuously updated estimate of each player’s true level: the whole career history, exponentially weighted, regressed to the league average. No arbitrary "last N games" cutoffs.')}</p>
    </div>
    <div id="pr-table"></div>`;

  makeTable(document.getElementById('pr-table'), {
    columns: cols, rows: projs, sort: { key: 'eteho', dir: -1 },
    rowClass: (r, gi) => gi === 0 ? 'leader' : '',
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   LEAGUE
══════════════════════════════════════════════════════════════════════════ */
async function showLeague(sid) {
  const data = await fetchJSON(`data/league/${sid}.json`);
  const season = data.season;
  const table = data.standings;
  const parks = data.parks;
  const weather = data.weather;

  const standCols = [
    {key:'rank', label:'#', sortable:false, get:()=>0, cell:(r,i)=>`<td>${i+1}</td>`},
    {key:'team', label:t('Joukkue', 'Team'), thClass:'name', get:r=>r.team,
     cell:r=>`<td class="name"><a href="#/team/${encodeURIComponent(r.team)}?sid=${sid}">${r.team}</a></td>`},
    {key:'games', label:t('O', 'G'), get:r=>r.games, cell:r=>`<td class="num">${r.games}</td>`},
    {key:'wins', label:t('V', 'W'), get:r=>r.wins, cell:r=>`<td class="num">${r.wins}</td>`},
    {key:'ties', label:'T', get:r=>r.ties, cell:r=>`<td class="num">${r.ties??'—'}</td>`},
    {key:'losses', label:t('H', 'L'), get:r=>r.losses, cell:r=>`<td class="num">${r.losses}</td>`},
    {key:'points', label:t('Pisteet', 'Points'), get:r=>r.points, cell:r=>`<td class="num"><strong>${r.points}</strong></td>`},
    {key:'runs', label:t('Juoksut', 'Runs'), sortable:false, get:r=>r.run_diff, cell:r=>`<td class="num">${r.runs_for}–${r.runs_against}</td>`},
    {key:'run_diff', label:'±', get:r=>r.run_diff, cell:r=>{
      const diff = r.run_diff>=0?`+${r.run_diff}`:`${r.run_diff}`;
      return `<td class="num ${r.run_diff>=0?'pos':'neg'}">${diff}</td>`;
    }},
  ];

  let parkRows = '';
  for (const p of (parks||[])) {
    parkRows += `<tr>
      <td class="name">${p.stadium}</td>
      <td class="num">${p.games}</td><td class="num">${p.runs_per_game}</td>
      <td class="num" style="font-weight:700${p.pf>100?';color:var(--accent)':''}">${p.pf}</td>
    </tr>`;
  }

  let wxRows = '';
  for (const w of (weather||[])) {
    wxRows += `<tr>
      <td class="name">${w.wind}</td>
      <td class="num">${w.games}</td><td class="num">${w.kunnari_rate}</td>
      <td class="num">${w.runs_per_game}</td>
    </tr>`;
  }

  main().innerHTML = `
    <div class="controls">
      ${seasonSelHtml(META.seasons, sid, '/league')}
    </div>
    <div class="page" style="padding-bottom:6px">
      <h1>${season.series} ${season.year}</h1>
      <p class="sub">${t('Koko kausi.', 'The full season.')}</p>
    </div>
    <div class="page" style="padding-top:0">
      <h2>${t('Sarjataulukko', 'Standings')}</h2>
      <div id="lg-standings"></div>
      <h2>${t('Kenttäkertoimet', 'Park factors')} <span class="muted">${t('(100 = neutraali)', '(100 = neutral)')}</span></h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr>
            <th class="name">${t('Stadion', 'Stadium')}</th>
            <th>${t('Ottelut', 'Games')}</th><th>${t('Juoksua/ottelu', 'Runs/game')}</th><th>PF</th>
          </tr></thead>
          <tbody>${parkRows}</tbody>
        </table>
      </div>
      <h2>${t('Tuuli ja kunnarit', 'Wind and home runs')}</h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr>
            <th class="name">${t('Tuuli', 'Wind')}</th>
            <th>${t('Ottelut', 'Games')}</th><th>${t('Kunnarit/vuoro', 'HR/PA')}</th><th>${t('Juoksua/ottelu', 'Runs/game')}</th>
          </tr></thead>
          <tbody>${wxRows}</tbody>
        </table>
        <p class="legend" style="padding:10px 16px">${t('Sää joka ottelusta suoraan tulospalvelun datasta.', 'Weather for every game, straight from the results service.')}</p>
      </div>
    </div>`;

  makeTable(document.getElementById('lg-standings'), {
    columns: standCols, rows: table, sort: { key: 'points', dir: -1 }, pageSize: 50,
  });

}

/* ══════════════════════════════════════════════════════════════════════════
   PLAYER
══════════════════════════════════════════════════════════════════════════ */
const PCT_STATS = ['kl_pct','saatto_pct','eten_pct','kunnari_rate','lyoty_rate','palo_rate','tehot_per_turn'];
const BASE_KL_KEYS = ['kl_base0','kl_base1','kl_base2','kl_base3'];

async function showPlayer(pid) {
  const data = await fetchJSON(`data/players/${pid}.json`);
  const {player, career, line, proj, translation, pitching, career_json, base_kl, base_keys, comps} = data;

  const projTile = proj?.teho_plus_proj
    ? `<div class="tile"><div class="label">${t('PARE enn.', 'PARE proj.')}</div><div class="value">${proj.teho_plus_proj}</div></div>` : '';

  let pctBars = '';
  for (const stat of PCT_STATS) {
    const pct = line[`pct_${stat}`];
    const v = line[stat];
    pctBars += pctBar(pct, statLabel(stat) + infoBtn(stat), rate(v));
  }

  let baseKlBars = '';
  if (base_kl) {
    for (const key of (base_keys||BASE_KL_KEYS)) {
      const pct = base_kl[`pct_${key}`];
      const tries = base_kl[`${key}_tries`];
      const lbl = `${statLabel(key)}${infoBtn(key)} <span style="color:var(--ink3);font-size:11px">(${tries} ${t('yrit.', 'att.')})</span>`;
      baseKlBars += pctBar(pct, lbl, rate(base_kl[key]));
    }
  }

  // Defensive numbers for the current season, when the player qualifies for
  // one of the PBP boards. Infielders and jokers get nothing here on
  // purpose: zone inference cannot carry individual claims for fluid
  // infield positions.
  let defenseHtml = '';
  try {
    const defData = await fetchJSON(`data/defense/${line.season_id}.json`);
    const ofRow = (defData.of_koppi || []).find(r => r.player_id === player.id);
    const lkRow = (defData.lukkari_def || []).find(r => r.player_id === player.id);
    if (ofRow || lkRow) {
      const tiles = [];
      if (ofRow) tiles.push(`
        <div class="tile"><div class="label">${t('Koppi-% takakentällä', 'Outfield catch rate')}${infoBtn('of_koppi_rate')}</div>
          <div class="value">${ofRow.rate} %</div></div>
        <div class="tile"><div class="label">${t('Kopit / lyönnit', 'Catches / balls')}</div>
          <div class="value">${ofRow.koppis}/${ofRow.n}</div></div>`);
      if (lkRow) tiles.push(`
        <div class="tile"><div class="label">${statLabel('lukkari_def_rv')}${infoBtn('lukkari_def_rv')}</div>
          <div class="value">${lkRow.def_rv > 0 ? '+' : ''}${lkRow.def_rv}</div></div>
        <div class="tile"><div class="label">${t('Poltot · haavat', 'Outs · wounds')}</div>
          <div class="value">${lkRow.outs} · ${lkRow.wounds}</div></div>`);
      defenseHtml = `
      <h2>${t('Puolustus', 'Defense')} ${line.year}</h2>
      <div class="tiles">${tiles.join('')}</div>
      <p class="legend">${t('Pelaajakohtainen jako perustuu lyöntien paikkatietoon — arvio, ei virallinen tilasto.',
        'The player split is inferred from hit locations — an estimate, not an official stat.')}</p>`;
    }
  } catch (e) { /* no play-by-play for this season */ }

  let careerRows = '';
  for (const s of career) {
    const teamCell = s.team
      ? `<a href="#/team/${encodeURIComponent(s.team)}?sid=${s.season_id}">${s.team}</a>`
      : '—';
    careerRows += `<tr>
      <td class="name">${s.year}</td>
      <td class="name">${teamCell}</td>
      <td class="num">${s.games}</td><td class="num">${s.turns_at_bat}</td>
      <td class="num strong">${s.vyk??'—'}</td>
      <td class="num">${s.spark_index??'—'}</td>
      <td class="num">${s.adv_plus??'—'}</td>
      <td class="num">${s.runner_plus??'—'}</td>
      <td class="num">${s.out_avoid_plus??'—'}</td>
      <td class="num">${s.money_kl_plus??'—'}</td>
      <td class="num extra">${s.teho_plus??'—'}</td>
    </tr>`;
  }

  let compsHtml = '';
  if (comps?.length) {
    let cr = '';
    for (const c of comps) {
      cr += `<tr>
        <td class="num">${c.score}</td>
        <td class="name"><a href="#/player/${c.player_id}">${c.name}</a></td>
        <td class="num">${c.year}</td><td class="num">${c.age||'—'}</td><td class="num extra">${c.teho_plus}</td>
      </tr>`;
    }
    compsHtml = `
      <h2>${t('Vertailukelpoiset kaudet', 'Comparable seasons')} <span class="muted">${t('(1000 = identtinen)', '(1000 = identical)')}</span></h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr><th>${t('Pisteet', 'Score')}</th><th class="name">${t('Pelaaja', 'Player')}</th><th>${t('Kausi', 'Season')}</th><th>${t('Ikä', 'Age')}</th><th class="extra">TEHO+</th></tr></thead>
          <tbody>${cr}</tbody>
        </table>
      </div>`;
  }

  let projRows = '';
  if (proj?.stats) {
    for (const [name, s] of Object.entries(proj.stats)) {
      projRows += `<tr>
        <td class="name">${name}</td>
        <td class="num extra"><strong>${rate(s.rate)}</strong></td>
        <td class="num">${rate(s.observed)}</td>
        <td class="num">${Math.round(s.effective_n)}</td>
      </tr>`;
    }
  }

  const careerCharts = career?.length > 1 ? `
    <h2>${t('Urakehitys', 'Career trend')}</h2>
    <div class="card">
      <div class="minis">
        <div class="mini"><div class="label">KL%</div><div id="career-kl"></div></div>
        <div class="mini"><div class="label">TEHO+</div><div id="career-teho"></div></div>
      </div>
    </div>` : '';

  main().innerHTML = `
    <div class="page">
      <h1>${player.name} <span class="pos">${posLabel(line.pos)}</span></h1>
      <p class="sub">
        <a href="#/team/${encodeURIComponent(line.team)}?sid=${line.season_id}">${line.team}</a>
        ${line.age ? `· ${line.age} ${t('v', 'y')}` : ''}
        · ${t('kausi', 'season')} ${line.year}
      </p>
      ${(translation || pitching) ? `<a class="bb-toggle" href="#/baseball/${pid}" title="${t('Käännä baseball-termeille', 'Translate to baseball terms')}" aria-label="Baseball">⚾</a>` : ''}
      <div class="tiles">
        <div class="tile"><div class="label">${t('Ottelut', 'Games')}</div><div class="value">${line.games}</div></div>
        <div class="tile hero"><div class="label">${statLabel('vyk')}${infoBtn('vyk')}</div><div class="value">${line.vyk??'—'}</div></div>
        <div class="tile"><div class="label">SPARK${infoBtn('spark_index')}</div><div class="value">${line.spark_index??'—'}</div></div>
        <div class="tile"><div class="label">TEHO+${infoBtn('teho_plus')}</div><div class="value">${line.teho_plus||'—'}</div></div>
        ${projTile}
      </div>
      <h2>${t('Mallo-indeksit', 'Mallo indices')} ${line.year} <span class="muted">${t('(100 = sarjan keskiarvo)', '(100 = league average)')}</span></h2>
      <div class="card"><div id="index-bars"></div></div>
      <h2>${t('Prosenttipisteet', 'Percentiles')} ${line.year} <span class="muted">${t('(sarjan vakiopelaajien joukossa)', '(among the league’s qualified players)')}</span></h2>
      <div class="card">
        ${pctBars}
        <p class="legend">${t('Vaalea = sarjan häntäpää · tumma = kärki. Numero = prosenttipiste.', 'Light = bottom of the league · dark = top. The number is the percentile.')}</p>
      </div>
      ${base_kl ? `
      <h2>${t('KL% pesäkohdittain', 'KL% by target base')} ${line.year} <span class="muted">${t('(kärkilyöntiprosentti per pesa)', '(advance-hit rate per base)')}</span></h2>
      <div class="card">${baseKlBars}</div>` : ''}
      ${defenseHtml}
      ${careerCharts}
      <div class="split">
        <div>
          <h2>${t('Kaudet', 'Seasons')}</h2>
          <div class="card" style="padding:0;overflow:hidden">
            <table>
              <thead><tr>
                <th class="name">${t('Kausi', 'Season')}</th><th class="name">${t('Joukkue', 'Team')}</th><th>${t('O', 'G')}</th><th>${t('LV', 'PA')}</th>
                <th>${statLabel('vyk')}</th><th>SPARK</th><th>ADV+</th><th>RUN+</th><th>OUT+</th><th>${statLabel('money_kl_plus')}</th>
                <th class="extra">TEHO+</th>
              </tr></thead>
              <tbody>${careerRows}</tbody>
            </table>
          </div>
        </div>
        <div>
          ${compsHtml}
          ${proj ? `
          <h2>${t('PARE-ennuste', 'PARE projection')} <span class="muted">(${proj.as_of||''})</span></h2>
          <div class="card" style="padding:0;overflow:hidden">
            <table>
              <thead><tr>
                <th class="name">${t('Tilasto', 'Stat')}</th>
                <th class="extra">${t('Ennuste', 'Projection')}</th><th>${t('Havaittu', 'Observed')}</th><th>${t('Otos', 'Sample')}</th>
              </tr></thead>
              <tbody>${projRows}</tbody>
            </table>
            <p class="legend" style="padding:10px 16px">
              ${t('Eksponentiaalisesti painotettu historia regressoituna sarjakeskiarvoon.', 'Exponentially weighted history regressed to the league average.')}</p>
          </div>` : ''}
        </div>
      </div>
    </div>`;

  const ibEl = document.getElementById('index-bars');
  if (ibEl && typeof renderIndexBars === 'function') {
    renderIndexBars(ibEl, [
      {label:'SPARK',    value: line.spark_index,    full:t('SPARK — tilanteenrakentajan indeksi', 'SPARK — table-setter index')},
      {label:'ADV+',     value: line.adv_plus,       full:t('Etenemisarvo lyöjänä', 'Advancement value as a batter')},
      {label:'RUN+',     value: line.runner_plus,    full:t('Etenijän arvo', 'Value as a runner')},
      {label:'OUT+',     value: line.out_avoid_plus, full:t('Palojen välttäminen', 'Out avoidance')},
      {label:statLabel('money_kl_plus'), value: line.money_kl_plus,  full:t('Kotiutuskärkilyönnit', 'Scoring advance hits')},
      {label:'TEHO+',    value: line.teho_plus,      full:t('Tuotanto per lyöntivuoro', 'Production per turn at bat')},
    ]);
  }

  if (career?.length > 1 && typeof renderCareer === 'function') {
    const klEl = document.getElementById('career-kl');
    const tpEl = document.getElementById('career-teho');
    if (klEl) renderCareer(klEl, career_json, 'kl_pct', {label:'KL%', fmt:d3.format('.3f')});
    if (tpEl) renderCareer(tpEl, career_json, 'teho_plus', {label:'TEHO+', fmt:d3.format('d')});
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   TEAM
══════════════════════════════════════════════════════════════════════════ */
async function showTeam(teamRaw, sid) {
  const slug = slugify(decodeURIComponent(teamRaw));

  let actualSid = sid;
  if (!actualSid) {
    for (const s of META.seasons) {
      try {
        await fetchJSON(`data/teams/${slug}-${s.id}.json`);
        actualSid = s.id;
        break;
      } catch(e) { continue; }
    }
  }

  const data = await fetchJSON(`data/teams/${slug}-${actualSid}.json`);
  const {team, season, roster, standing} = data;

  const standingTiles = standing ? `
    <div class="tiles" style="margin-top:16px">
      <div class="tile"><div class="label">${t('Ottelut', 'Games')}</div><div class="value">${standing.games}</div></div>
      <div class="tile"><div class="label">${t('V–H', 'W–L')}</div><div class="value">${standing.wins}–${standing.losses}</div></div>
      <div class="tile hero"><div class="label">${t('Pisteet', 'Points')}</div><div class="value">${standing.points}</div></div>
      <div class="tile"><div class="label">${t('Juoksuero', 'Run diff')}</div><div class="value">${standing.run_diff>=0?'+':''}${standing.run_diff}</div></div>
    </div>` : '';

  const rosterCols = [
    {key:'name', label:t('Pelaaja', 'Player'), thClass:'name', get:r=>r.name,
     cell:r=>`<td class="name"><a class="player" href="#/player/${r.player_id}">${r.name}</a> <span class="pos">${posLabel(r.pos)}</span></td>`},
    {key:'games', label:t('O', 'G'), get:r=>r.games, cell:r=>`<td class="num">${r.games}</td>`},
    {key:'turns_at_bat', label:t('LV', 'PA'), get:r=>r.turns_at_bat, cell:r=>`<td class="num">${r.turns_at_bat}</td>`},
    {key:'spark_index', label:'SPARK', get:r=>r.spark_index, cell:r=>`<td class="num strong">${r.spark_index??'—'}</td>`},
    {key:'adv_plus', label:'ADV+', get:r=>r.adv_plus, cell:r=>`<td class="num">${r.adv_plus??'—'}</td>`},
    {key:'runner_plus', label:'RUN+', get:r=>r.runner_plus, cell:r=>`<td class="num">${r.runner_plus??'—'}</td>`},
    {key:'out_avoid_plus', label:'OUT+', get:r=>r.out_avoid_plus, cell:r=>`<td class="num">${r.out_avoid_plus??'—'}</td>`},
    {key:'teho_plus', label:'TEHO+', thClass:'extra', get:r=>r.teho_plus, cell:r=>`<td class="num extra">${r.teho_plus??'—'}</td>`},
  ];

  main().innerHTML = `
    <div class="page">
      <h1>${team}</h1>
      <p class="sub">${season.series} ${season.year}</p>
      ${standingTiles}
      <h2 style="margin-top:${standing?'4px':'0'}">${t('Pelaajat', 'Players')}</h2>
      <div id="tm-roster"></div>
    </div>`;

  makeTable(document.getElementById('tm-roster'), {
    columns: rosterCols, rows: roster, sort: { key: 'spark_index', dir: -1 }, pageSize: 50,
  });
}


/* ══════════════════════════════════════════════════════════════════════════
   BASEBALL TRANSLATION — concise player → MLB card
══════════════════════════════════════════════════════════════════════════ */
async function showBaseball(pid) {
  const data = await fetchJSON(`data/players/${pid}.json`);
  const {player, line, translation: t, pitching: pit} = data;
  if (!t && !pit) {
    main().innerHTML = `<div class="page"><h1>${player.name}</h1>
      <p class="sub"><a href="#/player/${pid}">${t('← takaisin', '← back')}</a> · ${t('ei baseball-käännöstä (liian vähän pelattu tältä kaudelta).', 'no baseball translation (not enough playing time this season).')}</p></div>`;
    return;
  }
  const callout = (k, v, cls) => `<div class="callout"><div class="k">${k}</div><div class="v ${cls||''}">${v}</div></div>`;
  const tbl = (head, body) => `<div class="card" style="padding:0;overflow:hidden"><table>
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;

  const batting = !t ? '' : `
    <h2>Lyönti → MLB <span class="muted">(same percentile, MLB scale)</span></h2>
    <div class="callrow">
      ${callout('wRC+ equivalent', t.wrc_plus ?? '—', 'accent')}
      ${callout('Reads like', t.tier ?? '—')}
    </div>
    ${tbl(`<th class="name">Pesäpallo</th><th>${t('Arvo', 'Value')}</th><th>Pctile</th><th>MLB</th><th class="extra">${t('Käännös', 'Translation')}</th>`,
      t.rows.map(r => `<tr>
        <td class="name">${r.pesis_label}</td><td class="num">${rate(r.pesis_value)}</td>
        <td class="num">${r.percentile}</td><td class="num">${r.mlb_stat}</td>
        <td class="num extra">${r.mlb_value}</td>
      </tr>`).join(''))}`;

  const pitchingHtml = !pit ? '' : `
    <h2>Lukkari → MLB <span class="muted">(juoksujenesto · run prevention)</span></h2>
    <div class="callrow">
      ${callout('ERA equivalent', pit.era ?? '—', 'accent')}
      ${callout('Reads like', pit.tier ?? '—')}
    </div>
    ${tbl(`<th class="name">Lukkari</th><th>${t('Arvo', 'Value')}</th><th>Pctile</th><th>MLB</th><th class="extra">${t('Käännös', 'Translation')}</th>`,
      pit.rows.map(r => `<tr>
        <td class="name">${r.pesis}</td><td class="num">${r.arvo}</td>
        <td class="num">${r.pctile ?? '—'}</td><td class="num">${r.mlb}</td>
        <td class="num extra">${r.kaannos}</td>
      </tr>`).join(''))}`;

  main().innerHTML = `
    <div class="page">
      <h1>${player.name} <span class="muted">· baseball</span></h1>
      <p class="sub">${line.team} · ${line.year}</p>
      <a class="bb-toggle" href="#/player/${pid}" title="${t('Takaisin tilastoihin', 'Back to the stats')}" aria-label="${t('Takaisin tilastoihin', 'Back to the stats')}">📊</a>
      ${batting}
      ${pitchingHtml}
      <p class="legend">Rank-preserving quantile map — a player's percentile among qualified
      Superpesis players read off at the same percentile of the MLB distribution. A translation
      baseball fans can read, not a claim the skills transfer.</p>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   STATIC PAGES
══════════════════════════════════════════════════════════════════════════ */
function showAbout() {
  const fi = `
        <p class="lead">Tämä on fanisivusto, joka ottaa mallia baseballin edistyneiden tilastojen
        sivustoista. Se on yhä vahvasti työn alla ja nojaa pesistulokset-palvelun dataan.</p>
        <p>Ennen kaikkea kyseessä on fanikokeilu — tapani tuoda rakkaus baseball-tilastoihin
        pesäpalloon. Ajan myötä varmasti muokkaamme mittareita ja poistamme osan, mutta tämä on
        ensimmäinen versio, jonka kokoamisesta olin innoissani.</p>
        <p>Jos haluat tietää hieman siitä, miten päädyin seuraamaan lajia — olen ollut fani vuodesta
        2011 — lue <a href="https://www.superpesis.fi/ajankohtaista/superpesis-yhdysvaltalainen-ron-bronson-toteutti-unelmansa-ja-matkusti-suomeen-katsomaan-pesapalloa">juttuni Superpesiksen sivuilla</a>.</p>`;
  const en = `
        <p class="lead">This is a fan site modeled on baseball's advanced-stats sites. It is very
        much a work in progress and relies on data from the pesistulokset.fi service.</p>
        <p>Above all it is a fan experiment — my way of bringing a love of baseball statistics to
        pesäpallo. Over time we will surely adjust some of the metrics and drop others, but this is
        the first version, and I was excited to put it together.</p>
        <p>If you want to know how I ended up following the sport — I have been a fan since
        2011 — read <a href="https://www.superpesis.fi/ajankohtaista/superpesis-yhdysvaltalainen-ron-bronson-toteutti-unelmansa-ja-matkusti-suomeen-katsomaan-pesapalloa">my story on the Superpesis site</a>.</p>`;
  main().innerHTML = `
    <div class="page">
      <h1>${t('Tietoa', 'About')}</h1>
      <div class="prose">
        ${t(fi, en)}
        <p>✉️ <a href="mailto:${contactAddr()}">${contactAddr()}</a></p>
      </div>
    </div>`;
}

function showGlossary() {
  // glossary tables have long text — allow wrapping in the Huomio column
  const gtable = (rows) => `
    <table class="gloss">
      <colgroup>
        <col class="c-stat">
        <col class="c-form">
        <col class="c-note">
      </colgroup>
      <thead><tr>
        <th class="name">${t('Tilasto', 'Stat')}</th>
        <th class="name">${t('Kaava', 'Formula')}</th>
        <th class="name">${t('Huomio', 'Note')}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  const gr = (name, formula, note) =>
    `<tr>
      <td class="name">${name}</td>
      <td style="text-align:left">${formula}</td>
      <td style="text-align:left;white-space:normal;color:var(--ink3)">${note}</td>
    </tr>`;

  main().innerHTML = `
    <div class="page">
      <h1>${t('Kaavat', 'Formulas')}</h1>
      <p class="sub">${t('Jokainen tilasto selitettynä — laskentakaava ja tulkintaohje.', 'Every stat explained — the formula and how to read it.')}</p>
      <h2>${t('Perustilastot', 'Basic stats')}</h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr(statLabel('tehot'),'<code>K + L + T</code>',t('perinteinen tuotantoluku', 'the traditional production stat (tehot)')) +
          gr(statLabel('kl_pct'),'<code>kärkilyönnit / KLY</code>',t('kärjen eteneminen per yritys', 'advance hits: moving the lead runner, per attempt')) +
          gr(t('Saatto-%', 'Escort%'),'<code>saatot / saattoyritykset</code>',t('takaetenijän vieminen lyöjänä', 'moving a trailing runner as the batter')) +
          gr(t('Etenemis-%', 'Advance%'),'<code>etenemiset / etenemisyritykset</code>',t('kärki- + takaetenemiset etenijänä', 'lead + trailing advances as a runner')) +
          gr(t('Kunnarit/vuoro', 'HR/PA'),'<code>K / V</code>','') +
          gr(t('Lyödyt/vuoro', 'RBI/PA'),'<code>L / V</code>','') +
          gr(t('Tuodut/yritys', 'R/attempt'),'<code>T / etenemisyritykset</code>',t('etenijän tuotto', 'production as a runner')) +
          gr(t('Palo-%', 'Out%'),'<code>palot / V</code>',t('pelaajan omat palot etenijänä; pienempi parempi', 'the player’s own outs as a runner; lower is better')) +
          gr(t('Tehot/vuoro', 'Tehot/PA'),'<code>(K + L + T) / V</code>','')
        )}
      </div>
      <h2>${t('Mallo-analytiikka', 'Mallo analytics')}</h2>
      <p class="sub">${t('Nämä mittarit eivät toista pesistulokset-laskureita — ne indeksoivat etenemisen, palojen välttämisen ja kotiutuskärkilyönnit sarjaan (100 = keskiarvo, yli 100 parempi).', 'These metrics do not repeat the pesistulokset counters — they index advancement, out avoidance and scoring advance hits to the league (100 = average, higher is better).')}</p>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('ADV+','<code>100 × ((KL + saatot) / (KLY + saatto-Y)) / sarjataso</code>',t('lyöjän etenemisarvo ilman K/L/T-toistoa', 'the batter’s advancement value without repeating K/L/T')) +
          gr('RUN+','<code>100 × (0.8·kärkietenemis-%/sarjataso + 0.2·takaetenemis-%/sarjataso)</code>',t('pelaajan arvo etenijänä; kumpikin osa verrataan omaan sarjatasoonsa ja kärkietenemiset painavat eniten, koska takaetenemiset ovat usein vapaita', 'value as a runner; each part is compared with its own league rate, and lead-runner advances weigh most because trailing advances are often free')) +
          gr('OUT+','<code>100 × (1 − palot/vuoro) / sarjataso</code>',t('omien palojen välttäminen; yli 100 parempi', 'avoiding the player’s own outs; higher than 100 is better')) +
          gr('SPARK','<code>0.50·ADV+ + 0.30·RUN+ + 0.20·OUT+</code>',t('tilanteenrakentajan indeksi', 'the table-setter index')) +
          gr('1 % / 2 % / 3 % / K %','<code>onnistuneet KL-liikkeet / yritykset</code>',t('koti→1, 1→2, 2→3 ja kotiutus; yksi lyöntivuoro voi tuottaa useita KL:iä', 'home→1st, 1st→2nd, 2nd→3rd and scoring; one turn at bat can produce several advance hits')) +
          gr('1 %+ / 2 %+ / 3 %+ / K %+','<code>100 × split-% / sarjan split-%</code>',t('sama virallinen split sarjaindeksinä', 'the same official split as a league index')) +
          gr(statLabel('money_kl_plus'),'<code>100 × K % / sarjataso</code>',t('kotiutus-/juoksuksi muuttavat kärkilyöntiyritykset', 'advance-hit attempts that turn into runs'))
        )}
      </div>
      <h2>${t('Arvo', 'Value')} <span class="muted">${t('— WAR-tyyliset kertyvät mittarit', '— WAR-style cumulative stats')}</span></h2>
      <p class="sub">${t('Toisin kuin indeksit (per vuoro), nämä <em>kertyvät</em>: peliaika kasvattaa arvoa. Juoksuarvot johdetaan sarjan omasta juoksuympäristöstä (ridge-regressio joukkuetotaaleista), ei MLB:n painoista.', 'Unlike the per-turn indices, these <em>accumulate</em>: playing time adds value. Run values are derived from the league’s own run environment (ridge regression on team totals), not from MLB weights.')}</p>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr(statLabel('jyk'),'<code>juoksuarvo − korvaajataso × lyöntivuorot</code>',t('Juoksut Yli Korvaajan — vertailutasona korvaajatason pelaaja eli sellainen, jonka joukkue saisi helposti tilalle esimerkiksi Ykköspesiksestä tai penkiltä', 'runs above replacement — the baseline is a replacement-level player, one a team could easily bring in from Ykköspesis or its own bench')) +
          gr(statLabel('vyk'),'<code>JYK / (juoksut per ottelu)</code>',t('Voitot Yli Korvaajan — WAR-vastine; kertyvä kokonaisarvo voittoina', 'wins above replacement — the WAR analog; cumulative total value in wins')) +
          gr('RAA','<code>juoksuarvo − sarjataso × lyöntivuorot</code>',t('juoksut yli sarjan keskiarvon (ei korvaajatasoa)', 'runs above the league average (no replacement level)'))
        )}
        <p class="legend" style="padding:10px 16px">${t('Ensimmäinen versio olemassa olevista koosterivistä; tarkentuu RE24-malliin kun syöttö-syötöltä-data on käytössä.', 'A first version built from the existing box-score rows; it will sharpen into an RE24 model once play-by-play data is in use.')}</p>
      </div>
      <h2>${t('Indeksit', 'Indices')}</h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('TEHO+','<code>100 × (tehot/V) / (sarjan tehot/V)</code>',t('100 = sarjan keskitaso; suosii lyöntijärjestyksen loppupäätä, kärki ~250–350', '100 = league average; favors the back of the order, leaders run ~250–350')) +
          gr(t('Kenttäkerroin (PF)', 'Park factor (PF)'),'<code>100 × (juoksut/ottelu kotona) / (juoksut/ottelu vieraissa)</code>',t('regressoitu kohti 100:aa', 'regressed toward 100')) +
          gr(t('Prosenttipiste', 'Percentile'),'<code>100 × (pienemmät + ½·samat) / n</code>',t('sarjan vakiopelaajien joukossa (≥40 vuoroa)', 'among the league’s qualified players (≥40 turns)'))
        )}
      </div>
      <h2>PARE <span class="muted">${t('— Painotettu ja Regressoitu Ennuste', '— weighted and regressed projection')}</span></h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr(t('eTilasto (esim. eKL%)', 'eStat (e.g. eKL%)'),'<code>(Σ β<sup>t</sup>·onnistumiset + κ·sarjataso) / (Σ β<sup>t</sup>·yritykset + κ)</code>',t('t = päiviä ottelusta; β ja κ per tilasto', 't = days since the game; β and κ per stat')) +
          gr('eTEHO+','<code>100 × ennustettu tehot/V / sarjataso</code>','')
        )}
        <p class="legend" style="padding:10px 16px">${t('e- = ennustettu.', 'e- = projected.')}</p>
      </div>
      <h2>Lukkari <span class="muted">${t('— juoksujenesto', '— run prevention')}</span></h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('LRA','<code>päästetyt juoksut / lukkariottelut</code>',t('lukkarin joukkueen päästämät juoksut per ottelu (ERA-vastine)', 'runs allowed per game by the lukkari’s team (the ERA analog)')) +
          gr('LRA-','<code>100 × LRA / sarjan LRA</code>',t('100 = keskiarvo, pienempi parempi', '100 = average, lower is better')) +
          gr('RP','<code>(sarjan LRA − LRA) × lukkariottelut</code>',t('juoksut estetty yli keskiarvon; kertyvä, suurempi parempi', 'runs prevented above average; cumulative, higher is better'))
        )}
        <p class="legend" style="padding:10px 16px">${t('ERA-tyylinen silta olemassa olevista otteluriveistä; tarkentuu kun syöttö-syötöltä-data on käytössä.', 'An ERA-style bridge from the existing game rows; it will sharpen once play-by-play data is in use.')}</p>
      </div>
      <h2>${t('Puolustus', 'Defense')} <span class="muted">${t('— syöttökohtaisesta datasta', '— from play-by-play data')}</span></h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr(statLabel('def_rv'),`<code>${t('Σ(tilanneodotus ennen − toteuma jälkeen − juoksut) / puolustetut vuoroparit × 8', 'Σ(expected before − actual after − runs on play) / halves defended × 8')}</code>`,t('puolustuksen estämät juoksut per ottelu; 0 = sarjan keskitaso', 'defensive runs saved per game; 0 = league average')) +
          gr(statLabel('def_koppi_pct'),'<code>kopit / kenttään lyödyt lyönnit</code>',t('koppi on kenttäpelaajan suoritus, ei palo', 'a caught fly (koppi) is a fielding act, not an out')) +
          gr(statLabel('def_out_conv'),'<code>poltot / vastustajan etenemisyritykset</code>',t('viralliset palot; haavat eivät sisälly', 'official outs only; wounds are not included')) +
          gr(statLabel('def_error_cost'),`<code>${t('harhaheittotilanteiden juoksuarvo / ottelut', 'run value of wild-throw plays / games')}</code>`,t('pienempi parempi', 'lower is better')) +
          gr(statLabel('def_arm_hold'),`<code>${t('100 × lisäetenemiset / sarjataso', '100 × extra advances allowed / league rate')}</code>`,t('etenijä kaksi pesäväliä tai enemmän; pienempi parempi', 'runner gains two or more bases; lower is better')) +
          gr(t('Tilanneodotus (RE)', 'Run expectancy (RE)'),`<code>${t('juoksuodote (pesätilanne, palot) vuoroparin loppuun', 'expected runs to the end of the half from (bases, outs)')}</code>`,t('laskettu sarjan omista syöttökohtaisista tapahtumista; vuoropari päättyy myös kierrossäännöllä', 'measured from the league’s own play-by-play; halves can also end by the round rule'))
        )}
      </div>
      <h2>${t('Paikat', 'Positions')} <span class="muted">— pesäpallo → baseball</span></h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('L → P','lukkari','pitcher') +
          gr('S → C','sieppari','catcher') +
          gr('1V / 2V / 3V → 1B / 2B / 3B','1./2./3.-vahti','vahdit') +
          gr('3P / 2P → LSS / RSS','3./2.-polttaja','vasen / oikea sisäkenttä (shortstop)') +
          gr('3K / 2K → LF / RF','3./2.-koppari','vasen / oikea ulkokenttä') +
          gr('J → DH','jokeri','lyöjä ilman kenttäpaikkaa')
        )}
      </div>
      <h2>${t('Muut', 'Other')}</h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr(t('Pisteet', 'Points'),'<code>3 / 2 / 1 / 0</code>',t('suora voitto 2–0 / muu voitto / tappio ratkaisussa / muu tappio', 'straight 2–0 win / other win / loss in the tiebreak / other loss')) +
          gr(t('Pudotuspeli-%', 'Playoff odds'),`<code>${t('osuus 300+ simulaatiosta, joissa top-4', 'share of 300+ simulations finishing top-4')}</code>`,t('joukkueen taso = juoksuero/ottelu, regressoitu', 'team strength = run differential per game, regressed')) +
          gr(t('Vertailupisteet', 'Comp score'),'<code>1000 − 100 × d</code>',t('z-skaalattu euklidinen etäisyys kausilinjojen välillä', 'z-scaled Euclidean distance between season lines'))
        )}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   ROUTER
══════════════════════════════════════════════════════════════════════════ */
async function route() {
  const hash = location.hash || '#/';
  const [pathPart, queryPart] = hash.slice(1).split('?');
  const params = Object.fromEntries(new URLSearchParams(queryPart||''));
  const parts = pathPart.split('/').filter(Boolean);
  const page = parts[0] || '';

  renderNav();
  loading();

  try {
    if (!META) META = await fetchJSON('data/meta.json');
    renderNav();
    renderUpdated(META.generated);

    const defaultSid = defaultSeasonId();

    if (page === '' || page === 'leaderboard') {
      const sid = parseInt(params.sid || defaultSid, 10);
      if (params.view === 'lukkari') {
        await showLukkarit(sid);
      } else if (params.view === 'defense') {
        await showDefense(sid);
      } else {
        await showLeaderboard(sid, params.stat || 'vyk', params.pos || '');
      }

    } else if (page === 'projections') {
      const sid = parseInt(params.sid || defaultSid, 10);
      await showProjections(sid);

    } else if (page === 'league') {
      const sid = parseInt(params.sid || defaultSid, 10);
      await showLeague(sid);

    } else if (page === 'player') {
      const pid = parseInt(parts[1], 10);
      if (!pid) throw new Error('bad player id');
      await showPlayer(pid);

    } else if (page === 'baseball') {
      const pid = parseInt(parts[1], 10);
      if (!pid) throw new Error('bad player id');
      await showBaseball(pid);

    } else if (page === 'team') {
      const teamRaw = parts[1] || '';
      const sid = params.sid ? parseInt(params.sid, 10) : null;
      await showTeam(teamRaw, sid);

    } else if (page === 'about') {
      showAbout();

    } else if (page === 'primer') {
      showPrimer(params.for, params.lang);

    } else if (page === 'glossary') {
      showGlossary();

    } else {
      main().innerHTML = `<div class="page"><p class="sub">${t('Sivua ei löydy.', 'Page not found.')}</p></div>`;
    }
  } catch(err) {
    console.error(err);
    main().innerHTML = `<div class="page">
      <div class="card">
        <p style="color:var(--ink3)">${t('Virhe', 'Error')}: ${err.message}</p>
        <p class="sub">Oletko ajanut <code>python export.py</code>?</p>
      </div>
    </div>`;
  }
}

/* ── Init ──────────────────────────────────────────────────────────────── */
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
