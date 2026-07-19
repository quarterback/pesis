'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   PRIMER / OPAS — two-way starter guide.

   Two audiences × two languages:
     for=baseball  →  explains pesäpallo and this site's stats to a baseball fan
     for=pesis     →  explains sabermetrics and the baseball terms to a pesis fan
   Each audience readable in both EN and FI (#/primer?for=…&lang=…).

   Entries render as a stacked definition list (.plist) instead of a
   three-column table so the page stays readable on phones. showPrimer() is
   called from the router in app.js.
══════════════════════════════════════════════════════════════════════════ */

function _primerList(rows) {
  const items = rows.map(r => `<div class="prow">
      <div class="ph"><span class="pt">${r[0]}</span>${r[1] ? `<span class="pe">${r[1]}</span>` : ''}</div>
      <div class="pn">${r[2]}</div>
    </div>`).join('');
  return `<div class="card plist">${items}</div>`;
}

/* ── Baseball-fan track ──────────────────────────────────────────────────── */

function _primerBaseballEN() {
  return `
    <h1>Pesäpallo for baseball fans</h1>
    <p class="sub">A guide to the game and to the stats on this site.</p>
    <div class="prose">
      <h2>The basics</h2>
      <p>Pesäpallo is Finland's national bat-and-ball sport. Lauri "Tahko" Pihkala developed it
      in the early 1920s after studying baseball in the United States, and the family
      resemblance is strong: one team bats while the other fields, runners advance around
      bases, and runs decide the game.</p>
      <p>The main difference is the pitch. The pitcher, called the lukkari, stands at home
      plate directly across from the batter and tosses the ball straight up in the air. Making
      contact is easy, so the game turns on where the batter places the ball and whether the
      runners can beat the throw to the next base.</p>
      <p>The bases are laid out in a zigzag rather than a diamond. First base is up the left
      side, second base is across on the right, and third base is deep on the left, so every
      advance means a long run and a real race with the throw.</p>
      <p>Outs work a little differently. A runner is out when the fielding team gets the ball
      to the base ahead of him; this is called a palo, and three of them end the half-inning.
      A caught fly ball instead "wounds" the batter and any runners who had left their base.
      They come off the base paths, but it does not count as one of the three outs.</p>
      <p>Home runs stay inside the field. On a kunnari, the batter rounds all three bases and
      reaches home on his own hit. League leaders typically finish a season with around
      five.</p>
      <p>Games are played in two periods of four innings each, and a team wins by taking both
      periods. If the periods split, the game goes to an extra inning and then a hitting
      contest. Each team fields nine players and can use up to three additional hitters,
      called jokers, in the batting order. The manager directs the offense from the sideline
      with a large fan, which serves the same purpose as a third-base coach's signs.</p>

      <h2>The traditional stats</h2>
    </div>
    ${_primerList([
      ['Vuorot (V)','PA','Turns at bat.'],
      ['Kärkilyönti (KL)','HIT','A hit that advances the lead runner. This is the basic offensive event, and a single turn at bat can produce more than one.'],
      ['KL%','AVG','Successful advances divided by attempts. This is the sport’s batting average. The league average is around .530, so the numbers run much higher than in baseball.'],
      ['Kunnari (K)','HR','A home run.'],
      ['Lyödyt (L)','RBI','Runs driven in.'],
      ['Tuodut (T)','R','Runs scored as a runner. Every run produces exactly one lyöty and one tuotu.'],
      ['Tehot','R + RBI','Kunnarit, lyödyt and tuodut added together. This is the traditional headline stat in pesäpallo.'],
      ['Palot','','Times the player was out. Fans read it much like a strikeout total.'],
    ])}
    <div class="prose">
      <h2>Mallo's stats</h2>
      <p>Most of the advanced stats on this site are modeled on familiar baseball metrics.</p>
    </div>
    ${_primerList([
      ['TEHO+','wRC+','Production per turn at bat, indexed to the league. 100 is average, and the top hitters land between 250 and 350.'],
      ['VYK','WAR','Wins above replacement. This is the site’s default leaderboard.'],
      ['JYK','RAR','Runs above replacement, based on run values from this league.'],
      ['SPARK','','A composite rating for table-setters that combines advancing runners, baserunning and avoiding outs.'],
      ['ADV+ / RUN+ / OUT+','','The three components of SPARK, each indexed to a league average of 100.'],
      ['KOTI-KL+','','How often a player’s hits bring the lead runner home, relative to the league.'],
      ['PARE','Steamer / ZiPS','The projection system. It weights a player’s full career with recent games counting most, then regresses toward the league average.'],
      ['LRA / LRA- / RP','ERA / ERA-','Run prevention for the lukkari: runs allowed per game, the same figure as a league index, and total runs prevented.'],
      ['PF / kTEHO+','Park factor','Ballpark effects, and TEHO+ adjusted for them.'],
    ])}
    <div class="prose">
      <h2>Positions</h2>
    </div>
    ${_primerList([
      ['Lukkari (L)','P','The pitcher, who also anchors the defense at home plate.'],
      ['Sieppari (S)','C','Covers the area behind the batter.'],
      ['1V / 2V / 3V','1B / 2B / 3B','The basemen.'],
      ['3P / 2P','LSS / RSS','Two shortstops, one on each side of the infield.'],
      ['3K / 2K','LF / RF','The outfielders.'],
      ['Jokeri (J)','DH','An extra hitter without a fielding position.'],
    ])}
    <div class="prose">
      <h2>The baseball card</h2>
      <p>Every player page has a ⚾ button that translates the player's numbers onto MLB
      scales. It works by percentile: the card finds where the player ranks among qualified
      Superpesis players and reads the same percentile off an MLB distribution. The result is
      a line you can read at a glance — batting average, wRC+, ERA — describing how good the
      player is in their own league.</p>
      <p>Formulas for every stat are on the <a href="#/glossary">Kaava</a> page, and the ⓘ
      button next to a stat anywhere on the site opens a short explanation.</p>
    </div>`;
}

function _primerBaseballFI() {
  return `
    <h1>Pesäpallo baseball-faneille</h1>
    <p class="sub">Opas peliin ja tämän sivuston tilastoihin.</p>
    <div class="prose">
      <h2>Perusasiat</h2>
      <p>Pesäpallo on Suomen kansallislaji. Lauri "Tahko" Pihkala kehitti sen 1920-luvun
      alussa tutkittuaan baseballia Yhdysvalloissa, ja sukulaisuus näkyy: toinen joukkue lyö
      ja toinen puolustaa, etenijät kiertävät pesiä ja juoksut ratkaisevat ottelun.</p>
      <p>Suurin ero on syötössä. Lukkari seisoo kotipesällä lyöjää vastapäätä ja syöttää
      pallon suoraan ylös. Osuminen on helppoa, joten ratkaisevaa on se, mihin lyöjä sijoittaa
      pallon ja ehtivätkö etenijät seuraavalle pesälle ennen palloa.</p>
      <p>Pesät kulkevat siksakkia eivätkä timantin muotoisesti. Ykköspesä on vasemmalla,
      kakkospesä oikealla ja kolmospesä syvällä vasemmalla, joten jokainen eteneminen on
      pitkä juoksu ja aito kilpailu heiton kanssa.</p>
      <p>Myös palot toimivat eri tavalla kuin baseballin ulosajot. Etenijä palaa, kun pallo
      ehtii pesälle ennen häntä, ja kolme paloa päättää vuoron. Ilmasta otettu koppi sen
      sijaan haavoittaa lyöjän ja pesältä lähteneet etenijät. He poistuvat pesiltä, mutta
      koppi ei kasvata palojen määrää.</p>
      <p>Kunnarit pysyvät kentän sisällä. Kunnarissa lyöjä kiertää kaikki kolme pesää ja
      ehtii kotiin omalla lyönnillään. Sarjan kärkinimet lyövät niitä kaudessa noin viisi.</p>
      <p>Ottelussa pelataan kaksi jaksoa, kummassakin neljä vuoroparia, ja voittoon tarvitaan
      molemmat jaksot. Tasatilanteessa pelataan supervuoro ja tarvittaessa
      kotiutuslyöntikilpailu. Ulkokentällä pelaa yhdeksän pelaajaa, ja lyöntijärjestykseen
      voi lisätä enintään kolme jokeria. Pelinjohtaja ohjaa hyökkäystä viuhkalla, joka ajaa
      saman asian kuin baseballin merkinanto.</p>

      <h2>Perinteiset tilastot</h2>
    </div>
    ${_primerList([
      ['Vuorot (V)','PA','Lyöntivuorot.'],
      ['Kärkilyönti (KL)','HIT','Lyönti, joka etenee kärkietenijää. Tämä on hyökkäyksen perustapahtuma, ja yksi lyöntivuoro voi tuottaa useamman.'],
      ['KL%','AVG','Onnistuneet etenemiset jaettuna yrityksillä. Tämä on lajin lyöntikeskiarvo, ja sarjan keskitaso on noin .530.'],
      ['Kunnari (K)','HR','Kunnari.'],
      ['Lyödyt (L)','RBI','Kotiin lyödyt juoksut.'],
      ['Tuodut (T)','R','Itse juostut juoksut. Jokainen juoksu tuottaa tasan yhden lyödyn ja yhden tuodun.'],
      ['Tehot','R + RBI','Kunnarit, lyödyt ja tuodut yhteenlaskettuina. Pesäpallon perinteinen päätilasto.'],
      ['Palot','','Montako kertaa pelaaja paloi.'],
    ])}
    <div class="prose">
      <h2>Mallon mittarit</h2>
      <p>Suurin osa sivuston edistyneistä tilastoista on rakennettu tuttujen
      baseball-mittarien mallin mukaan.</p>
    </div>
    ${_primerList([
      ['TEHO+','wRC+','Tuotanto lyöntivuoroa kohden sarjaan indeksoituna. 100 on keskitaso, ja kärkilyöjät liikkuvat välillä 250–350.'],
      ['VYK','WAR','Voitot yli korvaajatason. Sivuston oletuslista.'],
      ['JYK','RAR','Juoksut yli korvaajatason, laskettuna tämän sarjan juoksuarvoilla.'],
      ['SPARK','','Kärjenrakentajan kokonaisluku, joka yhdistää etenemisen lyöjänä, etenijänä ja palojen välttämisen.'],
      ['ADV+ / RUN+ / OUT+','','SPARKin kolme osaa, kukin indeksoituna sarjan keskiarvoon 100.'],
      ['KOTI-KL+','','Kuinka usein pelaajan lyönnit tuovat kärjen kotiin asti, suhteessa sarjaan.'],
      ['PARE','Steamer / ZiPS','Ennustejärjestelmä. Se painottaa koko uraa niin, että tuoreet ottelut painavat eniten, ja regressoi kohti sarjan keskitasoa.'],
      ['LRA / LRA- / RP','ERA / ERA-','Lukkarin juoksujenesto: päästetyt juoksut per ottelu, sama lukuna sarjaindeksinä ja estetyt juoksut yhteensä.'],
      ['PF / kTEHO+','Park factor','Kenttien vaikutus juoksumääriin ja TEHO+ sillä korjattuna.'],
    ])}
    <div class="prose">
      <h2>Pelipaikat</h2>
    </div>
    ${_primerList([
      ['Lukkari (L)','P','Syöttäjä, joka johtaa puolustusta kotipesältä.'],
      ['Sieppari (S)','C','Pelaa lyöjän takana olevan alueen.'],
      ['1V / 2V / 3V','1B / 2B / 3B','Pesävahdit.'],
      ['3P / 2P','LSS / RSS','Kaksi polttajaa sisäkentän molemmin puolin.'],
      ['3K / 2K','LF / RF','Kopparit.'],
      ['Jokeri (J)','DH','Lyöjä ilman kenttäpaikkaa.'],
    ])}
    <div class="prose">
      <h2>Baseball-kortti</h2>
      <p>Jokaisella pelaajasivulla on ⚾-nappi, joka kääntää pelaajan luvut MLB:n
      asteikoille. Käännös toimii prosenttipisteillä: kortti katsoo, mihin pelaaja sijoittuu
      Superpesiksen vakiopelaajien joukossa, ja lukee saman kohdan MLB:n jakaumasta.
      Tuloksena on rivi, jonka baseballia tunteva lukee yhdellä silmäyksellä.</p>
      <p>Kaikkien tilastojen kaavat ovat <a href="#/glossary">Kaava-sivulla</a>, ja tilaston
      vieressä oleva ⓘ-nappi avaa lyhyen selityksen missä tahansa sivustolla.</p>
    </div>`;
}

/* ── Pesis-fan track ─────────────────────────────────────────────────────── */

function _primerPesisFI() {
  return `
    <h1>Sabermetriikka pesisfanille</h1>
    <p class="sub">Mitä edistyneet tilastot ovat, mistä ne tulivat ja mitä tämän sivuston baseball-luvut tarkoittavat.</p>
    <div class="prose">
      <h2>Mistä on kyse</h2>
      <p>Sabermetriikka sai alkunsa 1970-luvulla, kun Bill James alkoi tutkia, mitkä
      baseballin tilastot oikeasti kertovat voittamisesta. Hän havaitsi, että moni arvostettu
      luku kertoi enemmän pelaajan maineesta ja pelipaikasta kuin hänen vaikutuksestaan
      joukkueen menestykseen, ja että osa tärkeimmästä tekemisestä jäi kokonaan mittaamatta.
      Vuonna 2002 Oakland Athletics rakensi pienellä budjetilla huippujoukkueen näiden oppien
      varaan. Tarina tunnetaan kirjasta ja elokuvasta Moneyball, ja nykyään jokaisella
      MLB-seuralla on oma analytiikkaosastonsa.</p>
      <p>Sama ajattelu on sittemmin muuttanut muitakin lajeja. Koripallossa laskettiin kolmen
      pisteen heiton todellinen arvo, ja hyökkäykset rakennettiin uudelleen sen ympärille.
      Jalkapallossa maaliodottama eli xG on vakiintunut osaksi lajin analyysia, ja
      jääkiekossa kiekonhallinnan mittarit ennustavat menestystä paremmin kuin perinteiset
      tilastot. Idea on kaikkialla sama: selvitetään, mikä voittaa otteluita, ja mitataan
      sitä.</p>

      <h2>Mitä hyötyä tästä on pesiksessä</h2>
      <p>Perinteinen tilastorivi eli kunnarit, lyödyt ja tuodut kertoo eniten
      lyöntijärjestyksen loppupään tykeistä. Suuri osa pesäpallosta tapahtuu kuitenkin
      muualla: kärjen etenemisissä, palojen välttämisessä ja etenijän työssä. Mallon mittarit
      antavat arvon myös sille.</p>
      <p>SPARK nostaa esiin kärjenrakentajat. VYK laskee pelaajan koko arvon voittoina,
      jolloin eri roolien pelaajia voi vertailla samalla luvulla. PARE arvioi pelaajan
      tämänhetkisen tason koko uran perusteella. Luvut auttavat näkemään, miksi pelinjohtaja
      luottaa pelaajaan, jonka teholuvut näyttävät vaatimattomilta.</p>

      <h2>Baseball-sanasto</h2>
    </div>
    ${_primerList([
      ['AVG','KL%','Lyöntikeskiarvo. MLB:ssä keskitaso on noin .250, kun KL%:n keskitaso on noin .530, joten käännetyt luvut ovat pesissilmään totuttua pienempiä.'],
      ['H','Kärkilyönnit','Lyönnit. Käännöksen H/600 PA vastaa täyden MLB-kauden lyöntimäärää.'],
      ['RBI','Lyödyt','Kotiin lyödyt juoksut.'],
      ['R','Tuodut','Itse juostut juoksut.'],
      ['K%','Palo-%','Kuinka suuri osa lyöntivuoroista päättyy omaan paloon. Pienempi on parempi.'],
      ['PA','Vuorot','Lyöntivuorot.'],
      ['wRC+','TEHO+','Kokonaistuotanto indeksinä, jossa 100 on keskitaso. Esimerkiksi 147 vastaa MVP-tason kautta.'],
      ['WAR','VYK','Wins above replacement eli pelaajan kokonaisarvo voittoina verrattuna korvaajatason pelaajaan. Mallon VYK on saman idean toteutus pesäpalloon.'],
      ['ERA / ERA-','LRA / LRA-','Lukkarin päästämät juoksut per ottelu ja sama sarjaindeksinä, jossa 100 on keskitaso ja pienempi on parempi.'],
      ['DH','Jokeri','Lyöjä ilman kenttäpaikkaa.'],
      ['Prosenttipiste','','Pelaajan sijoitus sarjan vakiopelaajien joukossa. Luku 92 tarkoittaa, että pelaaja on parempi kuin 92 prosenttia vertailujoukosta.'],
    ])}
    <div class="prose">
      <h2>Miten ⚾-käännös toimii</h2>
      <p>Pelaajasivun ⚾-kortti näyttää, miltä pelaajan taso näyttäisi MLB:n asteikoilla.
      Kortti katsoo, mille prosenttipisteelle pelaaja sijoittuu Superpesiksen vakiopelaajien
      joukossa, ja lukee saman kohdan MLB:n jakaumasta. Sarjansa 92. prosenttipisteen lyöjä
      saa kortin, jonka mukaan hän lyö kuin .290:n MLB-lyöjä. Kyse on pelaajan tasosta omassa
      sarjassaan, ilmaistuna asteikolla, jonka baseballin seuraaja tuntee.</p>

      <h2>Mallon omat mittarit</h2>
    </div>
    ${_primerList([
      ['VYK / JYK','','Kertyvät arvomittarit: voitot ja juoksut yli korvaajatason. Peliaika kasvattaa arvoa.'],
      ['TEHO+','','Tuotanto lyöntivuoroa kohden. 100 on sarjan keskitaso.'],
      ['SPARK','','Kärjenrakentajan indeksi, joka yhdistää etenemisen lyöjänä (ADV+), etenijänä (RUN+) ja palojen välttämisen (OUT+).'],
      ['1 % / 2 % / 3 % / K %','','Viralliset kärkilyöntisplitit pesittäin: ykköseltä kakkoselle, kakkoselta kolmoselle, kolmoselta kotiin ja kotiutukset.'],
      ['PARE','','Ennuste pelaajan tasosta. Koko ura painotettuna niin, että tuoreet ottelut painavat eniten.'],
      ['LRA / RP','','Lukkarin päästämät juoksut per ottelu ja estetyt juoksut yli sarjatason.'],
      ['PF / kTEHO+','','Kenttäkerroin, jossa 100 on neutraali, ja sillä korjattu TEHO+.'],
    ])}
    <div class="prose">
      <p>Tarkat kaavat ovat <a href="#/glossary">Kaava-sivulla</a>. Taulukoissa ja
      pelaajasivuilla jokaisen tilaston vieressä on ⓘ-nappi, josta aukeaa lyhyt selitys.</p>
    </div>`;
}

function _primerPesisEN() {
  return `
    <h1>Sabermetrics for pesis fans</h1>
    <p class="sub">What advanced stats are, where they came from, and what the baseball numbers on this site mean.</p>
    <div class="prose">
      <h2>What this is about</h2>
      <p>Sabermetrics began in the 1970s, when Bill James started examining which baseball
      statistics actually say something about winning. He found that many respected numbers
      said more about a player's reputation and position than about his effect on the team,
      and that some of the most important work on the field went unmeasured. In 2002 the
      Oakland Athletics built a top team on a small budget using those ideas. The story
      became the book and film Moneyball, and today every MLB club runs its own analytics
      department.</p>
      <p>The same thinking has since changed other sports. Basketball worked out the real
      value of the three-point shot and rebuilt its offenses around it, soccer adopted
      expected goals, and hockey's possession metrics predict success better than the
      traditional counts. The idea is the same everywhere: figure out what wins games, and
      measure that.</p>

      <h2>What it offers pesäpallo</h2>
      <p>The traditional stat line of kunnarit, lyödyt and tuodut says the most about the
      power hitters at the back of the order. A large share of pesäpallo happens elsewhere:
      in advancing the lead runner, avoiding outs and doing the running. Mallo's metrics put
      a value on that work too.</p>
      <p>SPARK identifies the table-setters. VYK counts a player's total value in wins, so
      players in different roles can be compared with one number. PARE estimates a player's
      current level from the whole career. The numbers help explain why a manager keeps
      trusting a player whose traditional line looks modest.</p>

      <h2>The baseball vocabulary</h2>
    </div>
    ${_primerList([
      ['AVG','KL%','Batting average. The MLB average is around .250, while the KL% average is around .530, so translated values look low to an eye used to pesäpallo.'],
      ['H','Kärkilyönnit','Hits. The translated H/600 PA corresponds to a full MLB season’s hit total.'],
      ['RBI','Lyödyt','Runs batted in.'],
      ['R','Tuodut','Runs scored.'],
      ['K%','Palo-%','The share of turns that end in the player’s own out. Lower is better.'],
      ['PA','Vuorot','Turns at bat.'],
      ['wRC+','TEHO+','Total production as an index where 100 is average. A 147, for example, is an MVP-level season.'],
      ['WAR','VYK','Wins above replacement, a player’s total value in wins over a replacement-level player. Mallo’s VYK applies the same idea to pesäpallo.'],
      ['ERA / ERA-','LRA / LRA-','Runs allowed per game by the lukkari, and the same figure as a league index where 100 is average and lower is better.'],
      ['DH','Jokeri','A batter without a fielding position.'],
      ['Percentile','','A player’s rank within the pool of qualified players. A 92 means the player is better than 92 percent of the pool.'],
    ])}
    <div class="prose">
      <h2>How the ⚾ translation works</h2>
      <p>The ⚾ card on a player page shows what the player's level would look like on MLB
      scales. The card finds the player's percentile among qualified Superpesis players and
      reads the same percentile off the MLB distribution, so a 92nd-percentile hitter gets a
      card saying he hits like a .290 MLB batter. It describes the player's standing in his
      own league, expressed on a scale baseball followers know.</p>

      <h2>Mallo's own metrics</h2>
    </div>
    ${_primerList([
      ['VYK / JYK','','Cumulative value stats: wins and runs above replacement. Playing time adds value.'],
      ['TEHO+','','Production per turn at bat. 100 is the league average.'],
      ['SPARK','','A table-setter index combining advancement as a batter (ADV+), as a runner (RUN+) and out avoidance (OUT+).'],
      ['1 % / 2 % / 3 % / K %','','The official lead-runner splits by base: first to second, second to third, third to home, and scoring.'],
      ['PARE','','A projection of the player’s level, weighting the whole career with recent games counting most.'],
      ['LRA / RP','','Runs allowed per game by the lukkari, and runs prevented above the league average.'],
      ['PF / kTEHO+','','The park factor, where 100 is neutral, and TEHO+ adjusted with it.'],
    ])}
    <div class="prose">
      <p>Exact formulas are on the <a href="#/glossary">Kaava</a> page. In tables and on
      player pages, the ⓘ button next to a stat opens a short explanation.</p>
    </div>`;
}

/* ── Page shell: audience + language toggles ─────────────────────────────── */

function showPrimer(aud, lang) {
  aud = aud === 'pesis' ? 'pesis' : 'baseball';
  // natural defaults: baseball track → EN, pesis track → FI
  if (lang !== 'en' && lang !== 'fi') lang = aud === 'pesis' ? 'fi' : 'en';

  const audLabels = lang === 'fi'
    ? { baseball: 'Baseball-fanille', pesis: 'Pesisfanille' }
    : { baseball: 'For baseball fans', pesis: 'For pesis fans' };
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
