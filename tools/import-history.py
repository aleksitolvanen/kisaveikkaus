#!/usr/bin/env python3
"""Tuo historialliset yhdistelmä-Excelit (history/*.xlsx) yhtenäiseen JSON-muotoon.

    python tools/import-history.py            # kaikki tunnetut turnaukset
    python tools/import-history.py em2016     # vain yksi

Kirjoittaa history/<tid>.json. Nimet korvataan alias-kartalla
(history/aliases.json — EI committoida: sisältää alkuperäisiä nimiä, joissa voi
olla koko nimiä; ks. AGENTS.md yksityisyyssääntö). Tuotos-JSONeissa on vain
lyhytnimiä, joukkuekoodit jätetään verbatim (historialliset suomikoodit, esim.
RAN/SAK — mahdollinen koodikartta tehdään analyysivaiheessa).

Kaksi sukupolvea:
  ko-winners (2016, 2018): pudotuspeleistä veikattiin ottelukohtaisia voittajia.
  qualifier-sets (2021, 2024): jatkoonpääsijäjoukot kierroksittain (kuten 2026).
"""
import json
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    import openpyxl
except ImportError:
    sys.exit("Tarvitaan openpyxl:  pip install openpyxl")

HIST = os.path.join(os.path.dirname(__file__), "..", "history")
MATCH_RE = re.compile(r"^([A-Za-zÅÄÖåäö]{2,4})-([A-Za-zÅÄÖåäö]{2,4})$")

# Per-turnaus asettelut (rivit/sarakkeet kartoitettu käsin 2026-06-12).
CONFIGS = {
    "em2016": {
        "file": "EM2016_Kaikki.xlsx", "year": 2016, "name": "EM2016", "scheme": "ko-winners",
        "name_row": 1, "name_col": 7, "name_step": 2,
        "match_col": 3, "result_col": 5, "group_rows": (3, 43),
        "sika_row": 44, "gs_row": 45, "ko_rows": (48, 79),
    },
    "mm2018": {
        "file": "MM2018_Kaikki.xlsx", "year": 2018, "name": "MM2018", "scheme": "ko-winners",
        "name_row": 1, "name_col": 7, "name_step": 2,
        "match_col": 3, "result_col": 5, "group_rows": (3, 57),
        "sika_row": 58, "gs_row": 59, "ko_rows": (62, 93),
    },
    "em2021": {
        "file": "EM2021_Kaikki.xlsx", "year": 2021, "name": "EM2021", "scheme": "qualifier-sets",
        "name_row": 2, "name_col": 6, "name_step": 2,
        "match_col": 2, "result_col": 4, "group_rows": (4, 44),
        "sika_row": 45, "gs_row": 46,
        "cup_rows": {"r16": (49, 64), "qf": (66, 73), "sf": (75, 78),
                     "final": (80, 81), "champion": (83, 83)},
    },
    "em2024": {
        "file": "EM2024_Kaikki.xlsx", "year": 2024, "name": "EM2024", "scheme": "qualifier-sets",
        "name_row": 2, "name_col": 5, "name_step": 2,
        "match_col": 2, "result_col": 3, "group_rows": (3, 46),
        "sika_row": 47, "gs_row": 87,
        "cup_rows": {"r16": (51, 66), "qf": (68, 75), "sf": (77, 80),
                     "final": (82, 83), "champion": (85, 85)},
    },
}


def cellval(ws, r, c):
    v = ws.cell(row=r, column=c).value
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def load_aliases():
    p = os.path.join(HIST, "aliases.json")
    if not os.path.exists(p):
        print("VAROITUS: history/aliases.json puuttuu — käytetään alkuperäisiä nimiä!")
        return {}
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def import_one(tid, cfg, aliases):
    wb = openpyxl.load_workbook(os.path.join(HIST, cfg["file"]), read_only=True, data_only=False)
    ws = wb["Tulokset"]
    amap = aliases.get(tid, {})

    # osallistujat
    cols, c = {}, cfg["name_col"]
    while True:
        v = cellval(ws, cfg["name_row"], c)
        if not v:
            break
        canon = amap.get(v)
        if not canon:
            print(f"  VAROITUS {tid}: nimeä {v!r} ei alias-kartassa — käytetään sellaisenaan")
            canon = v
        cols[canon] = c
        c += cfg["name_step"]

    def picks_at(r):
        return {n: cellval(ws, r, cc) for n, cc in cols.items() if cellval(ws, r, cc)}

    # lohko-ottelut
    group_matches = []
    for r in range(cfg["group_rows"][0], cfg["group_rows"][1] + 1):
        pair = cellval(ws, r, cfg["match_col"])
        if not pair or not MATCH_RE.match(pair):
            continue
        group_matches.append({
            "pair": pair.upper(),
            "result": cellval(ws, r, cfg["result_col"]),
            "picks": picks_at(r),
        })

    # sikajengi (tulos voi olla tasajaettu '&'-erottimella) ja maalintekijä
    sika_res = cellval(ws, cfg["sika_row"], cfg["result_col"])
    sika = {
        "result": [s.strip().upper() for s in re.split(r"[&/,]", sika_res)] if sika_res and "Maalintekij" not in sika_res else [],
        "picks": picks_at(cfg["sika_row"]),
    }
    gs_res = cellval(ws, cfg["gs_row"], cfg["result_col"])
    if gs_res and ("aalintekij" in gs_res or gs_res.startswith("=")):
        gs_res = None  # tuloskennossa onkin label/kaava
    goalscorer = {"result": gs_res, "picks": picks_at(cfg["gs_row"])}

    out = {
        "id": tid, "year": cfg["year"], "name": cfg["name"], "scheme": cfg["scheme"],
        "source": cfg["file"], "players": sorted(cols.keys()),
        "groupMatches": group_matches, "sikajengi": sika, "goalscorer": goalscorer,
    }

    if cfg["scheme"] == "qualifier-sets":
        cup = {}
        for key, (r0, r1) in cfg["cup_rows"].items():
            res, picks = [], {n: [] for n in cols}
            for r in range(r0, r1 + 1):
                v = cellval(ws, r, cfg["result_col"])
                if v:
                    res.append(v.upper())
                for n, cc in cols.items():
                    pv = cellval(ws, r, cc)
                    if pv:
                        picks[n].append(pv.upper())
            if key == "champion":
                cup[key] = {"result": res[0] if res else None,
                            "picks": {n: v[0] for n, v in picks.items() if v}}
            else:
                cup[key] = {"result": res, "picks": {n: v for n, v in picks.items() if v}}
        out["cup"] = cup
        out["champion"] = cup["champion"]
    else:
        # ko-winners: kerää kaikki rivit joilla on tulos tai veikkauksia; label
        # A-sarakkeesta (jatkuu edellisestä jos tyhjä)
        ko, label = [], None
        for r in range(cfg["ko_rows"][0], cfg["ko_rows"][1] + 1):
            a = cellval(ws, r, 1)
            if a:
                label = a.replace("\n", " ")
            res = cellval(ws, r, cfg["result_col"])
            picks = picks_at(r)
            if not res and len(picks) < max(2, len(cols) // 2):
                continue
            ko.append({"label": label, "result": res.upper() if res else None,
                       "picks": {n: v.upper() for n, v in picks.items()}})
        out["koPicks"] = ko
        fin = next((k for k in ko if k["label"] and "FINAALI" in k["label"].upper()), None)
        out["champion"] = {"result": fin["result"], "picks": fin["picks"]} if fin else None

    path = os.path.join(HIST, f"{tid}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    nres = sum(1 for m in group_matches if m["result"])
    print(f"  {tid}: {len(cols)} pelaajaa · {len(group_matches)} lohko-ottelua ({nres} tulosta) · "
          f"mestari={out['champion']['result'] if out.get('champion') else '?'} → {path}")


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    aliases = load_aliases()
    for tid, cfg in CONFIGS.items():
        if only and tid != only:
            continue
        import_one(tid, cfg, aliases)


if __name__ == "__main__":
    main()
