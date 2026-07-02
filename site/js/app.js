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
  vyk:'VYK', jyk:'JYK', raa:'RAA',
  tehot:'Tehot', kunnarit:'Kunnarit', lyodyt:'Lyödyt', tuodut:'Tuodut',
};

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
  if (typeof closeSarja === 'function') closeSarja();
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

/* ── Leaderboard controls: Sarja (division) + sex + Kausi ─────────────────── */
// We only import Superpesis and Ykköspesis — no lower tiers.
const TIERS = ['Superpesis', 'Ykköspesis'];

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
  const vq = view === 'lukkari' ? '&view=lukkari' : '';  // preserve view across series/season switches
  const find = (sex, tier, year) => seasons.find(s => {
    const p = parseSeries(s.series);
    return p.sex === sex && p.tier === tier && s.year === year;
  });

  // Sarja popover: Miehet / Naiset columns × available tiers
  const col = (sex, label) => {
    const items = TIERS.map(tier => {
      const m = find(sex, tier, curYear);
      if (!m) return '';   // tier not imported for this sex/year — omit entirely
      const on = sex === curSex && tier === curTier ? ' class="on"' : '';
      return `<button${on} onclick="location.hash='/?sid=${m.id}${vq}'">${tier}</button>`;
    }).join('');
    return `<div class="col"><div class="colh">${label}</div>${items}</div>`;
  };
  const sarja = `<span class="lab">Sarja</span>
    <div class="dropwrap">
      <button class="seldrop" type="button" onclick="toggleSarja(event)">${curTier}<span class="caret"></span></button>
      <div class="menu" id="sarjaMenu" style="display:none">${col('M','Miehet')}${col('N','Naiset')}</div>
    </div>`;

  // Lyöjät / Lukkarit — batting vs pitching leaderboard
  const modeSeg = `<div class="seg">
    <a href="#/?sid=${sid}"${view!=='lukkari'?' class="on"':''}>Lyöjät</a>
    <a href="#/?sid=${sid}&view=lukkari"${view==='lukkari'?' class="on"':''}>Lukkarit</a>
  </div>`;

  // Miehet / Naiset segmented — same tier, other sex
  const seg = ['M', 'N'].map(sex => {
    const m = find(sex, curTier, curYear);
    const label = sex === 'M' ? 'Miehet' : 'Naiset';
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
    <span class="lab">Kausi</span>
    <select class="sel" onchange="location.hash=this.value.slice(1)">${yearOpts}</select>
  </div>`;
}

function closeSarja() {
  const m = document.getElementById('sarjaMenu');
  if (m) m.style.display = 'none';
  const b = document.getElementById('menuback');
  if (b) b.remove();
}

window.toggleSarja = function (e) {
  e.stopPropagation();
  const m = document.getElementById('sarjaMenu');
  if (!m) return;
  if (m.style.display !== 'none') { closeSarja(); return; }
  m.style.display = 'flex';
  const b = document.createElement('div');
  b.className = 'menuback'; b.id = 'menuback'; b.onclick = closeSarja;
  document.body.appendChild(b);
};

/* ── Nav ─────────────────────────────────────────────────────────────────── */
function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav || !META) return;
  const hash = location.hash;
  const page = hash.split('?')[0];
  const curSid = parseInt(qs('sid') || '0', 10);

  const defaultSid = META.nav_seasons[0]?.id || '';
  const statsSid = curSid || defaultSid;
  const onStats = page === '#/' || page === '#/leaderboard' || page === '#/player' || page === '#/team';
  let html = '';
  html += `<a href="#/?sid=${statsSid}"${onStats?' class="active"':''}>Tilastot</a>`;
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
      return `<th class="${cls}" data-k="${c.key}">${c.label}${arrow}</th>`;
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
        <span class="psize">Näytä <select class="sel">${sizeOpts}</select></span>
        <span class="pnav">
          <button class="pbtn pprev"${page<=0?' disabled':''}>‹ Edell.</button>
          <span class="ppage">${page+1} / ${pages}</span>
          <button class="pbtn pnext"${page>=pages-1?' disabled':''}>Seur. ›</button>
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
  const STATS = data.stats || ['vyk','jyk','spark_index','adv_plus','runner_plus','out_avoid_plus',
    'money_kl_plus','adv1_pct','adv2_pct','adv3_pct','adv_home_pct',
    'adv1_plus','adv2_plus','adv3_plus','adv_home_plus','teho_plus','teho_plus_adj'];

  if (!stat || !STATS.includes(stat)) stat = STATS[0];

  // every Mallo metric is "higher = better" (indices centred on 100)
  const LOWER_BETTER = new Set();
  // stats shown as plain numbers (indices + value stats), not .xxx rates
  const INDEX_STATS = new Set(['spark_index','adv_plus','runner_plus','out_avoid_plus',
    'money_kl_plus','adv1_plus','adv2_plus','adv3_plus','adv_home_plus',
    'teho_plus','teho_plus_adj','vyk','jyk','raa']);

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
  if (posFilter) sorted = sorted.filter(l => posLabel(l.pos) === posFilter);
  const posQ = posFilter ? `&pos=${posFilter}` : '';
  const posOpts = [`<option value="">Kaikki paikat</option>`].concat(
    posPresent.map(p => `<option value="${p}"${p===posFilter?' selected':''}>${p}</option>`)).join('');
  const posSel = `<span class="lab">Paikka</span>
    <select class="sel" onchange="location.hash='/?sid=${sid}&stat=${stat}'+(this.value?'&pos='+this.value:'')">${posOpts}</select>`;

  const pills = STATS.map(s =>
    `<a href="#/?sid=${sid}&stat=${s}${posQ}"
       class="${s===stat?'active':''}">${STAT_LABEL[s]||s}</a>`).join('');

  // SPARK + TEHO+ are the always-on anchors; the sorted stat gets its own
  // highlighted column unless it is already one of the anchors.
  const featuredStat = stat;
  const ANCHOR_STATS = ['spark_index', 'teho_plus'];
  const showFeat = !ANCHOR_STATS.includes(stat);
  const maxFeat = Math.max(...sorted.map(x => Math.abs(x[featuredStat] || 0)), 1e-9);
  const sparkMax = Math.max(...sorted.map(x => Math.abs(x.spark_index || 0)), 1e-9);
  const featTh = STAT_LABEL[stat] || stat;

  const barCell = (v, max) => {
    const w = v == null ? 0 : Math.min(Math.abs(v) / max * 100, 100);
    return `<td><div class="teho-cell"><span class="val">${v??'—'}</span><span class="bar"><i style="width:${w}%"></i></span></div></td>`;
  };
  const cols = [
    {key:'rank', label:'#', sortable:false, get:()=>0, cell:(r,i)=>`<td><span class="rank">${i+1}</span></td>`},
    {key:'name', label:'Pelaaja', thClass:'name', get:r=>r.name,
     cell:r=>`<td class="name"><a class="player" href="#/player/${r.player_id}">${r.name}</a> <span class="pos">${posLabel(r.pos)}</span></td>`},
    {key:'team', label:'Joukkue', thClass:'name', get:r=>r.team,
     cell:r=>`<td class="name team"><a href="#/team/${encodeURIComponent(r.team)}?sid=${sid}">${r.team||'—'}</a></td>`},
    {key:'games', label:'O', get:r=>r.games, cell:r=>`<td class="num">${r.games}</td>`},
    {key:'turns_at_bat', label:'Vuorot', get:r=>r.turns_at_bat, cell:r=>`<td class="num">${r.turns_at_bat}</td>`},
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
    ? 'VYK = voitot yli korvaajan (pesäpallon WAR-vastine), JYK = juoksut yli korvaajan — kertyviä arvomittareita. Vähintään 40 lyöntivuoroa.'
    : ['spark_index','adv_plus','runner_plus','out_avoid_plus','money_kl_plus',
       'adv1_plus','adv2_plus','adv3_plus','adv_home_plus'].includes(stat)
    ? 'Mallo-mittarit: 100 = sarjan keskiarvo, yli 100 parempi. Vähintään 40 lyöntivuoroa.'
    : 'Vähintään 40 lyöntivuoroa. TEHO+ = tehot/vuoro suhteessa sarjan keskiarvoon (100 = keskiverto).';

  main().innerHTML = `
    ${leaderboardControls(sid, '')}
    <div class="page" style="padding-bottom:6px">
      <h1>${parseSeries(season.series).tier} ${season.year}</h1>
      <p class="sub">${subText}</p>
    </div>
    <div class="filters">
      <span class="lab">Järjestä</span>
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
    {key:'name', label:'Pelaaja', thClass:'name', get:r=>r.name,
     cell:r=>`<td class="name"><a class="player" href="#/player/${r.player_id}">${r.name}</a> <span class="pos">P</span></td>`},
    {key:'team', label:'Joukkue', thClass:'name', get:r=>r.team,
     cell:r=>`<td class="name team"><a href="#/team/${encodeURIComponent(r.team)}?sid=${sid}">${r.team||'—'}</a></td>`},
    {key:'lukkari_games', label:'Ott.', get:r=>r.lukkari_games, cell:r=>`<td class="num">${r.lukkari_games}</td>`},
    {key:'runs_allowed', label:'Päästetyt', get:r=>r.runs_allowed, cell:r=>`<td class="num">${r.runs_allowed}</td>`},
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
      <h1>${parseSeries(season.series).tier} ${season.year} <span class="muted">· Lukkarit</span></h1>
      <p class="sub">Lukkarin juoksujenesto: RP = juoksut estetty yli sarjan keskiarvon (kertyvä, suurempi parempi). LRA = päästetyt juoksut/ottelu, LRA- indeksinä (100 = keskiarvo, pienempi parempi). Vähintään 3 lukkariottelua. ERA-tyylinen silta kunnes syöttödata on saatavilla.</p>
    </div>
    ${lk.length ? `<div id="lk-table"></div>` : `<div class="page"><p class="sub">Ei lukkaridataa tälle kaudelle.</p></div>`}`;

  if (lk.length) makeTable(document.getElementById('lk-table'), {
    columns: cols, rows: lk, sort: { key: 'lukkari_rp', dir: -1 },
    rowClass: (r, gi) => gi === 0 ? 'leader' : '',
  });
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
    {key:'name', label:'Pelaaja', thClass:'name', get:r=>r.name,
     cell:r=>`<td class="name"><a class="player" href="#/player/${r.player_id}">${r.name}</a></td>`},
    {key:'ekl', label:'eKL%', get:r=>r.stats?.kl_pct?.rate, cell:r=>`<td class="num">${rate(r.stats?.kl_pct?.rate)}</td>`},
    {key:'esaatto', label:'eSaatto%', get:r=>r.stats?.saatto_pct?.rate, cell:r=>`<td class="num">${rate(r.stats?.saatto_pct?.rate)}</td>`},
    {key:'eeten', label:'eEtenemis%', get:r=>r.stats?.eten_pct?.rate, cell:r=>`<td class="num">${rate(r.stats?.eten_pct?.rate)}</td>`},
    {key:'epalo', label:'ePalo%', get:r=>r.stats?.palo_rate?.rate, cell:r=>`<td class="num">${rate(r.stats?.palo_rate?.rate)}</td>`},
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
      <h1>PARE-ennusteet</h1>
      <p class="sub">Päivittyvä arvio jokaisen pelaajan todellisesta tasosta: koko urahistoria
      eksponentiaalisesti painotettuna + regressio sarjakeskiarvoon.
      Ei mielivaltaisia "viimeiset N ottelua" -rajauksia.</p>
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
  const history = data.odds_history;
  const parks = data.parks;
  const weather = data.weather;

  const standCols = [
    {key:'rank', label:'#', sortable:false, get:()=>0, cell:(r,i)=>`<td>${i+1}</td>`},
    {key:'team', label:'Joukkue', thClass:'name', get:r=>r.team,
     cell:r=>`<td class="name"><a href="#/team/${encodeURIComponent(r.team)}?sid=${sid}">${r.team}</a></td>`},
    {key:'games', label:'O', get:r=>r.games, cell:r=>`<td class="num">${r.games}</td>`},
    {key:'wins', label:'V', get:r=>r.wins, cell:r=>`<td class="num">${r.wins}</td>`},
    {key:'ties', label:'T', get:r=>r.ties, cell:r=>`<td class="num">${r.ties??'—'}</td>`},
    {key:'losses', label:'H', get:r=>r.losses, cell:r=>`<td class="num">${r.losses}</td>`},
    {key:'points', label:'Pisteet', get:r=>r.points, cell:r=>`<td class="num"><strong>${r.points}</strong></td>`},
    {key:'runs', label:'Juoksut', sortable:false, get:r=>r.run_diff, cell:r=>`<td class="num">${r.runs_for}–${r.runs_against}</td>`},
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
      <p class="sub">Koko kausi.</p>
    </div>
    ${history ? `<div class="page" style="padding-top:0">
      <h2>Pudotuspelitodennäköisyydet kaudella</h2>
      <div class="card" style="padding:0;overflow:hidden">
        <div id="fangraph" style="width:100%"></div>
      </div></div>` : ''}
    <div class="page" style="padding-top:0">
      <h2>Sarjataulukko</h2>
      <div id="lg-standings"></div>
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

  makeTable(document.getElementById('lg-standings'), {
    columns: standCols, rows: table, sort: { key: 'points', dir: -1 }, pageSize: 50,
  });

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
  const {player, career, line, proj, translation, career_json, base_kl, base_keys, comps} = data;

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
      <td class="num">${s.games}</td><td class="num">${s.turns_at_bat}</td>
      <td class="num strong">${s.vyk??'—'}</td>
      <td class="num">${s.spark_index??'—'}</td>
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
      <h1>${player.name} <span class="pos">${posLabel(line.pos)}</span></h1>
      <p class="sub">
        <a href="#/team/${encodeURIComponent(line.team)}?sid=${line.season_id}">${line.team}</a>
        ${line.age ? `· ${line.age} v` : ''}
        · kausi ${line.year}
        ${translation ? `· <a href="#/baseball/${pid}">⚾ Baseball →</a>` : ''}
      </p>
      <div class="tiles">
        <div class="tile"><div class="label">Ottelut</div><div class="value">${line.games}</div></div>
        <div class="tile hero"><div class="label">VYK</div><div class="value">${line.vyk??'—'}</div></div>
        <div class="tile"><div class="label">SPARK</div><div class="value">${line.spark_index??'—'}</div></div>
        <div class="tile"><div class="label">TEHO+</div><div class="value">${line.teho_plus||'—'}</div></div>
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
                <th class="name">Kausi</th><th>O</th><th>Vuorot</th>
                <th>VYK</th><th>SPARK</th><th>ADV+</th><th>RUN+</th><th>OUT+</th><th>KOTI-KL+</th>
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

  const rosterCols = [
    {key:'name', label:'Pelaaja', thClass:'name', get:r=>r.name,
     cell:r=>`<td class="name"><a class="player" href="#/player/${r.player_id}">${r.name}</a> <span class="pos">${posLabel(r.pos)}</span></td>`},
    {key:'games', label:'O', get:r=>r.games, cell:r=>`<td class="num">${r.games}</td>`},
    {key:'turns_at_bat', label:'Vuorot', get:r=>r.turns_at_bat, cell:r=>`<td class="num">${r.turns_at_bat}</td>`},
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
      <h2 style="margin-top:${standing?'4px':'0'}">Pelaajat</h2>
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
  const {player, line, translation: t} = data;
  if (!t) {
    main().innerHTML = `<div class="page"><h1>${player.name}</h1>
      <p class="sub"><a href="#/player/${pid}">← takaisin</a> · ei baseball-käännöstä (liian vähän lyöntivuoroja).</p></div>`;
    return;
  }
  const callout = (k, v, cls) => `<div class="callout"><div class="k">${k}</div><div class="v ${cls||''}">${v}</div></div>`;
  const rows = t.rows.map(r => `<tr>
    <td class="name">${r.pesis_label}</td>
    <td class="num">${rate(r.pesis_value)}</td>
    <td class="num">${r.percentile}</td>
    <td class="num">${r.mlb_stat}</td>
    <td class="num extra">${r.mlb_value}</td>
  </tr>`).join('');

  main().innerHTML = `
    <div class="page">
      <h1>${player.name} <span class="muted">· baseball</span></h1>
      <p class="sub"><a href="#/player/${pid}">← ${line.team} · ${line.year}</a></p>
      <div class="callrow">
        ${callout('wRC+ equivalent', t.wrc_plus ?? '—', 'accent')}
        ${callout('Reads like', t.tier ?? '—')}
        ${callout('162-game pace', `${t.pace.HR} HR · ${t.pace.RBI} RBI · ${t.pace.R} R`)}
      </div>
      <h2>Skill → MLB <span class="muted">(same percentile, MLB scale)</span></h2>
      <div class="card" style="padding:0;overflow:hidden">
        <table>
          <thead><tr>
            <th class="name">Pesäpallo</th><th>Arvo</th><th>Pctile</th>
            <th>MLB</th><th class="extra">Käännös</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="legend">Rank-preserving quantile map — a player's percentile among qualified
      Superpesis hitters read off at the same percentile of the MLB distribution. A translation
      baseball fans can read, not a claim the skills transfer.</p>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   STATIC PAGES
══════════════════════════════════════════════════════════════════════════ */
function showAbout() {
  main().innerHTML = `
    <div class="page">
      <h1>Tietoa</h1>
      <div class="prose">
        <p class="lead">Tämä on fanisivusto, joka ottaa mallia baseballin edistyneiden tilastojen
        sivustoista. Se on yhä vahvasti työn alla ja nojaa pesistulokset-palvelun dataan.</p>
        <p>Ennen kaikkea kyseessä on fanikokeilu — tapani tuoda rakkaus baseball-tilastoihin
        pesäpalloon. Ajan myötä varmasti muokkaamme mittareita ja poistamme osan, mutta tämä on
        ensimmäinen versio, jonka kokoamisesta olin innoissani.</p>
        <p>Jos haluat tietää hieman siitä, miten päädyin seuraamaan lajia — olen ollut fani vuodesta
        2011 — lue <a href="https://www.superpesis.fi/ajankohtaista/superpesis-yhdysvaltalainen-ron-bronson-toteutti-unelmansa-ja-matkusti-suomeen-katsomaan-pesapalloa">juttuni Superpesiksen sivuilla</a>.</p>
        <p>✉️ <a href="mailto:${contactAddr()}">${contactAddr()}</a></p>
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
      <h2>Arvo <span class="muted">— WAR-tyyliset kertyvät mittarit</span></h2>
      <p class="sub">Toisin kuin indeksit (per vuoro), nämä <em>kertyvät</em>: peliaika kasvattaa arvoa. Juoksuarvot johdetaan sarjan omasta juoksuympäristöstä (ridge-regressio joukkuetotaaleista), ei MLB:n painoista.</p>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('JYK','<code>juoksuarvo − korvaajataso × vuorot</code>','Juoksut Yli Korvaajan — juoksut yli vapaasti saatavilla olevan pelaajan') +
          gr('VYK','<code>JYK / (juoksut per ottelu)</code>','Voitot Yli Korvaajan — WAR-vastine; kertyvä kokonaisarvo voittoina') +
          gr('RAA','<code>juoksuarvo − sarjataso × vuorot</code>','juoksut yli sarjan keskiarvon (ei korvaajatasoa)')
        )}
        <p class="legend" style="padding:10px 16px">Ensimmäinen versio olemassa olevista koosterivistä; tarkentuu RE24-malliin kun syöttö-syötöltä-data on käytössä.</p>
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
      <h2>Lukkari <span class="muted">— juoksujenesto</span></h2>
      <div class="card" style="padding:0;overflow-x:auto">
        ${gtable(
          gr('LRA','<code>päästetyt juoksut / lukkariottelut</code>','lukkarin joukkueen päästämät juoksut per ottelu (ERA-vastine)') +
          gr('LRA-','<code>100 × LRA / sarjan LRA</code>','100 = keskiarvo, pienempi parempi') +
          gr('RP','<code>(sarjan LRA − LRA) × lukkariottelut</code>','juoksut estetty yli keskiarvon; kertyvä, suurempi parempi')
        )}
        <p class="legend" style="padding:10px 16px">ERA-tyylinen silta olemassa olevista otteluriveistä; tarkentuu kun syöttö-syötöltä-data on käytössä.</p>
      </div>
      <h2>Paikat <span class="muted">— pesäpallo → baseball</span></h2>
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
      if (params.view === 'lukkari') {
        await showLukkarit(sid);
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
