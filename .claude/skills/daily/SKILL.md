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
- **Älä roastaa samaa henkilöä pääkohteena monta päivää putkeen.** Jos esim.
  Jype tai JukkaM oli edellisen päivän kärkikohde, anna heidän olla tällä kertaa
  (paitsi jos faktat pakottavat — silloin täysin uudella kulmalla). Levitä
  piikit eri veikkaajille; lähes kaikki saavat vuorollaan osansa turnauksen
  aikana.
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

Näytä molemmat tekstit (+ mahdolliset lisäehdotukset) käyttäjälle chatissa.
**ÄLÄ julkaise ennen eksplisiittistä hyväksyntää.** Käyttäjä voi pyytää muokkauksia
— iteroi kunnes hyväksytty.

## 5. Julkaisu

1. Lisää päivä `data/mm2026/digests.json` → `days`-objektiin:
   ```json
   "2026-06-12": { "label": "pe 12.6.", "covers": ["A2", "B1"],
                   "badges": [{ "emoji": "🔮", "title": "Päivän Nostradamus",
                                "name": "Kapa", "why": "perustelu lyhyesti" }],
                   "katsaus": "...", "roast": "..." }
   ```
   **`covers` on pakollinen**: faktapaketin `covers`-lista sellaisenaan — sen
   varassa seuraava ajo tietää mitkä ottelut on jo käsitelty.
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
