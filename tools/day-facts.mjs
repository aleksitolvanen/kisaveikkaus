// Päivän faktapaketti digestiä (katsaus + roast) varten — pelkkää deterministisesti
// laskettua faktaa, AI ei keksi lukuja itse.
//
//   node tools/day-facts.mjs [tid]                  pending: kaikki ratkenneet
//                                                   ottelut joita aiemmat digestit
//                                                   eivät kata (digests.json covers)
//   node tools/day-facts.mjs [tid] <futispäivä>     tietyn päivän ottelut (2026-06-11)
//
// Futispäivä = päivä johon ottelu kuuluu Suomen ajassa, kun raja on klo 08
// (yön matsit kuuluvat edelliseen iltaan — sama logiikka kuin sivulla).
// Tulokset haetaan data-repon data.json:sta (tuotannon totuus); maalintekijät
// ja kortit FIFA:n timeline-API:sta.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { matchPoints, scoreAll, parseScore, sign } from "../scoring.mjs";

const tid = process.argv.find((a, i) => i >= 2 && !/^\d{4}-/.test(a)) || "mm2026";
const day = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

const DATA_URL = "https://raw.githubusercontent.com/aleksitolvanen/kisaveikkaus-mm2026/main/data.json";
const curl = (u) => JSON.parse(execFileSync("curl",
  ["-sS", "--max-time", "30", u + (u.includes("?") ? "&" : "?") + "cb=" + Date.now()],
  { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 }));

// futispäivä: Helsinki-päivä 8 h taaksepäin siirrettynä
const fDay = (iso) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Helsinki" })
  .format(new Date(new Date(iso).getTime() - 8 * 3600000));

const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..", "data", tid);
const T = JSON.parse(await readFile(path.join(dir, "tournament.json"), "utf-8"));
const P = JSON.parse(await readFile(path.join(dir, "predictions.json"), "utf-8"));
const R = curl(DATA_URL).results;

const names = Object.keys(P);
const tn = (c) => (T.teamNames && T.teamNames[c]) || c;

// --- käsiteltävät ottelut: tietty futispäivä TAI pending-mode (ratkenneet
// joita aiemmat digestit eivät kata — kattavuus digests.json "covers"-listoista,
// jolloin ei haittaa ajetaanko digest heti illalla vai vasta seuraavana päivänä)
let dayGroup, dayKo, covered = [];
if (day) {
  dayGroup = T.matches.filter((m) => m.kickoff && fDay(m.kickoff) === day);
  dayKo = (T.knockout || []).filter((m) => m.kickoff && fDay(m.kickoff) === day);
} else {
  try {
    const dg = JSON.parse(await readFile(path.join(dir, "digests.json"), "utf-8")).days || {};
    covered = Object.values(dg).flatMap((d) => d.covers || []);
  } catch {}
  dayGroup = T.matches.filter((m) => (R.matches || {})[m.id] && !covered.includes(m.id));
  dayKo = (T.knockout || []).filter((m) => m.score && !covered.includes(m.id));
}

// --- per ottelu: tulos, pisteet per veikkaaja, timeline (maalit + kortit)
const matches = [];
for (const m of dayGroup) {
  const res = (R.matches || {})[m.id] || null;
  const live = (R.live || {})[m.id] || null;
  const entry = { id: m.id, pair: m.home + "-" + m.away, names: tn(m.home) + " – " + tn(m.away),
    result: res, liveNow: live, stadium: m.stadium, city: m.city };
  if (res) {
    const rows = names.map((n) => {
      const pick = (P[n].matches || {})[m.id] || null;
      const pts = matchPoints(pick, res, T.scoring.group);
      const ps = parseScore(pick), rs = parseScore(res);
      const dist = ps && rs ? Math.abs(ps[0] - rs[0]) + Math.abs(ps[1] - rs[1]) +
        (sign(ps[0] - ps[1]) !== sign(rs[0] - rs[1]) ? 2 : 0) : 99;
      return { n, pick, pts, dist };
    });
    entry.exact = rows.filter((r) => r.pts === 3).map((r) => r.n);
    entry.direction = rows.filter((r) => r.pts === 1).map((r) => r.n + " (" + r.pick + ")");
    entry.zero = rows.filter((r) => r.pts === 0).map((r) => r.n + " (" + r.pick + ")");
    entry.worstPick = rows.slice().sort((a, b) => b.dist - a.dist)[0];
  }
  // timeline: maalit + kortit (stage/match-id:t ottelun urlista)
  const ids = (m.url || "").match(/match\/(\d+)\/(\d+)\/(\d+)\/(\d+)/);
  if (ids && (res || live)) {
    try {
      const tl = curl(`https://api.fifa.com/api/v3/timelines/${ids[1]}/${ids[2]}/${ids[3]}/${ids[4]}?language=en`);
      const ev = tl.Event || [];
      const desc = (e) => (e.EventDescription && e.EventDescription[0] && e.EventDescription[0].Description) || "";
      entry.goals = ev.filter((e) => e.Type === 0 || e.Type === 41).map((e) => e.MatchMinute + " " + desc(e));
      entry.yellows = ev.filter((e) => e.Type === 2).map((e) => e.MatchMinute + " " + desc(e));
      entry.reds = ev.filter((e) => e.Type === 3 || e.Type === 4).map((e) => e.MatchMinute + " " + desc(e) + (e.Type === 4 ? " (2. keltainen)" : ""));
    } catch {}
  }
  matches.push(entry);
}
for (const m of dayKo) {
  matches.push({ id: m.id, pair: m.home + "-" + m.away, round: m.roundLabel,
    result: m.score || null, liveNow: m.liveScore || null, knockout: true });
}

// --- sarjataulukko: nyt vs ennen päivää (päivän matsit poistettuna)
const rowsNow = scoreAll(P, R, T);
const Rbefore = JSON.parse(JSON.stringify(R));
for (const m of dayGroup) delete (Rbefore.matches || {})[m.id];
const rowsBefore = scoreAll(P, Rbefore, T);
const rankOf = (rows) => { const r = {}; rows.forEach((x, i) => r[x.name] = i + 1); return r; };
const rb = rankOf(rowsBefore), rn = rankOf(rowsNow);
const standings = rowsNow.map((x) => ({ name: x.name, total: x.total,
  dayPts: x.total - (rowsBefore.find((y) => y.name === x.name) || {}).total,
  rank: rn[x.name], move: rb[x.name] - rn[x.name] }));

// --- maalintekijäosumat: osuiko kenenkään veikkaama pelaaja päivän maaleihin
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const gsHits = [];
for (const n of names) {
  const pick = P[n].goalscorer; if (!pick) continue;
  const sur = norm(pick).split(/\s+/).pop();
  for (const m of matches) for (const g of (m.goals || [])) {
    if (norm(g).includes(sur)) gsHits.push({ n, pick, goal: g, match: m.pair });
  }
}

// --- sikaveikkaukset kontekstiksi (kuka veikkasi mitä)
const sikaPicks = {};
for (const n of names) { const s = P[n].sikajengi; if (s) (sikaPicks[s] = sikaPicks[s] || []).push(n); }

console.log(JSON.stringify({
  mode: day ? "day" : "pending",
  day: day || fDay(new Date().toISOString()),
  covers: matches.filter((m) => m.result).map((m) => m.id),   // -> digestin covers-kenttään
  liveNow: Object.keys(R.live || {}),
  matches, standings, goalscorerHits: gsHits, sikaPicks,
  decidedTotal: Object.keys(R.matches || {}).length }, null, 2));
