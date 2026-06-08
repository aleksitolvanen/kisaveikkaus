// Generoi site/index.html staattisena sivuna. Lukee data/<tid>/:n JSONit ja
// upottaa ne + pisteytyslogiikan (scoring.mjs) sivulle; pistetilanne ja
// otteluohjelma renderöidään selaimessa, jotta filtterit/analytiikka voidaan
// kerrostaa päälle ilman build-vaihetta. Kirjoittaa vain jos sisältö muuttui
// (ei turhia CF Pages -deployja).
//
// Käyttö:  node site.mjs [tid]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const tid = process.argv[2] || "mm2026";
const dir = path.join("data", tid);
const rd = async (f) => JSON.parse(await readFile(path.join(dir, f), "utf-8"));
const [tournament, predictions, results] = await Promise.all([
  rd("tournament.json"), rd("predictions.json"), rd("results.json"),
]);

// Inlinoi scoring.mjs: riisu export-avainsanat (selaimessa ei moduulisysteemiä).
const scoringSrc = readFileSync("scoring.mjs", "utf-8").replace(/^export\s+/gm, "");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Estä </script>-pako upotetussa JSONissa.
const jsonBlob = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

const KV = jsonBlob({ tournament, predictions, results });

const CSS = `
:root{--bg:#0f1115;--card:#181b22;--card2:#1f232c;--line:#2a2f3a;--fg:#e8eaed;
  --muted:#9aa3b2;--accent:#3ea6ff;--gold:#ffd24a;--good:#46c46b;--mid:#e0b341;--bad:#566;}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  padding:0 0 40px;max-width:880px;margin:0 auto}
header{padding:18px 16px 10px;position:sticky;top:0;background:linear-gradient(var(--bg),var(--bg) 78%,transparent);z-index:5}
h1{font-size:20px;letter-spacing:.2px}
.sub{color:var(--muted);font-size:13px;margin-top:2px}
nav{display:flex;gap:8px;padding:8px 16px 4px;position:sticky;top:58px;background:var(--bg);z-index:4}
nav button{flex:1;padding:9px 8px;border:1px solid var(--line);background:var(--card);color:var(--fg);
  border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
nav button.active{background:var(--accent);border-color:var(--accent);color:#04121f}
main{padding:6px 12px}
.view{display:none}.view.active{display:block}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:9px 6px;text-align:right;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px;font-weight:600}
th:nth-child(2),td:nth-child(2){text-align:left}
.rank{color:var(--muted);width:30px}
.name{font-weight:600}
.tot{font-weight:800;color:var(--gold)}
tr.me .name{color:var(--accent)}
.dim{color:var(--muted)}
.grp{margin:14px 0 6px;font-weight:700;color:var(--accent);font-size:13px;letter-spacing:.5px}
.match{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;
  padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);margin-bottom:6px}
.match .teams{font-weight:600}
.match .time{color:var(--muted);font-size:12px}
.match .res{font-weight:800;font-variant-numeric:tabular-nums;background:var(--card2);
  padding:3px 9px;border-radius:7px;min-width:46px;text-align:center}
.match .res.none{color:var(--muted);font-weight:500}
.hint{color:var(--muted);font-size:12px;margin:4px 2px 12px}
@media(max-width:560px){.hide-sm{display:none}body{font-size:14px}}
`;

// --- selainpuolen renderöinti (string, inlinoidaan; ei backtick/`${}` täällä) ---
const CLIENT = [
  "const KV = JSON.parse(document.getElementById('kv').textContent);",
  "const {tournament:T, predictions:P, results:R} = KV;",
  "const rows = scoreAll(P, R, T);",
  "const $ = (s,el)=> (el||document).querySelector(s);",
  "const el = (tag,cls,txt)=>{var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;};",
  "",
  "function renderStandings(){",
  "  var played = Object.keys(R.matches||{}).length;",
  "  var t = el('table');",
  "  var thead = el('thead'); var hr = el('tr');",
  "  ['#','Veikkaaja','Yht','Lohko','Sika','Cup','Maalit'].forEach(function(h,i){",
  "    var th=el('th',null,h); if(i>=3)th.className='hide-sm'; hr.appendChild(th);});",
  "  thead.appendChild(hr); t.appendChild(thead);",
  "  var tb = el('tbody');",
  "  rows.forEach(function(r){",
  "    var tr=el('tr');",
  "    tr.appendChild(el('td','rank',r.rank));",
  "    tr.appendChild(el('td','name',r.name));",
  "    tr.appendChild(el('td','tot',r.total));",
  "    [['group'],['sikajengi'],['cup'],['goalscorer']].forEach(function(k){",
  "      tr.appendChild(el('td','dim hide-sm',r[k[0]]));});",
  "    tb.appendChild(tr);",
  "  });",
  "  t.appendChild(tb);",
  "  var box=$('#standings'); box.innerHTML='';",
  "  var h=el('div','hint', played+' / '+T.matches.length+' lohko-ottelua pelattu'+(R.rounds&&R.rounds.champion?' · mestari '+R.rounds.champion:''));",
  "  box.appendChild(h); box.appendChild(t);",
  "}",
  "",
  "function renderSchedule(){",
  "  var box=$('#schedule'); box.innerHTML='';",
  "  var byGroup={};",
  "  T.matches.forEach(function(m){(byGroup[m.group]=byGroup[m.group]||[]).push(m);});",
  "  Object.keys(byGroup).forEach(function(g){",
  "    box.appendChild(el('div','grp','LOHKO '+g));",
  "    byGroup[g].forEach(function(m){",
  "      var row=el('div','match');",
  "      var left=el('div');",
  "      left.appendChild(el('div','teams',m.home+' – '+m.away));",
  "      left.appendChild(el('div','time',m.timeLabel||''));",
  "      row.appendChild(left);",
  "      var res=(R.matches||{})[m.id];",
  "      row.appendChild(el('div','res'+(res?'':' none'), res||'–'));",
  "      box.appendChild(row);",
  "    });",
  "  });",
  "}",
  "",
  "function show(v){",
  "  document.querySelectorAll('.view').forEach(function(e){e.classList.toggle('active',e.id==='view-'+v);});",
  "  document.querySelectorAll('nav button').forEach(function(b){b.classList.toggle('active',b.dataset.v===v);});",
  "}",
  "document.querySelectorAll('nav button').forEach(function(b){b.onclick=function(){show(b.dataset.v);};});",
  "renderStandings(); renderSchedule(); show('standings');",
].join("\n");

const html = `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Kisaveikkaus · ${esc(tournament.name)}</title>
<meta name="color-scheme" content="dark">
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>Kisaveikkaus · ${esc(tournament.name)}</h1>
  <div class="sub">${Object.keys(predictions).length} veikkaajaa · ${tournament.matches.length} lohko-ottelua</div>
</header>
<nav>
  <button data-v="standings" class="active">Pistetilanne</button>
  <button data-v="schedule">Ottelut</button>
</nav>
<main>
  <section id="view-standings" class="view active"><div id="standings"></div></section>
  <section id="view-schedule" class="view"><div id="schedule"></div></section>
</main>
<script type="application/json" id="kv">${KV}</script>
<script>
${scoringSrc}
${CLIENT}
</script>
</body>
</html>
`;

await mkdir("site", { recursive: true });
const out = path.join("site", "index.html");
const prev = existsSync(out) ? readFileSync(out, "utf-8") : null;
if (prev === html) {
  console.log("site/index.html ennallaan — ei kirjoitettu.");
} else {
  await writeFile(out, html, "utf-8");
  console.log(`Kirjoitettu ${out} (${(html.length / 1024).toFixed(1)} kt) · ${tid}`);
}
