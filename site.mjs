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
.view.active{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow:auto}
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
.mcell{margin-bottom:6px}
.match{display:grid;grid-template-columns:auto auto 1fr auto;gap:8px 12px;align-items:center;cursor:pointer;
  padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.match.open{border-radius:10px 10px 0 0;border-bottom-color:transparent}
.match .chev{color:var(--muted);font-size:11px;transition:transform .15s}
.match.open .chev{transform:rotate(90deg)}
.match .teams{font-weight:600}.match .time{color:var(--muted);font-size:12px}
.match .res{font-weight:800;background:var(--card2);padding:3px 9px;border-radius:7px;min-width:46px;text-align:center}
.match .res.none{color:var(--muted);font-weight:500}
.fifalink{justify-self:center;font-size:11px;color:var(--accent);text-decoration:none;white-space:nowrap;font-weight:600}
.fifalink:hover{text-decoration:underline}
.mdetail{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:5px 12px;
  padding:9px 11px;border:1px solid var(--line);border-top:none;border-radius:0 0 10px 10px;background:var(--card2)}
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
.mutrow{display:flex;justify-content:space-between;gap:10px;padding:7px 6px;border-bottom:1px solid var(--line)}
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
.oddrow{display:grid;grid-template-columns:92px 1fr 48px;gap:8px;align-items:center;margin-bottom:5px;font-size:13px}
.oddrow .name{font-weight:600;overflow:hidden;text-overflow:ellipsis}
.oddbar{position:relative;background:var(--card2);border-radius:6px;height:20px;overflow:hidden}
.oddbar>span{position:absolute;left:0;top:0;bottom:0;background:var(--accent);opacity:.4}
.oddrow .ov{text-align:right;font-weight:800;color:var(--gold);font-variant-numeric:tabular-nums}
.chartbox{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:8px 6px 4px}
.chartbox svg{display:block;width:100%;height:auto}
.legend{display:flex;flex-wrap:wrap;gap:5px 12px;margin:8px 2px 0}
.legi{display:flex;align-items:center;gap:6px;font-size:12px}
.legsw{width:12px;height:3px;border-radius:2px;display:inline-block}
@media(max-width:560px){.hide-sm{display:none}body{font-size:14px}}
`;

const CLIENT = String.raw`
const KV = JSON.parse(document.getElementById('kv').textContent);
const T = KV.tournament, P = KV.predictions, R = KV.results;
const NAMES = Object.keys(P);
function teamName(c){ return (T.teamNames && T.teamNames[c]) || c; }
function pairTitle(h, a){ return teamName(h) + ' – ' + teamName(a); }
const ALLROWS = scoreAll(P, R, T);                 // globaali pistetilanne (ei suodatettu)
const savedUI = loadUI();
const state = { players: loadSel(),
  view: savedUI.view || 'predictions', filterOpen: !!savedUI.filterOpen,
  dayFilter: savedUI.dayFilter || 'all', predMode: savedUI.predMode || 'lohko',
  cmpA: savedUI.cmpA || null, cmpB: savedUI.cmpB || null, odds: null,
  scroll: savedUI.scroll || {} };

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

/* muiden valintojen + skrollikohdan pysyvyys (localStorage 'kv-ui') */
function loadUI(){ try{ return JSON.parse(localStorage.getItem('kv-ui')||'{}')||{}; }catch(e){ return {}; } }
function saveUI(){ try{ localStorage.setItem('kv-ui', JSON.stringify({ view:state.view, predMode:state.predMode,
  dayFilter:state.dayFilter, filterOpen:state.filterOpen, cmpA:state.cmpA, cmpB:state.cmpB, scroll:state.scroll })); }catch(e){} }
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
  var none=el('a',null,'Tyhjennä'); none.onclick=function(){ state.players.clear(); rerender(); };
  facts.appendChild(all); facts.appendChild(top4); facts.appendChild(none); row.appendChild(facts);
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
  var tdiv=el('div','teams',m.home+' – '+m.away); tdiv.title=pairTitle(m.home,m.away); left.appendChild(tdiv);
  left.appendChild(el('div','time', fiTime(m.kickoff) || m.timeLabel || ''));
  row.appendChild(left);
  // FIFA-linkki otteluparin ja tuloksen väliin (keskelle tyhjää kohtaa)
  if(m.url){ var a=document.createElement('a'); a.className='fifalink'; a.textContent='FIFA ↗';
    a.href=m.url; a.target='_blank'; a.rel='noopener noreferrer'; a.onclick=function(e){ e.stopPropagation(); }; row.appendChild(a); }
  else row.appendChild(el('span'));
  var res=(R.matches||{})[m.id];
  row.appendChild(el('div','res'+(res?'':' none'), res||'–'));
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
  var list=el('div'); box.appendChild(list);
  var df=state.dayFilter, now=new Date();
  var todayK=fiDayKey(now.toISOString()), tmrK=fiDayKey(new Date(Date.now()+86400000).toISOString());
  var ms;
  if(df==='today') ms=T.matches.filter(function(m){ return m.kickoff && fiDayKey(m.kickoff)===todayK; });
  else if(df==='tomorrow') ms=T.matches.filter(function(m){ return m.kickoff && fiDayKey(m.kickoff)===tmrK; });
  else if(df==='upcoming') ms=T.matches.filter(function(m){ return m.kickoff && new Date(m.kickoff) > now; });
  else ms=T.matches;
  if(!ms.length){ list.appendChild(el('div','hint',
    df==='today'?'Ei otteluita tänään.':df==='tomorrow'?'Ei otteluita huomenna.':df==='upcoming'?'Ei tulevia otteluita.':'Ei otteluita.')); return; }
  // Aina lohkoittain (A–L), lohkon sisällä aikajärjestyksessä.
  var by={}; ms.forEach(function(m){ (by[m.group]=by[m.group]||[]).push(m); });
  Object.keys(by).sort().forEach(function(g){
    list.appendChild(el('div','grp','LOHKO '+g));
    by[g].forEach(function(m){ list.appendChild(matchCell(m)); });
  });
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
    var ac=el('td','actual tcol'+(s.mono?' mono':''), s.actual==null?'–':s.actual); if(s.actualTitle) ac.title=s.actualTitle; tr.appendChild(ac);
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
    var resolved = actual.length>0;
    var actualSorted = actual.slice().sort();
    for(var i=0;i<slots;i++){
      (function(key, i){
        rows.push({ label:String(i+1), mono:true,
          actual: actualSorted[i] || (resolved?'':'–'),
          actualTitle: actualSorted[i] ? teamName(actualSorted[i]) : null,
          cellFor:function(n){
            var v=P[n].cup&&P[n].cup[key];
            var arr = key==='champion' ? (v?[v]:[]) : (v||[]);
            var pick=arr[i];
            if(!pick) return { txt:'', cls:'mono' };
            return { txt:pick, title:teamName(pick), cls:'mono '+(resolved?(actualSet[pick]?'c3':'c0'):'') };
          }
        });
      })(rd.key, i);
    }
  });
  var w=buildMatrix(players, null, rows); w.style.flex='1 1 auto'; w.style.minHeight='0';
  box.appendChild(w); freezeOffsets(w); trackScroll(w,'pred:cup');
  box.appendChild(el('div','hint','Kuten Excelissä: sarake = veikkaajan jatkoonpääsijät, Tulos = oikeat joukkueet. Vihreä = oikein, harmaa = väärin (kun ratkennut).'));
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
      var res=(R.matches||{})[m.id], has=!!res;
      rows.push({ label:m.home+'–'+m.away, mono:true, title:pairTitle(m.home,m.away), actual:res, cellFor:function(n){
        var pred=(P[n].matches||{})[m.id];
        return { txt:pred||'', cls:cellClass(matchPoints(pred,res,T.scoring.group), has) };
      }});
    });
  });
  var w1=buildMatrix(players, null, rows); w1.style.flex='1 1 auto'; w1.style.minHeight='0';
  box.appendChild(w1); freezeOffsets(w1); trackScroll(w1,'pred:lohko');
}
// Muut: sikajengi + maalintekijä yksinkertaisena listana (pelaaja → veikkaus)
function renderMuutInto(box, players){
  var wrap=el('div','mutwrap'), dirty=R.dirtiestTeams||[];
  wrap.appendChild(el('div','msub','Sikajengi'+(dirty.length?' · oikein: '+dirty.map(teamName).join(' / '):'')));
  players.forEach(function(n){
    var pred=P[n].sikajengi, row=el('div','mutrow');
    row.appendChild(el('span','nm',n));
    var pk=el('span','pk',pred||'–'); if(pred) pk.title=teamName(pred);
    if(dirty.length&&pred) pk.className='pk '+(dirty.indexOf(pred)>=0?'pos':'neg');
    row.appendChild(pk); wrap.appendChild(row);
  });
  wrap.appendChild(el('div','msub','Maalintekijä'));
  players.forEach(function(n){
    var pred=P[n].goalscorer, goals=(R.goals||{})[pred], row=el('div','mutrow');
    row.appendChild(el('span','nm',n));
    row.appendChild(el('span','pk', pred ? (pred+(goals!=null?' ('+goals+' maalia)':'')) : '–'));
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
function rscore(){ return Math.floor(Math.random()*4)+'-'+Math.floor(Math.random()*4); }
function rpick(a){ return a[Math.floor(Math.random()*a.length)]; }
function rsample(a,n){ var c=a.slice(); for(var i=c.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=c[i]; c[i]=c[j]; c[j]=t; } return c.slice(0,n); }
function cupPool(key){ var s={}; for(var n in P){ var v=P[n].cup&&P[n].cup[key]; if(Array.isArray(v)) v.forEach(function(t){ if(t)s[t]=1; }); else if(v) s[v]=1; } var a=Object.keys(s); return a.length?a:T.teams; }
function undecidedMatches(){ return T.matches.filter(function(m){ return !matchDecided(R,m.id); }); }
function undecidedCup(){ return T.cupRounds.filter(function(rd){ var a=R.rounds&&R.rounds[rd.key]; return rd.key==='champion'? !a : !(a&&a.length); }); }
function simulateOdds(N){
  var und=undecidedMatches(), sikaUnd=!(R.dirtiestTeams&&R.dirtiestTeams.length), cupUnd=undecidedCup();
  var pools={}; cupUnd.forEach(function(rd){ pools[rd.key]=cupPool(rd.key); });
  var wins={}; for(var n in P) wins[n]=0;
  for(var s=0;s<N;s++){
    var res={ matches:Object.assign({},R.matches), dirtiestTeams:R.dirtiestTeams, rounds:Object.assign({},R.rounds), goals:R.goals };
    und.forEach(function(m){ res.matches[m.id]=rscore(); });
    if(sikaUnd) res.dirtiestTeams=[rpick(T.teams)];
    cupUnd.forEach(function(rd){ res.rounds[rd.key]= rd.key==='champion'? rpick(pools[rd.key]) : rsample(pools[rd.key], rd.slots); });
    var rows=scoreAll(P,res,T), top=rows[0].total, w=rows.filter(function(r){ return r.total===top; });
    w.forEach(function(x){ wins[x.name]+=1/w.length; });
  }
  return Object.keys(P).map(function(n){ return { name:n, odds:wins[n]/N }; }).sort(function(a,b){ return b.odds-a.odds; });
}
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
  var W=340,H=190,padL=6,padR=6,padT=10,padB=10,xN=events.length;
  function X(i){ return (padL+(xN?i/xN:0)*(W-padL-padR)).toFixed(1); }
  function Y(v){ return (H-padB-(v/maxY)*(H-padT-padB)).toFixed(1); }
  var pal=['#3ea6ff','#ffd24a','#46c46b','#e2706e','#b98cff','#46c9c0','#ff9d4a','#e36fb0','#7ec8ff','#caa84a','#8ad28f','#ff8f8f'];
  var svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto">';
  svg+='<line x1="'+padL+'" y1="'+(H-padB)+'" x2="'+(W-padR)+'" y2="'+(H-padB)+'" stroke="#2a2f3a"/>';
  if(allSel){ names.forEach(function(n){ var pts=series[n].map(function(v,i){ return X(i)+','+Y(v); }).join(' ');
    svg+='<polyline points="'+pts+'" fill="none" stroke="#39414f" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0.5"/>'; }); }
  top.forEach(function(n,idx){
    var pts=series[n].map(function(v,i){ return X(i)+','+Y(v); }).join(' ');
    svg+='<polyline points="'+pts+'" fill="none" stroke="'+pal[idx%pal.length]+'" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>';
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
function renderAnalytics(){
  var box=$('#analytics'); box.innerHTML='';
  var und=undecidedMatches(), cupUnd=undecidedCup(), sikaUnd=!(R.dirtiestTeams&&R.dirtiestTeams.length);
  box.appendChild(el('div','hint', (T.matches.length-und.length)+'/'+T.matches.length+' ottelua pelattu · '+
    (cupUnd.length?'cup-vaihe kesken':'cup ratkennut')+(sikaUnd?' · sikajengi auki':'')));
  box.appendChild(renderTimeChart());

  // 1) Max-pisteet / kuka voi vielä voittaa
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

  // 2) Pelaajavertailu
  var names=ALLROWS.map(function(r){ return r.name; });
  if(state.cmpA==null){ state.cmpA=names[0]; state.cmpB=names[1]||names[0]; }
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

  // 3) Voittotodennäköisyys (Monte Carlo)
  var s3=el('div','asec'); s3.appendChild(el('h3',null,'Voittotodennäköisyys'));
  if(state.odds==null) state.odds=simulateOdds(1000);
  var top=state.odds.length?state.odds[0].odds:0;
  var shown=state.odds.filter(function(o){ return o.odds>0; });
  if(!shown.length){ s3.appendChild(el('div','hint','Ei ratkaisemattomia kohteita – tilanne on jo lukittu.')); }
  shown.slice(0,12).forEach(function(o){
    var row=el('div','oddrow'); row.appendChild(el('div','name',o.name));
    var bar=el('div','oddbar'), fill=el('span'); fill.style.width=(top?Math.round(o.odds/top*100):0)+'%'; bar.appendChild(fill); row.appendChild(bar);
    row.appendChild(el('div','ov',(o.odds*100).toFixed(o.odds<0.095?1:0)+'%'));
    s3.appendChild(row);
  });
  s3.appendChild(el('div','hint','1000 simulaatiota: ratkaisemattomat ottelut, sikajengi ja cup-polut arvottu satunnaisesti.'));
  box.appendChild(s3);
  trackScroll($('#view-analytics'),'analytics');
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
renderSchedule();
show(state.view);
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
