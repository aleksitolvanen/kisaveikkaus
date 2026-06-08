import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseScore, matchPoints, sikajengiPoints, goalscorerPoints,
  cupPoints, scoreParticipant, scoreAll, remainingMax,
} from "../scoring.mjs";

test("parseScore", () => {
  assert.deepEqual(parseScore("2-1"), [2, 1]);
  assert.deepEqual(parseScore(" 0 - 0 "), [0, 0]);
  assert.deepEqual(parseScore("3–2"), [3, 2]); // en dash
  assert.equal(parseScore(""), null);
  assert.equal(parseScore(null), null);
  assert.equal(parseScore("foo"), null);
});

test("matchPoints: oikea tulos = 3", () => {
  assert.equal(matchPoints("2-1", "2-1"), 3);
  assert.equal(matchPoints("0-0", "0-0"), 3);
});

test("matchPoints: oikea lopputulos = 1", () => {
  assert.equal(matchPoints("2-1", "3-0"), 1); // molemmat kotivoitto
  assert.equal(matchPoints("1-1", "2-2"), 1); // molemmat tasapeli
  assert.equal(matchPoints("0-1", "0-3"), 1); // molemmat vierasvoitto
});

test("matchPoints: väärä = 0", () => {
  assert.equal(matchPoints("2-1", "1-2"), 0); // koti vs vieras
  assert.equal(matchPoints("2-1", "1-1"), 0); // voitto vs tasapeli
  assert.equal(matchPoints("1-1", "2-1"), 0);
});

test("matchPoints: pelaamaton tai puuttuva veikkaus = 0", () => {
  assert.equal(matchPoints("2-1", ""), 0);
  assert.equal(matchPoints("2-1", null), 0);
  assert.equal(matchPoints("", "2-1"), 0);
});

test("sikajengi: yksi oikea = 8, tasan = 4", () => {
  assert.equal(sikajengiPoints("GER", ["GER"]), 8);
  assert.equal(sikajengiPoints("GER", ["GER", "ARG"]), 4); // tasatilanne
  assert.equal(sikajengiPoints("GER", ["ARG"]), 0);
  assert.equal(sikajengiPoints(null, ["GER"]), 0);
  assert.equal(sikajengiPoints("GER", []), 0);
});

test("goalscorer: 1p per maali", () => {
  assert.equal(goalscorerPoints("Kane", { Kane: 5 }), 5);
  assert.equal(goalscorerPoints("Kane", { Messi: 3 }), 0);
  assert.equal(goalscorerPoints(null, { Kane: 5 }), 0);
});

const CUP_ROUNDS = [
  { key: "r16", pointsPerTeam: 2, slots: 16 },
  { key: "qf", pointsPerTeam: 4, slots: 8 },
  { key: "sf", pointsPerTeam: 8, slots: 4 },
  { key: "final", pointsPerTeam: 15, slots: 2 },
  { key: "champion", pointsPerTeam: 30, slots: 1 },
];

test("cupPoints: jatkoonpääsijät pisteytyvät kierroksittain, järjestyksellä ei väliä", () => {
  const pred = {
    r16: ["GER", "FRA", "ESP", "BRA"],
    qf: ["GER", "BRA"],
    sf: ["GER"],
    final: ["GER"],
    champion: "GER",
  };
  const rounds = {
    r16: ["FRA", "GER", "ARG", "ESP"], // 3 osumaa (GER,FRA,ESP)
    qf: ["GER", "ARG"], // 1 osuma
    sf: ["ARG", "GER"], // 1 osuma
    final: ["ARG", "GER"], // 1 osuma
    champion: "GER",
  };
  const { total, breakdown } = cupPoints(pred, rounds, CUP_ROUNDS);
  assert.equal(breakdown.r16.points, 6);
  assert.equal(breakdown.qf.points, 4);
  assert.equal(breakdown.sf.points, 8);
  assert.equal(breakdown.final.points, 15);
  assert.equal(breakdown.champion.points, 30);
  assert.equal(total, 63);
});

test("cupPoints: tyhjät tulokset = 0", () => {
  const pred = { r16: ["GER"], qf: [], sf: [], final: [], champion: "GER" };
  const { total } = cupPoints(pred, {}, CUP_ROUNDS);
  assert.equal(total, 0);
});

const TOURNAMENT = {
  matches: [
    { id: "A1" }, { id: "A2" }, { id: "A3" },
  ],
  cupRounds: CUP_ROUNDS,
  scoring: {
    group: { exact: 3, outcome: 1, miss: 0 },
    sikajengi: { points: 8, tiePoints: 4 },
    goalscorer: { perGoal: 1 },
  },
};

test("scoreParticipant: summa kaikista osa-alueista", () => {
  const pred = {
    matches: { A1: "2-1", A2: "1-1", A3: "0-2" },
    cup: { r16: ["GER"], qf: [], sf: [], final: [], champion: "GER" },
    sikajengi: "GER",
    goalscorer: "Kane",
  };
  const results = {
    matches: { A1: "2-1", A2: "0-0", A3: "1-0" }, // 3 + 1 + 0 = 4
    dirtiestTeams: ["GER"], // 8
    rounds: { r16: ["GER"], qf: [], sf: [], final: [], champion: "GER" }, // 2 + 30 = 32
    goals: { Kane: 4 }, // 4
  };
  const s = scoreParticipant(pred, results, TOURNAMENT);
  assert.equal(s.group, 4);
  assert.equal(s.sikajengi, 8);
  assert.equal(s.cup, 32);
  assert.equal(s.goalscorer, 4);
  assert.equal(s.total, 48);
});

test("remainingMax: vain ratkaisemattomat kohteet, maalintekijä pois", () => {
  const pred = {
    matches: { A1: "2-1", A2: "1-1", A3: "0-2" },
    cup: { r16: ["GER"], qf: [], sf: [], final: [], champion: "GER" },
    sikajengi: "GER",
    goalscorer: "Kane",
  };
  const results = {
    matches: { A1: "2-1" },            // A2, A3 ratkaisematta
    dirtiestTeams: [],                 // auki
    rounds: { r16: [], qf: [], sf: [], final: [], champion: null }, // auki
    goals: { Kane: 99 },               // ei vaikuta (avoin)
  };
  // 2 auki olevaa ottelua (veikattu) ×3 = 6 + sikajengi 8 + r16 1 pick ×2 = 2 + mestari 30 = 46
  assert.equal(remainingMax(pred, results, TOURNAMENT), 46);
});

test("remainingMax: ratkaistut eivät tuo lisää", () => {
  const pred = { matches: { A1: "2-1" }, cup: {}, sikajengi: "GER", goalscorer: null };
  const results = { matches: { A1: "2-1", A2: "0-0", A3: "1-0" }, dirtiestTeams: ["GER"],
    rounds: { r16: ["GER"], qf: ["GER"], sf: ["GER"], final: ["GER"], champion: "GER" } };
  assert.equal(remainingMax(pred, results, TOURNAMENT), 0);
});

test("scoreAll: lajittelu ja jaetut sijat", () => {
  const predictions = {
    Ala: { matches: { A1: "2-1" }, cup: {}, sikajengi: null, goalscorer: null },
    Beta: { matches: { A1: "2-1" }, cup: {}, sikajengi: null, goalscorer: null },
    Gamma: { matches: { A1: "0-0" }, cup: {}, sikajengi: null, goalscorer: null },
  };
  const results = { matches: { A1: "2-1" }, rounds: {} };
  const rows = scoreAll(predictions, results, TOURNAMENT);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 1); // jaettu ykkönen (Ala & Beta, 3p)
  assert.equal(rows[2].rank, 3); // Gamma 0p -> sija 3, ei 2
  assert.equal(rows[2].name, "Gamma");
});
