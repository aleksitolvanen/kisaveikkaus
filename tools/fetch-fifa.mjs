// Hakee oikean otteluohjelman ja live-tulokset FIFA:n virallisesta v3-API:sta
// ja päivittää data/<tid>/tournament.json + results.json. Yhdistää FIFA-ottelut
// meidän otteluihin lohko + joukkuepari -avaimella (otteluiden id:t A1..L6
// säilyvät → veikkaukset pysyvät kohdallaan).
//
//   node tools/fetch-fifa.mjs [tid] --mode schedule|results|all
//
// Lähteet:  api.fifa.com/api/v3 · idCompetition=17 · idSeason=285023 (MM 2026).
// HTTP-kuljetus curl-lapsiprosessina (kuten finnkino).
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const tid = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) || "mm2026";
const mode = (process.argv.find((a) => a.startsWith("--mode=")) || "--mode=all").split("=")[1];
const dir = path.join("data", tid);

const FIFA = {
  base: "https://api.fifa.com/api/v3",
  idCompetition: "17",
  idSeason: "285023",
  from: "2026-06-11T00:00:00Z",
  to: "2026-06-30T00:00:00Z", // lohkovaihe (viim. ottelut ~27.6)
};
// Oikea julkinen matsisivu: match-centre/match/{kilpailu}/{kausi}/{vaihe}/{ottelu}
const matchUrl = (idStage, idMatch) =>
  `https://www.fifa.com/en/match-centre/match/${FIFA.idCompetition}/${FIFA.idSeason}/${idStage}/${idMatch}`;
// FIFA:n viralliset koodit -> meidän Excel-koodit (vain erot)
const CODE = { CUW: "CUR", CIV: "ICV", COD: "DRC" };
const norm = (abbr) => CODE[abbr] || abbr;

function curlJson(url) {
  const out = execFileSync("curl", ["-sS", "--max-time", "30", url], {
    encoding: "utf-8", maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function fetchFifaMatches() {
  const url = `${FIFA.base}/calendar/matches?idCompetition=${FIFA.idCompetition}` +
    `&idSeason=${FIFA.idSeason}&from=${FIFA.from}&to=${FIFA.to}&count=104&language=en`;
  return curlJson(url).Results || [];
}

// Avain: lohkokirjain + aakkostettu joukkuepari (meidän koodeilla)
const groupLetter = (g) => (g || "").replace(/group/i, "").trim().toUpperCase();
const pairKey = (grp, a, b) => `${grp}|${[a, b].sort().join("-")}`;

function indexFifa(matches) {
  const byPair = {};
  for (const m of matches) {
    const grp = groupLetter(m.GroupName?.[0]?.Description);
    const h = norm(m.Home?.Abbreviation), a = norm(m.Away?.Abbreviation);
    if (!grp || !h || !a) continue; // ohita knockout/placeholderit
    byPair[pairKey(grp, h, a)] = m;
  }
  return byPair;
}

async function main() {
  const tPath = path.join(dir, "tournament.json");
  const tournament = JSON.parse(await readFile(tPath, "utf-8"));
  const fifa = fetchFifaMatches();
  const byPair = indexFifa(fifa);
  console.log(`FIFA: ${fifa.length} ottelua haettu, ${Object.keys(byPair).length} lohko-ottelua indeksoitu`);

  let schedUpdated = 0, resWritten = 0, unmatched = [];

  if (mode === "schedule" || mode === "all") {
    for (const m of tournament.matches) {
      const f = byPair[pairKey(m.group, m.home, m.away)];
      if (!f) { unmatched.push(m.id + " " + m.home + "-" + m.away); continue; }
      m.kickoff = f.Date;        // UTC tietokantaan; sivu näyttää Suomen ajan
      delete m.timeLabel;        // label lasketaan sivulla kickoffista
      m.fifaId = f.IdMatch;
      m.matchNumber = f.MatchNumber;
      m.stadium = f.Stadium?.Name?.[0]?.Description || null;
      m.city = f.Stadium?.CityName?.[0]?.Description || null;
      m.url = matchUrl(f.IdStage, f.IdMatch);
      schedUpdated++;
    }
    tournament.matches.sort((a, b) => (a.kickoff || "").localeCompare(b.kickoff || ""));
    // Maiden koko nimet (koodi -> nimi) tooltippejä varten
    const teamNames = {};
    for (const fm of fifa) {
      for (const side of [fm.Home, fm.Away]) {
        const code = norm(side?.Abbreviation), name = side?.TeamName?.[0]?.Description;
        if (code && name && tournament.teams.includes(code)) teamNames[code] = name;
      }
    }
    tournament.teamNames = teamNames;
    await writeFile(tPath, JSON.stringify(tournament, null, 2) + "\n", "utf-8");
    console.log(`Otteluohjelma päivitetty: ${schedUpdated}/${tournament.matches.length} ottelua` +
      (unmatched.length ? `, EI löytynyt: ${unmatched.join(", ")}` : ""));
  }

  if (mode === "results" || mode === "all") {
    const rPath = path.join(dir, "results.json");
    let results;
    try { results = JSON.parse(await readFile(rPath, "utf-8")); }
    catch { results = { matches: {}, dirtiestTeams: [], rounds: {}, goals: {} }; }
    for (const m of tournament.matches) {
      const f = byPair[pairKey(m.group, m.home, m.away)];
      if (!f) continue;
      const hs = f.HomeTeamScore, as = f.AwayTeamScore;
      if (hs == null || as == null) continue;       // ei pelattu / ei tulosta
      if (String(f.MatchStatus) === "1") continue;   // 1 = ei alkanut
      // FIFA:n koti/vieras voi olla eri päin kuin meillä → kohdista koodilla
      const fHome = norm(f.Home?.Abbreviation);
      const [H, A] = fHome === m.home ? [hs, as] : [as, hs];
      results.matches[m.id] = `${H}-${A}`;
      resWritten++;
    }
    await writeFile(rPath, JSON.stringify(results, null, 2) + "\n", "utf-8");
    console.log(`Tulokset päivitetty: ${resWritten} pelattua lohko-ottelua ` +
      `(sikajengi, cup ja maalit syötetään käsin / muusta lähteestä)`);
  }
}

main().catch((e) => { console.error("Virhe:", e.message); process.exit(1); });
