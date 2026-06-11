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

// Cup-kaavion rakenne (puolikkaat + finaali): ensisijaisesti knockout-entryjen
// feedA/feedB-kentistä (ottelunumerot, pysyvät), toissijaisesti "W74"-place-
// holdereista ("ottelun 74 voittaja" — katoavat kun joukkueet selviävät).
// Rakenne on kiinteä koko turnauksen ajan, joten se lasketaan build-aikana ja
// upotetaan sivuun; client täyttää joukkueet/tulokset live-datasta ottelu-
// numeroilla. Palauttaa null jos puu ei ole täysi → kaavio jää pois.
function buildBracket(knockout) {
  const final = (knockout || []).find((m) => m.round === "final");
  if (!final) return null;
  const W = (s) => { const m = /^W(\d+)$/.exec(String(s)); return m ? Number(m[1]) : null; };
  const feed = new Map(knockout.map((m) => [m.matchNumber, [m.feedA ?? W(m.home), m.feedB ?? W(m.away)]]));
  const half = (root) => {
    const cols = [];
    const rec = (num, d) => {
      if (num == null || !feed.has(num)) return;
      (cols[d] = cols[d] || []).push(num);
      const f = feed.get(num);
      if (f[0] != null || f[1] != null) { rec(f[0], d + 1); rec(f[1], d + 1); }
    };
    rec(root, 0);
    return cols;
  };
  const [fa, fb] = feed.get(final.matchNumber) || [];
  if (fa == null || fb == null) return null;
  const left = half(fa), right = half(fb);
  const full = (c) => c.length > 0 && c.every((col, d) => (col || []).length === 2 ** d);
  if (left.length !== right.length || !full(left) || !full(right)) return null;
  const bronze = knockout.find((m) => m.round === "bronze");
  return { left, right, final: final.matchNumber, bronze: bronze ? bronze.matchNumber : null };
}

// Pelaajakortit (AI-syväanalyysit) jos generoitu — staattista sisältöä, upotetaan buildissa.
let playercards = null;
try { playercards = JSON.parse(readFileSync(path.join(dir, "playercards.json"), "utf-8")); } catch {}

// Demo-buildi = paikallinen results.json sisältää dataa (tuotannossa tyhjä).
// Demo ei pollaa (random-results-kokeilut eivät ylikirjoitu); tuotantobuildi
// pollaa myös file://-protokollasta avattuna.
const demo = Object.keys(results.matches || {}).length > 0;

const KV = jsonBlob({ tournament, predictions, results, bracket: buildBracket(tournament.knockout),
  bracketUrl: tournament.bracketUrl || null, playercards, demo });

const CSS = `
:root{--bg:#0f1115;--card:#181b22;--card2:#1f232c;--line:#2a2f3a;--fg:#e8eaed;
  --muted:#9aa3b2;--accent:#3ea6ff;--gold:#ffd24a;--good:#46c46b;--mid:#e0b341;}
*{box-sizing:border-box;margin:0;padding:0}
button,.chip,.ftoggle,.blab{touch-action:manipulation}
/* ohuet tummat scrollbarit + tilanvaraus, etteivät ne peitä sisältöä */
*{scrollbar-width:thin;scrollbar-color:#3a4150 transparent}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-thumb{background:#3a4150;border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:#4a5366}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-corner{background:transparent}
html{-webkit-text-size-adjust:100%}
html{height:100%}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  max-width:980px;margin:0 auto;height:100vh;height:100dvh;overflow:hidden;display:flex;flex-direction:column}
#topbar{flex:0 0 auto;z-index:20;background:var(--bg)}
nav{display:flex;gap:8px;padding:8px 14px 6px;background:var(--bg)}
nav button{flex:1;padding:8px 6px;border:1px solid var(--line);background:var(--card);color:var(--fg);
  border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
nav button.active{background:var(--accent);border-color:var(--accent);color:#04121f}
main{flex:1 1 auto;min-height:0;padding:4px 12px;display:flex;flex-direction:column}
.view{display:none;min-height:0}
.view.active{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:auto;
  scrollbar-gutter:stable;padding-right:2px}
#view-predictions.active{overflow:hidden}
#predictions{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
/* filtteri (kokoontaitettava) */
#filterbar{padding:2px 14px 6px;background:var(--bg)}
.ftoggle{display:inline-flex;align-items:center;gap:7px;cursor:pointer;color:var(--muted);user-select:none;
  font-size:11px;text-transform:uppercase;letter-spacing:.4px;padding:3px 0}
.ftoggle .chev2{font-size:9px}
.frow{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.facts{display:flex;gap:14px;font-size:12px}
.facts a{color:var(--accent);cursor:pointer}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px}
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
#standings table.rank-t{width:auto}
.rank-t td.pts{text-align:right;white-space:nowrap;padding-left:22px}
.brk{color:var(--muted);font-size:12px;margin-right:8px;font-variant-numeric:tabular-nums}
/* ottelut */
.seg{display:inline-flex;align-self:flex-start;gap:2px;margin:2px 0 12px;background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:3px}
.seg button{border:none;background:transparent;color:var(--muted);padding:5px 13px;border-radius:999px;
  font-size:12px;font-weight:600;cursor:pointer;line-height:1.2}
.seg button.on{background:var(--accent);color:#04121f}
.grp{margin:14px 0 6px;font-weight:700;color:var(--accent);font-size:13px;letter-spacing:.5px}
.kohdr{margin:20px 0 6px;font-weight:800;color:var(--gold);font-size:13px;letter-spacing:1px;border-top:1px solid var(--line);padding-top:14px}
.match.noexp{cursor:default}
.mcell{margin-bottom:6px}
.match{display:grid;grid-template-columns:auto auto 1fr auto;gap:8px 12px;align-items:center;cursor:pointer;
  padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.match.open{border-radius:10px 10px 0 0;border-bottom-color:transparent}
.match .chev{color:var(--muted);font-size:11px;transition:transform .15s}
.match.open .chev{transform:rotate(90deg)}
.match .teams{font-weight:600}.match .time{color:var(--muted);font-size:12px}
.match .res{font-weight:800;background:var(--card2);padding:3px 9px;border-radius:7px;min-width:46px;text-align:center}
.match .res.none{color:var(--muted);font-weight:500}
.match .res.islive{color:var(--good)}
.match .res.islive::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;
  background:var(--good);margin-right:5px;vertical-align:1px;animation:kvpulse 1.3s ease-in-out infinite}
@keyframes kvpulse{50%{opacity:.25}}
.matrix td.actual.islive{font-style:italic;color:var(--good);font-weight:700}
.matrix td.actual.islive::before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;
  background:var(--good);margin-right:4px;vertical-align:1px;animation:kvpulse 1.3s ease-in-out infinite}
.fifalink{justify-self:center;font-size:11px;color:var(--accent);text-decoration:none;white-space:nowrap;font-weight:600}
.fifalink:hover{text-decoration:underline}
.mdetail{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:5px 12px;
  padding:9px 11px;border:1px solid var(--line);border-top:none;border-radius:0 0 10px 10px;background:var(--card2)}
.mhead{grid-column:1/-1;padding-bottom:4px;border-bottom:1px solid var(--line)}
.mnames{font-size:12.5px;font-weight:600;color:var(--muted)}
.mvenue{font-size:11px;font-weight:400;color:#6f7889;margin-top:1px}
.pitem{display:flex;justify-content:space-between;gap:8px;font-size:13px;align-items:center}
.pname{color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.pval{font-weight:700;font-variant-numeric:tabular-nums;padding:1px 6px;border-radius:5px;min-width:38px;text-align:center}
/* veikkausmatriisi */
.mwrap{overflow:auto;border:1px solid var(--line);border-radius:10px;position:relative;z-index:0}
table.matrix{border-collapse:separate;border-spacing:0;font-size:12px;font-variant-numeric:tabular-nums}
.matrix th,.matrix td{padding:6px 8px;white-space:nowrap;border-bottom:1px solid var(--line);text-align:center}
.matrix thead th{position:sticky;top:0;background:var(--card2);z-index:7;font-weight:600}
.matrix .mcol{position:sticky;left:0;background:var(--card);z-index:4;text-align:left;font-weight:600;white-space:nowrap}
.matrix .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
.matrix .tcol{position:sticky;left:var(--mcolw,72px);background:var(--card);z-index:4}
.matrix thead .mcol,.matrix thead .tcol{z-index:8}
.matrix tr.grow td{background:var(--bg);height:22px}
.matrix .glabel{position:sticky;left:0;z-index:5;background:var(--bg);padding:0}
.matrix .glabel span{position:absolute;left:8px;top:5px;white-space:nowrap;color:var(--accent);
  font-weight:700;font-size:11px;letter-spacing:.5px}
.matrix td.actual{color:var(--muted);font-size:11px;font-weight:400}
.msub{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin:14px 2px 5px}
.mutwrap{flex:1 1 auto;min-height:0;overflow:auto}
.mutrow{display:grid;grid-template-columns:minmax(72px,1fr) 84px minmax(120px,1.3fr);gap:10px;
  padding:7px 6px;border-bottom:1px solid var(--line);align-items:center}
.mutrow span:nth-child(2){text-align:center}
.mutrow span:nth-child(3){text-align:right}
.muthead span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-weight:600}
.mutrow .nm{font-weight:600}
.mutrow .pk{font-weight:600;color:var(--muted)}
.mutrow .pk.pos{color:var(--good)}.mutrow .pk.neg{color:#e2706e}
.c3{background:rgba(70,196,107,.20)}.c1{background:rgba(224,179,65,.18)}.c0{color:var(--muted)}
.hint{color:var(--muted);font-size:12px;margin:4px 2px 12px}
/* analytiikka */
.asec{margin:4px 0 22px}
.asec h3{font-size:13px;text-transform:uppercase;letter-spacing:.4px;color:var(--accent);margin:0 2px 9px;font-weight:700}
.cmpsel{display:flex;gap:8px;margin-bottom:10px}
.cmpsel select{flex:1;padding:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:9px;font-size:14px}
.pos{color:var(--good);font-weight:700}.neg{color:#e2706e;font-weight:700}
.elim{color:var(--muted);text-decoration:line-through}
.chartbox{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:8px 6px 4px}
/* cup-kaavio */
.bhead{display:flex;align-items:center;justify-content:space-between;margin:0 2px 9px}
.bhead h3{margin:0}
.bnav{display:flex;gap:6px}
.bnav button{width:32px;height:26px;border-radius:8px;border:1px solid var(--line);background:var(--card);
  color:var(--fg);font-size:16px;line-height:1;cursor:pointer;padding:0 0 2px}
.bwrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card);padding:10px 8px}
.bracket{display:flex;gap:7px;min-width:580px}
.bcol{display:flex;flex-direction:column;flex:1 0 58px;min-width:0}
.blab{font-size:9px;color:var(--muted);text-align:center;letter-spacing:.4px;
  text-transform:uppercase;white-space:nowrap;cursor:pointer;user-select:none;
  background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:2px 0;margin:0 2px 4px}
.blab:hover{color:var(--fg);border-color:var(--accent)}
.blab.on{background:var(--accent);border-color:var(--accent);color:#04121f;font-weight:600}
.blab.plain,.blab.plain:hover{background:transparent;border-color:transparent;cursor:default;color:var(--muted)}
.bcells{flex:1;display:flex;flex-direction:column;justify-content:space-around}
.bpair{flex:1;display:flex;flex-direction:column;justify-content:space-around;position:relative}
/* yhdysviivat pareista seuraavaan otteluun: haarukka raon puoliväliin + tulostubi */
.colL .bpair.duo::after{content:'';position:absolute;right:-4px;top:25%;height:50%;width:4px;
  border:1px solid var(--line);border-left:none;pointer-events:none}
.colR .bpair.duo::after{content:'';position:absolute;left:-4px;top:25%;height:50%;width:4px;
  border:1px solid var(--line);border-right:none;pointer-events:none}
.colL .bcell.fed::before{content:'';position:absolute;left:-4px;top:50%;width:4px;border-top:1px solid var(--line)}
.colR .bcell.fed::before{content:'';position:absolute;right:-4px;top:50%;width:4px;border-top:1px solid var(--line)}
.bcell{border:1px solid var(--line);border-radius:6px;background:var(--card2);padding:2px 5px;margin:2px 0;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;position:relative;
  display:flex;flex-direction:column}
.bdate{order:-1;text-align:center;font-size:9px;color:var(--muted);white-space:nowrap;line-height:1.4}
.bcell.bfinal{border-color:var(--gold);
  background:linear-gradient(180deg,rgba(255,210,74,.10),rgba(255,210,74,0) 65%),var(--card2);
  box-shadow:0 0 14px rgba(255,210,74,.30),0 0 4px rgba(255,210,74,.45)}
.bteam{display:flex;justify-content:space-between;gap:4px;line-height:1.5}
.bteam .tc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bteam.tbd .tc{color:var(--muted);font-size:9.5px}
.bteam.win{color:var(--good);font-weight:700}
.bsc{color:var(--muted)}.bteam.win .bsc{color:inherit}
.bchamp{text-align:center;margin:2px 0;font-weight:800;color:var(--gold);font-size:13px;white-space:nowrap}
.bbz{margin-top:14px}
/* kännykällä: kolme kierrosta rinnakkain (snap-pyyhkäisy siirtyy kierroksen
   kerrallaan); päiväys omalla rivillään parin yläpuolella */
@media(max-width:560px){
  .bwrap{scroll-snap-type:x mandatory}
  .bracket{min-width:0}
  .bcol{flex:0 0 27vw;scroll-snap-align:center}
  .blab{font-size:11px;padding:3px 0}
  .bcell{font-size:12.5px;padding:3px 6px}
  .bteam{line-height:1.6}
  .bdate{font-size:9.5px}
}
.chartbox svg{display:block;width:100%;height:auto}
.legend{display:flex;flex-wrap:wrap;gap:5px 12px;margin:8px 2px 0}
.legi{display:flex;align-items:center;gap:6px;font-size:12px}
.legsw{width:12px;height:3px;border-radius:2px;display:inline-block}
.aigen{font-weight:400;color:var(--muted);text-transform:none;letter-spacing:0;font-size:11px;margin-left:8px}
.pcard{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px 14px;margin-top:4px}
.pchead{font-weight:800;color:var(--gold);margin-bottom:7px}
.pctext{font-size:13.5px;line-height:1.55;white-space:pre-line}
.wildrow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--line)}
.wmatch{font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
.wname{color:var(--muted)}
.wsub{color:var(--muted);font-size:11px;margin-top:2px}
.wpred{font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums;white-space:nowrap}
@media(max-width:560px){.hide-sm{display:none}body{font-size:14px}}
`;

const CLIENT = String.raw`
const KV = JSON.parse(document.getElementById('kv').textContent);
let T = KV.tournament, R = KV.results; const P = KV.predictions;  // T,R päivittyvät pollauksessa
const BRACKET = KV.bracket || null;  // cup-kaavion kiinteä rakenne (ottelunumerot)
const CARDS = (KV.playercards && KV.playercards.cards) || null;  // pelaajakortit (staattiset)
const NAMES = Object.keys(P);
function teamName(c){ return (T.teamNames && T.teamNames[c]) || c; }
function pairTitle(h, a){ return teamName(h) + ' – ' + teamName(a); }
// Käynnissä olevan ottelun juokseva tulos (results.live); pisteytys ei käytä tätä.
function liveScore(id){ return (R.live||{})[id] || null; }
let ALLROWS = scoreAll(P, R, T);                 // globaali pistetilanne (päivittyy pollauksessa)
// Mistä tuore data haetaan ilman sivun reloadia. Oletus: sama origin ('data.json').
// Voi osoittaa erilliseen lähteeseen (R2/data-repo) → sivua ei tarvitse deployata datan muuttuessa.
var DATA_URL = 'https://raw.githubusercontent.com/aleksitolvanen/kisaveikkaus-mm2026/main/data.json';
const savedUI = loadUI();
const state = { players: loadSel(),
  view: savedUI.view || 'predictions', filterOpen: !!savedUI.filterOpen,
  dayFilter: savedUI.dayFilter || 'all', predMode: savedUI.predMode || 'lohko',
  cmpA: savedUI.cmpA || null, cmpB: savedUI.cmpB || null,
  cardPlayer: savedUI.cardPlayer || '',
  scroll: savedUI.scroll || {} };

const $ = (s) => document.querySelector(s);
function el(tag, cls, txt){ var e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; }
function sel(){ return NAMES.filter(function(n){ return state.players.has(n); }); }

/* valinta query-parametrista (?p=) tai localStoragesta; tyhjä = kaikki */
function loadSel(){
  try{
    var q=new URLSearchParams(location.search);
    var raw = q.has('p') ? q.get('p') : localStorage.getItem('kv-players');
    if(raw==null) return new Set(NAMES);
    if(raw==='') return new Set();   // tyhjennetty valinta säilyy tyhjänä
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

/* muiden valintojen + skrollikohdan pysyvyys (localStorage 'kv-ui') */
function loadUI(){ try{ return JSON.parse(localStorage.getItem('kv-ui')||'{}')||{}; }catch(e){ return {}; } }
function saveUI(){ try{ localStorage.setItem('kv-ui', JSON.stringify({ view:state.view, predMode:state.predMode,
  dayFilter:state.dayFilter, filterOpen:state.filterOpen, cmpA:state.cmpA, cmpB:state.cmpB,
  cardPlayer:state.cardPlayer, scroll:state.scroll })); }catch(e){} }
var uiTimer=null;
function saveUISoon(){ if(uiTimer) return; uiTimer=setTimeout(function(){ uiTimer=null; saveUI(); }, 400); }
function trackScroll(elem, key){
  if(!elem) return;
  elem.onscroll=function(){ state.scroll[key]=elem.scrollTop; saveUISoon(); };
  if(elem.clientHeight>0){ var y=state.scroll[key]||0;
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(function(){ try{ elem.scrollTop=y; }catch(e){} });
    else try{ elem.scrollTop=y; }catch(e){} }
}
function activeScroller(){
  if(state.view==='predictions') return { elem: document.querySelector('#predictions .mwrap')||document.querySelector('#predictions .mutwrap'), key:'pred:'+state.predMode };
  return { elem: document.querySelector('#view-'+state.view), key: state.view+(state.view==='schedule'?(':'+state.dayFilter):'') };
}
function restoreScroll(){ var a=activeScroller(); if(!a.elem) return; var y=state.scroll[a.key]||0;
  if(typeof requestAnimationFrame==='function') requestAnimationFrame(function(){ try{ a.elem.scrollTop=y; }catch(e){} });
  else try{ a.elem.scrollTop=y; }catch(e){} }

/* ---- pelaajafiltteri (kokoontaitettava, oletuksena piilossa) ---- */
function renderFilter(){
  var bar=$('#filterbar'); bar.innerHTML='';
  var row=el('div','frow');
  var tog=el('div','ftoggle');
  tog.appendChild(el('span','chev2', state.filterOpen?'▼':'▶'));
  tog.appendChild(el('span',null,'Veikkaajat ('+state.players.size+'/'+NAMES.length+')'));
  tog.onclick=function(){ state.filterOpen=!state.filterOpen; renderFilter(); saveUI(); };
  row.appendChild(tog);
  var facts=el('div','facts');
  var all=el('a',null,'Kaikki'); all.onclick=function(){ NAMES.forEach(function(n){state.players.add(n);}); rerender(); };
  var top4=el('a',null,'Top 4'); top4.onclick=function(){ state.players=new Set(ALLROWS.slice(0,4).map(function(r){ return r.name; })); rerender(); };
  var top10=el('a',null,'Top 10'); top10.onclick=function(){ state.players=new Set(ALLROWS.slice(0,10).map(function(r){ return r.name; })); rerender(); };
  var none=el('a',null,'Tyhjennä'); none.onclick=function(){ state.players.clear(); rerender(); };
  facts.appendChild(all); facts.appendChild(top4); facts.appendChild(top10); facts.appendChild(none); row.appendChild(facts);
  bar.appendChild(row);
  if(!state.filterOpen) return;
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
  ['#','Veikkaaja','Pisteet'].forEach(function(h){ hr.appendChild(el('th',null,h)); });
  thead.appendChild(hr); t.appendChild(thead);
  var tb=el('tbody');
  ALLROWS.forEach(function(r){                       // aina kaikki veikkaajat
    var tr=el('tr');
    tr.appendChild(el('td','rank',r.rank));
    tr.appendChild(el('td','name',r.name));
    var parts=[['Lohko',r.group],['Sikajengi',r.sikajengi],['Cup',r.cup],['Maalit',r.goalscorer]];
    var nz=parts.filter(function(p){ return p[1]>0; }).map(function(p){ return p[1]; });
    var td=el('td','pts'); td.title=parts.map(function(p){ return p[0]+' '+p[1]; }).join(' · ');
    if(nz.length>1) td.appendChild(el('span','brk','('+nz.join('+')+')'));
    td.appendChild(el('span','tot',r.total));
    tr.appendChild(td); tb.appendChild(tr);
  });
  t.appendChild(tb); box.appendChild(t);
  trackScroll($('#view-standings'),'standings');
}

/* ---- otteluohjelma + matsia klikkaamalla kaikkien veikkaukset ---- */
function matchDetail(m){
  var res=(R.matches||{})[m.id]||liveScore(m.id), has=!!res;
  var rows=NAMES.map(function(n){ var p=(P[n].matches||{})[m.id]||''; return { n:n, p:p, pts:matchPoints(p,res,T.scoring.group) }; });
  if(has) rows.sort(function(a,b){ return b.pts-a.pts || a.n.localeCompare(b.n,'fi'); });
  var d=el('div','mdetail');
  // Koko maiden nimet + pelipaikka omalla rivillään (kännykällä rivin tooltip ei
  // ole käytettävissä).
  var full=pairTitle(m.home,m.away);
  var venue=[m.stadium,m.city].filter(Boolean).join(', ');
  var hasFull = full!==m.home+' – '+m.away;
  if(hasFull||venue){
    var n=el('div','mhead');
    if(hasFull) n.appendChild(el('div','mnames',full));
    if(venue) n.appendChild(el('div','mvenue',venue));
    d.appendChild(n);
  }
  rows.forEach(function(r){
    var it=el('div','pitem');
    it.appendChild(el('span','pname',r.n));
    it.appendChild(el('span','pval '+cellClass(r.pts,has), r.p||'–'));
    d.appendChild(it);
  });
  return d;
}
function matchCell(m, ko){
  var cell=el('div','mcell'), row=el('div','match'+(ko?' noexp':''));
  row.appendChild(el('span','chev', ko?'':'▶'));
  var left=el('div');
  var tdiv=el('div','teams',m.home+' – '+m.away); tdiv.title=pairTitle(m.home,m.away); left.appendChild(tdiv);
  left.appendChild(el('div','time', fiTime(m.kickoff) || m.timeLabel || ''));
  row.appendChild(left);
  // FIFA-linkki otteluparin ja tuloksen väliin (keskelle tyhjää kohtaa)
  if(m.url){ var a=document.createElement('a'); a.className='fifalink'; a.textContent='FIFA ↗';
    a.href=m.url; a.target='_blank'; a.rel='noopener noreferrer'; a.onclick=function(e){ e.stopPropagation(); }; row.appendChild(a); }
  else row.appendChild(el('span'));
  var fin = ko ? m.score : (R.matches||{})[m.id];
  var lv = ko ? (m.liveScore||null) : liveScore(m.id);
  var res = fin || lv;
  var pill = el('div','res'+(res?'':' none')+(lv&&!fin?' islive':''), res||'–');
  if(lv&&!fin) pill.title='Käynnissä';
  row.appendChild(pill);
  if(ko){ cell.appendChild(row); return cell; }          // pudotuspelit eivät laajene (ei per-matsi-veikkauksia)
  var det=matchDetail(m); det.style.display='none';
  row.onclick=function(){ var open=det.style.display==='none'; det.style.display=open?'':'none'; row.classList.toggle('open',open); };
  cell.appendChild(row); cell.appendChild(det); return cell;
}
// Tietokannassa kickoff on UTC; näytetään aina Suomen aika.
function fiTime(iso){
  if(!iso) return '';
  var p={}; new Intl.DateTimeFormat('fi-FI',{timeZone:'Europe/Helsinki',weekday:'short',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(iso)).forEach(function(x){p[x.type]=x.value;});
  return p.weekday.replace('.','')+' '+p.day+'.'+p.month+' klo '+p.hour+':'+p.minute;
}
// Lyhyt päiväys kaavion soluihin: "su 28.6."
function fiDateShort(iso){
  if(!iso) return '';
  var p={}; new Intl.DateTimeFormat('fi-FI',{timeZone:'Europe/Helsinki',weekday:'short',day:'numeric',month:'numeric'}).formatToParts(new Date(iso)).forEach(function(x){p[x.type]=x.value;});
  return p.weekday.replace('.','')+' '+p.day+'.'+p.month+'.';
}
function fiClock(iso){
  if(!iso) return '';
  var p={}; new Intl.DateTimeFormat('fi-FI',{timeZone:'Europe/Helsinki',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(iso)).forEach(function(x){p[x.type]=x.value;});
  return p.hour+':'+p.minute;
}
function fiDayKey(iso){
  var p={}; new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso)).forEach(function(x){p[x.type]=x.value;});
  return p.year+'-'+p.month+'-'+p.day;
}
function renderSchedule(){
  var box=$('#schedule'); box.innerHTML='';
  var seg=el('div','seg');
  [['today','Tänään'],['tomorrow','Huomenna'],['upcoming','Tulevat'],['all','Kaikki']].forEach(function(o){
    var b=el('button', state.dayFilter===o[0]?'on':null, o[1]);
    b.onclick=function(){ state.dayFilter=o[0]; renderSchedule(); saveUI(); };
    seg.appendChild(b);
  });
  box.appendChild(seg);
  box.appendChild(el('div','hint','Ottelua klikkaamalla näet kaikkien veikkaukset.'));
  var list=el('div'); box.appendChild(list);
  var df=state.dayFilter, now=new Date();
  // "Futispäivä": yön matsit (Suomen aikaa ennen klo 08) kuuluvat vielä
  // edelliseen päivään — pe 05:00 on "torstain peli".
  function fDay(iso){ return fiDayKey(new Date(new Date(iso).getTime()-8*3600000).toISOString()); }
  var todayK=fDay(now.toISOString()), tmrK=fDay(new Date(Date.now()+86400000).toISOString());
  function keep(m, finished){ if(df==='all') return true; if(!m.kickoff) return false;
    if(df==='today') return fDay(m.kickoff)===todayK;
    if(df==='tomorrow') return fDay(m.kickoff)===tmrK;
    // tulevat: alkamattomat + käynnissä olevat (pudotetaan kun lopputulos kirjautuu)
    var kt=new Date(m.kickoff).getTime();
    return kt>now.getTime() || (now.getTime()-kt < 170*60000 && !finished); }
  var ms = T.matches.filter(function(m){ return keep(m, !!(R.matches||{})[m.id]); });
  var ko = (T.knockout||[]).filter(function(m){ return keep(m, !!m.score); });
  if(!ms.length && !ko.length){ list.appendChild(el('div','hint',
    df==='today'?'Ei otteluita tänään.':df==='tomorrow'?'Ei otteluita huomenna.':df==='upcoming'?'Ei tulevia otteluita.':'Ei otteluita.'));
    trackScroll($('#view-schedule'),'schedule:'+state.dayFilter); return; }
  // Lohkot (A–L), lohkon sisällä aikajärjestyksessä.
  var by={}; ms.forEach(function(m){ (by[m.group]=by[m.group]||[]).push(m); });
  Object.keys(by).sort().forEach(function(g){
    list.appendChild(el('div','grp','LOHKO '+g));
    by[g].forEach(function(m){ list.appendChild(matchCell(m)); });
  });
  // Pudotuspelit lohkojen jälkeen, kierroksittain.
  if(ko.length){
    list.appendChild(el('div','kohdr','PUDOTUSPELIT'));
    var byR={}; ko.forEach(function(m){ (byR[m.round]=byR[m.round]||[]).push(m); });
    ['r32','r16','qf','sf','bronze','final'].forEach(function(rk){
      if(!byR[rk]) return;
      list.appendChild(el('div','grp', byR[rk][0].roundLabel));
      byR[rk].forEach(function(m){ list.appendChild(matchCell(m, true)); });
    });
  }
  trackScroll($('#view-schedule'),'schedule:'+state.dayFilter);
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
    if(s.group!=null){ var tr=el('tr','grow'); var lab=el('td','glabel');
      var sp=document.createElement('span'); sp.textContent=s.group; lab.appendChild(sp); tr.appendChild(lab);
      var f=el('td','gfill',''); f.colSpan=players.length+1; tr.appendChild(f); tb.appendChild(tr); return; }
    var tr=el('tr');
    var lc=el('td','mcol'+(s.mono?' mono':''),s.label); if(s.title) lc.title=s.title; tr.appendChild(lc);
    var ac=el('td','actual tcol'+(s.mono?' mono':'')+(s.actualCls?' '+s.actualCls:''), s.actual==null?'–':s.actual); if(s.actualTitle) ac.title=s.actualTitle; tr.appendChild(ac);
    players.forEach(function(n){ var c=s.cellFor(n); var td=el('td',c.cls,c.txt==null?'':c.txt); if(c.title) td.title=c.title; tr.appendChild(td); });
    tb.appendChild(tr);
  });
  t.appendChild(tb); wrap.appendChild(t); return wrap;
}
// Mittaa Ottelu-sarakkeen todellinen leveys ja jäädytä Tulos-sarake sen viereen
// (Ottelu-sarake sovittautuu sisältöön → maakoodit eivät koskaan leikkaudu).
function freezeOffsets(wrap){
  if(!wrap.querySelector) return;
  var c=wrap.querySelector('.mcol'), t=wrap.querySelector('table');
  if(c && t && c.offsetWidth) t.style.setProperty('--mcolw', c.offsetWidth+'px');
}
function predSeg(){
  var seg=el('div','seg');
  [['lohko','Lohko'],['cup','Cup'],['muut','Muut']].forEach(function(o){
    var b=el('button', state.predMode===o[0]?'on':null, o[1]);
    b.onclick=function(){ state.predMode=o[0]; renderPredictions(); saveUI(); };
    seg.appendChild(b);
  });
  return seg;
}
// Cup-vaihe Excel-tyylillä: rivit = paikat kierroksittain, kukin sarake listaa
// veikkaajan jatkoonpääsijät (koodit), Tulos-sarake = oikeat joukkueet.
function renderCupInto(box, players){
  var rows=[];
  T.cupRounds.forEach(function(rd){
    rows.push({ group: rd.label.toUpperCase()+' ('+rd.pointsPerTeam+'p)' });
    var slots = rd.slots || 1;
    var actual = rd.key==='champion' ? ((R.rounds&&R.rounds.champion)?[R.rounds.champion]:[]) : ((R.rounds&&R.rounds[rd.key])||[]);
    var actualSet={}; actual.forEach(function(t){ actualSet[t]=1; });
    // Osuma (vihreä) näytetään heti; ohilyönti (harmaa) vasta kun kierroksen
    // kaikki paikat on täytetty — sitä ennen veikkaus voi vielä toteutua.
    var complete = actual.length>=slots;
    var actualSorted = actual.slice().sort();
    for(var i=0;i<slots;i++){
      (function(key, i){
        rows.push({ label:String(i+1), mono:true,
          actual: actualSorted[i] || '–',
          actualTitle: actualSorted[i] ? teamName(actualSorted[i]) : null,
          cellFor:function(n){
            var v=P[n].cup&&P[n].cup[key];
            var arr = key==='champion' ? (v?[v]:[]) : (v||[]);
            var pick=arr[i];
            if(!pick) return { txt:'', cls:'mono' };
            return { txt:pick, title:teamName(pick), cls:'mono '+(actualSet[pick]?'c3':(complete?'c0':'')) };
          }
        });
      })(rd.key, i);
    }
  });
  var w=buildMatrix(players, null, rows); w.style.flex='1 1 auto'; w.style.minHeight='0';
  box.appendChild(w); freezeOffsets(w); trackScroll(w,'pred:cup');
  box.appendChild(el('div','hint','Kuten Excelissä: sarake = veikkaajan jatkoonpääsijät, Tulos = oikeat joukkueet. Vihreä = oikein, harmaa = väärin (kun koko kierros on ratkennut).'));
}
function renderPredictions(){
  var box=$('#predictions'); box.innerHTML='';
  box.appendChild(predSeg());
  var players=sel();
  if(!players.length){ box.appendChild(el('div','hint','Avaa filtteri ja valitse veikkaajia.')); return; }
  if(state.predMode==='cup'){ renderCupInto(box, players); return; }
  if(state.predMode==='muut'){ renderMuutInto(box, players); return; }
  // lohko-ottelut
  var rows=[]; var by={}; T.matches.forEach(function(m){ (by[m.group]=by[m.group]||[]).push(m); });
  Object.keys(by).forEach(function(g){
    rows.push({group:'LOHKO '+g});
    by[g].forEach(function(m){
      var fin=(R.matches||{})[m.id], lv=liveScore(m.id), res=fin||lv, has=!!res;
      rows.push({ label:m.home+'–'+m.away, mono:true, title:pairTitle(m.home,m.away),
        actual:res, actualCls:(lv&&!fin)?'islive':null, cellFor:function(n){
        var pred=(P[n].matches||{})[m.id];
        return { txt:pred||'', cls:cellClass(matchPoints(pred,res,T.scoring.group), has) };
      }});
    });
  });
  var w1=buildMatrix(players, null, rows); w1.style.flex='1 1 auto'; w1.style.minHeight='0';
  box.appendChild(w1); freezeOffsets(w1); trackScroll(w1,'pred:lohko');
}
// Muut: sikajengi + maalintekijä yhtenä listana (rivi per veikkaaja)
function renderMuutInto(box, players){
  var wrap=el('div','mutwrap'), dirty=R.dirtiestTeams||[];
  wrap.appendChild(el('div','msub','Sikajengi & maalintekijä'+
    (dirty.length?' · sikajengi: '+dirty.map(teamName).join(' / '):'')));
  var hd=el('div','mutrow muthead');
  hd.appendChild(el('span',null,''));
  hd.appendChild(el('span',null,'Sikajengi'));
  hd.appendChild(el('span',null,'Maalintekijä'));
  wrap.appendChild(hd);
  players.forEach(function(n){
    var row=el('div','mutrow');
    row.appendChild(el('span','nm',n));
    var sp=P[n].sikajengi;
    var pk=el('span','pk',sp||'–'); if(sp) pk.title=teamName(sp);
    if(dirty.length&&sp) pk.className='pk '+(dirty.indexOf(sp)>=0?'pos':'neg');
    row.appendChild(pk);
    var gp=P[n].goalscorer, goals=(R.goals||{})[gp];
    row.appendChild(el('span','pk', gp ? (gp+(goals!=null?' ('+goals+')':'')) : '–'));
    wrap.appendChild(row);
  });
  box.appendChild(wrap); trackScroll(wrap,'pred:muut');
}

/* ---- analytiikka ---- */
function mkSelect(opts, val, onCh){
  var s=document.createElement('select');
  opts.forEach(function(o){ var op=document.createElement('option'); op.value=o; op.textContent=o; if(o===val)op.selected=true; s.appendChild(op); });
  s.onchange=function(){ onCh(s.value); }; return s;
}
function undecidedMatches(){ return T.matches.filter(function(m){ return !matchDecided(R,m.id); }); }
// Kierros on auki kunnes kaikki paikat on täytetty (jatkoonpääsijät selviävät yksitellen).
function undecidedCup(){ return T.cupRounds.filter(function(rd){ var a=R.rounds&&R.rounds[rd.key];
  return rd.key==='champion' ? !a : !(a&&a.length>=(rd.slots||1)); }); }
// Aikajana: ratkenneet pisteytystapahtumat loogisessa järjestyksessä +
// per-veikkaaja pistedelta. Lohko-ottelut kickoff-järjestyksessä, sitten
// sikajengi, cup-kierrokset ja lopuksi maalit.
function pointsTimeline(){
  var ev=[], names=Object.keys(P);
  T.matches.filter(function(m){ return matchDecided(R,m.id); })
    .slice().sort(function(a,b){ return (a.kickoff||'').localeCompare(b.kickoff||''); })
    .forEach(function(m){ var d={}; names.forEach(function(n){ d[n]=matchPoints((P[n].matches||{})[m.id], R.matches[m.id], T.scoring.group); }); ev.push({label:m.home+'–'+m.away, deltas:d}); });
  if(R.dirtiestTeams&&R.dirtiestTeams.length){ var d={}; names.forEach(function(n){ d[n]=sikajengiPoints(P[n].sikajengi,R.dirtiestTeams,T.scoring.sikajengi); }); ev.push({label:'Sikajengi', deltas:d}); }
  T.cupRounds.forEach(function(rd){ var a=R.rounds&&R.rounds[rd.key]; var dec=rd.key==='champion'?!!a:(a&&a.length); if(!dec)return;
    var d={}; names.forEach(function(n){ d[n]=cupPoints(P[n].cup, R.rounds, [rd]).total; }); ev.push({label:rd.label, deltas:d}); });
  if(R.goals && Object.keys(R.goals).length){ var d={}; names.forEach(function(n){ d[n]=goalscorerPoints(P[n].goalscorer,R.goals,T.scoring.goalscorer); }); ev.push({label:'Maalit', deltas:d}); }
  return ev;
}
function renderTimeChart(){
  var s=el('div','asec'); s.appendChild(el('h3',null,'Pisteet ajan yli'));
  var events=pointsTimeline();
  if(!events.length){ s.appendChild(el('div','hint','Ei vielä ratkenneita otteluita.')); return s; }
  var names=Object.keys(P), cum={}, series={};
  names.forEach(function(n){ cum[n]=0; series[n]=[0]; });
  events.forEach(function(e){ names.forEach(function(n){ cum[n]+=e.deltas[n]||0; series[n].push(cum[n]); }); });
  var picked=sel();
  if(!picked.length){ s.appendChild(el('div','hint','Valitse veikkaajia suodattimesta nähdäksesi käyrät.')); return s; }
  var allSel=picked.length===names.length;
  var top = allSel ? names.slice().sort(function(a,b){ return cum[b]-cum[a]; }).slice(0,8)
                   : picked.slice().sort(function(a,b){ return cum[b]-cum[a]; });
  var scaleSet = allSel ? names : top;   // skaala kattaa myös harmaat taustaviivat
  var maxY=1; scaleSet.forEach(function(n){ if(cum[n]>maxY)maxY=cum[n]; });
  var W=340,H=190,padL=6,padR=22,padT=10,padB=10,xN=events.length;
  function X(i){ return (padL+(xN?i/xN:0)*(W-padL-padR)).toFixed(1); }
  function Y(v){ return (H-padB-(v/maxY)*(H-padT-padB)).toFixed(1); }
  var pal=['#3ea6ff','#ffd24a','#46c46b','#e2706e','#b98cff','#46c9c0','#ff9d4a','#e36fb0','#7ec8ff','#caa84a','#8ad28f','#ff8f8f'];
  var svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto">';
  svg+='<line x1="'+padL+'" y1="'+(H-padB)+'" x2="'+(W-padR)+'" y2="'+(H-padB)+'" stroke="#2a2f3a"/>';
  if(allSel){ names.forEach(function(n){ var pts=series[n].map(function(v,i){ return X(i)+','+Y(v); }).join(' ');
    svg+='<polyline points="'+pts+'" fill="none" stroke="#39414f" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0.5"/>'; }); }
  // Identtiset sarjat viuhkaksi: ryhmän keskikohta on tarkalleen oikea viiva,
  // säikeet ±~3px sen ympärillä — muuten päällekkäisistä näkyisi vain päällimmäinen.
  var gSize={}, gIx={};
  top.forEach(function(n){ var sig=series[n].join(',');
    if(gSize[sig]==null) gSize[sig]=0;
    gIx[n]=gSize[sig]++; });
  function fanDy(n){
    var g=gSize[series[n].join(',')];
    if(g<2) return 0;
    var step=Math.min(1.2, 6/(g-1));
    return (gIx[n]-(g-1)/2)*step;
  }
  top.forEach(function(n,idx){
    var dy=fanDy(n);
    var pts=series[n].map(function(v,i){ return X(i)+','+(+Y(v)+dy).toFixed(1); }).join(' ');
    svg+='<polyline points="'+pts+'" fill="none" stroke="'+pal[idx%pal.length]+'" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>';
  });
  // montako veikkaajaa samalla viivalla (ryhmille >= 3)
  top.forEach(function(n){
    var sig=series[n].join(','), g=gSize[sig];
    if(g>=3 && gIx[n]===0){
      var last=series[n][series[n].length-1];
      svg+='<text x="'+(W-padR+4)+'" y="'+(+Y(last)+3).toFixed(1)+'" fill="#8b93a7" font-size="9">×'+g+'</text>';
    }
  });
  svg+='</svg>';
  var cb=el('div','chartbox'); cb.innerHTML=svg; s.appendChild(cb);
  var leg=el('div','legend');
  top.forEach(function(n,idx){ var it=el('div','legi'); var sw=el('span','legsw'); sw.style.background=pal[idx%pal.length]; it.appendChild(sw); it.appendChild(el('span',null,n+' ('+cum[n]+')')); leg.appendChild(it); });
  s.appendChild(leg);
  s.appendChild(el('div','hint', events.length+' ratkennutta tapahtumaa · '+
    (allSel?'top 8 värillä, muut harmaana (suodata veikkaajavalinnasta)':picked.length+' valittua veikkaajaa')+' · maalit mukana lopussa'));
  return s;
}
// Villeimmät veikkaukset: ennusteen keskim. etäisyys muiden veikkauksiin samassa
// ottelussa (maaliero + vastakkainen lopputulos +2). Top 10.
function wildScoreDist(a,b){ return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+(sign(a[0]-a[1])!==sign(b[0]-b[1])?2:0); }
function wildestPredictions(){
  var out=[];
  T.matches.forEach(function(m){
    var preds=[];
    NAMES.forEach(function(n){ var s=parseScore((P[n].matches||{})[m.id]); if(s) preds.push({n:n,s:s}); });
    if(preds.length<3) return;
    var counts={}; preds.forEach(function(p){ var k=p.s[0]+'-'+p.s[1]; counts[k]=(counts[k]||0)+1; });
    var mode=Object.keys(counts).sort(function(a,b){ return counts[b]-counts[a]; })[0];
    preds.forEach(function(p){
      var sum=0; preds.forEach(function(q){ if(q!==p) sum+=wildScoreDist(p.s,q.s); });
      out.push({ m:m, player:p.n, pred:p.s[0]+'-'+p.s[1], mode:mode, wild:sum/(preds.length-1) });
    });
  });
  out.sort(function(a,b){ return b.wild-a.wild; });
  return out.slice(0,10);
}
/* ---- cup-kaavio: vasen/oikea puolisko, finaali keskellä ---- */
function renderBracket(){
  if(!BRACKET) return null;
  var ix={}; (T.knockout||[]).forEach(function(m){ ix[m.matchNumber]=m; });
  var champ=(R.rounds&&R.rounds.champion)||null;
  function cell(num, parentNum, extraCls){
    var m=ix[num], c=el('div','bcell'+(extraCls?' '+extraCls:''));
    if(!m){ c.appendChild(el('div','bteam tbd','?')); return c; }
    var pm=parentNum?ix[parentNum]:null, sc=(m.score||'').split('-');
    [[m.home,sc[0]],[m.away,sc[1]]].forEach(function(t,j){
      var code=t[0];
      // jatkoonpäässyt: joukkue näkyy seuraavassa ottelussa, tai tulos on selvä
      // (tasatulos ratkeaa rankkareilla → merkataan vasta kun jatkopaikka näkyy),
      // finaalissa myös mestari-kentästä
      var inNext = pm ? (pm.home===code||pm.away===code) : false;
      var byScore = m.score && +sc[0]!==+sc[1] ? (j===0 ? +sc[0]>+sc[1] : +sc[1]>+sc[0]) : false;
      var adv = inNext || byScore || (m.round==='final' && champ===code);
      var row=el('div','bteam'+(m.real?'':' tbd')+(adv?' win':''));
      row.appendChild(el('span','tc',code));
      row.appendChild(el('span','bsc', t[1]!=null?t[1]:''));
      c.appendChild(row);
    });
    if(m.kickoff){ var dt=el('div','bdate',fiDateShort(m.kickoff));
      dt.appendChild(el('span','btime',' '+fiClock(m.kickoff))); c.appendChild(dt); }
    if(m.real) c.title=pairTitle(m.home,m.away)+(m.score?' · '+m.score:'')+(m.kickoff?' · '+fiTime(m.kickoff):'');
    return c;
  }
  var s=el('div','asec');
  var wrap=el('div','bwrap'), br=el('div','bracket');
  // otsikko + nuolet: siirtävät valintaa kierroksen kerrallaan
  var hd=el('div','bhead'); hd.appendChild(el('h3',null,'Cup-kaavio'));
  var nav=el('div','bnav');
  var prevB=el('button',null,'‹'), nextB=el('button',null,'›');
  prevB.onclick=function(){ selectLab(curLab-1); };
  nextB.onclick=function(){ selectLab(curLab+1); };
  nav.appendChild(prevB); nav.appendChild(nextB); hd.appendChild(nav); s.appendChild(hd);
  // kierrosotsikko toimii nappina: keskittää oman sarakkeensa (FIFA-tyyliin) ja
  // jää valituksi. Oletus 1/8: 1/16 ja 1/8 keskittyvät samaan (klampattuun)
  // alkuasentoon, joten 1/8:sta ensimmäinen nuolipainallus liikuttaa näkymää.
  var labs=[], labCols=[], curLab=0, spyT=null, pendingX=null, pendingT=null;
  function markLab(i){
    curLab=i;
    labs.forEach(function(l){ l.classList.remove('on'); });
    labs[i].classList.add('on');
  }
  function selectLab(i){
    if(!labs.length) return;
    i=Math.min(labs.length-1, Math.max(0,i));
    markLab(i);
    var col=labCols[i];
    var r=col.getBoundingClientRect(), w=wrap.getBoundingClientRect();
    var x=wrap.scrollLeft+(r.left-w.left)+r.width/2-wrap.clientWidth/2;
    x=Math.max(0, Math.min(x, wrap.scrollWidth-wrap.clientWidth));
    // spy odottaa kunnes tämä maali on saavutettu (varotimeri purkaa jos ei koskaan)
    pendingX=x;
    if(pendingT) clearTimeout(pendingT);
    pendingT=setTimeout(function(){ pendingX=null; pendingT=null; spySync(); },1200);
    animateTo(x);
  }
  // Oma animaatio natiivin smooth-scrollin sijaan: selaimen snap vie keskeytetyn
  // animaation maalin yli (nopeat klikit hyppäsivät kierroksen). Snap pois päältä
  // liu'un ajaksi; loppuasema on tarkka sarakekeskitys, joten snap ei korjaa sitä.
  var animF=null;
  function animateTo(x){
    if(typeof requestAnimationFrame!=='function'){ wrap.scrollLeft=x; return; }
    if(animF) cancelAnimationFrame(animF);
    var t0=null, x0=wrap.scrollLeft, dx=x-x0;
    var D=Math.min(450, 220+Math.abs(dx)*0.4);
    wrap.style.scrollSnapType='none';
    function stepFn(ts){
      if(t0==null) t0=ts;
      var p=Math.min(1,(ts-t0)/D);
      p = p<0.5 ? 2*p*p : 1-Math.pow(-2*p+2,2)/2;   // easeInOutQuad
      wrap.scrollLeft=x0+dx*p;
      if(p<1){ animF=requestAnimationFrame(stepFn); }
      else { animF=null; wrap.style.scrollSnapType=''; }
    }
    animF=requestAnimationFrame(stepFn);
  }
  function wireLab(lab,col){
    var i=labs.length; labs.push(lab); labCols.push(col);
    lab.onclick=function(){ selectLab(i); };
  }
  // scroll-spy: kun vieritys on PYSÄHTYNYT, synkkaa valinta lähimpään
  // kierrokseen → nuoli astuu aina siitä mitä ruudulla oikeasti näkyy.
  // Jättävä debounce ei koskaan ammu kesken animaation; scrollend on tarkin.
  function nearestLab(){
    var w=wrap.getBoundingClientRect(), cx=w.left+wrap.clientWidth/2, best=0, bd=Infinity;
    labCols.forEach(function(col,i){ var r=col.getBoundingClientRect();
      var d=Math.abs(r.left+r.width/2-cx); if(d<bd){ bd=d; best=i; } });
    return best;
  }
  function spySync(){
    if(spyT){ clearTimeout(spyT); spyT=null; }
    if(pendingX!=null){
      if(Math.abs(wrap.scrollLeft-pendingX)>6) return;   // klikin animaatio kesken
      pendingX=null; if(pendingT){ clearTimeout(pendingT); pendingT=null; }
    }
    var i=nearestLab(); if(i!==curLab) markLab(i);
  }
  wrap.onscroll=function(){
    if(spyT) clearTimeout(spyT);
    spyT=setTimeout(spySync,200);
  };
  if('onscrollend' in wrap) wrap.onscrollend=spySync;
  function halfCols(cols, mirror){
    var ds=[]; for(var d=cols.length-1;d>=0;d--) ds.push(d);
    if(mirror) ds.reverse();
    ds.forEach(function(d){
      var col=el('div','bcol '+(mirror?'colR':'colL'));
      var lab=el('div','blab','1/'+Math.pow(2,d+1)); wireLab(lab,col); col.appendChild(lab);
      var box=el('div','bcells');
      var cells=cols[d].map(function(num,i){
        var parent = d===0 ? BRACKET.final : cols[d-1][Math.floor(i/2)];
        var c=cell(num,parent);
        if(d<cols.length-1) c.className+=' fed';   // tulostubi edelliseltä kierrokselta
        return c;
      });
      for(var i=0;i<cells.length;i+=2){            // parit omaan kehykseen haarukkaviivaa varten
        var pair=el('div','bpair'+(cells[i+1]?' duo':''));
        pair.appendChild(cells[i]); if(cells[i+1]) pair.appendChild(cells[i+1]);
        box.appendChild(pair);
      }
      col.appendChild(box); br.appendChild(col);
    });
  }
  halfCols(BRACKET.left,false);
  var center=el('div','bcol');
  var flab=el('div','blab','Finaali'); wireLab(flab,center); center.appendChild(flab);
  var cb=el('div','bcells'); cb.style.justifyContent='center';
  var mz=el('div');
  mz.appendChild(el('div','blab plain','Kulta'));
  if(champ){ var ch=el('div','bchamp','🏆 '+champ); ch.title=teamName(champ); mz.appendChild(ch); }
  cb.appendChild(mz);
  cb.appendChild(cell(BRACKET.final,null,'bfinal'));
  if(BRACKET.bronze){ var bz=el('div','bbz');
    bz.appendChild(el('div','blab plain','Pronssi'));
    bz.appendChild(cell(BRACKET.bronze,null)); cb.appendChild(bz); }
  center.appendChild(cb); br.appendChild(center);
  halfCols(BRACKET.right,true);
  wrap.appendChild(br); s.appendChild(wrap);
  if(labs.length){ curLab=Math.min(1,labs.length-1); labs[curLab].classList.add('on'); }
  if(KV.bracketUrl){ var hint=el('div','hint'); var a=document.createElement('a'); a.className='fifalink';
    a.href=KV.bracketUrl; a.target='_blank'; a.rel='noopener noreferrer';
    a.textContent='Virallinen kaavio (FIFA) ↗'; hint.appendChild(a); s.appendChild(hint); }
  return s;
}

function renderAnalytics(){
  var box=$('#analytics'); box.innerHTML='';
  var und=undecidedMatches(), cupUnd=undecidedCup(), sikaUnd=!(R.dirtiestTeams&&R.dirtiestTeams.length);
  var phase = und.length ? 'lohkovaihe kesken' : (cupUnd.length ? 'cup-vaihe kesken' : 'cup ratkennut');
  box.appendChild(el('div','hint', (T.matches.length-und.length)+'/'+T.matches.length+' ottelua pelattu · '+
    phase+(sikaUnd?' · sikajengi auki':'')));
  if(hasResults()) box.appendChild(renderTimeChart());
  var bk=renderBracket(); if(bk) box.appendChild(bk);
  if(!hasResults()){ renderAnalyticsPre(box); return; }

  // 1) Pelaajavertailu (localStoragen nimi voi olla vanhentunut → validoi)
  var names=ALLROWS.map(function(r){ return r.name; });
  if(names.indexOf(state.cmpA)<0) state.cmpA=names[0];
  if(names.indexOf(state.cmpB)<0) state.cmpB=names[1]||names[0];
  var s2=el('div','asec'); s2.appendChild(el('h3',null,'Pelaajavertailu'));
  var sr=el('div','cmpsel');
  sr.appendChild(mkSelect(names,state.cmpA,function(v){ state.cmpA=v; renderAnalytics(); saveUI(); }));
  sr.appendChild(mkSelect(names,state.cmpB,function(v){ state.cmpB=v; renderAnalytics(); saveUI(); }));
  s2.appendChild(sr);
  var a=scoreParticipant(P[state.cmpA],R,T), b=scoreParticipant(P[state.cmpB],R,T);
  var t2=el('table','rank-t'), h2=el('thead'), hr2=el('tr');
  ['', state.cmpA, state.cmpB, 'Ero'].forEach(function(h){ hr2.appendChild(el('th',null,h)); });
  h2.appendChild(hr2); t2.appendChild(h2); var b2=el('tbody');
  [['Lohko','group'],['Sikajengi','sikajengi'],['Cup','cup'],['Maalit','goalscorer'],['Yhteensä','total']].forEach(function(row){
    var av=a[row[1]], bv=b[row[1]], d=av-bv, tr=el('tr');
    tr.appendChild(el('td','name',row[0]));
    tr.appendChild(el('td', row[1]==='total'?'tot':'dim', av));
    tr.appendChild(el('td', row[1]==='total'?'tot':'dim', bv));
    tr.appendChild(el('td', d>0?'pos':d<0?'neg':'dim', (d>0?'+':'')+d));
    b2.appendChild(tr);
  });
  t2.appendChild(b2); s2.appendChild(t2); box.appendChild(s2);

  // 2) Villeimmät veikkaukset
  renderWildest(box, 'Eniten muiden veikkauksista poikkeavat lohkoveikkaukset.');
  // 3) Pelaajakortit
  renderPlayerCards(box);
  // 4) Max-pisteet / kuka voi vielä voittaa (lopussa — alkuvaiheessa vähiten kiinnostava)
  var mx=ALLROWS.map(function(r){ var rem=remainingMax(P[r.name],R,T); return { name:r.name, now:r.total, rem:rem, max:r.total+rem }; });
  var leadNow=Math.max.apply(null, mx.map(function(x){ return x.now; }));
  mx.sort(function(a,b){ return b.max-a.max || b.now-a.now; });
  var s1=el('div','asec'); s1.appendChild(el('h3',null,'Kuka voi vielä voittaa?'));
  var t1=el('table','rank-t'), h1=el('thead'), hr1=el('tr');
  ['Veikkaaja','Nyt','+Max','=Max'].forEach(function(h){ hr1.appendChild(el('th',null,h)); });
  h1.appendChild(hr1); t1.appendChild(h1); var b1=el('tbody');
  mx.forEach(function(x){ var tr=el('tr');
    tr.appendChild(el('td','name'+(x.max>=leadNow?'':' elim'),x.name));
    tr.appendChild(el('td','dim',x.now));
    tr.appendChild(el('td','dim','+'+x.rem));
    tr.appendChild(el('td','tot',x.max));
    b1.appendChild(tr); });
  t1.appendChild(b1); s1.appendChild(t1);
  s1.appendChild(el('div','hint','Yliviivatut eivät voi enää saavuttaa johtajan nykypisteitä ('+leadNow+'). Maalintekijä ei mukana (avoin).'));
  box.appendChild(s1);
  trackScroll($('#view-analytics'),'analytics');
}
function renderWildest(box, hintText){
  var sw=el('div','asec'); sw.appendChild(el('h3',null,'Villeimmät veikkaukset'));
  wildestPredictions().forEach(function(w){
    var row=el('div','wildrow'), l=el('div','wleft'), line1=el('div');
    var mm=el('span','wmatch',w.m.home+'–'+w.m.away); mm.title=pairTitle(w.m.home,w.m.away);
    line1.appendChild(mm); line1.appendChild(el('span','wname',' · '+w.player));
    l.appendChild(line1); l.appendChild(el('div','wsub','yleisin '+w.mode));
    row.appendChild(l); row.appendChild(el('span','wpred',w.pred));
    sw.appendChild(row);
  });
  sw.appendChild(el('div','hint',hintText));
  box.appendChild(sw);
}

// Ennen ensimmäisiä tuloksia: vain veikkauksista laskettava sisältö (villeimmät
// veikkaukset); pistetaulukot ja vertailut ilmestyvät kun jotain on ratkennut.
function renderAnalyticsPre(box){
  renderWildest(box, 'Eniten muiden veikkauksista poikkeavat lohkoveikkaukset. Lisää analytiikkaa ilmestyy kun tuloksia alkaa kertyä.');
  renderPlayerCards(box);
  trackScroll($('#view-analytics'),'analytics');
}
// Pelaajakortit: dropdownista valitaan veikkaaja, kortti sen alle.
function renderPlayerCards(box){
  if(!CARDS) return;
  var names=Object.keys(CARDS).filter(function(n){ return NAMES.indexOf(n)>=0; })
    .sort(function(a,b){ return a.localeCompare(b,'fi'); });
  if(!names.length) return;
  if(state.cardPlayer && names.indexOf(state.cardPlayer)<0) state.cardPlayer='';
  var s=el('div','asec');
  var h=el('h3',null,'Pelaajakortit'); h.appendChild(el('span','aigen','AI-generoitu'));
  s.appendChild(h);
  var sr=el('div','cmpsel');
  var sel=document.createElement('select');
  var ph=document.createElement('option'); ph.value=''; ph.textContent='Valitse veikkaaja…'; sel.appendChild(ph);
  names.forEach(function(n){ var o=document.createElement('option'); o.value=n; o.textContent=n;
    if(n===state.cardPlayer) o.selected=true; sel.appendChild(o); });
  var holder=el('div');
  function draw(){
    holder.innerHTML='';
    var c=CARDS[state.cardPlayer];
    if(!c) return;
    var d=el('div','pcard');
    d.appendChild(el('div','pchead',c.headline));
    d.appendChild(el('div','pctext',c.card));
    holder.appendChild(d);
  }
  sel.onchange=function(){ state.cardPlayer=sel.value; saveUI(); draw(); };
  sr.appendChild(sel); s.appendChild(sr); s.appendChild(holder);
  draw();
  box.appendChild(s);
}

/* ---- näkymät ---- */
function rerender(){
  persistSel();
  renderFilter();
  if(state.view==='standings') renderStandings();
  if(state.view==='predictions') renderPredictions();
  if(state.view==='analytics') renderAnalytics();
}
function show(v){
  state.view=v;
  document.querySelectorAll('.view').forEach(function(e){ e.classList.toggle('active', e.id==='view-'+v); });
  document.querySelectorAll('nav button').forEach(function(b){ b.classList.toggle('active', b.dataset.v===v); });
  $('#filterbar').style.display = (v==='predictions' || v==='analytics') ? '' : 'none';
  rerender();
  restoreScroll();
  saveUI();
}
document.querySelectorAll('nav button').forEach(function(b){ b.onclick=function(){ show(b.dataset.v); }; });
// Onko mitään ratkennut? Ohjaa analytiikan sisältöä (tabi on aina näkyvissä).
function hasResults(){
  var r=R||{};
  if(r.matches && Object.keys(r.matches).length) return true;
  if(r.dirtiestTeams && r.dirtiestTeams.length) return true;
  if(r.goals && Object.keys(r.goals).length) return true;
  if(r.rounds){ for(var i=0;i<T.cupRounds.length;i++){ var k=T.cupRounds[i].key, v=r.rounds[k];
    if(k==='champion' ? v : (v&&v.length)) return true; } }
  return false;
}
renderSchedule();
show(state.view);

// Live-päivitys ilman reloadia: hae data jaetusta lähteestä ~60 s välein,
// päivitä näkymä jos tulokset/otteluohjelma muuttuivat (UI-tila + skrolli säilyy).
function refreshFromServer(){
  if(typeof document!=='undefined' && document.hidden) return;
  fetch(DATA_URL+'?t='+Date.now(),{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(d){
    if(!d||!d.results||!d.tournament) return;
    if(JSON.stringify(d.results)===JSON.stringify(R)
       && JSON.stringify(d.tournament.matches)===JSON.stringify(T.matches)
       && JSON.stringify(d.tournament.knockout||[])===JSON.stringify(T.knockout||[])) return;
    T=d.tournament; R=d.results; ALLROWS=scoreAll(P,R,T);
    renderSchedule(); rerender();
  }).catch(function(){});
}
if(typeof setInterval==='function' && !KV.demo){   // demo-buildi ei pollaa (paikalliset kokeilut)
  refreshFromServer();                          // heti latauksessa (baked-data voi olla vanhaa)
  setInterval(refreshFromServer, 60000);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) refreshFromServer(); });
}
`;

const html = `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Kisaveikkaus · ${esc(tournament.name)}</title>
<meta name="description" content="Ursarien ${esc(tournament.name)} kisaveikkaus">
<meta property="og:title" content="Kisaveikkaus · ${esc(tournament.name)}">
<meta property="og:description" content="Ursarien ${esc(tournament.name)} kisaveikkaus">
<meta property="og:type" content="website">
<meta property="og:url" content="https://kisaveikkaus.tolvanen.dev/">
<meta property="og:locale" content="fi_FI">
<meta name="color-scheme" content="dark">
<style>${CSS}</style>
</head>
<body>
<div id="topbar">
  <nav>
    <button data-v="predictions" class="active">Veikkaus</button>
    <button data-v="schedule">Ottelut</button>
    <button data-v="standings">Pisteet</button>
    <button data-v="analytics">Analyt.</button>
  </nav>
  <div id="filterbar"></div>
</div>
<main>
  <section id="view-standings" class="view"><div id="standings"></div></section>
  <section id="view-predictions" class="view active"><div id="predictions"></div></section>
  <section id="view-schedule" class="view"><div id="schedule"></div></section>
  <section id="view-analytics" class="view"><div id="analytics"></div></section>
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

// Tuore data erilliseen tiedostoon live-pollausta varten (selain hakee tämän ~60 s
// välein ja päivittää näkymän ilman reloadia). Header estää välimuistituksen.
await writeFile(path.join("site", "data.json"), JSON.stringify({ tournament, predictions, results }), "utf-8");
await writeFile(path.join("site", "_headers"), "/data.json\n  Cache-Control: no-store\n", "utf-8");
