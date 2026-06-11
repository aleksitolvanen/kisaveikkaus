// fetch-fifa:n puhtaiden funktioiden yksikkötestit: live/lopullinen-jako,
// stale-siivous, statussuojat, parien suunnistus, knockout-tilat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyResults, updateKnockout, indexFifa, pairKey } from "../tools/fetch-fifa.mjs";

const T = { matches: [
  { id: "A1", group: "A", home: "MEX", away: "RSA" },
  { id: "A2", group: "A", home: "KOR", away: "CZE" },
  { id: "B1", group: "B", home: "CAN", away: "BIH" },
] };
const fm = (h, a, hs, as, st) => ({
  GroupName: [{ Description: "Group " + (h === "CAN" || h === "BIH" ? "B" : "A") }],
  Home: { Abbreviation: h }, Away: { Abbreviation: a },
  HomeTeamScore: hs, AwayTeamScore: as, MatchStatus: st,
});
const emptyResults = () => ({ matches: {}, live: {}, dirtiestTeams: [], rounds: {}, goals: {} });

test("päättynyt (status 0) -> matches", () => {
  const r = emptyResults();
  applyResults(indexFifa([fm("MEX", "RSA", 2, 1, 0)]), T, r);
  assert.equal(r.matches.A1, "2-1");
  assert.deepEqual(r.live, {});
});

test("käynnissä (status 3) -> live, ei matches", () => {
  const r = emptyResults();
  applyResults(indexFifa([fm("MEX", "RSA", 1, 0, 3)]), T, r);
  assert.equal(r.matches.A1, undefined);
  assert.equal(r.live.A1, "1-0");
});

test("ei alkanut (status 1) -> ei kumpaankaan, vaikka pisteet olisivat", () => {
  const r = emptyResults();
  applyResults(indexFifa([fm("MEX", "RSA", 0, 0, 1)]), T, r);
  assert.deepEqual(r.matches, {});
  assert.deepEqual(r.live, {});
});

test("null-pisteet -> ohitetaan statuksesta riippumatta", () => {
  const r = emptyResults();
  applyResults(indexFifa([fm("MEX", "RSA", null, null, 3)]), T, r);
  assert.deepEqual(r.live, {});
});

test("stale-siivous: kirjattu tulos poistuu kun FIFA sanoo 'käynnissä'", () => {
  const r = emptyResults();
  r.matches.A1 = "1-0";  // vanhan koodin jäännös
  const n = applyResults(indexFifa([fm("MEX", "RSA", 1, 0, 3)]), T, r);
  assert.equal(r.matches.A1, undefined);
  assert.equal(r.live.A1, "1-0");
  assert.ok(n >= 1);
});

test("statussuoja: tuntematon status EI poista kirjattua tulosta", () => {
  const r = emptyResults();
  r.matches.A1 = "2-1";
  applyResults(indexFifa([fm("MEX", "RSA", 2, 1, 4)]), T, r);  // 4 = abandoned tms
  assert.equal(r.matches.A1, "2-1", "kirjattu tulos säilyy API-välähdyksessä");
});

test("FT-korjaus: FIFA muuttaa lopullista tulosta -> päivittyy", () => {
  const r = emptyResults();
  r.matches.A1 = "2-1";
  const n = applyResults(indexFifa([fm("MEX", "RSA", 2, 2, 0)]), T, r);
  assert.equal(r.matches.A1, "2-2");
  assert.ok(n >= 1);
});

test("käännetty pari: FIFA RSA-MEX -> tulos kohdistuu oikein päin", () => {
  const r = emptyResults();
  applyResults(indexFifa([fm("RSA", "MEX", 0, 3, 0)]), T, r);
  assert.equal(r.matches.A1, "3-0", "MEX koti -> 3-0 vaikka FIFA listasi RSA ensin");
});

test("live rakentuu joka kerralla uusiksi: poistunut matsi putoaa", () => {
  const r = emptyResults();
  applyResults(indexFifa([fm("MEX", "RSA", 1, 0, 3), fm("KOR", "CZE", 0, 0, 3)]), T, r);
  assert.deepEqual(Object.keys(r.live).sort(), ["A1", "A2"]);
  applyResults(indexFifa([fm("KOR", "CZE", 1, 0, 3)]), T, r);  // A1 katosi syötteestä
  assert.deepEqual(Object.keys(r.live), ["A2"]);
});

test("muuttumaton tila -> n=0 (ei turhaa kirjoitusta)", () => {
  const r = emptyResults();
  applyResults(indexFifa([fm("MEX", "RSA", 1, 0, 3)]), T, r);
  const n = applyResults(indexFifa([fm("MEX", "RSA", 1, 0, 3)]), T, r);
  assert.equal(n, 0);
});

test("indexFifa ohittaa knockoutin (ei GroupNamea)", () => {
  const ko = { Home: { Abbreviation: "MEX" }, Away: { Abbreviation: "RSA" },
    HomeTeamScore: 1, AwayTeamScore: 0, MatchStatus: 0 };
  assert.deepEqual(indexFifa([ko]), {});
});

test("pairKey on järjestysriippumaton", () => {
  assert.equal(pairKey("A", "MEX", "RSA"), pairKey("A", "RSA", "MEX"));
});

const koFm = (num, h, a, hs, as, st) => ({
  StageName: [{ Description: "Round of 32" }], IdMatch: "M" + num, MatchNumber: num,
  Home: h ? { Abbreviation: h } : null, Away: a ? { Abbreviation: a } : null,
  PlaceHolderA: "1A", PlaceHolderB: "2B",
  HomeTeamScore: hs, AwayTeamScore: as, MatchStatus: st,
  Date: "2026-06-28T19:00:00Z", IdStage: "S",
});
const koT = () => ({ knockout: [
  { fifaId: "M73", matchNumber: 73, home: "1A", away: "2B", real: false, score: null, liveScore: null },
] });

test("knockout käynnissä -> liveScore, score null", () => {
  const t = koT();
  const changed = updateKnockout([koFm(73, "MEX", "KOR", 1, 1, 3)], t);
  assert.ok(changed);
  assert.equal(t.knockout[0].liveScore, "1-1");
  assert.equal(t.knockout[0].score, null);
  assert.equal(t.knockout[0].real, true);
});

test("knockout päättynyt -> score, liveScore tyhjenee", () => {
  const t = koT();
  updateKnockout([koFm(73, "MEX", "KOR", 1, 1, 3)], t);
  updateKnockout([koFm(73, "MEX", "KOR", 2, 1, 0)], t);
  assert.equal(t.knockout[0].score, "2-1");
  assert.equal(t.knockout[0].liveScore, null);
});

test("knockout placeholderit ennen pareja -> ei kaadu, real=false", () => {
  const t = koT();
  const changed = updateKnockout([koFm(73, null, null, null, null, 1)], t);
  assert.equal(t.knockout[0].real, false);
  assert.equal(changed, false);  // sama tila kuin pohjassa
});
