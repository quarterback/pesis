'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   PRIMER / OPAS — two-way starter guide.

   Two audiences × two languages:
     for=baseball  →  "I know baseball, explain pesäpallo (and Mallo's stats)"
     for=pesis     →  "Tunnen pesiksen — mitä sabermetriikka on ja mitä
                       baseball-luvut tarkoittavat?"
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
    <p class="sub">The game in 90 seconds, the box score decoded, and Mallo's stats in MLB terms.</p>
    <div class="prose">
      <h2>Same revolution, new sport</h2>
      <p class="lead">Sabermetrics changed how baseball sees its players. Mallo runs the same
      playbook for pesäpallo: measure what wins games, index it to the league, and let the
      numbers introduce you to players the highlight reel skips.</p>

      <h2>The game in 90 seconds</h2>
      <p>Lauri "Tahko" Pihkala built pesäpallo in the 1920s after studying American baseball.
      Same DNA: bat, ball, bases, runs. Different physics.</p>
      <p><strong>The pitch goes straight up.</strong> The pitcher (<em>lukkari</em>) stands at
      the plate, faces the batter, and lofts the ball overhead. Everyone makes contact. The
      skill is placement — steering the ball where the defense is thin so runners move.</p>
      <p><strong>The bases zig-zag.</strong> First base sits up the left line, second across on
      the right, third deep on the left. Every advance is a footrace.</p>
      <p><strong>Two ways off the field.</strong> A burn (<em>palo</em>) is the out: the ball
      beats the runner to the base. A caught fly wounds (<em>haava</em>) the batter and anyone
      advancing — the wounded leave the bases while the out counter stays put. Three burns end
      the half-inning.</p>
      <p><strong>Homers stay in the park.</strong> A <em>kunnari</em> means the batter circles
      all three bases on their own hit. League leaders hit about five a season, and every one
      is a sprint.</p>
      <p><strong>Structure.</strong> Two periods of four innings each; win both periods and you
      win the game. Ties go to an extra inning, then a hitting contest. Nine fielders play
      defense, and up to three <em>jokers</em> join the lineup as bench bats who only hit. The
      manager calls every play by waving a giant multicolored fan.</p>

      <h2>Reading the box score</h2>
    </div>
    ${_primerTable(['Pesis stat','MLB idea','What it is'], [
      ['Vuorot (V)','PA','Turns at bat.'],
      ['Kärkilyönti (KL)','Base hit','The core batting event: a hit that moves the lead runner. One turn can produce several.'],
      ['KL%','AVG','Hits per attempt — the sport’s batting average. League average sits near .530 and stars clear .600.'],
      ['Kunnari (K)','HR','An inside-the-park homer: the batter rounds every base on their own hit.'],
      ['Lyödyt (L)','RBI','Runs batted home.'],
      ['Tuodut (T)','R','Runs scored. Every run pairs one lyöty with one tuotu.'],
      ['Tehot','R + RBI','K + L + T — the traditional headline stat, like reading R+RBI off the back of a baseball card.'],
      ['Palot','K%','Times burned. The out you handed the defense.'],
    ])}
    <div class="prose">
      <h2>Mallo's advanced stats</h2>
      <p>The FanGraphs toolkit, translated:</p>
    </div>
    ${_primerTable(['Mallo stat','MLB analog','How to read it'], [
      ['TEHO+','wRC+','Production per turn, indexed to league. 100 = average; the leaders run 250–350.'],
      ['VYK','WAR','<em>Voitot Yli Korvaajan</em> — wins above replacement. Total value in wins, and the site’s default leaderboard.'],
      ['JYK','RAR','Runs above replacement, priced from the league’s own run environment.'],
      ['SPARK','—','Table-setter index: advancement, baserunning, and out avoidance in one number. Think "leadoff score".'],
      ['ADV+ / RUN+ / OUT+','—','SPARK’s parts: value at the plate, value as a runner, out avoidance. 100 = average.'],
      ['KOTI-KL+','Clutch','Scoring advances — lead runner home — versus league.'],
      ['PARE','Steamer / ZiPS','The projection: full career, recent games weighted, regressed to league.'],
      ['LRA / LRA- / RP','ERA / ERA- / runs saved','Run prevention for the lukkari: runs allowed per game, its league index, and cumulative runs prevented.'],
      ['PF / kTEHO+','Park factor','Ballpark run environments (100 = neutral) and TEHO+ corrected for them.'],
    ])}
    <div class="prose">
      <h2>Positions</h2>
    </div>
    ${_primerTable(['Pesis','Baseball code','Note'], [
      ['Lukkari (L)','P','The pitcher and the defense’s quarterback, stationed at the plate.'],
      ['Sieppari (S)','C','Fields the zone behind the batter.'],
      ['1V / 2V / 3V','1B / 2B / 3B','The basemen.'],
      ['3P / 2P','LSS / RSS','Left and right shortstop — two middle infielders.'],
      ['3K / 2K','LF / RF','The outfield.'],
      ['Jokeri (J)','DH','Bats only.'],
    ])}
    <div class="prose">
      <h2>One note on scales</h2>
      <p>Pesäpallo rates live on their own scales: league-average KL% sits near .530, with
      spreads about four times wider than MLB batting average. The <strong>⚾ button</strong> on
      every player page converts a player's league standing onto MLB scales — AVG, wRC+,
      ERA — so your baseball brain can price them instantly.</p>
      <p>Formulas live under <a href="#/glossary">Kaava</a>. Tap the small <strong>ⓘ</strong>
      next to any stat on the site for a quick explainer.</p>
    </div>`;
}

function _primerBaseballFI() {
  return `
    <h1>Pesäpallo baseball-faneille</h1>
    <p class="sub">Peli 90 sekunnissa, tilastorivi avattuna ja Mallon mittarit MLB-termein.</p>
    <div class="prose">
      <h2>Sama vallankumous, uusi laji</h2>
      <p class="lead">Sabermetriikka muutti tavan, jolla baseball näkee pelaajansa. Mallo ajaa
      saman pelikirjan pesäpalloon: mittaa se mikä voittaa, indeksoi se sarjaan ja anna lukujen
      esitellä pelaajat, jotka kohokohtakooste ohittaa.</p>

      <h2>Peli 90 sekunnissa</h2>
      <p>Lauri "Tahko" Pihkala rakensi pesäpallon 1920-luvulla amerikkalaisen baseballin
      pohjalta. Sama DNA: maila, pallo, pesät, juoksut. Eri fysiikka.</p>
      <p><strong>Syöttö nousee suoraan ylös.</strong> Lukkari seisoo kotipesällä lyöjää
      vastapäätä ja heittää pallon ilmaan. Jokainen osuu. Taito on sijoittelussa — pallo
      ohjataan sinne, missä puolustus on ohuimmillaan, jotta etenijät liikkuvat.</p>
      <p><strong>Pesät kulkevat siksakkia.</strong> Ykköspesä on vasemmalla, kakkonen oikealla,
      kolmonen syvällä vasemmalla. Jokainen eteneminen on juoksukilpailu.</p>
      <p><strong>Kaksi tapaa poistua kentältä.</strong> Palo on ulos: pallo ehtii pesälle ennen
      etenijää. Koppi haavoittaa lyöjän ja etenemässä olleet — haavoittuneet poistuvat pesiltä
      ja palolaskuri pysyy paikallaan. Kolme paloa päättää vuoron.</p>
      <p><strong>Kunnarit pysyvät kentällä.</strong> Kunnarissa lyöjä kiertää kaikki pesät
      omalla lyönnillään. Sarjan kärkinimi lyö niitä noin viisi kaudessa, ja jokainen on
      pikajuoksu.</p>
      <p><strong>Rakenne.</strong> Kaksi jaksoa, kummassakin neljä vuoroparia; kaksi
      jaksovoittoa vie ottelun. Tasatilanteessa pelataan supervuoro ja sitten
      kotiutuslyöntikilpailu. Ulkokentällä pelaa yhdeksän, ja lyöntijärjestykseen mahtuu
      lisäksi kolme jokeria. Pelinjohtaja ohjaa jokaisen tilanteen viuhkalla.</p>

      <h2>Tilastorivi avattuna</h2>
    </div>
    ${_primerTable(['Pesistilasto','MLB-käsite','Mitä se on'], [
      ['Vuorot (V)','PA','Lyöntivuorot.'],
      ['Kärkilyönti (KL)','Lyönti (hit)','Perustapahtuma: lyönti, joka liikuttaa kärkietenijää. Yksi vuoro voi tuottaa useita.'],
      ['KL%','AVG','Onnistumiset per yritys — lajin lyöntikeskiarvo. Sarjan keskitaso ~.530, tähdet .600+.'],
      ['Kunnari (K)','HR','Sisäkenttäkunnari: lyöjä kiertää pesät omalla lyönnillään.'],
      ['Lyödyt (L)','RBI','Kotiin lyödyt juoksut.'],
      ['Tuodut (T)','R','Itse juostut juoksut. Jokainen juoksu tuottaa yhden lyödyn ja yhden tuodun.'],
      ['Tehot','R + RBI','K + L + T — perinteinen tuotantoluku.'],
      ['Palot','K%','Montako kertaa pelaaja paloi.'],
    ])}
    <div class="prose">
      <h2>Mallon mittarit</h2>
      <p>FanGraphs-työkalupakki käännettynä:</p>
    </div>
    ${_primerTable(['Mallo','MLB-vastine','Lukuohje'], [
      ['TEHO+','wRC+','Tuotanto per vuoro sarjaan indeksoituna. 100 = keskitaso; kärki 250–350.'],
      ['VYK','WAR','Voitot Yli Korvaajan — kokonaisarvo voittoina. Sivuston oletuslista.'],
      ['JYK','RAR','Juoksut yli korvaajatason, hinnoiteltuna sarjan omasta juoksuympäristöstä.'],
      ['SPARK','—','Kärjenrakentajan indeksi: eteneminen, juokseminen ja palojen välttäminen yhdessä luvussa.'],
      ['ADV+ / RUN+ / OUT+','—','SPARKin osat: arvo lyöjänä, arvo etenijänä, palojen välttäminen. 100 = keskitaso.'],
      ['KOTI-KL+','Clutch','Kotiuttavat kärkilyönnit suhteessa sarjaan.'],
      ['PARE','Steamer / ZiPS','Ennuste: koko ura, tuoreet ottelut painotettuina, regressoituna sarjatasoon.'],
      ['LRA / LRA- / RP','ERA / ERA- / runs saved','Lukkarin juoksujenesto: päästetyt per ottelu, sarjaindeksi ja estetyt juoksut.'],
      ['PF / kTEHO+','Park factor','Kenttäkertoimet (100 = neutraali) ja niillä korjattu TEHO+.'],
    ])}
    <div class="prose">
      <h2>Huomio asteikoista</h2>
      <p>Pesistilastot elävät omilla asteikoillaan: KL%-keskitaso on ~.530 ja hajonta noin neljä
      kertaa MLB:n lyöntikeskiarvoa leveämpi. Pelaajasivun <strong>⚾-nappi</strong> kääntää
      pelaajan sarjatason MLB-asteikoille. Kaavat löytyvät <a href="#/glossary">Kaava-sivulta</a>,
      ja jokaisen tilaston pikaselitys aukeaa <strong>ⓘ</strong>-napista.</p>
    </div>`;
}

/* ── Pesis-fan track ─────────────────────────────────────────────────────── */

function _primerPesisFI() {
  return `
    <h1>Sabermetriikka pesisfanille</h1>
    <p class="sub">Miksi edistyneet tilastot ovat olemassa, mitä ne ovat tehneet muille lajeille — ja mitä nämä baseball-luvut tarkoittavat.</p>
    <div class="prose">
      <h2>Mistä on kyse?</h2>
      <p class="lead">Sabermetriikka syntyi yhdestä kysymyksestä: mikä oikeasti voittaa
      otteluita? Bill James alkoi 1970-luvulla laskea baseballia uudelleen ja huomasi, että
      moni kuuluisa tilasto mittasi mainetta — ja moni huomaamaton pelaaja voitti pelejä.</p>
      <p>Vuoden 2002 Oakland Athletics rakensi pikkubudjetilla voittajan näiden oppien varaan.
      Tarina tunnetaan nimellä <em>Moneyball</em>. Nykyään jokaisella MLB-seuralla on
      analytiikkaosasto, ja sama ajattelu on levinnyt kaikkialle: koripallo löysi kolmosen
      arvon ja rakensi hyökkäyksensä uusiksi, jalkapallo mittaa maaliodottamaa (xG), jääkiekko
      laskee kiekonhallintaa. Kaava on joka lajissa sama: mittaa se mikä voittaa, indeksoi se
      sarjaan ja anna lukujen paljastaa pelaajat, jotka silmä ohittaa.</p>

      <h2>Mitä tämä antaa pesikselle?</h2>
      <p>Perinteinen rivi — kunnarit, lyödyt, tuodut — palkitsee lyöntijärjestyksen loppupään
      tykit. Iso osa pesäpalloa tapahtuu muualla: kärjen etenemisessä, palojen välttämisessä,
      etenijän jaloissa. Mallon mittarit antavat sille työlle arvon.</p>
      <p><strong>SPARK</strong> nostaa esiin kärjenrakentajat. <strong>VYK</strong> laskee
      pelaajan koko arvon voittoina, jolloin ykkösvaihdon tykkiä ja kakkosvaihdon moottoria voi
      vertailla samalla luvulla. <strong>PARE</strong> kertoo pelaajan tason juuri nyt koko
      uran painolla. Vertailu toimii yli kausien ja sarjojen — ja roolipelaaja saa vihdoin
      numeron, joka näyttää, miksi pelinjohtaja luottaa häneen.</p>

      <h2>Baseball-sanasto</h2>
    </div>
    ${_primerTable(['Baseball-termi','Pesis-vastine','Selitys'], [
      ['AVG','KL%','Lyöntikeskiarvo. MLB:n keskitaso on ~.250 ja KL%:n ~.530 — käännetty luku asuu pienemmällä asteikolla.'],
      ['H (hits)','Kärkilyönnit','Onnistuneet lyönnit. H/600 PA ≈ täyden MLB-kauden lyöntimäärä.'],
      ['RBI','Lyödyt','Kotiin lyödyt juoksut.'],
      ['R (runs)','Tuodut','Itse juostut juoksut.'],
      ['K%','Palo-%','Kuinka usein vuoro päättyy omaan paloon. Pienempi on parempi.'],
      ['PA','Vuorot','Lyöntivuorot. /600 PA = täysi MLB-kausi.'],
      ['wRC+','TEHO+','Kokonaistuotanto indeksinä: 100 = keskitaso, 147 lukee "MVP-kandidaatti".'],
      ['WAR','VYK','Wins Above Replacement — kokonaisarvo voittoina yli vapaasti saatavilla olevan pelaajan. Mallon VYK on saman idean pesistoteutus.'],
      ['ERA / ERA-','LRA / LRA-','Lukkarin päästetyt juoksut per ottelu ja sama sarjaindeksinä. 2.90 lukee "ykköslukkari".'],
      ['DH','Jokeri','Lyöjä ilman kenttäpaikkaa.'],
      ['Percentile','Prosenttipiste','Pelaajan sijainti sarjan vakiopelaajien joukossa: 92 = parempi kuin 92 % vertailujoukosta.'],
    ])}
    <div class="prose">
      <h2>Miten ⚾-käännös toimii?</h2>
      <p>Pelaajasivun ⚾-kortti näyttää, miltä pelaajan taso näyttäisi MLB-asteikoilla.
      Pelaajan prosenttipiste Superpesiksen vakiopelaajien joukossa luetaan samalta kohdalta
      MLB-jakaumaa: sarjansa 92. prosenttipisteen lyöjä lukee ".290:n MLB-lyöjä". Se on väite
      pelaajan tasosta omassa sarjassaan, baseball-fanin asteikolla.</p>

      <h2>Mallon omat mittarit</h2>
      <p>Sivuston listat mittaavat asioita, jotka perinteinen rivi ohittaa:</p>
    </div>
    ${_primerTable(['Mittari','Kysymys johon se vastaa','Lukuohje'], [
      ['VYK / JYK','Kuinka arvokas pelaaja on kokonaisuutena?','Kertyvät arvomittarit: voitot ja juoksut yli korvaajatason. Peliaika kasvattaa arvoa.'],
      ['TEHO+','Kuinka tehokas lyöjä per vuoro?','100 = sarjan keskitaso. Riippumaton peliajasta.'],
      ['SPARK','Kuinka hyvä kärjenrakentaja?','Yhdistää etenemisen lyöjänä (ADV+), etenijänä (RUN+) ja palojen välttämisen (OUT+).'],
      ['1 % / 2 % / 3 % / K %','Miltä pesältä pelaaja etenee kärkeä?','Viralliset splitit: 1→2, 2→3, 3→koti ja kotiutus. Plus-versiot indeksoivat sarjaan.'],
      ['PARE','Mikä on pelaajan todellinen taso juuri nyt?','Ennuste koko urasta, tuoreet ottelut painotettuina.'],
      ['LRA / RP','Kuinka hyvin lukkari estää juoksuja?','Päästetyt juoksut per ottelu ja estetyt juoksut yli sarjatason.'],
      ['PF / kTEHO+','Paljonko kotikenttä vaikuttaa?','Kenttäkerroin 100 = neutraali; kTEHO+ poistaa kenttien vaikutuksen.'],
    ])}
    <div class="prose">
      <p>Tarkat kaavat: <a href="#/glossary">Kaava</a>. Pikaselitys jokaisesta tilastosta
      aukeaa <strong>ⓘ</strong>-napista taulukoissa ja pelaajasivuilla.</p>
    </div>`;
}

function _primerPesisEN() {
  return `
    <h1>Sabermetrics for pesis fans</h1>
    <p class="sub">Why advanced stats exist, what they did for other sports — and what the baseball numbers on this site mean.</p>
    <div class="prose">
      <h2>What is this about?</h2>
      <p class="lead">Sabermetrics started with one question: what actually wins games? In the
      1970s Bill James began recounting baseball and found that famous stats measured fame —
      while quiet players won games.</p>
      <p>The 2002 Oakland Athletics built a winner on a small budget using those lessons. The
      story became <em>Moneyball</em>. Today every MLB club runs an analytics department, and
      the same thinking spread everywhere: basketball found the value of the three-pointer and
      rebuilt its offense, soccer measures expected goals (xG), hockey counts puck possession.
      The formula is identical in every sport: measure what wins, index it to the league, and
      let the numbers reveal the players the eye skips.</p>

      <h2>What does it give pesäpallo?</h2>
      <p>The traditional line — kunnarit, lyödyt, tuodut — rewards the sluggers at the back of
      the order. A huge share of pesäpallo happens elsewhere: advancing the lead runner,
      avoiding burns, running the bases. Mallo's metrics put a value on that work.</p>
      <p><strong>SPARK</strong> spotlights the table-setters. <strong>VYK</strong> prices a
      player's whole contribution in wins, so a slugger and a leadoff engine compare on one
      number. <strong>PARE</strong> tells you a player's true level right now, weighted by the
      whole career. Comparisons work across seasons and leagues — and the role player finally
      gets a number that shows why the manager trusts them.</p>

      <h2>The baseball vocabulary</h2>
    </div>
    ${_primerTable(['Baseball term','Pesis counterpart','Meaning'], [
      ['AVG','KL%','Batting average. MLB average sits near .250 and KL% near .530 — the translated number lives on a smaller scale.'],
      ['H (hits)','Kärkilyönnit','Successful hits. H/600 PA ≈ a full MLB season’s hit total.'],
      ['RBI','Lyödyt','Runs batted home.'],
      ['R (runs)','Tuodut','Runs scored as a runner.'],
      ['K%','Palo-%','How often a turn ends in your own burn. Lower is better.'],
      ['PA','Vuorot','Turns at bat. /600 PA = a full MLB season.'],
      ['wRC+','TEHO+','Total production as an index: 100 = average, 147 reads "MVP candidate".'],
      ['WAR','VYK','Wins Above Replacement — total value in wins over a freely available player. Mallo’s VYK is the same idea built for pesis.'],
      ['ERA / ERA-','LRA / LRA-','Pitcher runs allowed per game and its league index. 2.90 reads "ace".'],
      ['DH','Jokeri','A batter with no fielding position.'],
      ['Percentile','Prosenttipiste','A player’s place in the qualified pool: 92 = better than 92% of it.'],
    ])}
    <div class="prose">
      <h2>How the ⚾ translation works</h2>
      <p>The ⚾ card on a player page shows what the player's level would look like on MLB
      scales. Their percentile among qualified Superpesis players is read off at the same
      percentile of the MLB distribution: a 92nd-percentile hitter reads "a .290 MLB bat". It
      is a statement about standing in their own league, on a scale baseball fans know.</p>

      <h2>Mallo's own metrics</h2>
      <p>The leaderboards measure what the traditional line skips:</p>
    </div>
    ${_primerTable(['Metric','The question it answers','How to read'], [
      ['VYK / JYK','How valuable is the player overall?','Cumulative value: wins and runs above replacement. Playing time accrues value.'],
      ['TEHO+','How productive per turn?','100 = league average. Independent of playing time.'],
      ['SPARK','How good a table-setter?','Blends advancement at the plate (ADV+), as a runner (RUN+), and out avoidance (OUT+).'],
      ['1 % / 2 % / 3 % / K %','From which base does the player advance the lead runner?','Official splits: 1→2, 2→3, 3→home, scoring. The plus versions index them to league.'],
      ['PARE','What is the player’s true level right now?','A projection from the full career, recent games weighted.'],
      ['LRA / RP','How well does the lukkari prevent runs?','Runs allowed per game and runs prevented above league.'],
      ['PF / kTEHO+','How much does the ballpark matter?','Park factor 100 = neutral; kTEHO+ strips park effects out.'],
    ])}
    <div class="prose">
      <p>Exact formulas: <a href="#/glossary">Kaava</a>. A quick explainer for every stat opens
      from the <strong>ⓘ</strong> button in tables and on player pages.</p>
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
