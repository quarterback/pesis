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
  spark_index:'SPARK', adv_plus:'ADV+', runner_plus:'RUN+',
  out_avoid_plus:'OUT+', money_kl_plus:'KOTI-KL+',
  adv1_pct:'1 %', adv2_pct:'2 %', adv3_pct:'3 %', adv_home_pct:'K %',
  adv1_plus:'1 %+', adv2_plus:'2 %+', adv3_plus:'3 %+', adv_home_plus:'K %+',
  kl_pct:'KL%', saatto_pct:'Saatto%', eten_pct:'Etenemis%',
  kunnari_rate:'Kunnarit/vuoro', lyoty_rate:'Lyödyt/vuoro',
  palo_rate:'Palo%', tehot_per_turn:'Tehot/vuoro',
  kl_base0:'1 % (1→2)', kl_base1:'2 % (2→3)',
  kl_base2:'3 % (3→koti)', kl_base3:'K % (kotiutus)',
  teho_plus:'TEHO+', teho_plus_adj:'kTEHO+',
  tehot:'Tehot', kunnarit:'Kunnarit', lyodyt:'Lyödyt', tuodut:'Tuodut',
};

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
  main().innerHTML = '<div class="empty"><div class="big">Ladataan…</div></div>';
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
  return `<span class="lab">Kausi</span>
    <select class="sel" onchange="location.hash=this.value.slice(1)">${opts}</select>`;
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
    html += `<a href="#/?sid=${s.id}"${isOn?' class="active"':''}>${s.series}</a>`;
  }
  const defaultSid = META.nav_seasons[0]?.id || '';
  html += `<a href="#/projections?sid=${defaultSid}"${page==='#/projections'?' class="active"':''}>PARE-ennusteet</a>`;
  html += `<a href="#/league?sid=${defaultSid}"${page==='#/league'?' class="active"':''}>Sarjataulukko</a>`;
  html += `<a href="#/glossary"${page==='#/glossary'?' class="active"':''}>Kaava</a>`;
  html += `<a href="#/about"${page==='#/about'?' class="active"':''}>About</a>`;
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
  const data = await fetchJSON(`data/leaderboard/${sid}.json`);
  const season = data.season;
  const players = data.players;
  const STATS = data.stats || ['spark_index','adv_plus','runner_plus','out_avoid_plus',
    'money_kl_plus','adv1_pct','adv2_pct','adv3_pct','adv_home_pct',
    'adv1_plus','adv2_plus','adv3_plus','adv_home_plus','teho_plus','teho_plus_adj'];

  if (!stat || !STATS.includes(stat)) stat = STATS[0];

  // every Mallo metric is "higher = better" (indices centred on 100)
  const LOWER_BETTER = new Set();
  // stats that are plain index numbers (no decimal formatting)
  const INDEX_STATS = new Set(['spark_index','adv_plus','runner_plus','out_avoid_plus',
    'money_kl_plus','adv1_plus','adv2_plus','adv3_plus','adv_home_plus',
    'teho_plus','teho_plus_adj']);

  const sorted = [...players].filter(p => p.turns_at_bat >= 40)
    .sort((a,b) => {
      const av = a[stat], bv = b[stat];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return LOWER_BETTER.has(stat) ? av - bv : bv - av;
    });

  const pills = STATS.map(s =>
    `<a href="#" onclick="nav('leaderboard',${sid},'${s}');return false;"
       class="${s===stat?'active':''}">${STAT_LABEL[s]||s}</a>`).join('');

  // SPARK + TEHO+ are the always-on anchors; the sorted stat gets its own
  // highlighted column unless it is already one of the anchors.
  const featuredStat = stat;
  const ANCHOR_STATS = ['spark_index', 'teho_plus'];
  const showFeat = !ANCHOR_STATS.includes(stat);

  let rows = '';
  sorted.forEach((l, i) => {
    let featCell = '';
    if (showFeat) {
      const fv = l[featuredStat];
      const isIdx = INDEX_STATS.has(stat);
      const shown = fv === null || fv === undefined ? '—' : isIdx ? fv : rate(fv);
      const bar = isIdx
        ? `<span class="bar"><i style="width:${Math.min(Math.round((fv||0)/2.2),100)}%"></i></span>` : '';
      featCell = `<td><div class="teho-cell"><span class="val">${shown}</span>${bar}</div></td>`;
    }
    rows += `<tr${i===0?' class="leader"':''}>
      <td><span class="rank">${i+1}</span></td>
      <td class="name"><a class="player" href="#/player/${l.player_id}">${l.name}</a></td>
      <td class="name team"><a href="#/team/${encodeURIComponent(l.team)}?sid=${sid}">${l.team||'—'}</a></td>
      <td class="num">${l.games}</td><td class="num">${l.turns_at_bat}</td>
      <td><div class="teho-cell"><span class="val">${l.spark_index??'—'}</span><span class="bar"><i style="width:${Math.min(Math.round((l.spark_index||0)/2.5),100)}%"></i></span></div></td>
      <td class="num">${l.teho_plus??'—'}</td>
      ${featCell}
    </tr>`;
  });

  const featTh = STAT_LABEL[stat]||stat;

  const subText = ['spark_index','adv_plus','runner_plus','out_avoid_plus','money_kl_plus',
    'adv1_plus','adv2_plus','adv3_plus','adv_home_plus'].includes(stat)
    ? 'Mallo-mittarit: 100 = sarjan keskiarvo, yli 100 parempi. Vähintään 40 lyöntivuoroa.'
    : 'Vähintään 40 lyöntivuoroa. TEHO+ = tehot/vuoro suhteessa sarjan keskiarvoon (100 = keskiverto).';

  main().innerHTML = `
    <div class="controls">
      ${seasonSelHtml(META.seasons, sid, '/', `&stat=${stat}`)}
    </div>
    <div class="page" style="padding-bottom:6px">
      <h1>${season.series} ${season.year}</h1>
      <p class="sub">${subText}</p>
    </div>
    <div class="filters">
      <span class="lab">Järjestä</span>
      ${pills}
      <span class="spacer"></span>
      <a href="#" onclick="dlLB(${sid},'${stat}');return false;">↓ CSV</a>
    </div>
    <table>
      <thead><tr>
        <th style="width:36px">#</th>
        <th class="name">Pelaaja</th><th class="name">Joukkue</th>
        <th>O</th><th>Vuorot</th><th>SPARK</th><th>TEHO+</th>
        ${showFeat?`<th>${featTh}</th>`:''}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  window.dlLB = function(sid, stat) {
    const cols = ['name','team','games','turns_at_bat',
                  'spark_index','adv_plus','runner_plus','out_avoid_plus','money_kl_plus',
                  'adv1_pct','adv2_pct','adv3_pct','adv_home_pct','teho_plus','teho_plus_adj'];
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
    const barW = Math.min(Math.round((p.teho_plus_proj||0)/2.1), 100);
    rows += `<tr${i===0?' class="leader"':''}>
      <td><span class="rank">${i===0?'1':i+1}</span></td>
      <td class="name"><a class="player" href="#/player/${p.player_id}">${p.name}</a></td>
      <td class="num">${p.age||'—'}</td>
      <td class="num">${rate(p.stats?.kl_pct?.rate)}</td>
      <td class="num">${rate(p.stats?.saatto_pct?.rate)}</td>
      <td class="num">${rate(p.stats?.eten_pct?.rate)}</td>
      <td class="num">${rate(p.stats?.palo_rate?.rate)}</td>
      <td><div class="teho-cell">
        <span class="val">${p.teho_plus_proj}</span>
        <span class="bar"><i style="width:${barW}%"></i></span>
      </div></td>
    </tr>`;
  });

  main().innerHTML = `
    <div class="controls">
      ${seasonSelHtml(META.seasons, sid, '/projections')}
    </div>
    <div class="page" style="padding-bottom:6px">
      <h1>PARE-ennusteet</h1>
      <p class="sub">Päivittyvä arvio jokaisen pelaajan todellisesta tasosta: koko urahistoria
      eksponentiaalisesti painotettuna + regressio sarjakeskiarvoon.
      Ei mielivaltaisia "viimeiset N ottelua" -rajauksia.</p>
    </div>
    <table>
      <thead><tr>
        <th style="width:34px">#</th>
        <th class="name">Pelaaja</th>
        <th>Ikä</th><th>eKL%</th><th>eSaatto%</th>
        <th>eEtenemis%</th><th>ePalo%</th><th class="extra">eTEHO+</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
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
    const diff = t.run_diff >= 0 ? `+${t.run_diff}` : `${t.run_diff}`;
    standRows += `<tr>
      <td>${i+1}</td>
      <td class="name"><a href="#/team/${encodeURIComponent(t.team)}?sid=${sid}">${t.team}</a></td>
      <td class="num">${t.games}</td><td class="num">${t.wins}</td>
      <td class="num">${t.ties??'—'}</td><td class="num">${t.losses}</td>
      <td class="num"><strong>${t.points}</strong></td>
      <td class="num">${t.runs_for}–${t.runs_against}</td>
      <td class="num ${t.run_diff>=0?'pos':'neg'}">${diff}</td>
    </tr>`;
  });

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
      <p class="sub">Koko kausi.</p>
    </div>
    ${history ? `<div class="page" style="padding-top:0">
      <h2>Pudotuspelitodennäköisyydet kaudella</h2>
      <div class="card" style="padding:0;overflow:hidden">
        <div id="fangraph" style="width:100%"></div>
      </div></div>` : ''}
    <div class="page" style="padding-top:0">
      <h2>Sarjataulukko</h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr>
            <th>#</th><th class="name">Joukkue</th>
            <th>O</th><th>V</th><th>T</th><th>H</th>
            <th>Pisteet</th><th>Juoksut</th><th>±</th>
          </tr></thead>
          <tbody>${standRows}</tbody>
        </table>
      </div>
      <h2>Kenttäkertoimet <span class="muted">(100 = neutraali)</span></h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr>
            <th class="name">Stadion</th>
            <th>Ottelut</th><th>Juoksua/ottelu</th><th>PF</th>
          </tr></thead>
          <tbody>${parkRows}</tbody>
        </table>
      </div>
      <h2>Tuuli ja kunnarit</h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr>
            <th class="name">Tuuli</th>
            <th>Ottelut</th><th>Kunnarit/vuoro</th><th>Juoksua/ottelu</th>
          </tr></thead>
          <tbody>${wxRows}</tbody>
        </table>
        <p class="legend" style="padding:10px 16px">Sää joka ottelusta suoraan tulospalvelun datasta.</p>
      </div>
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
  const {player, career, line, proj, career_json, base_kl, base_keys, comps} = data;

  const projTile = proj?.teho_plus_proj
    ? `<div class="tile"><div class="label">PARE enn.</div><div class="value">${proj.teho_plus_proj}</div></div>` : '';

  let pctBars = '';
  for (const stat of PCT_STATS) {
    const pct = line[`pct_${stat}`];
    const v = line[stat];
    pctBars += pctBar(pct, STAT_LABEL[stat]||stat, rate(v));
  }

  let baseKlBars = '';
  if (base_kl) {
    for (const key of (base_keys||BASE_KL_KEYS)) {
      const pct = base_kl[`pct_${key}`];
      const tries = base_kl[`${key}_tries`];
      const lbl = `${STAT_LABEL[key]||key} <span style="color:var(--ink3);font-size:11px">(${tries} yrit.)</span>`;
      baseKlBars += pctBar(pct, lbl, rate(base_kl[key]));
    }
  }

  let careerRows = '';
  for (const s of career) {
    careerRows += `<tr>
      <td class="name">${s.year}</td>
      <td class="num">${s.age||'—'}</td>
      <td class="num">${s.games}</td><td class="num">${s.turns_at_bat}</td>
      <td class="num strong">${s.spark_index??'—'}</td>
      <td class="num">${s.adv_plus??'—'}</td>
      <td class="num">${s.runner_plus??'—'}</td>
      <td class="num">${s.out_avoid_plus??'—'}</td>
      <td class="num">${s.money_kl_plus??'—'}</td>
      <td class="num extra">${s.teho_plus??'—'}</td>
      <td class="num">${s.teho_plus_adj||'—'}</td>
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
      <h2>Vertailukelpoiset kaudet <span class="muted">(1000 = identtinen)</span></h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr><th>Pisteet</th><th class="name">Pelaaja</th><th>Kausi</th><th>Ikä</th><th class="extra">TEHO+</th></tr></thead>
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
    <h2>Urakehitys</h2>
    <div class="card">
      <div class="minis">
        <div class="mini"><div class="label">KL%</div><div id="career-kl"></div></div>
        <div class="mini"><div class="label">TEHO+</div><div id="career-teho"></div></div>
      </div>
    </div>` : '';

  main().innerHTML = `
    <div class="page">
      <h1>${player.name}</h1>
      <p class="sub">
        <a href="#/team/${encodeURIComponent(line.team)}?sid=${line.season_id}">${line.team}</a>
        ${line.age ? `· ${line.age} v` : ''}
        · kausi ${line.year}
      </p>
      <div class="tiles">
        <div class="tile"><div class="label">Ottelut</div><div class="value">${line.games}</div></div>
        <div class="tile"><div class="label">SPARK</div><div class="value">${line.spark_index??'—'}</div></div>
        <div class="tile hero"><div class="label">TEHO+</div><div class="value">${line.teho_plus||'—'}</div></div>
        ${projTile}
      </div>
      <h2>Mallo-indeksit ${line.year} <span class="muted">(100 = sarjan keskiarvo)</span></h2>
      <div class="card"><div id="index-bars"></div></div>
      <h2>Prosenttipisteet ${line.year} <span class="muted">(sarjan vakiopelaajien joukossa)</span></h2>
      <div class="card">
        ${pctBars}
        <p class="legend">Vaalea = sarjan häntäpää · tumma = kärki. Numero = prosenttipiste.</p>
      </div>
      ${base_kl ? `
      <h2>KL% pesäkohdittain ${line.year} <span class="muted">(kärkilyöntiprosentti per pesa)</span></h2>
      <div class="card">${baseKlBars}</div>` : ''}
      ${careerCharts}
      <div class="split">
        <div>
          <h2>Kaudet</h2>
          <div class="card" style="padding:0;overflow:hidden">
            <table>
              <thead><tr>
                <th class="name">Kausi</th><th>Ikä</th><th>O</th><th>Vuorot</th>
                <th>SPARK</th><th>ADV+</th><th>RUN+</th><th>OUT+</th><th>KOTI-KL+</th>
                <th class="extra">TEHO+</th><th title="kenttäkorjattu">kTEHO+</th>
              </tr></thead>
              <tbody>${careerRows}</tbody>
            </table>
          </div>
        </div>
        <div>
          ${compsHtml}
          ${proj ? `
          <h2>PARE-ennuste <span class="muted">(${proj.as_of||''})</span></h2>
          <div class="card" style="padding:0;overflow:hidden">
            <table>
              <thead><tr>
                <th class="name">Tilasto</th>
                <th class="extra">Ennuste</th><th>Havaittu</th><th>Otos</th>
              </tr></thead>
              <tbody>${projRows}</tbody>
            </table>
            <p class="legend" style="padding:10px 16px">
              Eksponentiaalisesti painotettu historia regressoituna sarjakeskiarvoon.</p>
          </div>` : ''}
        </div>
      </div>
    </div>`;

  const ibEl = document.getElementById('index-bars');
  if (ibEl && typeof renderIndexBars === 'function') {
    renderIndexBars(ibEl, [
      {label:'SPARK',    value: line.spark_index,    full:'SPARK — kärjenrakentajan kokonaisindeksi'},
      {label:'ADV+',     value: line.adv_plus,       full:'Etenemisarvo lyöjänä'},
      {label:'RUN+',     value: line.runner_plus,    full:'Etenijän arvo'},
      {label:'OUT+',     value: line.out_avoid_plus, full:'Palojen välttäminen'},
      {label:'KOTI-KL+', value: line.money_kl_plus,  full:'Kotiutuskärkilyönnit'},
      {label:'TEHO+',    value: line.teho_plus,      full:'Tuotanto per vuoro'},
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
      <div class="tile"><div class="label">Ottelut</div><div class="value">${standing.games}</div></div>
      <div class="tile"><div class="label">V–H</div><div class="value">${standing.wins}–${standing.losses}</div></div>
      <div class="tile hero"><div class="label">Pisteet</div><div class="value">${standing.points}</div></div>
      <div class="tile"><div class="label">Juoksuero</div><div class="value">${standing.run_diff>=0?'+':''}${standing.run_diff}</div></div>
    </div>` : '';

  // roster ranked by the season line's SPARK order it arrives in; show Mallo indices only
  let rosterRows = '';
  for (const l of roster) {
    rosterRows += `<tr>
      <td class="name"><a class="player" href="#/player/${l.player_id}">${l.name}</a></td>
      <td class="num">${l.games}</td><td class="num">${l.turns_at_bat}</td>
      <td class="num strong">${l.spark_index??'—'}</td>
      <td class="num">${l.adv_plus??'—'}</td>
      <td class="num">${l.runner_plus??'—'}</td>
      <td class="num">${l.out_avoid_plus??'—'}</td>
      <td class="num extra">${l.teho_plus??'—'}</td>
    </tr>`;
  }

  main().innerHTML = `
    <div class="page">
      <h1>${team}</h1>
      <p class="sub">${season.series} ${season.year}</p>
      ${standingTiles}
      <h2 style="margin-top:${standing?'4px':'0'}">Pelaajat</h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr>
            <th class="name">Pelaaja</th>
            <th>O</th><th>Vuorot</th>
            <th>SPARK</th><th>ADV+</th><th>RUN+</th><th>OUT+</th><th class="extra">TEHO+</th>
          </tr></thead>
          <tbody>${rosterRows}</tbody>
        </table>
      </div>
    </div>`;
}


/* ══════════════════════════════════════════════════════════════════════════
   STATIC PAGES
══════════════════════════════════════════════════════════════════════════ */
function showAbout() {
  main().innerHTML = `
    <div class="page">
      <h1>What is Mallo?</h1>
      <p class="sub">The first analytics site for pesäpallo (Finnish baseball). English, because
      the ideas came from the baseball and basketball analytics world — Finnish UI everywhere else.</p>
      <div class="prose">
        <p class="lead">Public analytics transformed how baseball (Baseball Savant, FanGraphs,
        Baseball-Reference) and basketball (DARKO, LEBRON) are understood — but pesäpallo, a sport
        with a century of history and a results service that records every plate turn, has never had
        an analytics layer. Mallo is an attempt to build one, on top of the official
        <a href="https://www.pesistulokset.fi/">pesistulokset.fi</a> data service.</p>
        <p><strong>PARE</strong> (Painotettu ja Regressoitu Ennuste — a nod to
        <a href="https://www.darko.app/">DARKO</a>, its methodological parent) is a daily-updating
        estimate of every player's true talent in every rate stat. Every game a player has ever played
        counts, weighted by an exponential decay fitted per stat — no arbitrary "last 10 games" windows —
        and blended with the league average in proportion to how much evidence exists.</p>
        <p><strong>TEHO+</strong> is league-indexed production per plate turn (100 = league average,
        150 = MVP season) in the spirit of baseball's OPS+/wRC+. <strong>kTEHO+</strong> is the
        park-adjusted version.</p>
        <p><strong>Percentile profiles</strong> show where a player ranks among qualified peers in each
        skill, Baseball Savant style. <strong>Kenttäkertoimet</strong> are the sport's first published
        park factors. <strong>Playoff odds</strong> come from Monte Carlo simulation of the remaining
        schedule.</p>
        <p>Data: the official pesistulokset.fi results service, per-player per-match statistics back
        to 1991.</p>
        <p>Open source, work in progress. The roadmap — run expectancy from play-by-play, lukkari
        metrics, manager decision analysis, win probability — lives in
        <code>docs/design.md</code>.</p>
      </div>
    </div>`;
}

function showGlossary() {
  // glossary tables have long text — allow wrapping in the Huomio column
  const gtable = (rows) => `
    <table style="table-layout:fixed;width:100%">
      <colgroup>
        <col style="width:160px">
        <col>
        <col style="width:220px">
      </colgroup>
      <thead><tr>
        <th class="name">Tilasto</th>
        <th class="name">Kaava</th>
        <th class="name">Huomio</th>
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
      <h1>Kaavat</h1>
      <p class="sub">Jokainen tilasto selitettynä — laskentakaava ja tulkintaohje.</p>
      <h2>Perustilastot</h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('Tehot','<code>K + L + T</code>','perinteinen tuotantoluku') +
          gr('KL%','<code>kärkilyönnit / KLY</code>','kärjen eteneminen per yritys') +
          gr('Saatto-%','<code>saatot / saattoyritykset</code>','takaetenijän vieminen lyöjänä') +
          gr('Etenemis-%','<code>etenemiset / etenemisyritykset</code>','kärki- + takaetenemiset etenijänä') +
          gr('Kunnarit/vuoro','<code>K / V</code>','') +
          gr('Lyödyt/vuoro','<code>L / V</code>','') +
          gr('Tuodut/yritys','<code>T / etenemisyritykset</code>','etenijän tuotto') +
          gr('Palo-%','<code>palot / V</code>','pienempi parempi') +
          gr('Tehot/vuoro','<code>(K + L + T) / V</code>','')
        )}
      </div>
      <h2>Mallo-analytiikka</h2>
      <p class="sub">Nämä mittarit eivät toista pesistulokset-laskureita — ne indeksoivat etenemisen, palojen välttämisen ja kotiutuskärkilyönnit sarjaan (100 = keskiarvo, yli 100 parempi).</p>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('ADV+','<code>100 × ((KL + saatot) / (KLY + saatto-Y)) / sarjataso</code>','lyöjän etenemisarvo ilman K/L/T-toistoa') +
          gr('RUN+','<code>100 × etenemis-% / sarjataso</code>','pelaajan arvo etenijänä') +
          gr('OUT+','<code>100 × (1 − palot/vuoro) / sarjataso</code>','palojen välttäminen; yli 100 parempi') +
          gr('SPARK','<code>0.50·ADV+ + 0.30·RUN+ + 0.20·OUT+</code>','kärjenrakentajan kokonaisindeksi') +
          gr('1 % / 2 % / 3 % / K %','<code>onnistuneet KL-liikkeet / yritykset</code>','1→2, 2→3, 3→koti ja kotiutus; yksi lyöntivuoro voi tuottaa useita KL:iä') +
          gr('1 %+ / 2 %+ / 3 %+ / K %+','<code>100 × split-% / sarjan split-%</code>','sama virallinen split sarjaindeksinä') +
          gr('KOTI-KL+','<code>100 × K % / sarjataso</code>','kotiutus-/juoksuksi muuttavat kärkilyöntiyritykset')
        )}
      </div>
      <h2>Indeksit</h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('TEHO+','<code>100 × (tehot/V) / (sarjan tehot/V)</code>','100 = sarjan keskitaso; kärki ~250–350') +
          gr('kTEHO+','<code>100 × Σ(tehot/kerroin) / V / sarjataso</code>','kenttäkorjattu TEHO+') +
          gr('Kenttäkerroin (PF)','<code>100 × (juoksut/ottelu kotona) / (juoksut/ottelu vieraissa)</code>','regressoitu kohti 100:aa') +
          gr('Prosenttipiste','<code>100 × (pienemmät + ½·samat) / n</code>','sarjan vakiopelaajien joukossa (≥40 vuoroa)')
        )}
      </div>
      <h2>PARE <span class="muted">— Painotettu ja Regressoitu Ennuste</span></h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('eTilasto (esim. eKL%)','<code>(Σ β<sup>t</sup>·onnistumiset + κ·sarjataso) / (Σ β<sup>t</sup>·yritykset + κ)</code>','t = päiviä ottelusta; β ja κ per tilasto') +
          gr('eTEHO+','<code>100 × ennustettu tehot/V / sarjataso</code>','')
        )}
        <p class="legend" style="padding:10px 16px">e- = ennustettu · k- = kenttäkorjattu.</p>
      </div>
      <h2>Muut</h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('Pisteet','<code>3 / 2 / 1 / 0</code>','suora voitto 2–0 / muu voitto / tappio ratkaisussa / muu tappio') +
          gr('Pudotuspeli-%','<code>osuus 300+ simulaatiosta, joissa top-4</code>','joukkueen taso = juoksuero/ottelu, regressoitu') +
          gr('Vertailupisteet','<code>1000 − 100 × d</code>','z-skaalattu euklidinen etäisyys kausilinjojen välillä')
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

    const defaultSid = META.nav_seasons[0]?.id;

    if (page === '' || page === 'leaderboard') {
      const sid = parseInt(params.sid || defaultSid, 10);
      const stat = params.stat || 'spark_index';
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

    } else if (page === 'about') {
      showAbout();

    } else if (page === 'glossary') {
      showGlossary();

    } else {
      main().innerHTML = '<div class="page"><p class="sub">Sivua ei löydy.</p></div>';
    }
  } catch(err) {
    console.error(err);
    main().innerHTML = `<div class="page">
      <div class="card">
        <p style="color:var(--ink3)">Virhe: ${err.message}</p>
        <p class="sub">Oletko ajanut <code>python export.py</code>?</p>
      </div>
    </div>`;
  }
}

/* ── Init ──────────────────────────────────────────────────────────────── */
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
