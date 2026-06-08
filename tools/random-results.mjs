// Arpoo data/<tid>/results.json:n testausta varten. Ei realistinen — vain
// rakenteellisesti validi ja pisteytystä kuormittava (cup-joukkueet poimitaan
// osallistujien omista cup-veikkauksista, jotta osumia syntyy ja pistetilanne elää).
//
// Käyttö:  node tools/random-results.mjs [tid] [--stage=group|full] [--seed=N]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const tid = args.find((a) => !a.startsWith("--")) || "mm2026";
const stage = (args.find((a) => a.startsWith("--stage=")) || "--stage=full").split("=")[1];
const seedArg = args.find((a) => a.startsWith("--seed="));
const dir = path.join("data", tid);

// Pieni siemennettävä RNG (mulberry32), jotta --seed antaa toistettavan tuloksen.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = seedArg ? rng(Number(seedArg.split("=")[1])) : Math.random;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const sample = (arr, n) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};
const randomScore = () => `${Math.floor(rand() * 4)}-${Math.floor(rand() * 4)}`;

const tournament = JSON.parse(await readFile(path.join(dir, "tournament.json"), "utf-8"));
const predictions = JSON.parse(await readFile(path.join(dir, "predictions.json"), "utf-8"));

const results = { matches: {}, dirtiestTeams: [], rounds: {}, goals: {} };

// Lohko-ottelut. partial = ~puolet pelattu (kustakin lohkosta alkupuolisko).
let toPlay = tournament.matches;
if (stage === "partial") {
  const byGroup = {};
  tournament.matches.forEach((m) => { (byGroup[m.group] = byGroup[m.group] || []).push(m); });
  toPlay = Object.values(byGroup).flatMap((ms) => ms.slice(0, Math.ceil(ms.length / 2)));
}
for (const m of toPlay) results.matches[m.id] = randomScore();

// Sikajengi ratkeaa vasta lohkovaiheen päätyttyä (ei partialissa).
if (stage !== "partial") {
  results.dirtiestTeams = rand() < 0.2 ? sample(tournament.teams, 2) : [pick(tournament.teams)];
}

// Maalintekijöille maaleja (myös partialissa – kisa käynnissä).
const scorers = [...new Set(Object.values(predictions).map((p) => p.goalscorer).filter(Boolean))];
for (const s of scorers) results.goals[s] = (stage === "partial" ? 0 : 1) + Math.floor(rand() * (stage === "partial" ? 4 : 6));

if (stage === "full" || stage === "mid") {
  // Cup-joukkueet osallistujien veikkauksista → varmistaa osumat
  const poolFor = (key) => {
    const s = new Set();
    for (const p of Object.values(predictions)) {
      const v = p.cup?.[key];
      if (Array.isArray(v)) v.forEach((t) => t && s.add(t));
      else if (v) s.add(v);
    }
    return [...s];
  };
  const r16pool = poolFor("r16");
  const r16 = sample(r16pool.length >= 16 ? r16pool : tournament.teams, 16);
  const qf = sample(r16, 8);
  if (stage === "mid") {
    // r16 + puolivälierä ratkennut, loppu auki
    results.rounds = { r16, qf, sf: [], final: [], champion: null };
  } else {
    const sf = sample(qf, 4), final = sample(sf, 2);
    results.rounds = { r16, qf, sf, final, champion: pick(final) };
  }
} else {
  results.rounds = { r16: [], qf: [], sf: [], final: [], champion: null };
}

await writeFile(path.join(dir, "results.json"), JSON.stringify(results, null, 2) + "\n", "utf-8");
console.log(`Arvottiin tulokset → ${path.join(dir, "results.json")} (stage=${stage}` +
  `${seedArg ? ", " + seedArg.slice(2) : ""})`);
console.log(`  ${Object.keys(results.matches).length} ottelua, sikajengi=${results.dirtiestTeams}` +
  `, mestari=${results.rounds.champion ?? "—"}, maalintekijöitä=${Object.keys(results.goals).length}`);
