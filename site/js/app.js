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

const STAT_LABEL = {
  kl_pct:'KL%', saatto_pct:'Saatto-%', eten_pct:'Etenemis-%',
  kunnari_rate:'Kunnarit/vuoro', lyoty_rate:'Lyödyt/vuoro',
  palo_rate:'Palo-%', tehot_per_turn:'Tehot/vuoro',
  kl_base0:'KL% 1. pesa', kl_base1:'KL% 2. pesa',
  kl_base2:'KL% 3. pesa', kl_base3:'KL% koti',
  teho_plus:'TEHO+', teho_plus_adj:'kTEHO+',
  tehot:'Tehot', kunnarit:'K', lyodyt:'L', tuodut:'T',
};

async function fetchJSON(url) {
  if (_cache[url]) return _cache[url];
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const d = await r.json();
  _cache[url] = d;
  return d;
}

function qs(params) {
  const o = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
  return params ? o[params] : o;
}

function main() { return document.getElementById('main'); }

function loading() { main().innerHTML = '<div class="loading">Ladataan…</div>'; }

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
  return `<div class="controls"><span class="ctl-lab">Sarja</span>
    <div class="sel-wrap">
      <select class="season-sel" onchange="location.hash=this.value.slice(1)">${opts}</select>
    </div></div>`;
}

/* ── Nav ─────────────────────────────────────────────────────────────────── */
function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav || !META) return;
  const hash = location.hash;
  const page = hash.split('?')[0];
  const curSid = parseInt(qs('sid') || '0', 10);

  let html = '';
  for (const s of META.nav_seasons) {
    const isOn = (page === '#/' || page === '#/leaderboard') && curSid === s.id;
    html += `<a href="#/?sid=${s.id}"${isOn?' class="on"':''}>${s.series}</a>`;
  }
  const defaultSid = META.nav_seasons[0]?.id || '';
  html += `<a href="#/projections?sid=${defaultSid}"${page==='#/projections'?' class="on"':''}>PARE-ennusteet</a>`;
  html += `<a href="#/league?sid=${defaultSid}"${page==='#/league'?' class="on"':''}>Sarjataulukko</a>`;
  html += `<a href="#/glossary"${page==='#/glossary'?' class="on"':''}>Kaava</a>`;
  html += `<a href="#/about"${page==='#/about'?' class="on"':''}>About</a>`;
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
   LEADERBOARD
══════════════════════════════════════════════════════════════════════════ */
async function showLeaderboard(sid, stat) {
  stat = stat || 'teho_plus';
  const STATS = ['teho_plus','teho_plus_adj','tehot','kl_pct',
                 'saatto_pct','eten_pct','kunnarit','lyodyt','tuodut','palo_rate'];
  if (!STATS.includes(stat)) stat = 'teho_plus';

  const data = await fetchJSON(`data/leaderboard/${sid}.json`);
  const season = data.season;
  const players = data.players;

  const showExtra = !['teho_plus','kl_pct','kunnarit','lyodyt','tuodut','tehot'].includes(stat);

  // sort
  const sorted = [...players].filter(p => p.turns_at_bat >= 40)
    .sort((a,b) => {
      const av = a[stat], bv = b[stat];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (stat === 'palo_rate') ? av - bv : bv - av;
    });

  const maxTp = sorted[0]?.teho_plus || 200;

  const pills = STATS.map(s =>
    `<a href="#" onclick="nav('leaderboard',${sid},'${s}');return false;"
       class="${s===stat?'active':''}">${s}</a>`).join('');

  let rows = '';
  sorted.forEach((l, i) => {
    const rk = i===0
      ? `<span class="rk">1</span>`
      : `<span style="color:var(--ink3);font-size:12px">${i+1}</span>`;
    const bw = Math.min(Math.round((l.teho_plus||0)*52/(maxTp||200)), 52);
    const bar = l.teho_plus
      ? `<span class="teho-bar" style="width:${Math.max(bw,3)}px"></span>` : '';
    const extra = showExtra
      ? `<td><strong>${typeof l[stat]==='number'&&!Number.isInteger(l[stat])?rate(l[stat]):l[stat]??'—'}</strong></td>` : '';
    rows += `<tr>
      <td>${rk}</td>
      <td class="name"><a class="pl" href="#/player/${l.player_id}">${l.name}</a></td>
      <td class="name"><a href="#/team/${encodeURIComponent(l.team)}?sid=${sid}" style="color:var(--ink3);font-size:12px">${l.team||'—'}</a></td>
      <td>${l.games}</td><td>${l.turns_at_bat}</td>
      <td>${l.kunnarit}</td><td>${l.lyodyt}</td><td>${l.tuodut}</td>
      <td>${l.tehot}</td>
      <td>${rate(l.kl_pct)}</td>
      ${extra}
      <td><div class="tehocell"><span class="tv">${l.teho_plus??'—'}</span>${bar}</div></td>
    </tr>`;
  });

  const extraTh = showExtra ? `<th>${STAT_LABEL[stat]||stat}</th>` : '';

  main().innerHTML = `
    <div class="page-hd">
      <h1>${season.series} ${season.year}</h1>
      <p class="sub">Vähintään 40 lyöntivuoroa. TEHO+ = tehot/vuoro suhteessa sarjan keskiarvoon (100 = keskiverto).</p>
    </div>
    ${seasonSelHtml(META.seasons, sid, '/', `&stat=${stat}`)}
    <div class="toolbar">
      <span class="ctl-lab">Järjestä</span>
      ${pills}
      <span style="flex:1"></span>
      <a class="csv-link" href="#" onclick="dlLB(${sid},'${stat}');return false;">↓ CSV</a>
    </div>
    <div class="lbwrap">
      <table class="lb">
        <thead><tr>
          <th style="width:36px">#</th>
          <th class="name">Pelaaja</th><th class="name">Joukkue</th>
          <th>O</th><th>Vuorot</th><th>K</th><th>L</th><th>T</th>
          <th>Tehot</th><th>KL%</th>${extraTh}<th>TEHO+</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  window.dlLB = function(sid, stat) {
    const cols = ['name','team','games','turns_at_bat','kunnarit','lyodyt','tuodut',
                  'tehot','kl_pct','saatto_pct','eten_pct','palo_rate','teho_plus','teho_plus_adj'];
    downloadCSV(sorted, cols, `${season.series}-${season.year}-${stat}.csv`);
  };
  window.nav = function(page, sid, stat) {
    location.hash = `/${page}?sid=${sid}&stat=${stat}`;
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   PROJECTIONS
══════════════════════════════════════════════════════════════════════════ */
async function showProjections(sid) {
  const data = await fetchJSON(`data/projections/${sid}.json`);
  const season = data.season;
  const projs = data.projections;

  let rows = '';
  projs.forEach((p, i) => {
    const rk = i===0 ? `<span class="rk">1</span>` : i+1;
    rows += `<tr>
      <td>${rk}</td>
      <td class="name"><a class="pl" href="#/player/${p.player_id}">${p.name}</a></td>
      <td>${p.age||'—'}</td>
      <td>${rate(p.stats?.kl_pct?.rate)}</td>
      <td>${rate(p.stats?.saatto_pct?.rate)}</td>
      <td>${rate(p.stats?.eten_pct?.rate)}</td>
      <td>${rate(p.stats?.palo_rate?.rate)}</td>
      <td><div class="tehocell"><span class="tv">${p.teho_plus_proj}</span></div></td>
    </tr>`;
  });

  main().innerHTML = `
    <h1>PARE-ennusteet</h1>
    <p class="sub">Päivittyvä arvio jokaisen pelaajan todellisesta tasosta: koko urahistoria
    eksponentiaalisesti painotettuna + regressio sarjakeskiarvoon.
    Ei mielivaltaisia "viimeiset N ottelua" -rajauksia.</p>
    ${seasonSelHtml(META.seasons, sid, '/projections')}
    <div class="lbwrap">
      <table class="lb">
        <thead><tr>
          <th style="width:34px">#</th>
          <th class="name">Pelaaja</th>
          <th>Ikä</th><th>eKL%</th><th>eSaatto%</th>
          <th>eEtenemis%</th><th>ePalo%</th><th>eTEHO+</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   LEAGUE
══════════════════════════════════════════════════════════════════════════ */
async function showLeague(sid) {
  const data = await fetchJSON(`data/league/${sid}.json`);
  const season = data.season;
  const table = data.standings;
  const history = data.odds_history;
  const parks = data.parks;
  const weather = data.weather;

  let standRows = '';
  table.forEach((t, i) => {
    standRows += `<tr>
      <td style="padding-left:16px">${i+1}</td>
      <td class="name"><a href="#/team/${encodeURIComponent(t.team)}?sid=${sid}">${t.team}</a></td>
      <td>${t.games}</td><td>${t.wins}</td><td>${t.ties??'—'}</td><td>${t.losses}</td>
      <td><strong>${t.points}</strong></td>
      <td>${t.runs_for}–${t.runs_against}</td>
      <td>${t.run_diff>=0?'+':''}${t.run_diff}</td>
    </tr>`;
  });

  let parkRows = '';
  for (const p of (parks||[])) {
    parkRows += `<tr>
      <td class="name" style="padding-left:16px">${p.stadium}</td>
      <td>${p.games}</td><td>${p.runs_per_game}</td>
      <td><strong>${p.pf}</strong></td>
    </tr>`;
  }

  let wxRows = '';
  for (const w of (weather||[])) {
    wxRows += `<tr>
      <td class="name" style="padding-left:16px">${w.wind}</td>
      <td>${w.games}</td><td>${w.kunnari_rate}</td><td>${w.runs_per_game}</td>
    </tr>`;
  }

  main().innerHTML = `
    <h1>${season.series} ${season.year}</h1>
    <p class="sub">Koko kausi.</p>
    ${seasonSelHtml(META.seasons, sid, '/league')}
    ${history ? '<h2 class="sech">Pudotuspelitodennäköisyydet kaudella</h2><div class="card" style="position:relative;min-height:180px"><div id="fangraph" style="width:100%;height:200px"></div></div>' : ''}
    <h2 class="sech">Sarjataulukko</h2>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-scroll"><table style="min-width:420px">
        <thead><tr>
          <th style="padding-left:16px">#</th>
          <th class="name">Joukkue</th>
          <th>O</th><th>V</th><th>T</th><th>H</th>
          <th>Pisteet</th><th>Juoksut</th><th>±</th>
        </tr></thead>
        <tbody>${standRows}</tbody>
      </table></div>
    </div>
    <h2 class="sech">Kenttäkertoimet <span class="secsub">(100 = neutraali)</span></h2>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-scroll"><table style="min-width:320px">
        <thead><tr>
          <th class="name" style="padding-left:16px">Stadion</th>
          <th>Ottelut</th><th>Juoksua/ottelu</th><th>PF</th>
        </tr></thead>
        <tbody>${parkRows}</tbody>
      </table></div>
    </div>
    <h2 class="sech">Tuuli ja kunnarit</h2>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-scroll"><table style="min-width:320px">
        <thead><tr>
          <th class="name" style="padding-left:16px">Tuuli</th>
          <th>Ottelut</th><th>Kunnarit/vuoro</th><th>Juoksua/ottelu</th>
        </tr></thead>
        <tbody>${wxRows}</tbody>
      </table>
      <p class="legend" style="padding:10px 16px">Sää joka ottelusta suoraan tulospalvelun datasta.</p>
    </div>`;

  if (history && typeof renderFangraph === 'function') {
    const el = document.getElementById('fangraph');
    if (el) renderFangraph(el, history);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   PLAYER
══════════════════════════════════════════════════════════════════════════ */
const PCT_STATS = ['kl_pct','saatto_pct','eten_pct','kunnari_rate','lyoty_rate','palo_rate','tehot_per_turn'];
const BASE_KL_KEYS = ['kl_base0','kl_base1','kl_base2','kl_base3'];

async function showPlayer(pid) {
  const data = await fetchJSON(`data/players/${pid}.json`);
  const {player, career, line, proj, career_json, base_kl, base_keys, log, comps} = data;

  // tiles
  const projTile = proj?.teho_plus_proj
    ? `<div class="tile"><div class="tl">PARE enn.</div><div class="tvv">${proj.teho_plus_proj}</div></div>` : '';

  // percentile bars
  let pctBars = '';
  for (const stat of PCT_STATS) {
    const pct = line[`pct_${stat}`];
    const v = line[stat];
    pctBars += pctBar(pct, STAT_LABEL[stat]||stat, rate(v));
  }

  // base kl bars
  let baseKlBars = '';
  if (base_kl) {
    for (const key of (base_keys||BASE_KL_KEYS)) {
      const pct = base_kl[`pct_${key}`];
      const tries = base_kl[`${key}_tries`];
      const lbl = `${STAT_LABEL[key]||key} <span style="color:var(--ink3);font-size:11px">(${tries} yrit.)</span>`;
      baseKlBars += pctBar(pct, lbl, rate(base_kl[key]));
    }
  }

  // career table
  let careerRows = '';
  for (const s of career) {
    careerRows += `<tr>
      <td class="name" style="padding-left:16px;font-weight:600">${s.year}</td>
      <td>${s.age||'—'}</td>
      <td>${s.games}</td><td>${s.turns_at_bat}</td>
      <td>${s.kunnarit}</td><td>${s.lyodyt}</td><td>${s.tuodut}</td>
      <td>${s.tehot}</td>
      <td>${rate(s.kl_pct)}</td><td>${rate(s.saatto_pct)}</td>
      <td>${rate(s.eten_pct)}</td><td>${rate(s.palo_rate)}</td>
      <td><strong>${s.teho_plus??'—'}</strong></td>
      <td>${s.teho_plus_adj||'—'}</td>
    </tr>`;
  }

  // comps
  let compsHtml = '';
  if (comps?.length) {
    let cr = '';
    for (const c of comps) {
      cr += `<tr>
        <td>${c.score}</td>
        <td class="name"><a href="#/player/${c.player_id}">${c.name}</a></td>
        <td>${c.year}</td><td>${c.age||'—'}</td><td>${c.teho_plus}</td>
      </tr>`;
    }
    compsHtml = `
      <h2 class="sech">Vertailukelpoiset kaudet <span class="secsub">(1000 = identtinen)</span></h2>
      <div class="card">
        <table class="career">
          <thead><tr><th>Pisteet</th><th class="name">Pelaaja</th><th>Kausi</th><th>Ikä</th><th>TEHO+</th></tr></thead>
          <tbody>${cr}</tbody>
        </table>
      </div>`;
  }

  // proj table
  let projRows = '';
  if (proj?.stats) {
    for (const [name, s] of Object.entries(proj.stats)) {
      projRows += `<tr>
        <td class="name" style="color:var(--ink2)">${name}</td>
        <td><strong>${rate(s.rate)}</strong></td>
        <td>${rate(s.observed)}</td>
        <td>${Math.round(s.effective_n)}</td>
      </tr>`;
    }
  }

  // game log
  let logRows = '';
  for (const g of (log||[])) {
    logRows += `<tr>
      <td class="name" style="padding-left:16px"><a href="#/match/${g.match_id}">${g.date}</a></td>
      <td class="name">${g.opponent}</td>
      <td style="color:var(--ink3);font-size:12px">${g.home?'K':'V'}</td>
      <td>${g.turns_at_bat}</td>
      <td>${g.kunnarit}</td><td>${g.lyodyt}</td><td>${g.tuodut}</td>
      <td>${g.tehot}</td>
      <td>${g.karkilyonnit}</td><td>${g.karki_yritykset??g.karkilyonti_yritykset??'—'}</td>
      <td>${g.palot}</td>
    </tr>`;
  }
  const logHtml = log?.length ? `
    <h2 class="sech">Ottelupäiväkirja ${line.year}</h2>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-scroll"><table style="min-width:480px">
        <thead><tr>
          <th class="name" style="padding-left:16px">Päivä</th>
          <th class="name">Vastustaja</th><th></th>
          <th>Vuorot</th><th>K</th><th>L</th><th>T</th>
          <th>Tehot</th><th>KL</th><th>KLY</th><th>Palot</th>
        </tr></thead>
        <tbody>${logRows}</tbody>
      </table></div>
    </div>` : '';

  const careerCharts = career?.length > 1 ? `
    <h2 class="sech">Urakehitys</h2>
    <div class="card">
      <div class="minis">
        <div class="mini"><div class="label">KL%</div><div id="career-kl"></div></div>
        <div class="mini"><div class="label">TEHO+</div><div id="career-teho"></div></div>
      </div>
    </div>` : '';

  main().innerHTML = `
    <div class="page-hd">
      <h1 class="pname">${player.name}</h1>
      <div class="pmeta">
        <a href="#/team/${encodeURIComponent(line.team)}?sid=${line.season_id}">${line.team}</a>
        ${line.age ? `<span class="pmeta-sep">·</span>${line.age} v` : ''}
        <span class="pmeta-sep">·</span>kausi ${line.year}
      </div>
    </div>
    <div class="tiles">
      <div class="tile"><div class="tl">Ottelut</div><div class="tvv">${line.games}</div></div>
      <div class="tile"><div class="tl">Kunnarit</div><div class="tvv">${line.kunnarit}</div></div>
      <div class="tile"><div class="tl">Tehot K+L+T</div><div class="tvv">${line.tehot}</div></div>
      <div class="tile hero"><div class="tl">TEHO+</div><div class="tvv">${line.teho_plus||'—'}</div></div>
      ${projTile}
    </div>
    <h2 class="sech">Prosenttipisteet ${line.year} <span class="secsub">(sarjan vakiopelaajien joukossa)</span></h2>
    <div class="card">
      ${pctBars}
      <p class="legend" style="margin-top:12px">Vaalea = sarjan häntäpää · tumma = kärki. Numero = prosenttipiste.</p>
    </div>
    ${base_kl ? `
    <h2 class="sech">KL% pesäkohdittain ${line.year} <span class="secsub">(kärkilyöntiprosentti per pesa)</span></h2>
    <div class="card">${baseKlBars}</div>` : ''}
    ${careerCharts}
    <div class="split">
      <div>
        <h2 class="sech">Kaudet</h2>
        <div class="card" style="padding:0;overflow:hidden">
          <div class="tbl-scroll"><table class="career" style="min-width:440px">
            <thead><tr>
              <th class="name" style="padding-left:16px">Kausi</th><th>Ikä</th><th>O</th><th>Vuorot</th>
              <th>K</th><th>L</th><th>T</th><th>Tehot</th>
              <th>KL%</th><th>Saatto%</th><th>Etenemis%</th><th>Palo%</th>
              <th>TEHO+</th><th title="kenttäkorjattu">kTEHO+</th>
            </tr></thead>
            <tbody>${careerRows}</tbody>
          </table></div>
        </div>
      </div>
      <div>
        ${compsHtml}
        ${proj ? `
        <h2 class="sech">PARE-ennuste <span class="secsub">(${proj.as_of||''})</span></h2>
        <div class="card">
          <table class="career">
            <thead><tr><th class="name">Tilasto</th><th>Ennuste</th><th>Havaittu</th><th>Otos</th></tr></thead>
            <tbody>${projRows}</tbody>
          </table>
          <p class="legend" style="margin-top:10px">Eksponentiaalisesti painotettu historia regressoituna sarjakeskiarvoon.</p>
        </div>` : ''}
      </div>
    </div>
    ${logHtml}`;

  // D3 career charts
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

  // find the right sid if not provided: use the season where this team appears
  let actualSid = sid;
  if (!actualSid) {
    // try to find the latest season for this team from META
    for (const s of META.seasons) {
      try {
        await fetchJSON(`data/teams/${slug}-${s.id}.json`);
        actualSid = s.id;
        break;
      } catch(e) { continue; }
    }
  }

  const data = await fetchJSON(`data/teams/${slug}-${actualSid}.json`);
  const {team, season, roster, matches, standing} = data;

  const standingTiles = standing ? `
    <div class="tiles" style="margin-top:16px">
      <div class="tile"><div class="label">Ottelut</div><div class="value">${standing.games}</div></div>
      <div class="tile"><div class="label">V–H</div><div class="value">${standing.wins}–${standing.losses}</div></div>
      <div class="tile hero"><div class="label">Pisteet</div><div class="value">${standing.points}</div></div>
      <div class="tile"><div class="label">Juoksuero</div><div class="value">${standing.run_diff>=0?'+':''}${standing.run_diff}</div></div>
    </div>` : '';

  let rosterRows = '';
  for (const l of roster) {
    rosterRows += `<tr>
      <td class="name" style="padding-left:16px">
        <a href="#/player/${l.player_id}">${l.name}</a>
      </td>
      <td>${l.games}</td><td>${l.turns_at_bat}</td>
      <td>${l.kunnarit}</td><td>${l.lyodyt}</td><td>${l.tuodut}</td>
      <td>${l.tehot}</td>
      <td>${rate(l.kl_pct)}</td>
      <td><strong>${l.teho_plus??'—'}</strong></td>
    </tr>`;
  }

  let matchRows = '';
  for (const m of matches) {
    const periods = m.periods_home != null
      ? `${m.periods_home}–${m.periods_away}${m.tiebreak?' k':''}` : '—';
    matchRows += `<tr>
      <td style="padding-left:16px"><a href="#/match/${m.id}">${m.date}</a></td>
      <td class="name">${m.home_team}</td>
      <td class="name">${m.away_team}</td>
      <td>${m.home_runs}–${m.away_runs}</td>
      <td>${periods}</td>
      <td class="name" style="color:var(--ink3);font-size:12px">${m.stadium||'—'}</td>
    </tr>`;
  }

  // season selector for this team (across seasons where this team appears)
  const teamSeasons = META.seasons.filter(s => {
    // we'll just show all seasons — team file may not exist for all but let nav handle that
    return true;
  });

  main().innerHTML = `
    <h1>${team}</h1>
    <p class="sub">${season.series} ${season.year}</p>
    ${standingTiles}
    <h2 class="sech" style="margin-top:${standing?'4px':'20px'}">Pelaajat</h2>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-scroll"><table style="min-width:420px">
        <thead><tr>
          <th class="name" style="padding-left:16px">Pelaaja</th>
          <th>O</th><th>Vuorot</th><th>K</th><th>L</th><th>T</th>
          <th>Tehot</th><th>KL%</th><th>TEHO+</th>
        </tr></thead>
        <tbody>${rosterRows}</tbody>
      </table></div>
    </div>
    <h2 class="sech">Ottelut</h2>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-scroll"><table style="min-width:400px">
        <thead><tr>
          <th class="name" style="padding-left:16px">Päivä</th>
          <th class="name">Koti</th><th class="name">Vieras</th>
          <th>Tulos</th><th>Erät</th><th class="name">Stadion</th>
        </tr></thead>
        <tbody>${matchRows}</tbody>
      </table></div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   MATCH
══════════════════════════════════════════════════════════════════════════ */
async function showMatch(mid) {
  const data = await fetchJSON(`data/matches/${mid}.json`);
  const {match: m, sides} = data;

  let html = `
    <h1>${m.home_team} – ${m.away_team}</h1>
    <p class="sub">${m.series} ${m.year} · ${m.date}${m.stadium?` · ${m.stadium}`:''}</p>
    <div class="tiles" style="margin-top:16px">
      <div class="tile hero"><div class="tl">Tulos</div><div class="tvv">${m.home_runs}–${m.away_runs}</div></div>
      ${m.temperature!=null?`<div class="tile"><div class="tl">Lämpö</div><div class="tvv">${m.temperature}°</div></div>`:''}
      ${m.wind!=null?`<div class="tile"><div class="tl">Tuuli</div><div class="tvv">${m.wind} m/s</div></div>`:''}
      ${m.attendance?`<div class="tile"><div class="tl">Yleisö</div><div class="tvv">${m.attendance}</div></div>`:''}
    </div>`;

  for (const [team, lines] of Object.entries(sides)) {
    let rows = '';
    for (const l of lines) {
      rows += `<tr>
        <td class="name" style="padding-left:16px"><a href="#/player/${l.player_id}">${l.name}</a></td>
        <td>${l.turns_at_bat}</td>
        <td>${l.kunnarit}</td><td>${l.lyodyt}</td><td>${l.tuodut}</td>
        <td><strong>${l.tehot}</strong></td>
        <td>${l.karkilyonnit}</td>
        <td>${rate(l.karkilyonnit&&l.karkilyonti_yritykset?l.karkilyonnit/l.karkilyonti_yritykset:null)}</td>
        <td>${l.palot}</td>
      </tr>`;
    }
    html += `
      <h2 class="sech">${team}</h2>
      <div class="card" style="padding:0;overflow:hidden">
        <div class="tbl-scroll"><table style="min-width:400px">
          <thead><tr>
            <th class="name" style="padding-left:16px">Pelaaja</th>
            <th>Vuorot</th><th>K</th><th>L</th><th>T</th>
            <th>Tehot</th><th>KL</th><th>KL%</th><th>Palot</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }

  main().innerHTML = html;
}


/* ══════════════════════════════════════════════════════════════════════════
   STATIC PAGES
══════════════════════════════════════════════════════════════════════════ */
function showAbout() {
  main().innerHTML = `
    <h1>What is Mallo?</h1>
    <p class="sub">The first analytics site for pesäpallo (Finnish baseball). English, because
    the ideas came from the baseball and basketball analytics world — Finnish UI everywhere else.</p>
    <div class="contentcard" style="margin-top:20px">
      <p>Public analytics transformed how baseball (Baseball Savant, FanGraphs, Baseball-Reference)
      and basketball (DARKO, LEBRON) are understood — but pesäpallo, a sport with a century of
      history and a results service that records every plate turn, has never had an analytics layer.
      Mallo is an attempt to build one, on top of the official
      <a href="https://www.pesistulokset.fi/">pesistulokset.fi</a> data service.</p>
      <p><strong>PARE</strong> (Painotettu ja Regressoitu Ennuste — a nod to
      <a href="https://www.darko.app/">DARKO</a>, its methodological parent) is a daily-updating
      estimate of every player's true talent in every rate stat. Every game a player has ever played
      counts, weighted by an exponential decay fitted per stat — no arbitrary "last 10 games" windows —
      and blended with the league average in proportion to how much evidence exists.</p>
      <p><strong>TEHO+</strong> is league-indexed production per plate turn (100 = league average,
      150 = MVP season) in the spirit of baseball's OPS+/wRC+. <strong>kTEHO+</strong> is the park-adjusted version.</p>
      <p><strong>Percentile profiles</strong> show where a player ranks among qualified peers in each skill,
      Baseball Savant style. <strong>Kenttäkertoimet</strong> are the sport's first published park factors.
      <strong>Playoff odds</strong> come from Monte Carlo simulation of the remaining schedule.</p>
      <p>Data: the official pesistulokset.fi results service, per-player per-match statistics back to 1991.</p>
      <p>Open source, work in progress. The roadmap — run expectancy from play-by-play, lukkari
      metrics, manager decision analysis, win probability — lives in <code>docs/design.md</code>.</p>
    </div>`;
}

function showGlossary() {
  main().innerHTML = `
    <h1>Kaavat</h1>
    <p class="sub">Jokainen tilasto selitettynä — laskentakaava ja tulkintaohje.</p>
    <h2 class="sech" style="margin-top:20px">Perustilastot</h2>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-scroll"><table style="min-width:420px">
        <thead><tr>
          <th class="name" style="padding-left:16px">Tilasto</th>
          <th class="name">Kaava</th><th class="name">Huomio</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding-left:16px">Tehot</td><td><code>K + L + T</code></td><td>perinteinen tuotantoluku</td></tr>
          <tr><td style="padding-left:16px">KL%</td><td><code>kärkilyönnit / KLY</code></td><td>kärjen eteneminen per yritys</td></tr>
          <tr><td style="padding-left:16px">Saatto-%</td><td><code>saatot / saattoyritykset</code></td><td>takaetenijän vieminen lyöjänä</td></tr>
          <tr><td style="padding-left:16px">Etenemis-%</td><td><code>etenemiset / etenemisyritykset</code></td><td>kärki- + takaetenemiset etenijänä</td></tr>
          <tr><td style="padding-left:16px">Kunnarit/vuoro</td><td><code>K / V</code></td><td></td></tr>
          <tr><td style="padding-left:16px">Lyödyt/vuoro</td><td><code>L / V</code></td><td></td></tr>
          <tr><td style="padding-left:16px">Tuodut/yritys</td><td><code>T / etenemisyritykset</code></td><td>etenijän tuotto</td></tr>
          <tr><td style="padding-left:16px">Palo-%</td><td><code>palot / V</code></td><td>pienempi parempi</td></tr>
          <tr><td style="padding-left:16px">Tehot/vuoro</td><td><code>(K + L + T) / V</code></td><td></td></tr>
        </tbody>
      </table></div>
    </div>
    <h2 class="sech">Indeksit</h2>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-scroll"><table style="min-width:420px">
        <thead><tr>
          <th class="name" style="padding-left:16px">Tilasto</th>
          <th class="name">Kaava</th><th class="name">Huomio</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding-left:16px">TEHO+</td><td><code>100 × (tehot/V) / (sarjan tehot/V)</code></td><td>100 = sarjan keskitaso; kärki ~250–350</td></tr>
          <tr><td style="padding-left:16px">kTEHO+</td><td><code>100 × Σ(tehot/kerroin) / V / sarjataso</code></td><td>kenttäkorjattu TEHO+</td></tr>
          <tr><td style="padding-left:16px">Kenttäkerroin (PF)</td><td><code>100 × (juoksut/ottelu kotona) / (juoksut/ottelu vieraissa)</code></td><td>regressoitu kohti 100:aa</td></tr>
          <tr><td style="padding-left:16px">Prosenttipiste</td><td><code>100 × (pienemmät + ½·samat) / n</code></td><td>sarjan vakiopelaajien joukossa (≥40 vuoroa)</td></tr>
        </tbody>
      </table></div>
    </div>
    <h2 class="sech">PARE <span class="secsub">— Painotettu ja Regressoitu Ennuste</span></h2>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-scroll"><table style="min-width:420px">
        <thead><tr>
          <th class="name" style="padding-left:16px">Tilasto</th>
          <th class="name">Kaava</th><th class="name">Huomio</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding-left:16px">eTilasto (esim. eKL%)</td>
            <td><code>(Σ β<sup>t</sup>·onnistumiset + κ·sarjataso) / (Σ β<sup>t</sup>·yritykset + κ)</code></td>
            <td>t = päiviä ottelusta; β ja κ per tilasto</td></tr>
          <tr><td style="padding-left:16px">eTEHO+</td>
            <td><code>100 × ennustettu tehot/V / sarjataso</code></td><td></td></tr>
        </tbody>
      </table></div>
      <p class="legend" style="padding:10px 16px">e- = ennustettu · k- = kenttäkorjattu.</p>
    </div>
    <h2 class="sech">Muut</h2>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="tbl-scroll"><table style="min-width:420px">
        <thead><tr>
          <th class="name" style="padding-left:16px">Tilasto</th>
          <th class="name">Kaava</th><th class="name">Huomio</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding-left:16px">Pisteet</td><td><code>3 / 2 / 1 / 0</code></td><td>suora voitto 2–0 / muu voitto / tappio ratkaisussa / muu tappio</td></tr>
          <tr><td style="padding-left:16px">Pudotuspeli-%</td><td><code>osuus 300+ simulaatiosta, joissa top-4</code></td><td>joukkueen taso = juoksuero/ottelu, regressoitu</td></tr>
          <tr><td style="padding-left:16px">Vertailupisteet</td><td><code>1000 − 100 × d</code></td><td>z-skaalattu euklidinen etäisyys kausilinjojen välillä</td></tr>
        </tbody>
      </table></div>
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

    const defaultSid = META.nav_seasons[0]?.id;

    if (page === '' || page === 'leaderboard') {
      const sid = parseInt(params.sid || defaultSid, 10);
      const stat = params.stat || 'teho_plus';
      await showLeaderboard(sid, stat);

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

    } else if (page === 'team') {
      const teamRaw = parts[1] || '';
      const sid = params.sid ? parseInt(params.sid, 10) : null;
      await showTeam(teamRaw, sid);

    } else if (page === 'match') {
      const mid = parseInt(parts[1], 10);
      if (!mid) throw new Error('bad match id');
      await showMatch(mid);

    } else if (page === 'about') {
      showAbout();

    } else if (page === 'glossary') {
      showGlossary();

    } else {
      main().innerHTML = '<p class="sub" style="margin-top:40px">Sivua ei löydy.</p>';
    }
  } catch(err) {
    console.error(err);
    main().innerHTML = `<div class="card" style="margin-top:40px">
      <p style="color:var(--ink3)">Virhe: ${err.message}</p>
      <p style="font-size:13px;margin-top:8px;color:var(--ink3)">
        Oletko ajanut <code>python export.py</code>?</p>
    </div>`;
  }
}

/* ── Init ──────────────────────────────────────────────────────────────── */
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
