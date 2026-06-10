// Pisteytyslogiikka — Excelin kaavat 1:1 koodissa. Puhdas moduuli: ei DOM:ia,
// ei I/O:ta. Jaettu selaimen (site.mjs inlinoi) ja node:test-yksikkötestien välillä.
//
// Säännöt (data/<tid>/tournament.json:n "scoring"):
//   Lohko-ottelu: oikea tulos = 3p, oikea lopputulos (voittaja/tasapeli) = 1p, muuten 0.
//   Sikajengi:    oikea joukkue = 8p; jos useampi tasan piskein, oikein = 4p.
//   Cup-vaihe:    jokainen oikein veikattu jatkoonpääsijä = kierroksen pisteet/joukkue.
//   Maalintekijä: 1p per veikatun pelaajan maali.

export const DEFAULT_SCORING = {
  group: { exact: 3, outcome: 1, miss: 0 },
  sikajengi: { points: 8, tiePoints: 4 },
  goalscorer: { perGoal: 1 },
};

// "2-1" -> [2,1]; tukee myös ajatusviivaa. null jos tyhjä/virheellinen.
export function parseScore(s) {
  if (s == null) return null;
  const m = String(s).trim().match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function sign(n) {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

// Yhden lohko-ottelun pisteet. Tyhjä tulos (pelaamaton) tai tyhjä veikkaus -> 0.
export function matchPoints(pred, result, cfg = DEFAULT_SCORING.group) {
  const r = parseScore(result);
  const p = parseScore(pred);
  if (!r || !p) return 0;
  if (p[0] === r[0] && p[1] === r[1]) return cfg.exact;
  if (sign(p[0] - p[1]) === sign(r[0] - r[1])) return cfg.outcome;
  return cfg.miss;
}

export function sikajengiPoints(pred, dirtiest, cfg = DEFAULT_SCORING.sikajengi) {
  if (!pred || !dirtiest || !dirtiest.length) return 0;
  if (!dirtiest.includes(pred)) return 0;
  return dirtiest.length > 1 ? cfg.tiePoints : cfg.points;
}

export function goalscorerPoints(pred, goals, cfg = DEFAULT_SCORING.goalscorer) {
  if (!pred || !goals) return 0;
  return (goals[pred] || 0) * cfg.perGoal;
}

// Cup-vaiheen pisteet + erittely kierroksittain. cupRounds = tournament.cupRounds.
export function cupPoints(cupPred, rounds, cupRounds) {
  const breakdown = {};
  let total = 0;
  for (const rd of cupRounds) {
    const actual = rounds ? rounds[rd.key] : null;
    let hits = 0;
    if (rd.key === "champion") {
      const pick = cupPred ? cupPred.champion : null;
      hits = pick && actual && pick === actual ? 1 : 0;
    } else {
      const set = new Set(actual || []);
      const picks = (cupPred && cupPred[rd.key]) || [];
      hits = picks.filter((t) => set.has(t)).length;
    }
    const pts = hits * rd.pointsPerTeam;
    breakdown[rd.key] = { hits, points: pts };
    total += pts;
  }
  return { total, breakdown };
}

// Yhden veikkaajan kokonaispisteet + erittely. tournament antaa matsit/kierrokset/säännöt.
export function scoreParticipant(pred, results, tournament) {
  const scoring = tournament.scoring || DEFAULT_SCORING;
  const res = results || {};
  const resMatches = res.matches || {};

  let group = 0;
  const matchPts = {};
  for (const m of tournament.matches) {
    const pts = matchPoints(pred.matches?.[m.id], resMatches[m.id], scoring.group);
    matchPts[m.id] = pts;
    group += pts;
  }

  const sikajengi = sikajengiPoints(pred.sikajengi, res.dirtiestTeams, scoring.sikajengi);
  const cup = cupPoints(pred.cup, res.rounds, tournament.cupRounds);
  const goalscorer = goalscorerPoints(pred.goalscorer, res.goals, scoring.goalscorer);

  return {
    group,
    sikajengi,
    cup: cup.total,
    cupBreakdown: cup.breakdown,
    goalscorer,
    total: group + sikajengi + cup.total + goalscorer,
    matchPoints: matchPts,
  };
}

// Onko ottelu ratkaistu (tulos syötetty)?
export function matchDecided(results, id) {
  return !!(results && results.matches && results.matches[id]);
}

// Suurin lisäpistemäärä jonka veikkaaja voi vielä saada ratkaisemattomista
// kohteista (kaikki menisi nappiin). Maalintekijä on avoin (ei ylärajaa) → ei
// mukana. Kumulatiivinen "max mahdollinen" = scoreParticipant().total + tämä.
export function remainingMax(pred, results, tournament) {
  const sc = tournament.scoring || DEFAULT_SCORING;
  const res = results || {};
  let r = 0;
  for (const m of tournament.matches) {
    if (!matchDecided(res, m.id) && pred.matches && pred.matches[m.id]) r += sc.group.exact;
  }
  if (!(res.dirtiestTeams && res.dirtiestTeams.length) && pred.sikajengi) r += sc.sikajengi.points;
  for (const rd of tournament.cupRounds) {
    const actual = res.rounds && res.rounds[rd.key];
    if (rd.key === "champion") {
      if (!actual && pred.cup && pred.cup.champion) r += rd.pointsPerTeam;
    } else {
      // Kierros voi olla osittain ratkennut (jatkoonpääsijät selviävät yksitellen):
      // vapaita paikkoja voi vielä täyttyä veikatuilla joukkueilla.
      const have = actual || [];
      const set = new Set(have);
      const picks = (pred.cup && pred.cup[rd.key]) || [];
      const slots = rd.slots || picks.length;
      const open = Math.max(0, slots - have.length);
      const missed = picks.filter((t) => !set.has(t)).length;
      r += rd.pointsPerTeam * Math.min(missed, open);
    }
  }
  return r;
}

// Kaikki veikkaajat pisteytettynä ja sijoitettuna. Tasapisteet jakavat sijan.
export function scoreAll(predictions, results, tournament) {
  const rows = Object.entries(predictions).map(([name, pred]) => ({
    name,
    ...scoreParticipant(pred, results, tournament),
  }));
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fi"));
  let rank = 0;
  let prev = null;
  rows.forEach((row, i) => {
    if (prev === null || row.total !== prev) rank = i + 1;
    row.rank = rank;
    prev = row.total;
  });
  return rows;
}
