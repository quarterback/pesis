'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   PRIMER / OPAS — two-way starter guide.

   Two audiences × two languages:
     for=baseball  →  "I know baseball, explain pesäpallo (and Mallo's stats)"
     for=pesis     →  "Tunnen pesiksen — mitä nämä baseball-luvut tarkoittavat?"
   Each audience readable in both EN and FI (#/primer?for=…&lang=…).

   Content lives here as data; showPrimer() is called from the router in
   app.js. Tables reuse the glossary's .gloss styling.
══════════════════════════════════════════════════════════════════════════ */

function _primerTable(head, rows) {
  const body = rows.map(r => `<tr>
      <td class="name">${r[0]}</td>
      <td style="text-align:left">${r[1]}</td>
      <td style="text-align:left;white-space:normal;color:var(--ink3)">${r[2]}</td>
    </tr>`).join('');
  return `<div class="card" style="padding:0;overflow-x:auto">
    <table class="gloss">
      <colgroup><col class="c-stat"><col class="c-form"><col class="c-note"></colgroup>
      <thead><tr><th class="name">${head[0]}</th><th class="name">${head[1]}</th><th class="name">${head[2]}</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
}

/* ── Baseball-fan track ──────────────────────────────────────────────────── */

function _primerBaseballEN() {
  return `
    <h1>Pesäpallo for baseball fans</h1>
    <p class="sub">Everything you need to read this site — the game in 90 seconds, the box score decoded, and Mallo's sabermetrics in MLB terms.</p>
    <div class="prose">
      <h2>The game in 90 seconds</h2>
      <p class="lead">Pesäpallo ("Finnish baseball") was created in the early 1920s by Lauri "Tahko"
      Pihkala, who studied American baseball and redesigned it around speed and tactics.
      Same DNA — bat, ball, bases, runs — different physics.</p>
      <p><strong>The pitch is vertical.</strong> The pitcher (<em>lukkari</em>) stands at the plate
      facing the batter and tosses the ball straight up. Contact is easy; the battle is about
      <em>placement</em> — hitting the ball where the defense isn't, so runners can advance.
      Think situational hitting as the entire offensive game.</p>
      <p><strong>The bases zig-zag.</strong> First base is up the left line, second is across on the
      right, third is back deep on the left. Runners sprint diagonals, and every advance is
      contested — there are no easy station-to-station trots.</p>
      <p><strong>Outs work differently.</strong> A runner is out (<em>palo</em>, "burned") when the
      ball is played to the base before them. A caught fly is <em>not</em> an out: it "wounds"
      (<em>haava</em>) the batter and any advancing runners — they leave the base paths, but it
      doesn't count toward the three outs that end the half-inning.</p>
      <p><strong>A home run stays in the park.</strong> A <em>kunnari</em> means the batter rounds
      all three bases and gets home on their own hit before the defense can play the ball back.
      Every homer is an inside-the-park homer; a season leader hits maybe five.</p>
      <p><strong>Structure:</strong> a game is two periods of four innings each — win both periods
      and you win the game (ties go to an extra inning, then a home-run hitting contest). The
      lineup has nine fielders plus up to three <em>jokers</em>, extra batters who only hit —
      DH energy. The offense is conducted in real time by the manager waving a giant
      multicolored fan. Yes, really.</p>

      <h2>Reading the box score</h2>
    </div>
    ${_primerTable(['Pesis stat','Nearest MLB idea','What it actually is'], [
      ['Vuorot (V)','PA','Turns at bat.'],
      ['Kärkilyönti (KL)','Base hit','The core batting event: a hit that advances the lead runner. One turn at bat can produce several.'],
      ['KL%','AVG','Kärkilyönnit ÷ attempts — the sport’s batting average. <strong>League average is ~.530</strong>, not .250, and stars run .600+. Don’t read it on the MLB scale.'],
      ['Kunnari (K)','HR','Inside-the-park home run — batter circles all bases on their own hit. Structurally rare.'],
      ['Lyödyt (L)','RBI','Runs batted home: the batter whose hit brings a runner in gets the lyöty.'],
      ['Tuodut (T)','R','Runs scored: the runner who crosses home gets the tuotu. Every run = exactly one lyöty + one tuotu.'],
      ['Tehot','R + RBI','K + L + T — the traditional headline production stat, like reading R+RBI off a baseball card.'],
      ['Palot','Outs / K%','Times the player was burned. The out you gave away — strikeout rate is its spiritual twin.'],
    ])}
    <div class="prose">
      <h2>Mallo's advanced stats</h2>
      <p>Mallo exists to bring the sabermetric toolkit to pesäpallo. If you know FanGraphs,
      you already know how to read these:</p>
    </div>
    ${_primerTable(['Mallo stat','MLB analog','How to read it'], [
      ['TEHO+','wRC+ / OPS+','Production per turn, indexed to league (100 = average). Superpesis production concentrates at the top of the order, so the leaders run ~250–350.'],
      ['VYK','WAR','<em>Voitot Yli Korvaajan</em> — wins above replacement. Cumulative value in wins; the site’s default leaderboard.'],
      ['JYK','RAR','<em>Juoksut Yli Korvaajan</em> — runs above replacement, derived from the league’s own run environment (not MLB weights).'],
      ['SPARK','—','A table-setter composite (advancement + baserunning + out-avoidance). No MLB equivalent — think "leadoff index".'],
      ['ADV+ / RUN+ / OUT+','—','SPARK’s components: batter advancement value, runner value, out-avoidance. All 100 = league average.'],
      ['KOTI-KL+','"Clutch"','Scoring-advance hits (lead runner home) vs league — situational scoring skill.'],
      ['PARE','Steamer / ZiPS','Projection: exponentially weighted career history regressed to league average. The "e" stats (eKL%, eTEHO+) are its outputs.'],
      ['LRA / LRA- / RP','ERA / ERA- / runs saved','Pitcher run prevention: runs allowed per game, its league index (lower = better), and cumulative runs prevented.'],
      ['PF / kTEHO+','Park factor / park-adjusted','Ballpark run environments (100 = neutral) and TEHO+ corrected for them.'],
    ])}
    <div class="prose">
      <h2>Positions</h2>
    </div>
    ${_primerTable(['Pesis','Baseball code','Note'], [
      ['Lukkari (L)','P','The pitcher — also the defensive quarterback, playing at the plate.'],
      ['Sieppari (S)','C','Catcher-ish: fields the area behind the batter.'],
      ['1V / 2V / 3V','1B / 2B / 3B','Basemen ("guards").'],
      ['3P / 2P','LSS / RSS','Left / right shortstop — two middle infielders.'],
      ['3K / 2K','LF / RF','Left / right outfield.'],
      ['Jokeri (J)','DH','Bats, doesn’t field.'],
    ])}
    <div class="prose">
      <h2>One warning about scales</h2>
      <p>Pesäpallo rate stats live on their own scales: league-average KL% is ~.530 and spreads are
      about four times wider than MLB batting-average spreads. When you want a player expressed in
      numbers your baseball brain can parse, open their player page and hit the <strong>⚾ button</strong> —
      it maps their league standing onto MLB scales (AVG, wRC+, ERA) honestly, without claiming the
      skills would transfer.</p>
      <p>Formulas for everything live under <a href="#/glossary">Kaava</a>.</p>
    </div>`;
}

function _primerBaseballFI() {
  return `
    <h1>Pesäpallo baseball-faneille</h1>
    <p class="sub">Kaikki mitä tarvitset tämän sivuston lukemiseen — peli 90 sekunnissa, tilastorivi avattuna ja Mallon mittarit MLB-termein.</p>
    <div class="prose">
      <h2>Peli 90 sekunnissa</h2>
      <p class="lead">Lauri "Tahko" Pihkala kehitti pesäpallon 1920-luvun alussa amerikkalaisen
      baseballin pohjalta — sama DNA (maila, pallo, pesät, juoksut), eri fysiikka.</p>
      <p><strong>Syöttö on pystysuora.</strong> Lukkari seisoo kotipesällä lyöjää vastapäätä ja
      syöttää pallon suoraan ylös. Osuminen on helppoa; taistelu käydään <em>sijoittelusta</em> —
      lyönnistä sinne missä puolustus ei ole, jotta etenijät pääsevät liikkeelle.</p>
      <p><strong>Pesät kulkevat siksakkia.</strong> Ykköspesä on vasemmalla, kakkonen oikealla,
      kolmonen taas vasemmalla syvällä. Jokainen eteneminen on kamppailu.</p>
      <p><strong>Palot ja haavat:</strong> etenijä palaa, kun pallo ehtii pesälle ennen häntä.
      Ilmasta otettu koppi ei ole palo — se haavoittaa lyöjän ja etenemässä olleet, mutta ei
      kasvata vuoron kolmen palon laskuria.</p>
      <p><strong>Kunnari pysyy kentällä:</strong> lyöjä kiertää kaikki pesät omalla lyönnillään.
      Kauden kärkinimi lyö niitä ehkä viisi — baseballin kunnarimäärät eivät käänny tänne.</p>
      <p><strong>Rakenne:</strong> ottelussa kaksi jaksoa, kummassakin neljä vuoroparia; kaksi
      jaksovoittoa vie ottelun (tasatilanteessa supervuoro ja kotiutuslyöntikilpailu).
      Ulkokentällä pelaa yhdeksän, ja lyöntijärjestykseen mahtuu lisäksi enintään kolme jokeria —
      baseballin DH-henkeen. Pelinjohtaja ohjaa hyökkäystä viuhkalla.</p>
      <h2>Tilastorivi avattuna</h2>
    </div>
    ${_primerTable(['Pesistilasto','Lähin MLB-käsite','Mitä se oikeasti on'], [
      ['Vuorot (V)','PA','Lyöntivuorot.'],
      ['Kärkilyönti (KL)','Lyönti (hit)','Perustapahtuma: lyönti, joka etenee kärkietenijää. Yksi lyöntivuoro voi tuottaa useita.'],
      ['KL%','AVG','Kärkilyönnit ÷ yritykset — lajin lyöntikeskiarvo. <strong>Sarjan keskitaso ~.530</strong>, tähdet .600+.'],
      ['Kunnari (K)','HR','Sisäkenttäkunnari — lyöjä kiertää pesät omalla lyönnillään. Rakenteellisesti harvinainen.'],
      ['Lyödyt (L)','RBI','Kotiuttajan piste: lyöjä, jonka lyönnillä juoksu syntyy.'],
      ['Tuodut (T)','R','Juoksijan piste: kotipesään ehtinyt etenijä. Jokainen juoksu = tasan yksi lyöty + yksi tuotu.'],
      ['Tehot','R + RBI','K + L + T — perinteinen tuotantoluku.'],
      ['Palot','Outs / K%','Montako kertaa pelaaja paloi. Pienempi parempi.'],
    ])}
    <div class="prose">
      <h2>Mallon mittarit</h2>
      <p>Mallo tuo sabermetriikan työkalupakin pesäpalloon. Jos FanGraphs on tuttu, osaat lukea nämä:</p>
    </div>
    ${_primerTable(['Mallo','MLB-vastine','Tulkinta'], [
      ['TEHO+','wRC+ / OPS+','Tuotanto per vuoro sarjaan indeksoituna (100 = keskitaso; kärki ~250–350).'],
      ['VYK','WAR','Voitot Yli Korvaajan — kertyvä kokonaisarvo voittoina.'],
      ['JYK','RAR','Juoksut Yli Korvaajan — sarjan omasta juoksuympäristöstä johdettuna.'],
      ['SPARK','—','Kärjenrakentajan yhdistelmäindeksi (eteneminen + etenijänä + palojen välttäminen).'],
      ['ADV+ / RUN+ / OUT+','—','SPARKin osat; 100 = sarjan keskiarvo.'],
      ['KOTI-KL+','"Clutch"','Kotiuttavat kärkilyönnit suhteessa sarjaan.'],
      ['PARE','Steamer / ZiPS','Ennuste: painotettu urahistoria regressoituna sarjatasoon (e-alkuiset tilastot).'],
      ['LRA / LRA- / RP','ERA / ERA- / runs saved','Lukkarin juoksujenesto: päästetyt/ottelu, sarjaindeksi ja estetyt juoksut.'],
      ['PF / kTEHO+','Park factor','Kenttäkertoimet (100 = neutraali) ja niillä korjattu TEHO+.'],
    ])}
    <div class="prose">
      <h2>Asteikkovaroitus</h2>
      <p>Pesistilastot elävät omilla asteikoillaan: KL%-keskitaso on ~.530 ja hajonta noin neljä
      kertaa MLB:n lyöntikeskiarvoa leveämpi. Pelaajasivun <strong>⚾-napista</strong> saat pelaajan
      MLB-asteikoille käännettynä. Kaikki kaavat: <a href="#/glossary">Kaava</a>.</p>
    </div>`;
}

/* ── Pesis-fan track ─────────────────────────────────────────────────────── */

function _primerPesisFI() {
  return `
    <h1>Baseball-mittarit pesisfaneille</h1>
    <p class="sub">Mitä AVG, wRC+ ja WAR tarkoittavat — ja miksi Mallon luvut eivät ole pesistulokset-kopio.</p>
    <div class="prose">
      <h2>Miksi baseball-termejä?</h2>
      <p class="lead">Baseballissa on 50 vuoden perinne edistyneille tilastoille (sabermetrics):
      mittareille, jotka erottavat pelaajan oman tekemisen joukkueen ja sattuman vaikutuksesta.
      Mallo tuo saman ajattelun pesäpalloon — ja kääntää pelaajat myös MLB-asteikoille, jotta
      baseballia tuntevat voivat lukea heitä.</p>
      <h2>Baseball-sanasto suomeksi</h2>
    </div>
    ${_primerTable(['Baseball-termi','Pesis-vastine','Selitys'], [
      ['AVG','KL%','Lyöntikeskiarvo. <strong>MLB:n keskitaso on ~.250</strong> — siksi käännetty luku näyttää pesissilmään pieneltä, vaikka pelaaja olisi hyvä. KL%-keskitaso on ~.530: asteikot ovat eri planeetoilta.'],
      ['H (hits)','Kärkilyönnit','Onnistuneet lyönnit. Käännöksessä H/600 PA ≈ täyden MLB-kauden lyöntimäärä.'],
      ['HR','Kunnarit','Kunnaria ei käännetä suoraan — pesiksessä niitä lyödään murto-osa MLB:n määristä.'],
      ['RBI','Lyödyt','Kotiin lyödyt juoksut ("runs batted in").'],
      ['R (runs)','Tuodut','Itse juostut juoksut.'],
      ['K%','Palo-%','Kuinka usein lyöntivuoro päättyy omaan virheeseen. Pienempi parempi.'],
      ['PA','Vuorot','Lyöntivuorot ("plate appearances"). /600 PA = täysi MLB-kausi.'],
      ['wRC+','TEHO+','Kokonaislyöntituotanto indeksinä: 100 = keskitaso, 147 lukee "MVP-kandidaatti". Sarjan paras lyöjä, ei raakoja tehoja.'],
      ['WAR','VYK','Wins Above Replacement — pelaajan kokonaisarvo voittoina yli "vapaasti saatavilla olevan" pelaajan. Mallon VYK on saman idean pesistoteutus.'],
      ['ERA / ERA-','LRA / LRA-','Lukkarin päästetyt juoksut per ottelu ja sama sarjaindeksinä (100 = keskitaso, pienempi parempi). 2.90 lukee "ykköslukkari".'],
      ['DH','Jokeri','Lyöjä ilman kenttäpaikkaa.'],
      ['Percentile / prosenttipiste','—','Missä kohtaa sarjan vakiopelaajien jakaumaa pelaaja on: 92 = parempi kuin 92 % vertailujoukosta.'],
    ])}
    <div class="prose">
      <h2>Miten ⚾-käännös toimii?</h2>
      <p>Pelaajasivun ⚾-kortti ei väitä, että taidot siirtyisivät lajista toiseen. Se on
      <em>sijoituksen säilyttävä käännös</em>: pelaajan prosenttipiste Superpesiksen
      vakiopelaajien joukossa luetaan samalta kohdalta MLB:n jakaumaa. "Sarjan 92.
      prosenttipisteen lyöjä" muuttuu muotoon "lyö kuin .290:n MLB-lyöjä" — väite pelaajan
      tasosta omassa sarjassaan, baseball-fanin ymmärtämällä asteikolla. KL% käännetään suoraan
      AVG-asteikolle niin, että todelliset erot pelaajien välillä säilyvät.</p>
      <h2>Mallon omat mittarit</h2>
      <p>Sivuston listat eivät toista pesistulokset-palvelun laskureita (K/L/T), vaan mittaavat
      asioita, joita perinteinen rivi ei näytä:</p>
    </div>
    ${_primerTable(['Mittari','Kysymys johon se vastaa','Lukuohje'], [
      ['VYK / JYK','Kuinka arvokas pelaaja on kokonaisuutena?','Kertyvät arvomittarit (voitot/juoksut yli korvaajatason). Peliaika kasvattaa arvoa — sivuston oletusjärjestys.'],
      ['TEHO+','Kuinka tehokas lyöjä on per vuoro?','100 = sarjan keskitaso. Ei riipu peliajasta.'],
      ['SPARK','Kuinka hyvä kärjenrakentaja?','Yhdistää etenemisen lyöjänä (ADV+), etenijänä (RUN+) ja palojen välttämisen (OUT+).'],
      ['1 % / 2 % / 3 % / K %','Miltä pesältä pelaaja etenee kärkeä?','Viralliset splitit: 1→2, 2→3, 3→koti, kotiutus. Plus-versiot indeksoivat sarjaan.'],
      ['PARE','Mikä on pelaajan todellinen taso juuri nyt?','Ennuste koko urahistoriasta, tuoreet ottelut painotettuina — ei mielivaltaisia "viimeiset 10 ottelua" -rajauksia.'],
      ['LRA / RP','Kuinka hyvin lukkari estää juoksuja?','ERA-tyylinen silta kunnes syöttökohtainen data on saatavilla.'],
      ['PF / kTEHO+','Paljonko kotikenttä vaikuttaa?','Kenttäkerroin 100 = neutraali; kTEHO+ poistaa kenttien vaikutuksen.'],
    ])}
    <div class="prose">
      <p>Tarkat laskentakaavat löytyvät <a href="#/glossary">Kaava-sivulta</a>.</p>
    </div>`;
}

function _primerPesisEN() {
  return `
    <h1>The baseball metrics, for pesis fans</h1>
    <p class="sub">What AVG, wRC+ and WAR mean — and why Mallo's numbers aren't a pesistulokset clone.</p>
    <div class="prose">
      <h2>Why baseball terms at all?</h2>
      <p class="lead">Baseball has a 50-year tradition of advanced stats (sabermetrics): metrics
      that separate a player's own contribution from team context and luck. Mallo brings that
      thinking to pesäpallo — and also translates players onto MLB scales so baseball literates
      can read them.</p>
      <h2>The baseball vocabulary</h2>
    </div>
    ${_primerTable(['Baseball term','Pesis counterpart','Meaning'], [
      ['AVG','KL%','Batting average. <strong>MLB league average is ~.250</strong> — that’s why a translated value looks tiny to a pesis eye even for a good hitter. KL% averages ~.530; the scales are from different planets.'],
      ['H (hits)','Kärkilyönnit','Successful hits. H/600 PA ≈ a full MLB season’s hit total.'],
      ['HR','Kunnarit','Not translated directly — pesäpallo homers are a fraction of MLB volumes.'],
      ['RBI','Lyödyt','Runs batted in.'],
      ['R (runs)','Tuodut','Runs scored as a runner.'],
      ['K%','Palo-%','How often a turn ends in your own out. Lower is better.'],
      ['PA','Vuorot','Plate appearances; /600 PA = a full MLB season.'],
      ['wRC+','TEHO+','Total batting production as an index: 100 = average, 147 reads "MVP candidate" — best hitter in the league, not raw tehot.'],
      ['WAR','VYK','Wins Above Replacement — total value in wins over a freely available player. Mallo’s VYK is the same idea built for pesis.'],
      ['ERA / ERA-','LRA / LRA-','Pitcher runs allowed per game and its league index (100 = average, lower better). 2.90 reads "ace".'],
      ['DH','Jokeri','A batter with no fielding position.'],
      ['Percentile','Prosenttipiste','Where a player sits in the qualified-player distribution: 92 = better than 92% of the pool.'],
    ])}
    <div class="prose">
      <h2>How the ⚾ translation works</h2>
      <p>The ⚾ card on a player page makes no claim that skills transfer between sports. It is a
      <em>rank-preserving translation</em>: the player's percentile among qualified Superpesis
      players is read off at the same percentile of the MLB distribution. "A 92nd-percentile
      hitter in his league" becomes "hits like a .290 MLB bat" — a statement about standing in
      his own league, on a scale baseball fans have intuition for. KL% maps straight onto the
      AVG scale so real gaps between hitters survive the trip.</p>
      <h2>Mallo's own metrics</h2>
      <p>The leaderboards deliberately don't repeat pesistulokset's counting columns (K/L/T) —
      they measure what the traditional line can't show:</p>
    </div>
    ${_primerTable(['Metric','The question it answers','How to read'], [
      ['VYK / JYK','How valuable is the player overall?','Cumulative value (wins/runs above replacement). Playing time accrues value — the site’s default sort.'],
      ['TEHO+','How productive per turn?','100 = league average. Playing-time independent.'],
      ['SPARK','How good a table-setter?','Blends advancement as batter (ADV+), as runner (RUN+), and out-avoidance (OUT+).'],
      ['1 % / 2 % / 3 % / K %','From which base does he advance the lead runner?','Official splits: 1→2, 2→3, 3→home, scoring. The plus versions index them to league.'],
      ['PARE','What is the player’s true level right now?','A projection from full career history with recent games weighted — no arbitrary "last 10 games" cutoffs.'],
      ['LRA / RP','How well does the lukkari prevent runs?','An ERA-style bridge until pitch-by-pitch data exists.'],
      ['PF / kTEHO+','How much does the ballpark matter?','Park factor 100 = neutral; kTEHO+ strips park effects out.'],
    ])}
    <div class="prose">
      <p>Exact formulas live on the <a href="#/glossary">Kaava page</a>.</p>
    </div>`;
}

/* ── Page shell: audience + language toggles ─────────────────────────────── */

function showPrimer(aud, lang) {
  aud = aud === 'pesis' ? 'pesis' : 'baseball';
  // natural defaults: baseball track → EN, pesis track → FI
  if (lang !== 'en' && lang !== 'fi') lang = aud === 'pesis' ? 'fi' : 'en';

  const audLabels = lang === 'fi'
    ? { baseball: '⚾ Baseball-fanille', pesis: '🥎 Pesisfanille' }
    : { baseball: '⚾ For baseball fans', pesis: '🥎 For pesis fans' };
  const audSeg = `<div class="seg">
    <a href="#/primer?for=baseball&lang=${lang}"${aud === 'baseball' ? ' class="on"' : ''}>${audLabels.baseball}</a>
    <a href="#/primer?for=pesis&lang=${lang}"${aud === 'pesis' ? ' class="on"' : ''}>${audLabels.pesis}</a>
  </div>`;
  const langSeg = `<div class="seg">
    <a href="#/primer?for=${aud}&lang=fi"${lang === 'fi' ? ' class="on"' : ''}>Suomeksi</a>
    <a href="#/primer?for=${aud}&lang=en"${lang === 'en' ? ' class="on"' : ''}>In English</a>
  </div>`;

  const body = aud === 'pesis'
    ? (lang === 'fi' ? _primerPesisFI() : _primerPesisEN())
    : (lang === 'fi' ? _primerBaseballFI() : _primerBaseballEN());

  main().innerHTML = `
    <div class="controls">${audSeg}<span class="spacer"></span>${langSeg}</div>
    <div class="page">${body}</div>`;
  window.scrollTo(0, 0);
}
