// Laskee per-pelaaja-faktapaketit historia-JSONeista + nykyisestä turnauksesta.
// Tuotos: history/factpacks.json — puhdasta dataa, jonka päälle AI-analyysi
// (pelaajakortti/roast) kirjoitetaan erillisenä kerroksena.
//
//   node tools/player-facts.mjs [pelaaja]   # ilman argumenttia: kaikki
import { readFile, writeFile } from "node:fs/promises";

const HIST = ["em2016", "mm2018", "em2021", "em2024"];
// Historialliset suomikoodit -> FIFA-koodit (vain varmat; tendenssilaskentaan)
const HISTCODE = { RAN: "FRA", SAK: "GER", SPA: "ESP", VEN: "RUS", "ITÄ": "AUT" };
const norm = (c) => (c ? HISTCODE[c] || c : null);
const nameKey = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const parse = (s) => {
  const m = String(s || "").trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  return m ? [+m[1], +m[2]] : null;
};

const rd = async (p) => JSON.parse(await readFile(p, "utf-8"));
const hist = {};
for (const tid of HIST) hist[tid] = await rd(`history/${tid}.json`);
const hof = await rd("history/halloffame.json");
const cur = await rd("data/mm2026/predictions.json");

const players = new Set(Object.keys(cur));
for (const j of Object.values(hist)) j.players.forEach((p) => players.add(p));

function styleStats(picks) {
  let n = 0, draws = 0, goals = 0, homeWins = 0, awayWins = 0;
  const freq = {};
  for (const v of picks) {
    const s = parse(v);
    if (!s) continue;
    n++; goals += s[0] + s[1];
    if (s[0] === s[1]) draws++;
    else if (s[0] > s[1]) homeWins++; else awayWins++;
    const k = s[0] + "-" + s[1];
    freq[k] = (freq[k] || 0) + 1;
  }
  const fav = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, c]) => ({ score: k, count: c }));
  return n ? { matches: n, drawsPct: Math.round(100 * draws / n), goalsPerMatch: +(goals / n).toFixed(2),
    homeWinsPct: Math.round(100 * homeWins / n), awayWinsPct: Math.round(100 * awayWins / n),
    favScorelines: fav } : null;
}

const packs = {};
for (const name of [...players].sort()) {
  const tournaments = [];
  const champPicks = {}, sikaPicks = {}, gsPicks = {};
  for (const tid of HIST) {
    const j = hist[tid];
    if (!j.players.includes(name)) continue;
    let exact = 0, outcome = 0, miss = 0, solo = 0;
    const myPicks = [];
    for (const m of j.groupMatches) {
      const p = m.picks[name];
      if (!p) continue;
      myPicks.push(p);
      const ps = parse(p), rs = parse(m.result);
      if (!ps) continue;
      if (!Object.entries(m.picks).some(([k, v]) => k !== name && v === p)) solo++;
      if (rs) {
        if (ps[0] === rs[0] && ps[1] === rs[1]) exact++;
        else if (sign(ps[0] - ps[1]) === sign(rs[0] - rs[1])) outcome++;
        else miss++;
      }
    }
    const st = (j.finalStandings || []).find((r) => r.name === name);
    const champPick = norm(j.champion ? j.champion.picks[name] : null);
    const champActual = norm(j.champion ? j.champion.result : null);
    const sika = j.sikajengi.picks[name] ? norm(j.sikajengi.picks[name].toUpperCase()) : null;
    const gs = j.goalscorer.picks[name] || null;
    if (champPick) champPicks[champPick] = (champPicks[champPick] || 0) + 1;
    if (sika) sikaPicks[sika] = (sikaPicks[sika] || 0) + 1;
    if (gs) gsPicks[nameKey(gs)] = (gsPicks[nameKey(gs)] || 0) + 1;
    tournaments.push({
      id: tid, rank: st ? st.rank : null, of: j.finalStandings ? j.finalStandings.length : null,
      points: st ? st.points : null,
      hits: { exact, outcome, miss }, soloPicks: solo,
      style: styleStats(myPicks),
      champion: { pick: champPick, actual: champActual, correct: !!champPick && champPick === champActual },
      sikajengi: { pick: sika, actual: (j.sikajengi.result || []).map(norm),
        correct: !!sika && (j.sikajengi.result || []).map(norm).includes(sika) },
      goalscorer: { pick: gs, actual: j.goalscorer.result || null,
        correct: !!gs && !!j.goalscorer.result && nameKey(gs) === nameKey(j.goalscorer.result) },
    });
  }
  // MM2026 (veikkaukset lukittu, tulokset kesken — vain tyyli + valinnat)
  let current = null;
  if (cur[name]) {
    const c = cur[name];
    if (c.cup?.champion) champPicks[c.cup.champion] = (champPicks[c.cup.champion] || 0) + 1;
    if (c.sikajengi) sikaPicks[c.sikajengi] = (sikaPicks[c.sikajengi] || 0) + 1;
    if (c.goalscorer) gsPicks[nameKey(c.goalscorer)] = (gsPicks[nameKey(c.goalscorer)] || 0) + 1;
    current = {
      id: "mm2026", style: styleStats(Object.values(c.matches || {})),
      champion: c.cup?.champion || null, final: c.cup?.final || [],
      semifinals: c.cup?.sf || [], sikajengi: c.sikajengi || null, goalscorer: c.goalscorer || null,
    };
  }
  // hall of fame -mitalit (kattaa myös vuodet joiden Excelit puuttuvat)
  const medals = { gold: [], silver: [], bronze: [] };
  for (const t of hof.tournaments) {
    if (!t.podium) continue;
    if ((t.podium["1"] || []).includes(name)) medals.gold.push(t.id);
    if ((t.podium["2"] || []).includes(name)) medals.silver.push(t.id);
    if ((t.podium["3"] || []).includes(name)) medals.bronze.push(t.id);
  }
  const ranks = tournaments.filter((t) => t.rank);
  packs[name] = {
    name, tournaments, current, medals,
    tendencies: {
      championPicks: champPicks, sikaPicks, goalscorerPicks: gsPicks,
      avgRank: ranks.length ? +(ranks.reduce((a, t) => a + t.rank, 0) / ranks.length).toFixed(1) : null,
      bestRank: ranks.length ? Math.min(...ranks.map((t) => t.rank)) : null,
      worstRank: ranks.length ? Math.max(...ranks.map((t) => t.rank)) : null,
      participations: tournaments.length + (current ? 1 : 0),
    },
  };
}

await writeFile("history/factpacks.json", JSON.stringify(packs, null, 1), "utf-8");
const only = process.argv[2];
if (only && packs[only]) console.log(JSON.stringify(packs[only], null, 1));
else console.log(`history/factpacks.json: ${Object.keys(packs).length} pelaajaa`);
