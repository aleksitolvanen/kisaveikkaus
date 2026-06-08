# kisaveikkaus

Kaveriporukan futiskisojen veikkaussivusto: veikkaukset, livetulokset, pistetilanne ja
analytiikka. Staattinen sivu (Cloudflare Pages → `kisaveikkaus.tolvanen.dev`), data JSONina
gitissä. Inspiroitu `finnkino`-projektista (sama Node ESM + staattinen generaattori -malli).

## Rakenne

```
data/<turnaus>/
  tournament.json   lohkot, otteluohjelma, cup-kierrokset, pisteytyssäännöt
  predictions.json  osallistujien veikkaukset (staattisia, lukittu ennen turnausta)
  results.json      oikeat tulokset — päivittyy turnauksen aikana
scoring.mjs         pisteytys, Excel-kaavat 1:1 (jaettu client + node:test)
site.mjs            generoi site/index.html (TODO)
tools/import-excel.py   Excel → JSON (veikkaukset & tulokset, uudelleenkäytettävä)
test/               node:test-yksikkötestit
```

## Pisteytys

- **Lohko-ottelu**: oikea tulos 3p · oikea lopputulos (voittaja/tasapeli) 1p · muuten 0p
- **Sikajengi** (eniten kortteja lohkovaiheessa): oikein 8p, tasatilanteessa 4p
- **Cup-vaihe**: jatkoonpääsijät — 16 joukkoon 2p · puolivälierä 4p · välierä 8p · finaali 15p · mestari 30p (per joukkue, kumuloituu)
- **Maalintekijä**: 1p per veikatun pelaajan maali (käsin)

## Komennot

```
npm test                                              # yksikkötestit
python tools/import-excel.py <excel> <id> --mode all  # Excel → JSON
npm run build                                         # generoi site/ (TODO)
```

## Hosting

Cloudflare Pages auto-deployaa pushista mainiin. Ks. `C:\s\r\docs\servers\tolvanen-dev`.
