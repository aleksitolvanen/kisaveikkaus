// Arpoo data/<tid>/results.json:n testausta varten. Ei realistinen — vain
// rakenteellisesti validi ja pisteytystä kuormittava (cup-joukkueet poimitaan
// osallistujien omista cup-veikkauksista, jotta osumia syntyy ja pistetilanne elää).
// mid/full täyttää myös tournament.json:n knockout-kaavion (parit + tulokset)
// yhteensopivasti rounds-listojen kanssa, jotta cup-kaavio elää.
//
// Käyttö:  node tools/random-results.mjs [tid] [--stage=group|partial|mid|full] [--seed=N]
// Palautus tuotantotilaan:  git checkout data/<tid>/results.json data/<tid>/tournament.json
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
  // vain turnauksessa mukana olevat joukkueet (veikkauksissa on myös karsiutuneita)
  const r16pool = poolFor("r16").filter((t) => tournament.teams.includes(t));
  const r16 = r16pool.length >= 16
    ? sample(r16pool, 16)
    : [...r16pool, ...sample(tournament.teams.filter((t) => !r16pool.includes(t)), 16 - r16pool.length)];
  const qf = sample(r16, 8);
  if (stage === "mid") {
    // r16 + puolivälierä ratkennut, loppu auki
    results.rounds = { r16, qf, sf: [], final: [], champion: null };
  } else {
    const sf = sample(qf, 4), final = sample(sf, 2);
    results.rounds = { r16, qf, sf, final, champion: pick(final) };
  }
  fillKnockout(tournament, results.rounds);
} else {
  results.rounds = { r16: [], qf: [], sf: [], final: [], champion: null };
}

// Täyttää tournament.knockoutin kaavion puun mukaisesti rounds-listoista:
// kierroksen X voittajat = kierrokselle X+1 päässeet, häviäjät arvotaan muista.
// Puu luetaan feedA/feedB-kentistä (tai W##-placeholdereista). ~20 % pelatuista
// päättyy tasan (rankkarit): kaavion voittajakorostus ratkeaa silloin seuraavan
// kierroksen parista.
function fillKnockout(tournament, rounds) {
  const ko = tournament.knockout || [];
  const byNum = new Map(ko.map((m) => [m.matchNumber, m]));
  const W = (s) => { const m = /^W(\d+)$/.exec(String(s)); return m ? Number(m[1]) : null; };
  const feeders = new Map(ko.map((m) => [m.matchNumber, [m.feedA ?? W(m.home), m.feedB ?? W(m.away)]]));
  const rounds4 = ["r32", "r16", "qf", "sf"].map((r) => ko.filter((m) => m.round === r));
  if (rounds4.some((ms) => !ms.length)) return;
  if (rounds4[1].some((m) => feeders.get(m.matchNumber).some((f) => f == null))) {
    console.log("HUOM: kaavion puu ei selviä datasta (feedA/feedB ja placeholderit puuttuvat) – kaaviota ei täytetty.");
    return;
  }

  const win = new Map();   // matchNumber -> voittajakoodi
  const part = new Map();  // matchNumber -> [koti, vieras]
  const score = (played, winnerFirst) => {
    if (!played) return null;
    if (rand() < 0.2) { const g = Math.floor(rand() * 3); return `${g}-${g}`; } // rankkarit
    const w = 1 + Math.floor(rand() * 3), l = Math.floor(rand() * w);
    return winnerFirst ? `${w}-${l}` : `${l}-${w}`;
  };
  // Sijoita ottelun osallistujat: voittaja satunnaiselle puolelle.
  const place = (m, winner, loser, played) => {
    const wHome = rand() < 0.5;
    part.set(m.matchNumber, wHome ? [winner, loser] : [loser, winner]);
    win.set(m.matchNumber, winner);
    m.home = wHome ? winner : loser; m.away = wHome ? loser : winner;
    m.real = true; m.score = score(played, wHome);
  };

  // Ylhäältä alas: kunkin kierroksen otteluille voittaja (= seuraavalle
  // kierrokselle päässyt) ja häviäjä (kierrokselle asti päässyt, ei pidemmälle).
  const stages = [
    { ms: rounds4[3], reach: rounds.sf, next: rounds.final, played: stage === "full" },
    { ms: rounds4[2], reach: rounds.qf, next: rounds.sf, played: stage === "full" },
    { ms: rounds4[1], reach: rounds.r16, next: rounds.qf, played: true },
    { ms: rounds4[0], reach: tournament.teams.filter((t) => !rounds.r16.includes(t)), next: rounds.r16, played: true },
    // r32: "reach" = lohkovaiheesta jatkoon mutta ei r16:een → häviäjäpooli
  ];
  const fM = ko.find((m) => m.round === "final"), bzM = ko.find((m) => m.round === "bronze");
  if (stage === "full" && fM) {
    const fin = sample(rounds.final, 2);
    place(fM, rounds.champion, fin.find((t) => t !== rounds.champion), true);
    if (bzM) { const bz = sample(rounds.sf.filter((t) => !rounds.final.includes(t)), 2);
      if (bz.length === 2) place(bzM, bz[0], bz[1], true); }
  }
  for (const st of stages) {
    if (!st.next || !st.next.length) continue;       // kierros ei vielä ratkennut
    // voittajapaikat: vanhemman ottelun osallistujat sidotaan feedereihin
    const winners = new Map(); // matchNumber -> voittaja
    const parents = ko.filter((m) => st.ms.some((c) => feeders.get(m.matchNumber)?.includes(c.matchNumber)));
    for (const pm of parents) {
      const [fa, fb] = feeders.get(pm.matchNumber);
      const p = part.get(pm.matchNumber) || sample(st.next, 2); // mid: qf-parit arvotaan
      if (!part.has(pm.matchNumber)) {
        // vanhempaa ei pelata vielä: kiinnitä parit silti puun mukaan
        const used = new Set([...winners.values()]);
        const avail = st.next.filter((t) => !used.has(t));
        const pa = sample(avail, 2);
        pm.home = pa[0]; pm.away = pa[1]; pm.real = true; pm.score = null;
        part.set(pm.matchNumber, pa);
      }
      const pp = part.get(pm.matchNumber);
      if (fa != null && byNum.has(fa)) winners.set(fa, pp[0]);
      if (fb != null && byNum.has(fb)) winners.set(fb, pp[1]);
    }
    const losers = sample(st.reach.filter((t) => ![...winners.values()].includes(t)), st.ms.length);
    st.ms.forEach((m, i) => {
      const w = winners.get(m.matchNumber);
      if (w) place(m, w, losers[i], st.played);
    });
  }
}

await writeFile(path.join(dir, "tournament.json"), JSON.stringify(tournament, null, 2) + "\n", "utf-8");
await writeFile(path.join(dir, "results.json"), JSON.stringify(results, null, 2) + "\n", "utf-8");
console.log(`Arvottiin tulokset → ${path.join(dir, "results.json")} (stage=${stage}` +
  `${seedArg ? ", " + seedArg.slice(2) : ""})`);
console.log(`  ${Object.keys(results.matches).length} ottelua, sikajengi=${results.dirtiestTeams}` +
  `, mestari=${results.rounds.champion ?? "—"}, maalintekijöitä=${Object.keys(results.goals).length}`);
