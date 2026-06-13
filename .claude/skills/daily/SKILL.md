---
name: daily
description: Luo Päivän katsaus + Päivän roast kisaveikkaus-sivulle pelipäivän päätyttyä. Laskee faktapaketin, hakee uutiset, kirjoittaa tekstit hyväksytyllä tyylillä, näyttää ne käyttäjälle hyväksyttäväksi ja julkaisee vasta hyväksynnän jälkeen.
---

# Päivän digest (katsaus + roast)

Tuottaa kaksi tekstiä Analytiikka-sivun alkuun (`data/mm2026/digests.json`):
**📋 Päivän katsaus** (asiallinen) ja **🔥 Päivän roast** (Comedy Central -henkinen).
Prosessi on kolmivaiheinen: **faktat → luonnos käyttäjälle → julkaisu vasta hyväksynnän jälkeen.**

## 1. Faktapaketti (deterministinen — AI ei keksi lukuja)

```bash
node tools/day-facts.mjs mm2026                # PENDING-MODE (oletus, käytä tätä):
                                               # kaikki ratkenneet ottelut joita
                                               # aiemmat digestit eivät kata
node tools/day-facts.mjs mm2026 2026-06-12     # tai tietty futispäivä
```

- **Käytä pending-modea**: se lukee aiempien digestien `covers`-listat
  digests.json:sta ja palauttaa vain käsittelemättömät ratkenneet ottelut.
  Näin ei haittaa, ajetaanko digest heti illan matsin jälkeen vai vasta
  seuraavana päivänä — yön matsit tulevat automaattisesti seuraavaan ajoon.
  Paketin `covers`-kenttä kopioidaan julkaisussa digestin `covers`-kenttään.
- Jos `liveNow` ei ole tyhjä, jokin matsi on kesken — mainitse käyttäjälle ja
  ehdota odottamista tai matsin jättämistä seuraavaan digestiin.
- Paketti sisältää: ottelut tuloksineen, täysosumat/suunnat/nollat per matsi,
  päivän huonoin veikkaus (worstPick), maalit ja kortit FIFA-timelinesta,
  sarjataulukon (kokonaispisteet, päivän pisteet, sijoitussiirrot),
  maalintekijäosumat (2p/maali!) ja sikaveikkaukset kontekstiksi.
- Korttipisteet sikajengiin: keltainen 1, toinen keltainen → punainen 2, suora punainen 3.

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
  ahneet veikkaukset, hauskat uutiset.
- **Lue KAIKKI edelliset roastit digests.json:sta äläkä toista samoja vitsejä.**
  Running gagit saavat jatkua (esim. JukkaM:n RSA-maali), mutta uudella kärjellä.
- Lopetus: lyhyt kuittaus + piikki jollekulle.

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
                   "katsaus": "...", "roast": "..." }
   ```
   **`covers` on pakollinen**: faktapaketin `covers`-lista sellaisenaan — sen
   varassa seuraava ajo tietää mitkä ottelut on jo käsitelty.
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
