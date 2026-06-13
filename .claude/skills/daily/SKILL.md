---
name: daily
description: Luo Päivän katsaus + Päivän roast kisaveikkaus-sivulle pelipäivän päätyttyä. Laskee faktapaketin, hakee uutiset, kirjoittaa tekstit hyväksytyllä tyylillä, näyttää ne käyttäjälle hyväksyttäväksi ja julkaisee vasta hyväksynnän jälkeen.
---

# Päivän digest (katsaus + roast)

Tuottaa kaksi tekstiä Analytiikka-sivun alkuun (`data/mm2026/digests.json`):
**📋 Päivän katsaus** (asiallinen) ja **🔥 Päivän roast** (Comedy Central -henkinen).
Prosessi on kolmivaiheinen: **faktat → luonnos käyttäjälle → julkaisu vasta hyväksynnän jälkeen.**

## Pelipäivän määritelmä (LUE ENSIN)

**Yksi "pelipäivä" = sen päivän ILLAN ottelu + sitä seuraavan YÖN ottelut.**
MM2026:n matsit pelataan Amerikan illassa, mikä on Suomen iltaa ja yötä. Esim.
13.6:n ohjelma on yksi 13.6 illan matsi (Suomen aikaa) + ~3 matsia samana yönä
(Suomen aikaa varhain aamulla 14.6). **Kaikki nämä kuuluvat samaan digestiin,
avaimella `2026-06-13`.**

- **Aja `/daily` vasta kun yön ottelut on pelattu** — eli seuraavana päivänä
  Suomen aikaa, milloin tahansa sen päivän aikana (13.6:n digest ajetaan siis
  **14.6 aikana**, aamulla, päivällä tai illalla — kunhan yön matsit on pelattu).
  Voit myös ajaa **myöhässä** tai useamman päivän kerralla; pending-mode hoitaa
  niputuksen (ks. alla).
- **Avain ja label tulevat OTTELUIDEN päivästä, ei ajopäivästä.** `day-facts`
  laskee `day`-kentän käsiteltävien matsien futispäivästä (illan matsi
  ankkurina), joten vaikka ajat digestin 14.6, paketti palauttaa
  `day: "2026-06-13"`. Käytä tätä avaimena; kirjoita label muotoon `"pe 13.6."`
  — EI ajopäivää.
- Pending-mode (alla) poimii automaattisesti kaikki ratkenneet käsittelemättömät
  ottelut, joten illan + yön matsit niputtuvat oikein kun ajat ne yön jälkeen.

## 1. Faktapaketti (deterministinen — AI ei keksi lukuja)

```bash
node tools/day-facts.mjs mm2026                # PENDING-MODE (oletus, käytä tätä):
                                               # kaikki ratkenneet ottelut joita
                                               # aiemmat digestit eivät kata
node tools/day-facts.mjs mm2026 2026-06-12     # tai tietty futispäivä
```

- **Käytä pending-modea**: se lukee aiempien digestien `covers`-listat
  digests.json:sta ja palauttaa vain käsittelemättömät ratkenneet ottelut.
  Aja se kerran per pelipäivä yön matsien jälkeen → illan + yön ottelut tulevat
  yhteen pakettiin. Jos jokin matsi jäi vahingossa edellisestä digestistä, se
  tulee automaattisesti mukaan seuraavaan. Paketin `day` ja `covers` kopioidaan
  julkaisussa digestin vastaaviin kenttiin.
- Jos `liveNow` ei ole tyhjä, jokin matsi on kesken — mainitse käyttäjälle ja
  ehdota odottamista tai matsin jättämistä seuraavaan digestiin.
- Paketti sisältää: ottelut tuloksineen, täysosumat/suunnat/nollat per matsi,
  päivän huonoin veikkaus (worstPick), maalit ja kortit FIFA-timelinesta,
  sarjataulukon (kokonaispisteet, päivän pisteet, sijoitussiirrot),
  maalintekijäosumat (2p/maali!) ja sikaveikkaukset kontekstiksi.
- Korttipisteet sikajengiin: keltainen 1, toinen keltainen → punainen 2, suora punainen 3.

### Päällekirjoitus- ja ajoitussuoja (TARKISTA ENNEN JULKAISUA)

Lue `digests.json` ja vertaa faktapaketin `day`/`covers` olemassa oleviin
päiviin **ennen kuin** kirjoitat. Tarkista nämä tilanteet:

- **Päivä jo olemassa** (paketin `day` löytyy `digests.json`:sta): älä ylikirjoita
  sokeasti. Yleensä digest on jo tehty. Kysy käyttäjältä: täydennetäänkö
  olemassa olevaa (esim. yön matsi joka jäi puuttumaan) vai onko erehdys.
- **Ei mitä koota** (`covers` tyhjä eikä `liveNow` ole tyhjä): kerro käyttäjälle
  ettei uusia ratkenneita otteluita ole — älä tee tyhjää digestiä.
- **Ajetaan liian aikaisin** (sen päivän matseja ei ole vielä pelattu — `covers`
  tyhjä tai vajaa ja matseja on vasta tulossa): **kysy käyttäjältä**, halutaanko
  odottaa vai koota vajaa digest jo pelatuista. Älä keksi tuloksia pelaamattomille.
- **Matsi kesken** (`liveNow` ei tyhjä): mainitse se ja ehdota odottamista tai
  ko. matsin jättämistä seuraavaan digestiin.
- **Edellinen päivä puuttuu kokonaan / myöhässä ajo**: täysin sallittua — voit
  koota puuttuvan päivän jälkikäteen. Mutta varo: jos pending-paketti kattaa
  **useamman pelipäivän otteluita** (esim. sekä 13.6 että 14.6, koska 13.6 jäi
  ajamatta), `day` osoittaa vain vanhimpaan päivään mutta `covers` sisältää
  molemmat. **Tee tällöin yksi digest per päivä**: aja `day-facts mm2026
  <vanhin-puuttuva-päivä>` (eksplisiittinen futispäivä) kullekin puuttuvalle
  päivälle erikseen, vanhin ensin, niin kukin saa omat tekstinsä ja `covers`-listansa.
  Jos epäselvää montako päivää on kesken, **kysy käyttäjältä** ennen ajamista.

Epäselvissä tilanteissa **kysy käyttäjältä tarkennusta** — älä arvaa.

### Historiakaikut (lisää AINA kun löytyy)

Veikkaajien menneet kisat ovat roastin parasta materiaalia — "veikkasit saman
maan jo viime kisoissa" tai "kolmas turnaus putkeen sama 2-0-pakkomielle" on aina
hauska, tarkka isku. Tarkista päivän roastattavien/nostettavien pelaajien
historia ennen kirjoittamista:

- **`data/mm2026/factpacks.json`** (AINA saatavilla, committattu, lyhytnimet):
  per pelaaja `tendencies` (`championPicks`-, `sikaPicks`-, `goalscorerPicks`-laskurit;
  `avgRank`, `bestRank`/`worstRank`, `participations`), `tournaments[]` (sijoitukset,
  pisteet, mestari-/sika-/maalintekijäveikkaukset menneiltä kisoilta +
  `style.favScorelines` ja `style.drawsPct`), `medals`, `current` (mm2026-vedot).
  Etsi kaikuja päivän vetoon: toistuva maavalinta, sama tulospakkomielle, sama
  mestariveikkaus monta kisaa putkeen, ennätyssijoitukset.
  - *Esim.* Jypen factpackissä `sikaPicks: {"BIH": 1}` — hän on veikannut Bosniaa
    ennenkin; tänään hän veikkasi taas Bosniaa (0-2). Tuollainen kaiku on kultaa.
- **`history/<tid>.json`** (LOKAALI, gitignoressa — löytyy manuaaliajossa, ei
  välttämättä tulevassa automaatiossa → käytä JOS olemassa): per-matsi `picks`
  lyhytnimillä neljältä kisalta (em2016, mm2018, em2021, em2024). Täältä saa
  tarkemmat kaiut kuin factpack: sama joukkuepari/tulos veikattu aiemmin,
  mestari-/putoamisvedot per ottelu. Kaiva näistä kun haluat täsmäviittauksen.
- **PARAS yksittäinen kaiku: sama ottelupari veikattu väärin jo aiemmin.** Jos
  pelaaja missasi tänään esim. ESP–ITA:n ja `history/`-datasta löytyy että hän
  veikkasi saman parin väärin myös 2021 ja 2016 — se on ehdotonta kultaa
  ("kolmas kerta kun ESP–ITA nöyryyttää sinua, etkö opi koskaan"). Etsi näitä
  aktiivisesti päivän missatuista matseista.

**Panosta syvyyteen.** Älä tyydy pintaraapaisuun: tee päivän roastattavista
oikeaa kaivaustyötä historiadatassa (factpack + `history/`-JSONit), ristiinaja
useita kisoja, etsi toistuvia kuvioita ja täsmäkaikuja. Mitä tarkempi ja
yllättävämpi historiafakta, sitä parempi vitsi. Voit käyttää sub-agentteja
rinnakkaiseen kaivamiseen jos kohteita on monta. Sama koskee tilastojen
tutkimista — syvä analyysi tuottaa terävämmän roastin kuin nopea silmäys.

Käytä historiatietoa myös **katsauksessa** maustamaan (esim. "Kapan paras
sijoitus viiteen kisaan"), ei vain roastissa. Yksityisyys: molemmat lähteet ovat
valmiiksi lyhytnimillä — koko nimiä ei historiastakaan koskaan käytetä.

## 2. Uutiset

Hae päivän MM-uutisotsikot (curl + suodata tuoreet MM-aiheiset):
- `https://yle.fi/rss/urheilu` (FI)
- `https://www.is.fi/rss/jalkapallo.xml` (FI)
- `https://www.theguardian.com/football/world-cup-2026/rss` (EN, dedikoitu MM-feedi)

Käytä uutista vain jos se on **aidosti kiinnostava** (loukkaantumiset, kohut,
dramatiikka). Trump-sekoilut ovat hyvää roast-materiaalia, mutta VAIN kun jotain
oikeasti tapahtui — ei pakollista päivittäistä osiota.

## 3. Tekstien kirjoitus

**Tyylimalli**: lue `data/mm2026/digests.json` päivän 2026-06-11 tekstit — ne ovat
käyttäjän hyväksymä sävyreferenssi. Lue myös [LORE.md](LORE.md) (historia, saagat,
tutkimusfaktat, hahmot).

**Toiston välttäminen (PAKOLLINEN — lue ennen kirjoittamista):** lue läpi
**vähintään 3–4 edellisen päivän** katsaukset JA roastit `digests.json`:sta ja
pidä huoli että uusi teksti tuntuu tuoreelta:
- **Listaa ensin ketkä on jo roastattu.** Käy edelliset 3–4 päivää läpi ja
  poimi nimet, jotka ovat olleet **henkilökohtaisen roastin kohteena**. Jokainen
  viime päivinä roastattu saa **selvästi pienemmän todennäköisyyden** päästä taas
  uuteen henkilökohtaiseen roastiin. Mitä useampana päivänä putkeen joku on ollut
  kohteena, sitä vahvemmin häntä vältetään.
- **Varo konteksti-vinoumaa.** Joistakin veikkaajista on enemmän taustatietoa
  (saagat, pelaajakortit, vastineet — esim. Jype), ja siksi heihin on houkutus
  palata joka päivä. **Älä anna kontekstin määrän ohjata kohdevalintaa** — anna
  PÄIVÄN FAKTOJEN ratkaista kuka roastataan. Jos eniten tunnettu hahmo ei tehnyt
  päivän huonointa vetoa, hän ei ole päivän kohde.
- **Poikkeus:** jos sama henkilö teki taas aidosti roastin arvoisen jutun (esim.
  toistuva todella huono veikkaus), hänet saa ottaa — mutta vain **täysin
  uudella kulmalla**, ei samaa vitsiä toiseen kertaan.
- **Levitä piikit.** Tavoite on että turnauksen mittaan lähes kaikki 20 saavat
  vuorollaan osansa. Etsi aktiivisesti vielä mainitsematta jääneitä veikkaajia.
- **Älä toista samoja vitsejä, kielikuvia tai rakenteita.** Jos eilen oli
  "rikkinäinen kello" tai "vessajono lisäajalla", keksi tänään jotain muuta.
  Tarkista ettei sama lopetuskaava ("Nukkukaa hyvin, paitsi X") toistu joka päivä.
- **Running gagit saavat jatkua** (JukkaM:n lahjamaalit, Jype-saaga), mutta aina
  *uudella käänteellä* — ei sama vitsi uudelleen kerrottuna.
- **Uudet näkökulmat ovat plussaa:** keksi tuoreita kulmia — odottamaton
  taulukkonousu, sikajengi/maalintekijä-tilanne, kahden veikkaajan vastakkainen
  veto samaan matsiin, "hiljaisin" veikkaaja jota ei ole vielä mainittu, sarja
  jossa joku on osunut/missannut putkeen, tilastollinen kuriositeetti jne.
- Sama koskee **katsausta**: vaihtele kappaleiden kärkiä äläkä aloita joka päivä
  samalla kaavalla.

**Katsaus** (3 kappaletta, ~150–200 sanaa):
- Mitä kentällä tapahtui (maalit, kortit, dramatiikka)
- Mitä veikkauksissa tapahtui (osumat, taulukkomuutokset, sikajengi/maalintekijä-vaikutukset)
- Maailmalta (vain aidosti kiinnostavat uutiset)
- EI "Seuraavaksi/tulevat ottelut" -osiota.

**Roast** (4–6 kappaletta, Jeff Ross / Greg Giraldo -rekisteri):
- Suora puhuttelu, teräviä kielikuvia, standup-rytmi. **Terävyys > raakuus** —
  käyttäjä testasi härskimmän version ja hylkäsi sen ("rikkinäinen kello on
  Sveitsin tarkkuusinstrumentti" voittaa alatyylin).
- Kohteet: päivän huonoimmat veikkaukset, häviäjäjoukkueet, ylivarovaiset ja
  ahneet veikkaukset, hauskat uutiset. **Kierrätä kohteita** (ks. toiston
  välttäminen yllä) — eri pääkohde kuin edellisinä päivinä.
- Lopetus: lyhyt kuittaus + piikki jollekulle (vaihda lopetuskaavaa päivittäin).

**Kirjoittajahahmo (`author`-kenttä).** Roastin kirjoittaa vaihtuva
**hahmo**, jonka nimi näkyy sivulla roastin yllä. Hahmot ja äänet ovat
[LORE.md](LORE.md):n "Roast-kirjoittajahahmot" -osiossa (Pasi Rautiainen,
Professori Poisson, Kioski-Reiska, Seiska-toimittaja Merilä, Sir David
[sukunimi], Komisario Tasapeli, Pastori Penaltikko, Algoritmi…). **Kierrätä
hahmoa päivittäin** — älä käytä samaa hahmoa kahta päivää putkeen (sama logiikka
kuin kohteiden kierrätyksessä).

**Tee kolme roast-versiota valittavaksi, kukin ERI hahmon äänellä.** Esitä
hyväksyntävaiheessa kolme vaihtoehtoa eri hahmoilta, joista käyttäjä valitsee
yhden (tai pyytää yhdistelmää/muokkausta). Valitse hahmot jotka sopivat päivän
aiheeseen ja ovat selvästi erottuvia toisistaan; vältä viime päivien hahmoja.
Sama faktapohja ja samat kohteet, eri ääni. Merkitse jokaiseen vaihtoehtoon
hahmon nimi. Kaikkia koskevat samat säännöt (toiston välttäminen, kohteiden
kierrätys, historiakaikut, yksityisyys, vain faktapaketin luvut). Pidä versiot
napakkoina luonnoksessa; viimeistele valittu vasta valinnan jälkeen.

**Lisäjutut**: jos faktapaketista nousee jotain erityistä, EHDOTA käyttäjälle
lisäosioita luonnoksen yhteydessä — esim. Päivän Nostradamus / Päivän surkimus
-badget, väliaikakatsaus ("viikko takana"), tilastonosto, erikoispäivävariantti.
Käyttäjä päättää otetaanko mukaan.

## 3b. Roast-kuva (valinnainen)

Tarjoa tekstien yhteydessä **valmis kuvaprompti** päivän parhaasta visuaalisesta
kulmasta. Käyttäjä generoi kuvan ChatGPT:llä ja tallentaa `tmp/`-kansioon —
jos hän ei jaksa, digest julkaistaan ilman kuvaa (image-kenttä on valinnainen).

Promptin lukittu tyylirunko (vaihda vain kohtauskuvaus):

```
Editorial sports illustration, dark moody comic style. [KOHTAUS PÄIVÄN
PARHAASTA ROAST-KULMASTA — liioitellut karikatyyri-ilmeet, satiirinen ote].
Dramatic stadium floodlights, deep navy and gold color palette with vivid red
accents, exaggerated caricature expressions, satirical tone, high detail,
cinematic lighting, wide 3:2 landscape composition. No text or numbers
anywhere in the image.
```

Kun kuva on `tmp/`-kansiossa: pakkaa se Playwright-canvasilla 1200 px leveäksi
jpeg:ksi (laatu 0.82) → `site/digest/<futispäivä>.jpg`, ja lisää digestiin
`"image": "digest/<futispäivä>.jpg"`. Kuva renderöityy roast-tekstin perään.

## 4. Hyväksyntä (PAKOLLINEN portti)

Näytä katsaus + **kolme roast-versiota eri hahmoilta** + mahdolliset
lisäehdotukset käyttäjälle chatissa. Käyttäjä valitsee yhden roast-version (tai
pyytää yhdistelmää/muokkausta). **ÄLÄ julkaise ennen eksplisiittistä
hyväksyntää.** Iteroi kunnes hyväksytty; julkaise vain valittu roast ja sen
hahmon nimi `author`-kenttään.

## 5. Julkaisu

1. Lisää päivä `data/mm2026/digests.json` → `days`-objektiin:
   ```json
   "2026-06-12": { "label": "pe 12.6.", "covers": ["A2", "B1"],
                   "author": "Pasi Rautiainen",
                   "badges": [{ "emoji": "🔮", "title": "Päivän Nostradamus",
                                "name": "Kapa", "why": "perustelu lyhyesti" }],
                   "katsaus": "...", "roast": "..." }
   ```
   **`covers` on pakollinen**: faktapaketin `covers`-lista sellaisenaan — sen
   varassa seuraava ajo tietää mitkä ottelut on jo käsitelty.
   `author` on valittu kirjoittajahahmo (näkyy roastin yllä); kierrätä päivittäin.
   `badges` on valinnainen (renderöityy katsauskortin loppuun): vakiot
   🔮 Päivän Nostradamus ja 🌧️ Päivän surkimus kun faktapaketista löytyy
   selvä voittaja/häviäjä; muita saa keksiä tilanteen mukaan.
   Label-muoto: `"to 11.6. · avauspäivä"` (lisämääre vain erikoispäivinä).
   Kappalejaot `\n\n`:llä; ei markdownia (renderöidään pre-line-tekstinä).
2. `node site.mjs mm2026`
3. Committaa ja pushaa (CF Pages deployaa automaattisesti):
   ```bash
   git add data/mm2026/digests.json site/index.html site/data.json
   git -c commit.gpgsign=false commit -m "Päivän digest <pvm>"
   git push "https://x-access-token:$(gh auth token)@github.com/aleksitolvanen/kisaveikkaus.git" main:main
   ```

## Ehdottomat säännöt

- **Yksityisyys**: vain lyhytnimet/lempinimet (predictions.json-avaimet). Koko
  nimiä EI KOSKAAN missään julkaistavassa.
- Kaikki luvut faktapaketista — jos fakta puuttuu, jätä pois, älä arvaa.
- Roastin kohteena veikkaukset ja joukkueet, ei henkilöt itse (paitsi
  lempeä piikittely veikkaustyylistä).
