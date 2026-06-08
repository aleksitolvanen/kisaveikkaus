# kisaveikkaus — agentti-/kehittäjäohje

Kaveriporukan futiskisojen veikkaussivusto. **Staattinen** sivu (Node ESM
-generaattori → `site/index.html`), tarjoiltu Cloudflare Pagesista osoitteessa
`kisaveikkaus.tolvanen.dev`. Veikkaukset ovat staattisia (lukittu ennen
turnausta); tulokset päivittyvät turnauksen aikana. Inspiraationa `C:\s\r\finnkino`
(sama Node-generaattori + CF Pages -malli).

## Arkkitehtuuri lyhyesti

- **Data JSONina** `data/<tid>/`:ssä — yksi kansio per turnaus (`mm2026`, myöh. `em2028`…).
- **`scoring.mjs`** — puhdas pisteytys (Excel-kaavat 1:1), testattu `node --test`.
  Inlinoidaan `site.mjs`:ssä selaimeen (export-sanat riisutaan).
- **`site.mjs`** — generoi `site/index.html`:n: upottaa datan + scoringin + client-JS:n.
  Renderöinti tapahtuu selaimessa → filtterit/analytiikka ilman build-vaihetta.
- **Live-tulokset on irrotettu tästä reposta.** Selain pollaa dataa erillisestä
  julkisesta data-reposta (`DATA_URL`, ks. alla). Tämän repon `data/` on vain
  *alkutilan snapshot* HTML-kuoren rakentamiseen.

## Hakemistorakenne

```
data/<tid>/
  tournament.json   lohkot, otteluohjelma, pudotuspelit, cup-kierrokset, säännöt
  predictions.json  veikkaukset (staattisia)
  results.json      tulokset (TÄSSÄ repossa pidetään tyhjänä tuotannossa; live tulee data-reposta)
scoring.mjs         pisteytys (jaettu client + node:test)
site.mjs            generoi site/index.html + site/data.json + site/_headers
tools/
  import-excel.py   Excel → JSON (veikkaukset & tulokset; uudelleenkäytettävä)
  fetch-fifa.mjs    FIFA v3 -API -haku (sama skripti elää myös data-repossa)
  random-results.mjs arvotut testitulokset paikalliseen kehitykseen
test/               node:test-yksikkötestit
site/               generoitu staattinen sivu (CF Pages tarjoilee tämän)
```

## Pisteytys (scoring.mjs / tournament.json "scoring")

- **Lohko-ottelu**: oikea tulos 3p · oikea lopputulos (voittaja/tasapeli) 1p · muuten 0
- **Sikajengi** (eniten kortteja lohkovaiheessa): oikein 8p, tasatilanteessa 4p
- **Cup-vaihe**: jatkoonpääsijät — 16 joukkoon 2p · puolivälierä 4p · välierä 8p · finaali 15p · mestari 30p (per joukkue, kumuloituu)
- **Maalintekijä**: 1p per veikatun pelaajan maali (käsin)

## Miten tehdä asioita

```bash
node site.mjs mm2026          # generoi site/ (avaa site/index.html — toimii myös file://)
npm test                      # yksikkötestit (scoring)

# Paikallinen testidata (ÄLÄ committaa feikkituloksia tuotantoon):
node tools/random-results.mjs mm2026 --stage=mid   # group|partial|mid|full [--seed=N]
node site.mjs mm2026

# Excel → JSON:
python tools/import-excel.py <xlsx> mm2026 --mode predictions   # tai results / all

# Deploy: committaa + pushaa main → Cloudflare Pages deployaa site/:n automaattisesti.
```

**Uusi turnaus** (esim. em2028): tee `data/<tid>/` (import-excel luo sen), aseta
FIFA-id:t `tools/fetch-fifa.mjs`:ään (data-repossa), generoi `node site.mjs <tid>`,
ja osoita `DATA_URL` uuden turnauksen data-repoon.

## Deploy & live-data (irrotettu)

- **Sivu**: Cloudflare Pages, **production branch `main`**, **build command tyhjä**,
  **output directory `site`**, ei secretsejä. Pushit mainiin → auto-deploy. Custom
  domain `kisaveikkaus.tolvanen.dev` (sama CF-tili kuin tolvanen.dev).
- **Live-data**: erillinen julkinen repo **`kisaveikkaus-mm2026`** (vain data + ajastettu
  Action). Sen Action hakee FIFA-tulokset ja julkaisee `data.json`:n. Selain pollaa sen
  rawsta ~60 s välein → tulokset päivittyvät **ilman tämän sivun deployta** (ei CF-buildeja).
  `DATA_URL` (`site.mjs`:n CLIENT) osoittaa:
  `https://raw.githubusercontent.com/aleksitolvanen/kisaveikkaus-mm2026/main/data.json`
- Ennen julkaisua: pidä tämän repon `data/mm2026/results.json` **tyhjänä** (tuotanto),
  ja tuo oikeat `predictions.json` molempiin (tähän + data-repoon) kun täytetyt Excelit ovat valmiina.

tolvanen.dev-infra: `C:\s\r\docs\servers\tolvanen-dev`.

## Sudenkuopat (lue ennen muokkausta)

- **CLIENT on `String.raw`-templaatti `site.mjs`:ssä** (inlinoidaan HTML:ään): **ei
  backtick- eikä `${}`-merkkejä sen sisällä** (käytä merkkijonokonkatenaatiota).
  Funktiot hoistataan, joten määrittelyjärjestys ei haittaa. `T`, `R`, `ALLROWS`
  ovat `let` (pollaus päivittää ne); `P` (predictions) on vakio.
- **Live-tulokset tulevat data-reposta, eivät tästä.** Älä laita oikeita tuloksia
  tämän repon `results.json`:iin — pidä se tyhjänä. Testaa paikallisesti
  `random-results.mjs`:llä äläkä committaa feikkidataa.
- **Matriisin asettelu**: `freezeOffsets` mittaa Ottelu-sarakkeen leveyden ajossa ja
  jäädyttää Tulos-sarakkeen sen viereen (älä pakota mcol-leveyttä). Kierros-/lohko-otsikot
  "leijuvat" (absoluuttinen span) etteivät levitä ensimmäistä saraketta. `.mwrap` luo
  oman stacking contextin (`position:relative;z-index:0`); topbar `z-index:20`.
- **App-shell**: `body` on kiinteäkorkuinen flex; Veikkaukset-näkymä ei skrollaa
  (vain matriisi skrollaa sisäisesti), muut näkymät skrollaavat itse.
- **Tila säilyy**: UI-tila + skrolli `localStorage`-avaimessa `kv-ui`; pelaajafiltteri
  URL:ssa (`?p=`) + `localStorage` `kv-players`. **Analytiikka-tabi piilossa kunnes
  tuloksia on.**
- **Ajat**: `kickoff` tallennetaan **UTC**:nä, näytetään aina **Suomen aikaa**
  (`fiTime`/`fiDayKey`, `Europe/Helsinki`).
- **Joukkuekoodit**: meidän Excel-koodit eroavat FIFA:n virallisista kolmessa:
  `CUR→CUW` (Curaçao), `ICV→CIV` (Norsunluurannikko), `DRC→COD` (Kongo DR). fetch-fifa
  hoitaa kartan.
- **Git tässä ympäristössä** (Claude Code -shell):
  - Commitit **ilman AI-attribuutiota** (käyttäjän globaali sääntö).
  - Allekirjoitus kulkee 1Password-agentin kautta joka **ei ole tavoitettavissa** →
    `git -c commit.gpgsign=false commit …`.
  - SSH-push (1Password) ei toimi → pushaa HTTPS-tokenilla:
    `git push "https://x-access-token:$(gh auth token)@github.com/aleksitolvanen/<repo>.git" main:main`
  - Workflow-tiedostojen pushaaminen vaatii tokenilta `workflow`-scopen
    (`gh auth refresh -h github.com -s workflow`).
- **Windows/bash**: Bash-työkalu ajaa git-bashia; **natiivi Python** (`/c/Python314/python`)
  tarvitsee Windows-polut (`C:/…`) skriptin **sisällä** (MSYS muuntaa vain argv-polut).
  `openpyxl`-tallennus pudottaa kaaviot xlsx:stä.
- **Verifiointi renderöimällä**: screenshotit finnkinon Playwrightilla
  (`createRequire('C:/s/r/finnkino/package.json')` → `require('playwright')`), tai
  kevyt DOM-mock-smoke (eval inlinoitu script + mock `document`).

## Linkit

- Data-repo (live): https://github.com/aleksitolvanen/kisaveikkaus-mm2026
- FIFA v3 -API: `api.fifa.com/api/v3`, MM2026 `idCompetition=17` `idSeason=285023`
  (matsisivu: `fifa.com/en/match-centre/match/{komp}/{kausi}/{vaihe}/{ottelu}`)
