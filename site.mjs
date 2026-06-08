// Generoi site/index.html staattisena sivuna. Lukee data/<tid>/:n JSONit ja
// upottaa ne + pisteytyslogiikan (scoring.mjs) sivulle; pistetilanne,
// otteluohjelma ja veikkausmatriisi renderöidään selaimessa, jotta
// filtterit/analytiikka voidaan kerrostaa ilman build-vaihetta. Kirjoittaa
// vain jos sisältö muuttui (ei turhia CF Pages -deployja).
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
const jsonBlob = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const KV = jsonBlob({ tournament, predictions, results });

const CSS = `
:root{--bg:#0f1115;--card:#181b22;--card2:#1f232c;--line:#2a2f3a;--fg:#e8eaed;
  --muted:#9aa3b2;--accent:#3ea6ff;--gold:#ffd24a;--good:#46c46b;--mid:#e0b341;}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  padding:0 0 40px;max-width:980px;margin:0 auto}
header{padding:9px 14px 2px}
h1{font-size:16px;letter-spacing:.2px;font-weight:700}
h1 span{color:var(--muted);font-weight:400;font-size:12px;margin-left:6px}
nav{display:flex;gap:8px;padding:6px 14px;position:sticky;top:0;background:var(--bg);z-index:5}
nav button{flex:1;padding:8px 6px;border:1px solid var(--line);background:var(--card);color:var(--fg);
  border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
nav button.active{background:var(--accent);border-color:var(--accent);color:#04121f}
main{padding:4px 12px}
.view{display:none}.view.active{display:block}
/* filtteri (kokoontaitettava) */
#filterbar{padding:3px 14px 2px;position:sticky;top:42px;background:var(--bg);z-index:4}
.ftoggle{display:inline-flex;align-items:center;gap:7px;cursor:pointer;color:var(--muted);user-select:none;
  font-size:11px;text-transform:uppercase;letter-spacing:.4px;padding:3px 0}
.ftoggle .chev2{font-size:9px}
.fbtitle{display:flex;gap:12px;margin:6px 0;font-size:12px}
.fbtitle a{color:var(--accent);cursor:pointer}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px}
.chip{padding:5px 10px;border:1px solid var(--line);border-radius:14px;font-size:12px;cursor:pointer;
  user-select:none;background:var(--card);white-space:nowrap}
.chip.on{background:var(--accent);border-color:var(--accent);color:#04121f;font-weight:600}
/* pistetilanne */
table.rank-t{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.rank-t th,.rank-t td{padding:9px 6px;text-align:right;border-bottom:1px solid var(--line)}
.rank-t th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px;font-weight:600}
.rank-t th:nth-child(2),.rank-t td:nth-child(2){text-align:left}
.rank{color:var(--muted);width:30px}.name{font-weight:600}
.tot{font-weight:800;color:var(--gold)}.dim{color:var(--muted)}
/* ottelut */
.seg{display:flex;gap:6px;margin:2px 0 10px;position:sticky;top:42px;background:var(--bg);padding:4px 0;z-index:3}
.seg button{flex:1;padding:7px 6px;border:1px solid var(--line);background:var(--card);color:var(--fg);
  border-radius:9px;font-size:13px;font-weight:600;cursor:pointer}
.seg button.on{background:var(--accent);border-color:var(--accent);color:#04121f}
.grp{margin:14px 0 6px;font-weight:700;color:var(--accent);font-size:13px;letter-spacing:.5px}
.mcell{margin-bottom:6px}
.match{display:grid;grid-template-columns:auto 1fr auto;gap:8px 12px;align-items:center;cursor:pointer;
  padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.match.open{border-radius:10px 10px 0 0;border-bottom-color:transparent}
.match .chev{color:var(--muted);font-size:11px;transition:transform .15s}
.match.open .chev{transform:rotate(90deg)}
.match .teams{font-weight:600}.match .time{color:var(--muted);font-size:12px}
.match .res{font-weight:800;background:var(--card2);padding:3px 9px;border-radius:7px;min-width:46px;text-align:center}
.match .res.none{color:var(--muted);font-weight:500}
.mdetail{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:5px 12px;
  padding:9px 11px;border:1px solid var(--line);border-top:none;border-radius:0 0 10px 10px;background:var(--card2)}
.pitem{display:flex;justify-content:space-between;gap:8px;font-size:13px;align-items:center}
.pname{color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.pval{font-weight:700;font-variant-numeric:tabular-nums;padding:1px 6px;border-radius:5px;min-width:38px;text-align:center}
/* veikkausmatriisi */
.mwrap{overflow:auto;max-height:78vh;border:1px solid var(--line);border-radius:10px}
table.matrix{border-collapse:separate;border-spacing:0;font-size:12px;font-variant-numeric:tabular-nums}
.matrix th,.matrix td{padding:6px 8px;white-space:nowrap;border-bottom:1px solid var(--line);text-align:center}
.matrix thead th{position:sticky;top:0;background:var(--card2);z-index:5;font-weight:600}
.matrix .mcol{position:sticky;left:0;width:66px;min-width:66px;max-width:66px;background:var(--card);
  z-index:4;text-align:left;font-weight:600;overflow:hidden;text-overflow:ellipsis}
.matrix .tcol{position:sticky;left:66px;background:var(--card);z-index:4}
.matrix thead .mcol,.matrix thead .tcol{z-index:6}
.matrix tr.grow td{background:var(--bg);color:var(--accent);font-weight:700;text-align:left;font-size:11px;
  letter-spacing:.5px;position:sticky;left:0;z-index:4}
.matrix td.actual{color:var(--muted);font-size:11px;font-weight:400}
.msub{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin:14px 2px 5px}
.c3{background:rgba(70,196,107,.20)}.c1{background:rgba(224,179,65,.18)}.c0{color:var(--muted)}
.hint{color:var(--muted);font-size:12px;margin:4px 2px 12px}
@media(max-width:560px){.hide-sm{display:none}body{font-size:14px}#filterbar{top:100px}}
`;

const CLIENT = String.raw`
const KV = JSON.parse(document.getElementById('kv').textContent);
const T = KV.tournament, P = KV.predictions, R = KV.results;
const NAMES = Object.keys(P);
const ALLROWS = scoreAll(P, R, T);                 // globaali pistetilanne (ei suodatettu)
const state = { players: loadSel(), view: 'standings', filterOpen: false, dayFilter: 'all' };

const $ = (s) => document.querySelector(s);
function el(tag, cls, txt){ var e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; }
function sel(){ return NAMES.filter(function(n){ return state.players.has(n); }); }

/* valinta query-parametrista (?p=) tai localStoragesta; tyhjä = kaikki */
function loadSel(){
  try{
    var q=new URLSearchParams(location.search);
    var raw = q.has('p') ? q.get('p') : localStorage.getItem('kv-players');
    if(!raw) return new Set(NAMES);
    var ns=raw.split(',').filter(function(n){ return NAMES.indexOf(n)>=0; });
    return ns.length ? new Set(ns) : new Set(NAMES);
  }catch(e){ return new Set(NAMES); }
}
function persistSel(){
  var all = state.players.size===NAMES.length;
  var val = all ? '' : NAMES.filter(function(n){ return state.players.has(n); }).join(',');
  try{ var u=new URL(location.href); if(all) u.searchParams.delete('p'); else u.searchParams.set('p',val); history.replaceState(null,'',u.toString()); }catch(e){}
  try{ if(all) localStorage.removeItem('kv-players'); else localStorage.setItem('kv-players',val); }catch(e){}
}

/* ---- pelaajafiltteri (kokoontaitettava, oletuksena piilossa) ---- */
function renderFilter(){
  var bar=$('#filterbar'); bar.innerHTML='';
  var tog=el('div','ftoggle');
  tog.appendChild(el('span','chev2', state.filterOpen?'▼':'▶'));
  tog.appendChild(el('span',null,'Veikkaajat ('+state.players.size+'/'+NAMES.length+')'));
  tog.onclick=function(){ state.filterOpen=!state.filterOpen; renderFilter(); };
  bar.appendChild(tog);
  if(!state.filterOpen) return;
  var acts=el('div','fbtitle');
  var all=el('a',null,'Kaikki'); all.onclick=function(){ NAMES.forEach(function(n){state.players.add(n);}); rerender(); };
  var none=el('a',null,'Tyhjennä'); none.onclick=function(){ state.players.clear(); rerender(); };
  acts.appendChild(all); acts.appendChild(none); bar.appendChild(acts);
  var chips=el('div','chips');
  NAMES.forEach(function(n){
    var c=el('span','chip'+(state.players.has(n)?' on':''),n);
    c.onclick=function(){ if(state.players.has(n))state.players.delete(n); else state.players.add(n); rerender(); };
    chips.appendChild(c);
  });
  bar.appendChild(chips);
}

/* ---- pistetilanne ---- */
function renderStandings(){
  var box=$('#standings'); box.innerHTML='';
  var played=Object.keys(R.matches||{}).length;
  box.appendChild(el('div','hint', played+' / '+T.matches.length+' lohko-ottelua pelattu'+
    (R.rounds&&R.rounds.champion?' · mestari '+R.rounds.champion:'')));
  var t=el('table','rank-t'), thead=el('thead'), hr=el('tr');
  ['#','Veikkaaja','Yht','Lohko','Sika','Cup','Maalit'].forEach(function(h,i){
    var th=el('th',i>=3?'hide-sm':null,h); hr.appendChild(th); });
  thead.appendChild(hr); t.appendChild(thead);
  var tb=el('tbody');
  ALLROWS.filter(function(r){return state.players.has(r.name);}).forEach(function(r){
    var tr=el('tr');
    tr.appendChild(el('td','rank',r.rank));
    tr.appendChild(el('td','name',r.name));
    tr.appendChild(el('td','tot',r.total));
    ['group','sikajengi','cup','goalscorer'].forEach(function(k){ tr.appendChild(el('td','dim hide-sm',r[k])); });
    tb.appendChild(tr);
  });
  t.appendChild(tb); box.appendChild(t);
}

/* ---- otteluohjelma + matsia klikkaamalla kaikkien veikkaukset ---- */
function matchDetail(m){
  var res=(R.matches||{})[m.id], has=!!res;
  var rows=NAMES.map(function(n){ var p=(P[n].matches||{})[m.id]||''; return { n:n, p:p, pts:matchPoints(p,res,T.scoring.group) }; });
  if(has) rows.sort(function(a,b){ return b.pts-a.pts || a.n.localeCompare(b.n,'fi'); });
  var d=el('div','mdetail');
  rows.forEach(function(r){
    var it=el('div','pitem');
    it.appendChild(el('span','pname',r.n));
    it.appendChild(el('span','pval '+cellClass(r.pts,has), r.p||'–'));
    d.appendChild(it);
  });
  return d;
}
function matchCell(m){
  var cell=el('div','mcell'), row=el('div','match');
  row.appendChild(el('span','chev','▶'));
  var left=el('div');
  left.appendChild(el('div','teams',m.home+' – '+m.away));
  left.appendChild(el('div','time',m.timeLabel||''));
  row.appendChild(left);
  var res=(R.matches||{})[m.id];
  row.appendChild(el('div','res'+(res?'':' none'), res||'–'));
  var det=matchDetail(m); det.style.display='none';
  row.onclick=function(){ var open=det.style.display==='none'; det.style.display=open?'':'none'; row.classList.toggle('open',open); };
  cell.appendChild(row); cell.appendChild(det); return cell;
}
function dayKey(d){ function p(n){ return (n<10?'0':'')+n; } return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function renderSchedule(){
  var box=$('#schedule'); box.innerHTML='';
  var seg=el('div','seg');
  [['today','Tänään'],['tomorrow','Huomenna'],['all','Kaikki']].forEach(function(o){
    var b=el('button', state.dayFilter===o[0]?'on':null, o[1]);
    b.onclick=function(){ state.dayFilter=o[0]; renderSchedule(); };
    seg.appendChild(b);
  });
  box.appendChild(seg);
  var list=el('div'); box.appendChild(list);
  var df=state.dayFilter;
  var want = df==='today'? dayKey(new Date()) : df==='tomorrow'? dayKey(new Date(Date.now()+86400000)) : null;
  var ms = T.matches.filter(function(m){ return want==null || (m.kickoff && m.kickoff.slice(0,10)===want); });
  if(!ms.length){ list.appendChild(el('div','hint', df==='today'?'Ei otteluita tänään.':'Ei otteluita huomenna.')); return; }
  if(df==='all'){
    var by={}; ms.forEach(function(m){ (by[m.group]=by[m.group]||[]).push(m); });
    Object.keys(by).forEach(function(g){
      list.appendChild(el('div','grp','LOHKO '+g));
      by[g].forEach(function(m){ list.appendChild(matchCell(m)); });
    });
  } else {
    ms.slice().sort(function(a,b){ return (a.kickoff||'').localeCompare(b.kickoff||''); })
      .forEach(function(m){ list.appendChild(matchCell(m)); });
  }
}

/* ---- veikkausmatriisi (ottelut × veikkaajat) ---- */
function cellClass(pts, hasRes){ return !hasRes?'':(pts===0?'c0':pts>=3?'c3':'c1'); }
// Rakentaa matriisitaulukon. specs = lista riveistä; rivi = {group} TAI {label,actual,cellFor}.
function buildMatrix(players, maxH, specs){
  var wrap=el('div','mwrap'); if(maxH) wrap.style.maxHeight=maxH;
  var t=el('table','matrix'), thead=el('thead'), hr=el('tr');
  hr.appendChild(el('th','mcol','')); hr.appendChild(el('th','tcol','Tulos'));
  players.forEach(function(n){ hr.appendChild(el('th',null,n)); });
  thead.appendChild(hr); t.appendChild(thead);
  var tb=el('tbody');
  specs.forEach(function(s){
    if(s.group!=null){ var tr=el('tr','grow'), td=el('td',null,s.group); td.colSpan=players.length+2; tr.appendChild(td); tb.appendChild(tr); return; }
    var tr=el('tr');
    tr.appendChild(el('td','mcol',s.label));
    tr.appendChild(el('td','actual tcol', s.actual==null?'–':s.actual));
    players.forEach(function(n){ var c=s.cellFor(n); tr.appendChild(el('td',c.cls,c.txt==null?'':c.txt)); });
    tb.appendChild(tr);
  });
  t.appendChild(tb); wrap.appendChild(t); return wrap;
}
function renderPredictions(){
  var box=$('#predictions'); box.innerHTML='';
  var players=sel();
  if(!players.length){ box.appendChild(el('div','hint','Avaa filtteri ja valitse veikkaajia.')); return; }
  // lohko-ottelut
  var rows=[]; var by={}; T.matches.forEach(function(m){ (by[m.group]=by[m.group]||[]).push(m); });
  Object.keys(by).forEach(function(g){
    rows.push({group:'LOHKO '+g});
    by[g].forEach(function(m){
      var res=(R.matches||{})[m.id], has=!!res;
      rows.push({ label:m.home+'–'+m.away, actual:res, cellFor:function(n){
        var pred=(P[n].matches||{})[m.id];
        return { txt:pred||'', cls:cellClass(matchPoints(pred,res,T.scoring.group), has) };
      }});
    });
  });
  box.appendChild(buildMatrix(players, '70vh', rows));
  // Muut – oma taulukko (ei levennä Ottelu-saraketta)
  box.appendChild(el('div','msub','Muut'));
  var muut=[
    { label:'Sikajengi', actual:(R.dirtiestTeams||[]).join(' / ')||null, cellFor:function(n){
        var pred=P[n].sikajengi;
        return { txt:pred||'', cls:cellClass(sikajengiPoints(pred,R.dirtiestTeams,T.scoring.sikajengi),(R.dirtiestTeams||[]).length>0) }; }},
    { label:'Mestari', actual:(R.rounds&&R.rounds.champion)||null, cellFor:function(n){
        var pred=P[n].cup&&P[n].cup.champion, has=!!(R.rounds&&R.rounds.champion);
        return { txt:pred||'', cls:!has?'':(pred===R.rounds.champion?'c3':'c0') }; }},
    { label:'Maalintekijä', actual:null, cellFor:function(n){
        var pred=P[n].goalscorer, goals=(R.goals||{})[pred];
        return { txt:pred?(pred+(goals?' ('+goals+')':'')):'', cls:goals?'c3':'' }; }},
  ];
  box.appendChild(buildMatrix(players, null, muut));
}

/* ---- näkymät ---- */
function rerender(){
  persistSel();
  renderFilter();
  if(state.view==='standings') renderStandings();
  if(state.view==='predictions') renderPredictions();
}
function show(v){
  state.view=v;
  document.querySelectorAll('.view').forEach(function(e){ e.classList.toggle('active', e.id==='view-'+v); });
  document.querySelectorAll('nav button').forEach(function(b){ b.classList.toggle('active', b.dataset.v===v); });
  $('#filterbar').style.display = (v==='schedule') ? 'none' : '';
  rerender();
}
document.querySelectorAll('nav button').forEach(function(b){ b.onclick=function(){ show(b.dataset.v); }; });
renderSchedule();
show('standings');
`;

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
  <h1>Kisaveikkaus · ${esc(tournament.name)}<span>${Object.keys(predictions).length} veikkaajaa</span></h1>
</header>
<nav>
  <button data-v="standings" class="active">Pistetilanne</button>
  <button data-v="predictions">Veikkaukset</button>
  <button data-v="schedule">Ottelut</button>
</nav>
<div id="filterbar"></div>
<main>
  <section id="view-standings" class="view active"><div id="standings"></div></section>
  <section id="view-predictions" class="view"><div id="predictions"></div></section>
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
