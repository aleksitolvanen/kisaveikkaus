# kisaveikkaus

Kaveriporukan futiskisojen **veikkaussivusto** — veikkaukset, livetulokset,
pistetilanne ja analytiikka. Staattinen sivu (Cloudflare Pages) osoitteessa
**[kisaveikkaus.tolvanen.dev](https://kisaveikkaus.tolvanen.dev)**.

Joka MM-/EM-kisoissa porukka täyttää veikkaukset ennen turnausta ja pisteitä
jaetaan oikeista tuloksista. Tämä sivu näyttää tilanteen ja päivittyy turnauksen
aikana automaattisesti.

## Ominaisuudet

- **Veikkaus** — Lohko / Cup / Muut: kunkin veikkaajan ennusteet matriisina
  (solut värittyvät pisteiden mukaan). Pelaajafiltteri (Kaikki / Top 4 / valinta),
  joka säilyy linkissä (`?p=`) ja selaimessa.
- **Ottelut** — koko otteluohjelma lohkoittain + pudotuspelit, Suomen ajassa,
  linkki FIFA:n matsisivulle. Suodattimet Tänään / Huomenna / Tulevat / Kaikki.
  Matsia klikkaamalla näkee kaikkien veikkaukset siihen otteluun.
- **Pisteet** — pistetilanne osa-aluerittelyllä, esim. *(lohko+sika+cup+maalit)*.
- **Analytiikka** (näkyy kun tuloksia on) — pisteet ajan yli, kuka voi vielä voittaa
  (max-pisteet), pelaajavertailu, voittotodennäköisyys (Monte Carlo), villeimmät
  veikkaukset.
- **Live ilman reloadia** — selain pollaa tulokset taustalla ja päivittää näkymän;
  UI-tila ja skrollikohta säilyvät.
- **Mobiili-first**, tumma teema.

## Pisteytys

- Lohko-ottelu: oikea tulos **3p** · oikea lopputulos **1p** · muuten **0p**
- Sikajengi (eniten kortteja lohkovaiheessa): oikein **8p** (tasan 4p)
- Cup: jatkoonpääsijät — 16 joukkoon 2p · puolivälierä 4p · välierä 8p · finaali 15p · mestari 30p (per joukkue, kumuloituu)
- Maalintekijä: **1p / maali**

## Kehitys

```bash
node site.mjs mm2026     # generoi site/ → avaa site/index.html
npm test                 # yksikkötestit (pisteytys)

# Testidata paikalliseen kehitykseen (ei committiin):
node tools/random-results.mjs mm2026 --stage=mid
node site.mjs mm2026

# Veikkaukset/tulokset Excelistä:
python tools/import-excel.py <xlsx> mm2026 --mode predictions
```

## Arkkitehtuuri

- **Data** JSONina `data/<tid>/` (per turnaus). **`scoring.mjs`** = pisteytys
  (Excel-kaavat 1:1, `node:test`-testattu). **`site.mjs`** generoi staattisen
  `site/index.html`:n (renderöinti tapahtuu selaimessa upotetusta datasta).
- **Live-tulokset on irrotettu sivun deploysta**: erillinen julkinen repo
  [`kisaveikkaus-mm2026`](https://github.com/aleksitolvanen/kisaveikkaus-mm2026)
  hakee FIFA-tulokset ajastetusti ja julkaisee `data.json`:n; selain pollaa sen.
  Sivua ei tarvitse deployata tulosten päivittyessä.
- Hostaus: Cloudflare Pages (`site/`-kansio, ei build-vaihetta).

Tarkemmat kehitys- ja deploy-ohjeet sekä sudenkuopat: **[AGENTS.md](AGENTS.md)**.
