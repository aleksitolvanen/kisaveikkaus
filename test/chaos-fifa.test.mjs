// Kaaossimulaatio: "maailma" jossa ottelut etenevät oikein (ei alkanut ->
// käynnissä -> päättynyt), mutta FIFA-syöte tekee yllätyksiä: statusvälähdyksiä,
// null-pisteitä, kadonneita otteluita, käännettyjä pareja, roskastatuksia ja
// jopa "live raportoitu lopullisena" -virheitä. applyResults ajetaan joka
// tikillä; puhtailla tikeillä (joka 50.) tila VAATIA täsmälleen oikeaksi —
// eli kaikki häiriöt pitää korjaantua heti kun syöte tervehtyy.
//
//   npm test                                  (oletus: 2000 tikkiä x 3 seediä)
//   CHAOS_TICKS=200000 CHAOS_SEEDS=20 npm test  (pitkä ja perusteellinen ajo)
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyResults, indexFifa } from "../tools/fetch-fifa.mjs";

const TICKS = Number(process.env.CHAOS_TICKS || 2000);
const SEEDS = Number(process.env.CHAOS_SEEDS || 3);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWorld(rand, ticks) {
  // 24 ottelua 4 lohkossa, elinkaaret ripoteltuna ajolle
  const groups = ["A", "B", "C", "D"];
  const teams = {};
  groups.forEach((g, gi) => { teams[g] = [0, 1, 2, 3].map((i) => g + "T" + i); });
  const matches = [];
  const T = { matches: [] };
  let id = 0;
  for (const g of groups) {
    const ts = teams[g];
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
      id++;
      const mid = g + id;
      const start = Math.floor(rand() * ticks * 0.7);
      const dur = 10 + Math.floor(rand() * 20);
      // maalitapahtumat live-jakson aikana
      const goals = [];
      let gh = 0, ga = 0;
      for (let k = 0; k < 6; k++) {
        if (rand() < 0.35) {
          const at = start + 1 + Math.floor(rand() * (dur - 1));
          if (rand() < 0.5) goals.push({ at, side: 0 }); else goals.push({ at, side: 1 });
        }
      }
      goals.sort((a, b) => a.at - b.at);
      matches.push({ id: mid, group: g, home: ts[i], away: ts[j], start, end: start + dur, goals });
      T.matches.push({ id: mid, group: g, home: ts[i], away: ts[j] });
    }
  }
  return { matches, T };
}

const scoreAt = (m, tick) => {
  let h = 0, a = 0;
  for (const g of m.goals) if (g.at <= tick) { if (g.side === 0) h++; else a++; }
  return [h, a];
};
const phase = (m, t) => (t < m.start ? "scheduled" : t < m.end ? "live" : "finished");

function feedEntry(m, tick, rand, chaos) {
  const ph = phase(m, tick);
  const [h, a] = scoreAt(m, Math.min(tick, m.end));
  let status = ph === "scheduled" ? 1 : ph === "live" ? 3 : 0;
  let hs = ph === "scheduled" ? null : h;
  let as = ph === "scheduled" ? null : a;
  let home = m.home, away = m.away;
  if (chaos) {
    const r = rand();
    if (r < 0.06) return null;                          // katoaa syötteestä
    else if (r < 0.10) status = ph === "finished" ? 3 : 0;   // statusvälähdys (myös live->FT!)
    else if (r < 0.13) { hs = null; as = null; }        // pisteet katoavat hetkeksi
    else if (r < 0.16) status = [4, 7, 12, 99][Math.floor(rand() * 4)]; // roskastatus
    if (rand() < 0.15) { [home, away] = [away, home]; [hs, as] = [as, hs]; } // käännetty esitys
  }
  return {
    GroupName: [{ Description: "Group " + m.group }],
    Home: { Abbreviation: home }, Away: { Abbreviation: away },
    HomeTeamScore: hs, AwayTeamScore: as, MatchStatus: status,
  };
}

function runChaos(seed) {
  const rand = rng(seed);
  const { matches, T } = makeWorld(rand, TICKS);
  const results = { matches: {}, live: {}, dirtiestTeams: [], rounds: {}, goals: {} };
  for (let tick = 0; tick < TICKS; tick++) {
    const clean = tick % 50 === 0;
    const feed = matches.map((m) => feedEntry(m, tick, rand, !clean)).filter(Boolean);
    applyResults(indexFifa(feed), T, results);   // ei saa heittää

    // rakenteellinen invariantti joka tikillä
    for (const v of [...Object.values(results.matches), ...Object.values(results.live)]) {
      assert.match(v, /^\d+-\d+$/, `seed ${seed} tick ${tick}: rikkinäinen tulos ${v}`);
    }
    if (clean) {
      // puhtaan syötteen jälkeen tilan on oltava TÄSMÄLLEEN totuus
      for (const m of matches) {
        const ph = phase(m, tick);
        const truth = scoreAt(m, Math.min(tick, m.end)).join("-");
        if (ph === "finished") {
          assert.equal(results.matches[m.id], truth,
            `seed ${seed} tick ${tick}: ${m.id} FT puuttuu/väärin (${results.matches[m.id]} != ${truth})`);
          assert.equal(results.live[m.id], undefined,
            `seed ${seed} tick ${tick}: ${m.id} päättynyt mutta yhä livenä`);
        } else if (ph === "live") {
          assert.equal(results.live[m.id], truth,
            `seed ${seed} tick ${tick}: ${m.id} live-tulos väärin`);
          assert.equal(results.matches[m.id], undefined,
            `seed ${seed} tick ${tick}: ${m.id} kesken mutta kirjattu lopulliseksi`);
        } else {
          assert.equal(results.matches[m.id], undefined,
            `seed ${seed} tick ${tick}: ${m.id} ei alkanut mutta kirjattu`);
          assert.equal(results.live[m.id], undefined,
            `seed ${seed} tick ${tick}: ${m.id} ei alkanut mutta livenä`);
        }
      }
    }
  }
  // loppukonvergenssi: kolme puhdasta tikkiä ja täysi tarkistus
  for (let k = 0; k < 3; k++) {
    const feed = matches.map((m) => feedEntry(m, TICKS + k, rand, false)).filter(Boolean);
    applyResults(indexFifa(feed), T, results);
  }
  let finished = 0;
  for (const m of matches) {
    if (phase(m, TICKS + 2) === "finished") {
      finished++;
      assert.equal(results.matches[m.id], scoreAt(m, m.end).join("-"),
        `seed ${seed}: loppukonvergenssi epäonnistui ${m.id}`);
    }
  }
  return { matches: matches.length, finished };
}

for (let s = 1; s <= SEEDS; s++) {
  const seed = s * 7919;
  test(`kaaossimulaatio seed=${seed} (${TICKS} tikkiä)`, () => {
    const { matches, finished } = runChaos(seed);
    assert.ok(finished > 0, "maailmassa pitäisi päättyä otteluita");
  });
}
