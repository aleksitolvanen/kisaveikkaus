#!/usr/bin/env python3
"""Tuo veikkaukset tai oikeat tulokset kisaveikkaus-Excelistä JSONiksi.

Käyttö:
    python tools/import-excel.py <xlsx> <tournamentId> --mode predictions
    python tools/import-excel.py <xlsx> <tournamentId> --mode results
    python tools/import-excel.py <xlsx> <tournamentId> --mode all

Kirjoittaa kohteeseen data/<tournamentId>/{tournament,predictions,results}.json.

Sama "Tulokset"-välilehden rakenne toistuu vuodesta toiseen (ryhmä jakaa saman
Excel-pohjan), joten skripti toimii myös tulevien turnausten Exceleille. Rakenne
tunnistetaan pääosin automaattisesti (lohko-otsikot, ottelut XXX-YYY-regexillä,
Sikajengi-/Maalintekijä-rivit labelista). Cup-vaiheen rivivälit ovat
eksplisiittisessä LAYOUT-kartassa. Jos tuleva pohja eroaa, päivitä LAYOUT.

Vaatii: openpyxl  (pip install openpyxl)
"""
import argparse
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
    from openpyxl.utils import get_column_letter, column_index_from_string
except ImportError:
    sys.exit("Tarvitaan openpyxl:  pip install openpyxl")

SHEET = "Tulokset"
RESULT_COL = column_index_from_string("C")  # "TULOS" – oikeat tulokset
FIRST_PRED_COL = column_index_from_string("E")  # ensimmäinen veikkaajan sarake
MATCH_RE = re.compile(r"^([A-Za-z]{2,4})-([A-Za-z]{2,4})$")

# Template "mm-2026": cup-vaiheen rivivälit (inclusive).
LAYOUT = {
    # Veikkaukset ja oikeat tulokset luetaan samoilta riveiltä: veikkaajan
    # sarakkeesta (E,G,...) ja oikeiden tulosten C-sarakkeesta. Ylläpitäjä
    # täyttää oikeat jatkoonpääsijät C-sarakkeeseen samoille riveille.
    "cup":       {"r16": (93, 108), "qf": (110, 117), "sf": (119, 122),
                  "final": (124, 125), "champion": (127, 127)},
    "cupMeta":   {"r16": ("16 joukkoon", 2), "qf": ("Puolivälierä", 4),
                  "sf": ("Välierä", 8), "final": ("Finaali", 15),
                  "champion": ("Mestari", 30)},
}
ROUND_ORDER = ["r16", "qf", "sf", "final", "champion"]


def cellval(ws, row, col):
    v = ws.cell(row=row, column=col).value
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def find_label_row(ws, needle, maxrow=200):
    needle = needle.lower()
    for r in range(1, maxrow + 1):
        a = ws.cell(row=r, column=1).value
        if a and needle in str(a).lower():
            return r
    return None


def parse_kickoff(label):
    if not label:
        return None, None
    m = re.search(r"(\d{1,2})\.(\d{1,2})\D+klo\s+(\d{1,2}):(\d{2})", str(label), re.I)
    if not m:
        return str(label), None
    d, mo, h, mi = map(int, m.groups())
    return str(label), f"2026-{mo:02d}-{d:02d}T{h:02d}:{mi:02d}:00"


def scan_layout(ws):
    """Auto-tunnista ottelurivit, lohkot, sikajengi-/maalintekijärivit."""
    matches, groups, group_order = [], {}, []
    cur, gcount = None, 0
    for r in range(1, 92):
        a = ws.cell(row=r, column=1).value
        b = ws.cell(row=r, column=2).value
        gm = re.match(r"lohko\s+(\S+)\s*$", str(a).strip(), re.I) if a else None
        if gm:
            cur = gm.group(1).upper()
            groups[cur], gcount = [], 0
            group_order.append(cur)
            continue
        if b and MATCH_RE.match(str(b).strip()):
            home, away = str(b).strip().split("-")
            gcount += 1
            label, iso = parse_kickoff(a)
            matches.append({"id": f"{cur}{gcount}", "group": cur, "home": home,
                            "away": away, "timeLabel": label, "kickoff": iso,
                            "row": r})
            for t in (home, away):
                if t not in groups[cur]:
                    groups[cur].append(t)
    return matches, groups, group_order, {
        "sikajengi": find_label_row(ws, "Sikajengi"),
        "goalscorer": find_label_row(ws, "Maalintekij"),
    }


def participant_cols(ws):
    out, c = [], FIRST_PRED_COL
    while True:
        name = ws.cell(row=2, column=c).value
        if name is None:
            break
        out.append((str(name).strip(), c))
        c += 2
    return out


def read_cup(ws, ranges, col):
    out = {}
    for key in ROUND_ORDER:
        r0, r1 = ranges[key]
        picks = [cellval(ws, r, col) for r in range(r0, r1 + 1)]
        picks = [x for x in picks if x]
        out[key] = (picks[0] if picks else None) if key == "champion" else picks
    return out


def build_tournament(tid, matches, groups, group_order):
    teams = sorted({t for ts in groups.values() for t in ts})
    return {
        "id": tid, "name": tid.upper(), "type": "worldcup",
        "year": 2026, "startDate": "2026-06-11",
        "teams": teams,
        "groups": {g: groups[g] for g in group_order},
        "matches": [{k: v for k, v in m.items() if k != "row"} for m in matches],
        "cupRounds": [{"key": k, "label": LAYOUT["cupMeta"][k][0],
                       "pointsPerTeam": LAYOUT["cupMeta"][k][1],
                       "slots": LAYOUT["cup"][k][1] - LAYOUT["cup"][k][0] + 1}
                      for k in ROUND_ORDER],
        "scoring": {"group": {"exact": 3, "outcome": 1, "miss": 0},
                    "sikajengi": {"points": 8, "tiePoints": 4},
                    "goalscorer": {"perGoal": 1}},
    }


def build_predictions(ws, matches, rows):
    preds = {}
    for name, c in participant_cols(ws):
        p = {"matches": {}, "cup": read_cup(ws, LAYOUT["cup"], c),
             "sikajengi": None, "goalscorer": None}
        for m in matches:
            v = cellval(ws, m["row"], c)
            if v:
                p["matches"][m["id"]] = v
        if rows["sikajengi"]:
            p["sikajengi"] = cellval(ws, rows["sikajengi"], c)
        if rows["goalscorer"]:
            p["goalscorer"] = cellval(ws, rows["goalscorer"], c)
        preds[name] = p
    return preds


def build_results(ws, matches, rows, existing):
    res = {"matches": {}, "dirtiestTeams": [], "rounds": {},
           "goals": (existing or {}).get("goals", {})}
    for m in matches:
        v = cellval(ws, m["row"], RESULT_COL)
        if v:
            res["matches"][m["id"]] = v
    if rows["sikajengi"]:
        sg = cellval(ws, rows["sikajengi"], RESULT_COL)
        if sg:
            res["dirtiestTeams"] = [sg]
    res["rounds"] = read_cup(ws, LAYOUT["cup"], RESULT_COL)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("tournamentId")
    ap.add_argument("--mode", choices=["predictions", "results", "all"], default="all")
    ap.add_argument("--outdir", default=None)
    args = ap.parse_args()

    outdir = args.outdir or os.path.join("data", args.tournamentId)
    os.makedirs(outdir, exist_ok=True)
    wb = openpyxl.load_workbook(args.xlsx, data_only=False)
    if SHEET not in wb.sheetnames:
        sys.exit(f"Välilehteä '{SHEET}' ei löydy: {wb.sheetnames}")
    ws = wb[SHEET]

    matches, groups, group_order, rows = scan_layout(ws)
    if not matches:
        sys.exit("Ei löytynyt yhtään ottelua – tarkista Excel-pohja.")

    def write(name, obj):
        path = os.path.join(outdir, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        print(f"  {path}  ({len(json.dumps(obj))} tavua)")

    print(f"Excel: {args.xlsx}  →  {outdir}/")
    print(f"  {len(matches)} ottelua, {len(group_order)} lohkoa, "
          f"{len(participant_cols(ws))} osallistujaa")

    if args.mode in ("predictions", "all"):
        write("tournament.json", build_tournament(args.tournamentId, matches, groups, group_order))
        write("predictions.json", build_predictions(ws, matches, rows))
    if args.mode in ("results", "all"):
        existing = None
        rpath = os.path.join(outdir, "results.json")
        if os.path.exists(rpath):
            with open(rpath, encoding="utf-8") as f:
                existing = json.load(f)
        write("results.json", build_results(ws, matches, rows, existing))


if __name__ == "__main__":
    main()
