/* ========================================================================
   Apostar con criterio · web v5
   Datos: API de Apps Script (actualizada sola). Si falla, usa la última copia
   guardada en este dispositivo y lo avisa. Nunca muestra datos de ejemplo.
   ======================================================================== */
const API="/*API*/";
const VALID=/*VALID*/null;
const APP_VERSION="5.7";
const BOOK_NAMES={B365:"Bet365",BFD:"Betfred",BV:"BetVictor",BW:"Bwin",PP:"Paddy Power",SKB:"Sky Bet",PS:"Pinnacle",BFE:"Betfair Exchange",Max:"Mejor cuota (casa no identificada)",PIN:"Pinnacle · actualizada",BFX:"Betfair Exchange · actualizada",B3A:"Bet365 Argentina",Avg:"Promedio de casas"};
const REAL=["B365","BFD","BV","BW","PP","SKB","PS"];

/* ---------- utilidades ---------- */
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pc=(x,d)=>x==null||!isFinite(x)?"–":(x*100).toFixed(d===undefined?0:d).replace(".",",")+"%";
const od=x=>x==null||!isFinite(x)?"–":x.toFixed(2).replace(".",",");
const n1=x=>x==null?"–":String(Math.round(x*10)/10).replace(".",",");
const money=x=>(x<0?"−$":"$")+Math.round(Math.abs(x)).toLocaleString("es-AR");
const sg=(x,d)=>x==null||!isFinite(x)?"–":(x>=0?"+":"−")+(Math.abs(x)*100).toFixed(d===undefined?1:d).replace(".",",")+"%";
function pnum(v,isMoney){let s=String(v==null?"":v).trim().replace(/\s|\$|%/g,"");if(!s)return NaN;if(isMoney||/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,"");return Number(s.replace(",","."))}
const ib=k=>`<button class="i" data-g="${k}" aria-label="Qué significa: ${esc((GL[k]||[k])[0])}">i</button>`;
const KO=`<span class="k obs">dato</span>`, KE=`<span class="k est">estimación</span>`, KX=`<span class="k exp">experimental</span>`;
const DIAS=["dom","lun","mar","mié","jue","vie","sáb"];
function ar(ms){return new Date(ms-108e5)} // hora argentina (UTC−3, sin horario de verano)
function fmtDT(ms){const d=ar(ms);return`${DIAS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} h`}
function fmtHM(ms){const d=ar(ms);return`${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`}
function dayKey(ms){return Math.floor((ms-108e5)/864e5)}
function dayLabel(ms){const k=dayKey(ms),t=dayKey(Date.now()),d=ar(ms);const base=`${DIAS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth()+1}`;return k===t?"Hoy · "+base:k===t+1?"Mañana · "+base:base}
function ago(ms){const h=(Date.now()-ms)/36e5;if(!isFinite(h))return"hora desconocida";if(h<1)return"hace menos de 1 h";if(h<48)return`hace ${Math.round(h)} h`;return`hace ${Math.round(h/24)} días`}

/* ---------- explicaciones (toque o teclado) ---------- */
function sheet(k){const g=GL[k];if(!g)return;$("shT").textContent=g[0];$("shB").innerHTML=`<p>${esc(g[1])}</p>${g[3]?`<p class="ex"><b>Ejemplo:</b> ${esc(g[3])}</p>`:""}${g[2]?`<details><summary>Ver explicación avanzada</summary><p>${esc(g[2])}</p></details>`:""}`;$("sheet").classList.add("on");$("shX").focus()}
$("shX").onclick=()=>$("sheet").classList.remove("on");
$("sheet").onclick=e=>{if(e.target.id==="sheet")$("sheet").classList.remove("on")};
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("sheet").classList.remove("on")});
document.addEventListener("click",e=>{const b=e.target.closest("[data-g]");if(b){e.preventDefault();e.stopPropagation();sheet(b.dataset.g)}},true);

/* ---------- ajustes ---------- */
const CFG_DEF={fresh:12,stale:48,vmin:2,vmax:25,omax:8,live:2,casas:"ar"};
const _cs=store.get("acc_cfg",{});if(_cs.named&&!_cs.casas)_cs.casas="id";delete _cs.named;
let CFG=Object.assign({},CFG_DEF,_cs);
const saveCFG=()=>store.set("acc_cfg",CFG);

/* ---------- fórmulas (las mismas del servidor) ---------- */
function powerFair(o){const r=o.map(x=>1/x);let lo=1,hi=4;for(let i=0;i<60;i++){const e=(lo+hi)/2,s=r.reduce((a,x)=>a+Math.pow(x,e),0);if(s>1)lo=e;else hi=e}const e=(lo+hi)/2,p=r.map(x=>Math.pow(x,e)),s=p.reduce((a,b)=>a+b,0);return p.map(x=>x/s)}
const lamFromOver=p=>6.0675*p*p*p-6.6*p*p+6.0653*p+0.5286;
const share=(pH,pA)=>Math.min(.85,Math.max(.15,.494+.402*(pH-pA)));
function pois(k,l){let r=Math.exp(-l);for(let i=1;i<=k;i++)r*=l/i;return r}
function grid(lh,la,rho){const g=[];let s=0;for(let i=0;i<=10;i++){g[i]=[];for(let j=0;j<=10;j++){let t=1;if(rho){if(i==0&&j==0)t=1-lh*la*rho;else if(i==0&&j==1)t=1+lh*rho;else if(i==1&&j==0)t=1+la*rho;else if(i==1&&j==1)t=1-rho}const v=Math.max(0,pois(i,lh)*pois(j,la)*t);g[i][j]=v;s+=v}}for(let i=0;i<=10;i++)for(let j=0;j<=10;j++)g[i][j]/=s;return g}
const implied=o=>o.reduce((s,x)=>s+1/x,0);
// Liquidación de hándicap asiático para el lado elegido: devuelve probabilidades de cada desenlace y el valor esperado.
function ahSettle(G,line,side,odd){const halves=Math.abs(line*4)%2===1?[line-.25,line+.25]:[line];let ev=0;const out={win:0,halfwin:0,push:0,halfloss:0,loss:0};
 for(let i=0;i<=10;i++)for(let j=0;j<=10;j++){const q=G[i][j];const d=side==="h"?i-j:j-i;let ret=0;halves.forEach(L=>{const x=d+L;ret+=(x>0?odd:x===0?1:0)/halves.length});ev+=q*(ret-1);
  const r=ret-1;if(Math.abs(r-(odd-1))<1e-9)out.win+=q;else if(r>1e-9)out.halfwin+=q;else if(Math.abs(r)<1e-9)out.push+=q;else if(Math.abs(r+1)<1e-9)out.loss+=q;else out.halfloss+=q}
 return{ev,out}}

/* ---------- datos ---------- */
let P=null, SRC="none", LOAD_ERR=null, ROWS=[], BYKEY={};
function srcOf(m){return m.lg.indexOf(":")>=0?"newFixtures":"fixtures"}
function fileAt(m){const s=P&&P.sources&&P.sources[srcOf(m)];return s&&s.at?Date.parse(s.at):NaN}
function oaAt(m){return m.oa&&m.oa.at?Date.parse(m.oa.at):NaN}
function capturedAt(m){const a=fileAt(m),b=oaAt(m),c=m.b3a?Date.parse(m.b3a.at):NaN;return Math.max(...[a,b,c].filter(isFinite))}
function fairAtOf(m){return m.fair&&/The Odds API/.test(m.fair.ref)?oaAt(m):fileAt(m)}
function freshOf(ms){const h=(Date.now()-ms)/36e5;if(!isFinite(h))return"exp";return h<=CFG.fresh?"ok":h<=CFG.stale?"old":"exp"}
function mstatus(ts){const n=Date.now();return ts>n?"prox":ts>n-CFG.live*36e5?"juego":"fin"}
// Cuotas que se pueden usar según "Casas" en Ajustes: Argentina (solo Bet365), casas con nombre, o todas. Cada una con su hora.
function priceList(m,i,inclExp){const L=[],fa=fileAt(m),oa=oaAt(m),mode=CFG.casas||"ar",fdb=mode==="ar"?["B365"]:mode==="id"?REAL:REAL.concat(["Max"]);
 fdb.forEach(b=>{const o=m.odds.x12[b];if(o)L.push({odd:o[i],book:b,at:fa})});
 if(m.odds.x12.B3A&&m.b3a)L.push({odd:m.odds.x12.B3A[i],book:"B3A",at:Date.parse(m.b3a.at)});
 if(mode!=="ar"&&m.oa&&m.oa.best&&m.oa.best[i])L.push({odd:m.oa.best[i][0],book:"OA",name:m.oa.best[i][1],at:oa});
 return inclExp?L:L.filter(x=>freshOf(x.at)!=="exp")}
function bestFor(m,i,inclExp){const L=priceList(m,i,inclExp);if(!L.length)return null;L.sort((a,b)=>b.odd-a.odd||b.at-a.at);return L[0]}
const bookLabel=b=>b.book==="OA"?b.name+" · Europa":b.book==="Max"?"no ident.":(BOOK_NAMES[b.book]||b.book);
// Incertidumbre: la probabilidad justa cambia según qué referencia se use (Betfair, Pinnacle, promedio) y cómo se quite el margen.
function fairSet(m){const out=[];["PIN","BFX","BFE","PS","Avg"].forEach(b=>{const o=m.odds.x12[b];if(!o)return;const s=implied(o);if(s<.97||s>1.12)return;out.push({ref:b,met:"potencia",p:powerFair(o)});out.push({ref:b,met:"proporcional",p:o.map(x=>1/x/s)})});return out}
function signalsOf(m){if(!m.fair)return[];const ff=freshOf(fairAtOf(m));if(ff==="exp")return[];const out=[],fs=fairSet(m);[0,1,2].forEach(i=>{const b=bestFor(m,i);if(!b)return;const ev=b.odd*m.fair.p[i]-1;if(ev>CFG.vmin/100&&ev<=CFG.vmax/100&&b.odd<=CFG.omax){const evs=fs.length?fs.map(f=>b.odd*f.p[i]-1):[ev];out.push({sel:i,odd:b.odd,book:b.book,bname:bookLabel(b),at:b.at,fr:ff==="ok"&&freshOf(b.at)==="ok"?"ok":"old",p:m.fair.p[i],ev,lo:Math.min(ev,...evs),hi:Math.max(ev,...evs),nref:new Set(fs.map(f=>f.ref)).size})}});return out.sort((a,b)=>b.ev-a.ev)}
function derive(){
 ROWS=(P&&P.matches||[]).map(m=>{const ts=Date.parse(m.kickoff),st=mstatus(ts),fr=freshOf(capturedAt(m)),sig=signalsOf(m),cap=sig.length?sig[0].at:capturedAt(m);
  return{m,ts,cap,st,fr,sig,state:sig.length&&st==="prox"?(sig.some(x=>x.fr==="ok")?"live":"old"):"none"}});
 BYKEY={};ROWS.forEach(r=>BYKEY[r.m.key]=r);
 if(typeof deriveOther==='function')deriveOther();
}
async function fetchJSON(url,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms||20000);try{const r=await fetch(url,{credentials:"omit",signal:c.signal});if(!r.ok)throw new Error("HTTP "+r.status);const j=await r.json();if(j&&j.error)throw new Error(j.error);return j}finally{clearTimeout(t)}}
async function loadData(force){
 // Primera visita: la web llega con los datos adentro (una sola descarga).
 if(!force&&window.__BOOT&&window.__BOOT.matches&&!P){P=window.__BOOT;SRC="api";store.set("acc_payload",{p:P,at:Date.now()});window.__BOOT=null;derive();render();return}
 const cached=store.get("acc_payload",null);
 if(cached&&!P){P=cached.p;SRC="cache";derive();render()}
 try{const j=await fetchJSON(API+"?api=data");if(!j.matches)throw new Error("respuesta sin partidos");P=j;SRC="api";LOAD_ERR=null;store.set("acc_payload",{p:j,at:Date.now()});}
 catch(e){LOAD_ERR=String(e.message||e);if(!P)SRC="none"}
 derive();render();
}

/* ---------- enrutador ---------- */
let ROUTE={v:"partidos"};
function go(h){if(location.hash!==h)location.hash=h;else route()}
function route(){
 const h=decodeURIComponent(location.hash.replace(/^#\/?/,"")).split("/");
 const v=h[0]||"partidos";ROUTE={v,a:h[1],b:h[2]};
 const map={p:"ficha",o:"ficha"};const view=map[v]||v;
 document.querySelectorAll(".view").forEach(s=>s.classList.toggle("on",s.id==="v-"+view));
 const tab={partidos:"partidos",p:"partidos",o:"partidos",oportunidades:"oportunidades",herramientas:"mas",registro:"mas",mas:"mas"}[v]||"partidos";
 document.querySelectorAll("nav.bottom button").forEach(b=>b.classList.toggle("on",b.dataset.go===tab));
 render();window.scrollTo(0,0);
}
window.addEventListener("hashchange",route);
document.querySelectorAll("nav.bottom button").forEach(b=>b.onclick=()=>{if(b.dataset.go==="herramientas"){$("toolView").hidden=true;$("toolHome").hidden=false}go("#/"+b.dataset.go)});
function showView(v,keep){if(v==="herramientas"){if(ROUTE.v!=="herramientas")location.hash="#/herramientas";if(!keep){$("toolView").hidden=true;$("toolHome").hidden=false}}else go("#/"+v)}
function render(){const v=ROUTE.v;if(v==="partidos")renderList();else if(v==="p")renderFicha(ROUTE.a,ROUTE.b||"resumen");else if(v==="o")renderOFicha(ROUTE.a);else if(v==="oportunidades")renderOpp();else if(v==="registro")renderRegistro();else if(v==="mas")renderMas(ROUTE.a)}

/* ---------- barra de estado ---------- */
function globalFresh(){if(!P)return"load";const t=P.sources&&P.sources.fixtures&&P.sources.fixtures.at?Date.parse(P.sources.fixtures.at):NaN;return freshOf(t)}
// Frescura de los partidos que vienen: cuenta tanto football-data como The Odds API, partido por partido.
function upcomingFresh(){const up=ROWS.filter(r=>r.st==="prox");if(!up.length)return null;const ok=up.filter(r=>r.fr==="ok").length;return{n:up.length,ok,f:ok===up.length?"ok":ok?"old":up.some(r=>r.fr==="old")?"old":"exp"}}
function stripHTML(){
 if(!P&&!LOAD_ERR)return["load","Cargando datos…"];
 if(!P)return["err","No se pudieron cargar los datos. Tocá para ver el detalle."];
 const f=globalFresh(),t=Date.parse(P.sources.fixtures&&P.sources.fixtures.at),next=ROWS.filter(r=>r.st==="prox").length;
 const lab={ok:"Cuotas recientes",old:"Cuotas viejas",exp:"Cuotas vencidas"}[f];
 const u=upcomingFresh(),oaT=P.oa&&P.oa.lastAt?Date.parse(P.oa.lastAt):NaN;
 if(u&&P.oa&&P.oa.matched){const L2=u.ok===u.n?"Cuotas recientes":u.ok?"Cuotas recientes en parte":u.f==="old"?"Cuotas viejas":"Cuotas vencidas";return[u.f,`<b>${L2}</b> · ${u.ok} de ${u.n} al día · ${ago(Math.max(t||0,oaT||0))}${SRC==="cache"?" · copia guardada":""}`]}
 return[f,`<b>${lab}</b> · publicadas ${ago(t)} · ${next} próximos${SRC==="cache"?" · copia guardada":""}`];
}
function renderStrip(){const[s,t]=stripHTML();$("strip").querySelector(".dot").className="dot "+s;$("stripTxt").innerHTML=t}
$("strip").onclick=()=>go("#/mas/estado");

/* ---------- bloque "Comparar cuotas": justa, Bet365 y tu casa (se escribe ahí mismo) ---------- */
const CASAS_TU=["Betano","Codere","BetWarrior","Bplay","Bet365","Otra"];
function cmpBlock(key,labels,p,b3,b3At){const my=(store.get("acc_cmp",{})[key])||{},casa=my.casa||store.get("acc_casa","Betano");
 return`<div class="panel"><h4>Comparar cuotas ${ib("valor")}</h4><div class="tw"><table class="cmp"><tr><th></th><th>Justa</th><th>Bet365</th><th>Tu casa</th></tr>${labels.map((x,i)=>{const fair=p?1/p[i]:null,b=b3?b3[i]:null,vb=b&&p?b*p[i]-1:null,desde=p?(1+CFG.vmin/100)/p[i]:null;return`<tr><td style="text-align:left">${esc(x)}</td><td><b>${fair?od(fair):"–"}</b><small>${p?pc(p[i]):""}</small></td><td class="${vb!=null&&vb>CFG.vmin/100?"pos":""}">${b?od(b):"–"}${vb!=null?`<small>${sg(vb)}</small>`:""}</td><td><input data-ci="${i}" inputmode="decimal" placeholder="${desde?"+"+od(desde):"cuota"}" value="${my.o&&my.o[i]?String(my.o[i]).replace(".",","):""}" aria-label="Cuota de tu casa para ${esc(x)}"><span class="vd" id="vd${i}"></span></td></tr>`}).join("")}</table></div>
 <label class="meta" style="display:flex;gap:8px;align-items:center;margin-top:6px">Tu casa: <select id="cmpCasa" style="padding:6px;border-radius:8px;border:1.5px solid var(--li);background:var(--bg);color:var(--tx);font-size:15px">${CASAS_TU.map(c=>`<option${c===casa?" selected":""}>${c}</option>`).join("")}</select></label>
 <p class="meta">Escribí la cuota que ves en tu casa y te dice al toque si conviene. El número gris en el casillero es la cuota mínima que conviene. Queda guardado solo en este teléfono.${b3At?` Bet365 Argentina: ${fmtHM(Date.parse(b3At))} h.`:""}</p></div>`}
function bindCmp(key,p){const ins=[...document.querySelectorAll(".cmp [data-ci]")];if(!ins.length)return;
 const save=()=>{const all=store.get("acc_cmp",{});all[key]={casa:$("cmpCasa").value,o:ins.map(x=>pnum(x.value)||null),at:Date.now()};store.set("acc_cmp",all);store.set("acc_casa",$("cmpCasa").value)};
 const show=x=>{const i=+x.dataset.ci,o=pnum(x.value),el=$("vd"+i);if(!(o>1)||!p){el.textContent="";el.className="vd";return}const v=o*p[i]-1;el.textContent=(v>CFG.vmin/100?"✓ conviene ":"✗ no conviene ")+sg(v);el.className="vd "+(v>CFG.vmin/100?"si":"no")};
 ins.forEach(x=>{show(x);x.oninput=()=>{show(x);save()}});$("cmpCasa").onchange=save}
/* ---------- cuotas en la lista: Justa · Bet365 · Mejor ---------- */
let OM=store.get("acc_om","justa");if(!["justa","b365","mejor"].includes(OM))OM="justa";
function b365Of(m,i){const L=[];if(m.odds.x12.B3A&&m.b3a)L.push(m.odds.x12.B3A[i]);if(m.odds.x12.B365)L.push(m.odds.x12.B365[i]);return L.length?Math.max(...L):null}
function oddsCells(odds,p){return`<span class="oc">${odds.map((o,i)=>{const v=o&&p?o*p[i]-1:null;return`<span class="${v!=null&&v>CFG.vmin/100&&OM!=="justa"?"vg":""}"><b>${o?od(o):"–"}</b><small>${p?pc(p[i]):""}</small></span>`}).join("")}</span>`}
function rowOddsF(m){const p=m.fair?m.fair.p:null;let o;if(OM==="justa")o=p?p.map(x=>1/x):[null,null,null];else if(OM==="b365")o=[0,1,2].map(i=>b365Of(m,i));else o=[0,1,2].map(i=>{const L=[];const a=b365Of(m,i);if(a)L.push(a);const b=bestFor(m,i);if(b)L.push(b.odd);if(m.oa&&m.oa.best&&m.oa.best[i])L.push(m.oa.best[i][0]);return L.length?Math.max(...L):null});return oddsCells(o,p)}
function rowOddsO(e){const p=e.fair?e.fair.p:null;let o;if(OM==="justa")o=p?p.map(x=>1/x):(e.b365||[null,null]);else if(OM==="b365")o=e.b365||[null,null];else o=[0,1].map(i=>{const L=[];if(e.b365)L.push(e.b365[i]);if(e.best&&e.best[i])L.push(e.best[i][0]);return L.length?Math.max(...L):null});return oddsCells(o,p)}
const dot=fr=>`<i class="fd ${fr==="ok"?"ok":fr==="old"?"old":"exp"}" title="${fr==="ok"?"Cuota reciente":fr==="old"?"Cuota de más de 12 h":"Cuota vieja"}"></i>`;
let COLL=new Set();
/* ---------- lista de partidos ---------- */
let F={chip:"all",q:"",sort:"time",day:"hoy"};
const CHIPS=[["all","Todos"],["hoy","Hoy"],["man","Mañana"],["sig","Con señal"],["arg","Argentina"],["eur","Europa"],["otr","Resto del mundo"]];
function renderChips(){$("chips").innerHTML=CHIPS.map(([k,l])=>`<button class="chip${F.chip===k?" on":""}" data-c="${k}" aria-pressed="${F.chip===k}">${l}</button>`).join("")}
$("chips").onclick=e=>{const b=e.target.closest("[data-c]");if(!b)return;F.chip=b.dataset.c;renderList()};
$("q").oninput=e=>{F.q=e.target.value.trim().toLowerCase();renderList()};
if($("q2"))$("q2").oninput=e=>{F.q=e.target.value.trim().toLowerCase();$("q").value=e.target.value;renderList()};
$("sort").onchange=e=>{F.sort=e.target.value;renderList()};
$("days").onclick=e=>{const b=e.target.closest("[data-d]");if(!b)return;F.day=b.dataset.d;renderList()};
$("filtBtn").onclick=()=>{const p=$("filtPanel"),o=p.hidden;p.hidden=!o;$("filtBtn").setAttribute("aria-expanded",String(o))};
function filtered(rows){const t=dayKey(Date.now());let r=rows;
 if(F.chip==="hoy")r=r.filter(x=>dayKey(x.ts)===t);else if(F.chip==="man")r=r.filter(x=>dayKey(x.ts)===t+1);else if(F.chip==="sig")r=r.filter(x=>x.state!=="none");else if(["arg","eur","otr"].includes(F.chip))r=r.filter(x=>x.m.region===F.chip);
 if(F.q)r=r.filter(x=>(x.m.home+" "+x.m.away+" "+x.m.league).toLowerCase().includes(F.q));
 if(F.sort==="ev")r=r.slice().sort((a,b)=>(b.sig[0]?b.sig[0].ev:-1)-(a.sig[0]?a.sig[0].ev:-1));
 else if(F.sort==="fav")r=r.slice().sort((a,b)=>Math.max(...(b.m.fair?b.m.fair.p:[0]))-Math.max(...(a.m.fair?a.m.fair.p:[0])));
 return r}
function badge(r){if(r.state==="live")return`<span class="badge y">Señal</span>`;if(r.state==="old")return`<span class="badge o">Señal vieja</span>`;if(r.st==="juego")return`<span class="badge n">En juego</span>`;if(r.st==="fin")return`<span class="badge n">Jugado</span>`;return""}
function mrow(r){const m=r.m,p=m.fair?m.fair.p:null;
 return`<button class="mrow" data-key="${esc(m.key)}"><span class="tm">${fmtHM(r.ts)}<small>${esc(m.country)}</small></span><span class="tt"><b>${esc(m.home)}</b><b>${esc(m.away)}</b><span class="lg">${esc(m.league)}</span>${p?`<span class="mini" aria-label="Local ${pc(p[0])}, empate ${pc(p[1])}, visitante ${pc(p[2])}"><span class="h" style="width:${p[0]*100}%"></span><span class="d" style="width:${p[1]*100}%"></span><span class="a" style="width:${p[2]*100}%"></span></span>`:""}</span><span>${badge(r)}</span></button>`}
function m1(r){const m=r.m;return`<button class="m1 mrow" data-key="${esc(m.key)}"><span class="t">${fmtHM(r.ts)}${dot(r.fr)}</span><span class="n"><span>${esc(m.home)}</span><span>${esc(m.away)}</span>${r.state!=="none"||r.st!=="prox"?badge(r):""}</span>${rowOddsF(m)}</button>`}
// Agrupa por liga: Argentina primero, después por horario del primer partido.
function byLeague(rows){const g=new Map();rows.forEach(r=>{const k=r.m.league;if(!g.has(k))g.set(k,[]);g.get(k).push(r)});
 return[...g.entries()].sort((a,b)=>(b[1][0].m.region==="arg")-(a[1][0].m.region==="arg")||a[1][0].ts-b[1][0].ts).map(([lg,rs])=>lgHead(lg,rs.length)+(COLL.has(lg)?"":rs.map(m1).join(""))).join("")}
function lgHead(lg,n){return`<button class="lgh" data-lg="${esc(lg)}" aria-expanded="${!COLL.has(lg)}"><span>${COLL.has(lg)?"▸":"▾"} ${esc(lg)}</span><small>${n}</small></button>`}
function oddsHead(n){const L=n===3?["1","X","2"]:["1","2"];return`<div class="ohead"><div class="omode" role="group" aria-label="Qué cuota mostrar">${[["justa","Justa"],["b365","Bet365"],["mejor","Mejor"]].map(([k,l])=>`<button data-om="${k}" class="${OM===k?"on":""}" aria-pressed="${OM===k}">${l}</button>`).join("")}</div><span class="oc ol">${L.map(x=>`<span>${x}</span>`).join("")}</span></div>`}
// La respuesta de arriba: qué mirar hoy, en una frase.
function answerHTML(){if(!P)return"";const up=ROWS.filter(r=>r.st==="prox"),live=[],old=[];up.forEach(r=>{if(r.state==="live")r.sig.forEach(s=>live.push([r,s]));else if(r.state==="old")r.sig.forEach(s=>old.push([r,s]))});
 const casa=CFG.casas==="ar"?"Bet365 (opera en Argentina)":"casas con nombre";
 if(live.length){live.sort((a,b)=>b[1].ev-a[1].ev);return`<div class="ans y"><h3>Para mirar: ${live.length} ${live.length===1?"señal":"señales"}</h3><p>Cuotas de ${casa} que pagan más de lo que dice el mercado. No es una garantía.</p>${live.slice(0,3).map(([r,s])=>`<button class="it" data-key="${esc(r.m.key)}"><span><b>${esc(SEL(r.m)[s.sel])}</b><small>${esc(r.m.home)} vs ${esc(r.m.away)} · ${fmtHM(r.ts)}</small></span><span class="v">${od(s.odd)} · ${sg(s.ev)}</span></button>`).join("")}${live.length>3?`<button class="lk" onclick="go('#/oportunidades')">Ver las ${live.length} señales ›</button>`:""}</div>`}
 if(old.length)return`<div class="ans"><h3>Hay ${old.length} ${old.length===1?"señal":"señales"} con cuotas viejas</h3><p>Pueden haber cambiado: revisalas en tu casa antes de decidir.</p><button class="lk" onclick="go('#/oportunidades')">Ver señales ›</button></div>`;
 return`<div class="ans"><h3>Hoy no hay oportunidades claras</h3><p>Revisamos ${up.length} partidos próximos con cuotas de ${casa}. No apostar también es una decisión: las cuotas se actualizan solas varias veces por día.</p></div>`}
function renderList(){
 renderStrip();renderSports();if(SPORT!=="futbol"){renderOther();return}$("filtBtn").hidden=false;renderChips();
 const al=[];
 if(LOAD_ERR&&P)al.push(`<div class="alert red"><b>No se pudo actualizar.</b> Se muestra la última copia guardada en este dispositivo. <button class="btn sm lt" id="retry">Reintentar</button></div>`);
 if(LOAD_ERR&&!P)al.push(`<div class="alert red"><b>No se pudieron cargar los datos</b> (${esc(LOAD_ERR)}). Revisá la conexión y tocá Reintentar. <button class="btn sm lt" id="retry">Reintentar</button></div>`);
 if(P){if(!ROWS.some(r=>r.st==="prox"))al.push(`<div class="alert red"><b>No hay partidos próximos en los datos.</b> Se van a cargar solos cuando la fuente publique los nuevos.</div>`)}
 // Todo el bloque se dibuja de una vez para que la pantalla no "salte" cuando llegan los datos.
 let count="",list="",past="";
 if(!P){list=LOAD_ERR?"":'<div class="skel"></div>'.repeat(6)}
 else{const act=filtered(ROWS.filter(r=>r.st!=="fin")),pa=filtered(ROWS.filter(r=>r.st==="fin"));
  const t0=dayKey(Date.now()),inDay=F.day==="ahora"?act.filter(r=>r.ts<Date.now()+3*36e5):F.day==="hoy"?act.filter(r=>dayKey(r.ts)<=t0):F.day==="man"?act.filter(r=>dayKey(r.ts)===t0+1):act;
  const nl=inDay.filter(r=>r.state==="live").length;
  count=inDay.length?`${inDay.length} partidos${nl?` · ${nl} con señal`:""}`:"";
  const filtOn=F.chip!=="all"||F.sort!=="time";$("filtBtn").classList.toggle("act",!!filtOn);$("filtBtn").textContent=filtOn?"Filtrar ·":"Filtrar";
  if(!inDay.length)list=`<div class="empty">${filtOn&&act.length?'No hay partidos con ese filtro. <button class="lk" id="clrF">Quitar filtros</button>':F.day==="hoy"&&act.length?F.day==="ahora"?'No hay partidos en las próximas 3 horas. <button class="lk" data-d="hoy">Ver hoy ›</button>':'Hoy no quedan partidos. <button class="lk" data-d="man">Ver mañana ›</button>':F.day==="man"&&act.length?'Mañana no hay partidos cargados. <button class="lk" data-d="todo">Ver más días ›</button>':"No hay partidos próximos."}</div>`;
  else if(F.sort!=="time")list=inDay.map(m1).join("");
  else if(F.day==="todo"){const d=new Map();inDay.forEach(r=>{const k=dayKey(r.ts);if(!d.has(k))d.set(k,[]);d.get(k).push(r)});list=[...d.values()].map(rs=>`<div class="day">${dayLabel(rs[0].ts)}</div>`+byLeague(rs)).join("")}
  else list=byLeague(inDay);
  past=F.day==="todo"&&pa.length?`<details><summary>Ya jugados (${pa.length})</summary><p class="meta">Empezaron hace más de ${CFG.live} h. Sin resultado cargado todavía.</p>${pa.map(m1).join("")}</details>`:""}
 $("answer").innerHTML=answerHTML();document.querySelectorAll("#days [data-d]").forEach(b=>{b.classList.toggle("on",b.dataset.d===F.day);b.setAttribute("aria-pressed",String(b.dataset.d===F.day))});
 const reg=$("region");reg.className=P||LOAD_ERR?"":"loading";
 reg.innerHTML=`<div id="topAlert">${al.join("")}</div><div class="count" id="count">${count}</div>${P?oddsHead(3):""}<div id="list">${list}</div><div id="pastBox">${past}</div>`;
 const rb=$("retry");if(rb)rb.onclick=()=>{LOAD_ERR=null;renderList();loadData(true)};
}
document.addEventListener("click",e=>{const b=e.target.closest(".mrow[data-key],.ans .it[data-key]");if(b){go("#/p/"+encodeURIComponent(b.dataset.key));return}const d=e.target.closest("#list [data-d]");if(d){F.day=d.dataset.d;renderList();return}if(e.target.closest("#clrF")){F.chip="all";F.q="";F.sort="time";$("q").value="";$("sort").value="time";renderList()}});

/* ---------- otros deportes: tenis, NBA y NFL (solo mercado) ---------- */
const SPORTS=[["futbol","Fútbol"],["tenis","Tenis"],["nba","NBA"],["nfl","NFL"],["mlb","Béisbol"]];
let SPORT=store.get("acc_sport","futbol");if(!SPORTS.some(x=>x[0]===SPORT))SPORT="futbol";
let OROWS=[],OBYKEY={};
function deriveOther(){const ev=(P&&P.other&&P.other.events)||[];
 OROWS=ev.map(e=>{const ts=Date.parse(e.kickoff),st=mstatus(ts),at=e.fair?Date.parse(e.at):Date.parse(e.b365At),fr=freshOf(at),sig=otherSig(e,fr);return{e,ts,st,fr,sig,state:sig.length&&st==="prox"?"live":"none"}});
 OBYKEY={};OROWS.forEach(r=>OBYKEY[r.e.key]=r)}
// Señales de otros deportes: solo con casas europeas con nombre (modo "id" o "all"). Bet365 no está en esta fuente.
function otherSig(e,fr){if(!e.fair||fr!=="ok")return[];const ar=(CFG.casas||"ar")==="ar",b3=e.b365&&freshOf(Date.parse(e.b365At))==="ok",out=[];[0,1].forEach(i=>{const c=[];if(b3)c.push([e.b365[i],"Bet365 Argentina"]);if(!ar&&e.best&&e.best[i])c.push([e.best[i][0],e.best[i][1]+" · Europa"]);if(!c.length)return;c.sort((a,b)=>b[0]-a[0]);const b=c[0],ev=b[0]*e.fair.p[i]-1;if(ev>CFG.vmin/100&&ev<=CFG.vmax/100&&b[0]<=CFG.omax)out.push({sel:i,odd:b[0],bname:b[1],ev,p:e.fair.p[i]})});return out.sort((a,b)=>b.ev-a.ev)}
const OSEL=e=>e.sport==="tenis"?[e.home,e.away]:["Gana "+e.home,"Gana "+e.away];
const fairOdd=p=>p>0?1/p:null;
function sportCount(k){if(k==="futbol")return ROWS.filter(r=>r.st==="prox").length;return OROWS.filter(r=>r.e.sport===k&&r.st==="prox").length}
function renderSports(){const el=$("sports");if(!el)return;el.innerHTML=SPORTS.filter(([k])=>k!=="mlb"||SPORT==="mlb"||(P&&sportCount("mlb")>0)).map(([k,l])=>{const n=P?sportCount(k):null;return`<button data-sp="${k}" class="${SPORT===k?"on":""}" aria-pressed="${SPORT===k}">${l}${n!=null?`<small>${n}</small>`:""}</button>`}).join("")}
document.addEventListener("click",e=>{const b=e.target.closest("#sports [data-sp]");if(!b)return;SPORT=b.dataset.sp;store.set("acc_sport",SPORT);F.day=SPORT==="futbol"?"hoy":"todo";renderList()});
function o1(r){const e=r.e;return`<button class="m1 mrow orow" data-okey="${esc(e.key)}"><span class="t">${fmtHM(r.ts)}${dot(r.fr)}</span><span class="n"><span>${esc(e.home)}</span><span>${esc(e.away)}</span>${r.state==="live"?`<span class="badge y">Señal</span>`:""}</span>${rowOddsO(e)}</button>`}
function oByLeague(rows){const g=new Map();rows.forEach(r=>{const k=r.e.league;if(!g.has(k))g.set(k,[]);g.get(k).push(r)});return[...g.entries()].sort((a,b)=>a[1][0].ts-b[1][0].ts).map(([lg,rs])=>lgHead(lg,rs.length)+(COLL.has(lg)?"":rs.map(o1).join(""))).join("")}
function otherAnswer(rows){const name=(SPORTS.find(x=>x[0]===SPORT)||["",""])[1],up=rows.filter(r=>r.st==="prox"),live=[];up.forEach(r=>r.sig.forEach(s=>live.push([r,s])));
 if(!P||!P.other||!Object.keys(P.other.fetched||{}).some(c=>(c.indexOf("TEN:")===0?"tenis":c.toLowerCase())===SPORT))return`<div class="ans"><h3>${name}: sin cuotas por ahora</h3><p>Las cuotas de ${name} se buscan solas cuando hay partidos en las próximas 36 horas (el plan gratis alcanza para eso).</p></div>`;
 if(live.length){live.sort((a,b)=>b[1].ev-a[1].ev);return`<div class="ans y"><h3>Para mirar: ${live.length} ${live.length===1?"señal":"señales"}</h3><p>${(CFG.casas||"ar")==="ar"?"Cuotas de Bet365 Argentina que pagan más que la cuota justa.":"Casas que pagan más que la cuota justa (Bet365 Argentina y europeas)."} No es una garantía.</p>${live.slice(0,3).map(([r,s])=>`<button class="it" data-okey="${esc(r.e.key)}"><span><b>${esc(OSEL(r.e)[s.sel])}</b><small>${esc(r.e.home)} vs ${esc(r.e.away)} · ${fmtHM(r.ts)} · ${esc(s.bname)}</small></span><span class="v">${od(s.odd)} · ${sg(s.ev)}</span></button>`).join("")}</div>`}
 const ar=(CFG.casas||"ar")==="ar";
 return`<div class="ans"><h3>${up.length?`${up.length} ${SPORT==="tenis"?"partidos":"partidos"} con cuota justa`:`${name}: no hay partidos en los próximos días`}</h3><p>${up.length?(ar?(up.some(r=>r.e.b365)?`Bet365 Argentina no paga hoy más que la cuota justa con margen suficiente. Al lado de cada partido va la <b>cuota justa</b> (sin margen): si tu casa paga más, hay valor.`:`Al lado de cada partido va la <b>cuota justa</b> (sin margen) de cada lado. Si tu casa paga más que eso, hay valor. Todavía no llegaron cuotas de Bet365 Argentina para ${name}.`):"Ninguna casa paga hoy más que la cuota justa con margen suficiente."):"Las cuotas se buscan solas varias veces por día."}</p></div>`}
function renderOther(){
 const all=OROWS.filter(r=>r.e.sport===SPORT),act=all.filter(r=>r.st!=="fin").filter(r=>!F.q||(r.e.home+" "+r.e.away+" "+r.e.league).toLowerCase().includes(F.q));
 const t0=dayKey(Date.now()),inDay=F.day==="ahora"?act.filter(r=>r.ts<Date.now()+3*36e5):F.day==="hoy"?act.filter(r=>dayKey(r.ts)<=t0):F.day==="man"?act.filter(r=>dayKey(r.ts)===t0+1):act;
 $("answer").innerHTML=otherAnswer(all);
 document.querySelectorAll("#days [data-d]").forEach(b=>{b.classList.toggle("on",b.dataset.d===F.day);b.setAttribute("aria-pressed",String(b.dataset.d===F.day))});
 $("filtBtn").hidden=true;$("filtPanel").hidden=true;
 let list;
 if(!P)list='<div class="skel"></div>'.repeat(4);
 else if(!inDay.length)list=`<div class="empty">${act.length&&F.day!=="todo"?'No hay partidos ese día. <button class="lk" data-d="todo">Ver más días ›</button>':"No hay partidos próximos con cuotas."}</div>`;
 else if(F.day==="todo"){const d=new Map();inDay.forEach(r=>{const k=dayKey(r.ts);if(!d.has(k))d.set(k,[]);d.get(k).push(r)});list=[...d.values()].map(rs=>`<div class="day">${dayLabel(rs[0].ts)}</div>`+oByLeague(rs)).join("")}
 else list=oByLeague(inDay);
 const fo=P&&P.other&&P.other.events.length?`<p class="meta">Cuota justa = Pinnacle sin margen (si falta, Betfair o el promedio de casas). Hora: Argentina.</p>`:"";
 $("region").className="";$("region").innerHTML=`<div id="topAlert"></div><div class="count" id="count">${inDay.length?inDay.length+" partidos":""}</div>${P?oddsHead(2):""}<div id="list">${list}</div>${fo}<div id="pastBox"></div>`}
document.addEventListener("click",e=>{const b=e.target.closest("[data-okey]");if(b)go("#/o/"+encodeURIComponent(b.dataset.okey))});
document.addEventListener("click",e=>{const o=e.target.closest("[data-om]");if(o){OM=o.dataset.om;store.set("acc_om",OM);renderList();return}const l=e.target.closest(".lgh[data-lg]");if(l){const k=l.dataset.lg;COLL.has(k)?COLL.delete(k):COLL.add(k);renderList()}});
function renderOFicha(key){const r=OBYKEY[key],el=$("v-ficha");
 if(!r){el.innerHTML=`<button class="back" onclick="go('#/partidos')">‹ Partidos</button><div class="empty">${P?"Este partido ya no está en los datos.":"Cargando…"}</div>`;return}
 const e=r.e,lab=OSEL(e),f=e.fair,stTxt=r.st==="prox"?`Empieza ${fmtDT(r.ts)}`:r.st==="juego"?"En juego o recién terminado · sin datos en vivo":"Ya jugado";
 let h=`<button class="back" id="fBack">‹ Partidos</button><div class="mhead"><div class="lg">${esc(e.league)}</div><div class="vs">${esc(e.home)}<span>vs</span>${esc(e.away)}</div><div class="mst">${stTxt}</div></div>`;
 r.sig.forEach(s=>{h+=`<div class="panel sig"><h4>Señal ${KE}</h4><p style="margin:0"><b>${esc(lab[s.sel])}</b> a <b>${od(s.odd)}</b> en ${esc(s.bname)} · valor ${sg(s.ev)}.</p><p class="meta">Cuota justa ${od(fairOdd(s.p))}. ${/Argentina/.test(s.bname)?"Revisá en tu Bet365 que la cuota siga igual.":"Es una casa europea: puede no operar en Argentina."} No es una garantía.</p></div>`});
 h+=cmpBlock(e.key,lab,f?f.p:null,e.b365||null,e.b365At||null);
 if(f)h+=`<div class="panel"><h4>Probabilidad de cada lado ${KE} ${ib("consenso")}</h4>${bars(lab,f.p)}<p class="meta">Mercado sin margen (${esc(f.ref)}). Cuotas ${ago(Date.parse(e.at))} (${fmtDT(Date.parse(e.at))}).${r.fr!=="ok"?" <b>Cuotas viejas: pueden haber cambiado.</b>":""}</p>
 <p class="meta">${e.sport==="tenis"?"Si un jugador abandona, cada casa liquida distinto: revisá sus reglas.":e.sport==="nba"?"Ganador del partido incluye el alargue.":e.sport==="mlb"?"Ganador del partido incluye entradas extra.":"Ganador del partido incluye el alargue; si termina empatado, la mayoría de las casas devuelve la apuesta."} Margen quitado con el método ${esc(f.method==="odds_ratio"?"odds ratio":f.method||"potencia")}, el que mejor predijo en datos reales para este tipo de mercado.</p></div>`;
 else h+=`<div class="alert">Todavía no hay cuota de Pinnacle para este partido, así que no se puede calcular la cuota justa. ${e.b365?"Abajo están las cuotas de Bet365 Argentina.":""}</div>`;
 h+=`${e.model?`<div class="panel"><h4>Modelo en prueba ${KX}</h4>${bars(lab,e.model.p,"alt")}<p class="meta">Elo por superficie (${esc(e.model.surface==="Clay"?"polvo de ladrillo":e.model.surface==="Grass"?"césped":"cancha dura")}), entrenado con resultados de Jeff Sackmann hasta ${esc(String(e.model.hasta).replace(/(\d{4})(\d{2})(\d{2})/,"$3/$2/$1"))} y actualizado con cada resultado nuevo. <b>No se usa para señales</b> hasta que demuestre que predice mejor que el mercado.${P&&P.sombra&&P.sombra.tenis&&P.sombra.tenis.n?` Hasta ahora, en ${P.sombra.tenis.n} partidos: modelo ${n1(P.sombra.tenis.llm/P.sombra.tenis.n*1000)/1000} contra mercado ${n1(P.sombra.tenis.llk/P.sombra.tenis.n*1000)/1000} de log loss (menos es mejor).`:""}</p></div>`:""}
`;
 const bk=Object.entries(e.books||{}).sort((a,b)=>b[1][0]-a[1][0]);
 h+=`<div class="panel"><h4>Cuotas</h4><div class="tw"><table><tr><th>Casa</th><th>${esc(e.sport==="tenis"?e.home.split(" ").slice(-1)[0]:"Local")}</th><th>${esc(e.sport==="tenis"?e.away.split(" ").slice(-1)[0]:"Visitante")}</th></tr>${e.b365?`<tr><td><b>Bet365 Argentina</b><small>${fmtHM(Date.parse(e.b365At))} h · OddsPapi</small></td><td>${od(e.b365[0])}</td><td>${od(e.b365[1])}</td></tr>`:""}${e.btn?`<tr><td>${esc(e.btnLabel||"Betano")}<small>referencia · puede variar en Argentina</small></td><td>${od(e.btn[0])}</td><td>${od(e.btn[1])}</td></tr>`:""}${e.pin?`<tr><td>Pinnacle (referencia)</td><td>${od(e.pin[0])}</td><td>${od(e.pin[1])}</td></tr>`:""}${bk.map(([n,o])=>`<tr><td>${esc(n)}</td><td>${od(o[0])}</td><td>${od(o[1])}</td></tr>`).join("")}</table></div><p class="meta">Bet365 Argentina: OddsPapi. Pinnacle y las demás: The Odds API, región Europa (pueden no operar en Argentina).</p></div>`;
 h+=`<div class="note">${e.sport==="nfl"?"En la NFL la página usa solo el mercado: se probó un modelo propio (Elo) con los partidos desde 2019 y predijo peor que las cuotas de cierre, así que no se muestra.":`En ${e.sport==="tenis"?"tenis":e.sport==="mlb"?"béisbol":"la NBA"} la página usa solo el mercado: todavía no hay un modelo propio probado con datos reales, y no se muestra uno sin probar.`}</div>`;
 el.innerHTML=h;$("fBack").onclick=()=>go("#/partidos");bindCmp(e.key,f?f.p:null);
}

/* ---------- goleadores: "anota en cualquier momento" ---------- */
function goalFresh(m){return m.gs&&freshOf(Date.parse(m.gs.at))==="ok"&&(!m.gs.b3aAt||freshOf(Date.parse(m.gs.b3aAt))==="ok")}
function goalSigs(m){if(!m.gs||!goalFresh(m)||mstatus(Date.parse(m.kickoff))!=="prox")return[];return m.gs.signals.filter(g=>g.ev>(g.m==="aproximada"?Math.max(5,CFG.vmin):CFG.vmin)/100)}
function fichaGoles(r){const m=r.m,G=m.gs;if(!G)return`<div class="empty">Este partido no tiene cuotas de goleadores.</div>`;
 const sig=goalSigs(m);let h="";
 sig.forEach(g=>{h+=`<div class="panel sig"><h4>Señal · goleador ${KE}</h4><p style="margin:0"><b>${esc(g.player)}</b> anota, a <b>${od(g.odd)}</b> en Bet365 Argentina · valor ${sg(g.ev)}.</p><p class="meta">Cuota justa ${od(1/g.p)} (probabilidad ${pc(g.p,1)}). Revisá en tu Bet365 que la cuota siga igual. No es una garantía.</p></div>`});
 const rows=G.players.slice().sort((a,b)=>b.p-a.p);
 h+=`<div class="panel"><h4>¿Quién anota? ${KE} ${ib("valor")}</h4><div class="tw"><table><tr><th>Jugador</th><th>Justa</th><th>Desde</th><th>Bet365</th></tr>${rows.map(g=>{const vm=(g.m==="aproximada"?Math.max(5,CFG.vmin):CFG.vmin)/100;return`<tr><td style="text-align:left">${esc(g.n)}${g.m==="aproximada"?" ≈":g.m==="exchange"?" ⇄":""}<small style="display:block">${pc(g.p,0)} de anotar${g.bfx?` · Betfair ${od(g.bfx)}`:""}</small></td><td>${od(1/g.p)}</td><td><b>${od((1+vm)/g.p)}</b></td><td class="${g.b3a&&g.b3a*g.p-1>vm?"pos":""}">${g.b3a?od(g.b3a)+`<small>${sg(g.b3a*g.p-1)}</small>`:"–"}</td></tr>`}).join("")}</table></div>
 <p class="meta"><b>Justa</b>: cuota sin margen. <b>Desde</b>: cuota mínima que conviene en tu casa. <b>Bet365</b>: Bet365 Argentina. Cuota justa: promedio de ${esc(String(Math.max(...rows.map(g=>g.nb))))} casas de EE. UU. (The Odds API) sin margen, con el método potencia cuando la casa da "sí" y "no". ≈ = solo había "sí": se estima con un margen típico del 8% y para marcar señal se pide 5% de valor. ⇄ = sin casas de EE. UU.: cuota justa de Betfair Exchange (apuestas entre personas, casi sin margen). Cuotas de ${fmtDT(Date.parse(G.at))}${G.b3aAt?` · Bet365 Argentina ${fmtDT(Date.parse(G.b3aAt))} (OddsPapi)`:" · Bet365 Argentina todavía no publicó esta lista"}.</p>
 <p class="meta">Si el jugador no juega, Bet365 suele devolver la apuesta: revisá sus reglas. Solo para los 10 partidos más importantes de la semana de Premier, LaLiga, Serie A, Bundesliga y Ligue 1.</p></div>`;
 return h}
/* ---------- detalle de una señal ---------- */
const SEL=m=>["Gana "+m.home,"Empate","Gana "+m.away];
function histFor(book){if(!VALID)return null;const b=VALID.backtest;return book==="Max"?b.max:book==="B365"?b.b365:b.nombradas}
function weak(r,s){const m=r.m,w=[];
 if(s.book==="Max")w.push("La mejor cuota es de una casa no identificada por la fuente: puede no operar en Argentina.");
 if(s.book==="OA")w.push("La mejor cuota es de una casa europea (The Odds API): no opera en Argentina. Compará con la cuota de tu casa en la ficha.");
 if(r.state==="old")w.push(`La cuota se publicó ${ago(r.cap)}: puede haber cambiado.`);
 if(s.odd>=5){const h=VALID&&VALID.backtest.max.porCuota.find(x=>x.rango.startsWith("5"));w.push(`Cuota de 5 o más: en el backtest ese rango rindió ${h?sg(h.roi):"peor"}.`)}
 if(s.ev>0.15)w.push("Un valor tan alto a veces es un error de la fuente: verificá la cuota en la casa.");
 if(s.lo<=0)w.push(`Con otra referencia o método de quitar el margen, el valor baja hasta ${sg(s.lo)}: la ventaja depende de cómo se calcule.`);else if(s.nref<2)w.push("Solo hay una referencia para la probabilidad justa: no se puede contrastar con otra.");
 if(m.model){const d=m.model.x12[s.sel]-s.p;if(Math.abs(d)>=0.10)w.push(`El modelo propio da ${pc(m.model.x12[s.sel])} (${d>0?"más":"menos"} que el mercado). El modelo es experimental y predijo peor que el mercado: tomalo como alerta de incertidumbre, no como confirmación.`)}
 if(m.issues&&m.issues.length)w.push("La fuente tuvo datos incoherentes en este partido ("+m.issues.join("; ")+").");
 const h=histFor(s.book);if(h)w.push(`La ganancia histórica de esta regla no está demostrada: ${sg(h.roi)} ± ${pc(h.errorRoi,1)} en ${h.apuestas.toLocaleString("es-AR")} apuestas.`);
 return w}
function sigCard(r,s,compact){const m=r.m,book=s.book,o=m.odds.x12[book],mg=o?implied(o)-1:null,h=histFor(book);
 const head=`<div class="hd">${r.state==="live"?'<span class="badge y">Señal</span>':'<span class="badge o">Señal vieja · verificá la cuota</span>'}<span class="meta">1X2 · ${esc(m.league)} · ${fmtDT(r.ts)}</span></div>`;
 const title=`<div class="big">${esc(SEL(m)[s.sel])} a ${od(s.odd)}</div><div class="meta">${esc(m.home)} vs ${esc(m.away)}</div>`;
 const kv=`<div class="kv" style="margin-top:8px">
  <div>Casa ${ib("mejor")}</div><div>${esc(s.bname||BOOK_NAMES[book]||book)}</div>
  <div>Cuota ${KO}</div><div>${od(s.odd)}</div>
  <div>Cuota publicada</div><div>${fmtDT(r.cap)}</div>
  <div>Probabilidad estimada ${KE}</div><div>${pc(s.p,1)}</div>
  <div>Método ${ib("consenso")}</div><div>${esc(m.fair.ref)} sin margen</div>
  <div>Probabilidad implícita ${ib("implicita")}</div><div>${pc(1/s.odd,1)}</div>
  <div>Margen de esa casa ${ib("margen")}</div><div>${mg==null?"–":pc(mg,1)}</div>
  <div>Cuota justa ${ib("justa")}</div><div>${od(1/s.p)}</div>
  <div>Valor esperado ${ib("ev")}</div><div class="pos">${sg(s.ev)}</div>
  <div>Rango según referencia y método ${ib("incertidumbre")}</div><div>${sg(s.lo)} a ${sg(s.hi)}</div>
  <div>Conviene si tu casa paga</div><div>${od(1.02/s.p)} o más</div>
  ${m.model?`<div>Modelo propio ${KX}</div><div>${pc(m.model.x12[s.sel],1)}</div>`:""}
 </div>`;
 const lv=`<div class="lvls"><div class="lvl">Señal<b>${sg(s.ev)}</b><small>${sg(s.lo,0)} a ${sg(s.hi,0)}</small></div><div class="lvl">Datos<b>${r.state==="old"?"Cuota vieja":m.issues&&m.issues.length?"Con avisos":"Completos"}</b></div><div class="lvl">Validación<b>${h?`CLV ${sg(h.clvPromedio)}`:"–"}</b></div></div>`;
 const w=weak(r,s);
 if(compact)return`<div class="sig${r.state==="old"?" old":""}">${head}${title}${lv}<button class="btn sm" data-open="${esc(m.key)}">Ver el análisis completo</button></div>`;
 return`<div class="sig${r.state==="old"?" old":""}">${head}${title}${kv}${lv}<b style="font-size:14px">Por qué la señal puede ser débil</b><ul class="warn">${w.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>${r.state==="live"?`<p style="margin:10px 0 0"><button class="btn sm" data-note="${esc(SEL(m)[s.sel]+" ("+m.home+" vs "+m.away+")")}" data-odd="${s.odd}" data-book="${esc(s.bname||BOOK_NAMES[s.book]||s.book)}" data-lg="${esc(m.league)}">Anotar en mi registro</button></p>`:""}</div>`}
document.addEventListener("click",e=>{const b=e.target.closest("[data-open]");if(b)go("#/p/"+encodeURIComponent(b.dataset.open))});
document.addEventListener("click",e=>{const b=e.target.closest("[data-note]");if(!b)return;if(paused()){b.textContent="Registro en pausa";b.disabled=true;return}addBet(b.dataset.note,+b.dataset.odd,unit(),{mk:"1X2",book:b.dataset.book||"",lg:b.dataset.lg||""});b.textContent="✓ Anotada";b.disabled=true});

/* ---------- ficha del partido ---------- */
const FORMS={};
function bars(labels,p,cls){const top=p.indexOf(Math.max(...p));return p.map((x,i)=>`<div class="bar${i===top?" top":""}"><span class="lbl">${esc(labels[i])}</span><span class="tr"><span class="fi ${cls||""}" style="width:${(x*100).toFixed(1)}%"></span></span><span class="pc">${pc(x)}</span></div>`).join("")}
function lambdas(m){const ref=["BFE","PS","Avg"].map(b=>m.odds.ou25[b]).find(Boolean);if(!ref||!m.fair)return null;const po=powerFair(ref)[0],lam=lamFromOver(po),sh=share(m.fair.p[0],m.fair.p[2]);return{lam,lh:lam*sh,la:lam*(1-sh),po}}
function renderFicha(key,tab){
 const r=BYKEY[key],el=$("v-ficha");
 if(!r){el.innerHTML=`<button class="back" onclick="history.back()">‹ Volver</button><div class="empty">${P?"Este partido ya no está en los datos (puede haberse jugado).":"Cargando…"}</div>`;return}
 const m=r.m,tabs=[["resumen","Resumen"],["mercados","Mercados"]].concat(m.gs?[["goleadores","Goleadores"]]:[]).concat([["cuotas","Cuotas"],["equipos","Equipos"],["modelo","Modelo"]]);
 const stTxt=r.st==="prox"?`Empieza ${fmtDT(r.ts)}`:r.st==="juego"?"En juego o recién terminado · sin datos en vivo":"Ya jugado · sin resultado cargado";
 let body="";
 if(tab==="resumen")body=fichaResumen(r);else if(tab==="goleadores")body=fichaGoles(r);else if(tab==="mercados")body=fichaMercados(r);else if(tab==="cuotas")body=fichaCuotas(r);else if(tab==="equipos")body=fichaEquipos(r);else body=fichaModelo(r);
 el.innerHTML=`<button class="back" id="fBack">‹ Partidos</button>
 <div class="mhead"><div class="lg">${esc(m.league)}</div><div class="vs">${esc(m.home)}<span>vs</span>${esc(m.away)}</div><div class="mst">${stTxt}${m.referee?" · Árbitro: "+esc(m.referee):""}</div><div class="mst" style="opacity:.75;font-size:12.5px">Sede: la fuente no la informa (normalmente, la cancha de ${esc(m.home)})</div></div>
 <div class="tabs2" role="tablist">${tabs.map(([k,l])=>`<button role="tab" class="${k===tab?"on":""}" data-ft="${k}" aria-selected="${k===tab}">${l}</button>`).join("")}</div>${body}`;
 $("fBack").onclick=()=>go("#/partidos");
 el.querySelectorAll("[data-ft]").forEach(b=>b.onclick=()=>{location.hash="#/p/"+encodeURIComponent(key)+"/"+b.dataset.ft});
 if(tab==="equipos")loadForm(r);
 if(tab==="resumen")bindCmp(m.key,m.fair?m.fair.p:null);
}
function fichaResumen(r){const m=r.m,lab=SEL(m);let h="";
 r.sig.forEach(s=>{if(r.state!=="none")h+=sigCard(r,s)});
 if(!r.sig.length||r.state==="none"){h+=`<div class="alert ${r.sig.length?"":"ok"}">${r.st!=="prox"?"El partido ya empezó: no hay apuestas previas posibles.":r.sig.length?"Había una señal, pero la cuota está vencida.":"No se encontró una oportunidad suficientemente respaldada en este partido."}</div>`}
 h+=cmpBlock(m.key,lab,m.fair?m.fair.p:null,[0,1,2].some(i=>b365Of(m,i))?[0,1,2].map(i=>b365Of(m,i)):null,m.b3a?m.b3a.at:null);
 if(m.fair)h+=`<div class="panel"><h4>Probabilidad de cada resultado ${KE} ${ib("consenso")}</h4>${bars(["Local · "+m.home,"Empate","Visitante · "+m.away],m.fair.p)}<p class="meta">Mercado sin margen (${esc(m.fair.ref)}). Cuotas de ${fmtDT(fairAtOf(m))}.</p></div>`;
 const L=lambdas(m);
 if(L)h+=`<div class="panel"><h4>Goles ${KE} ${ib("golesesp")}</h4><div class="kv"><div>Goles esperados</div><div>${n1(L.lam)}</div><div>${esc(m.home)}</div><div>${n1(L.lh)}</div><div>${esc(m.away)}</div><div>${n1(L.la)}</div><div>Más de 2,5 goles (mercado)</div><div>${pc(L.po)}</div></div></div>`;
 else h+=`<div class="panel"><h4>Goles</h4><p class="meta">Datos insuficientes: la fuente no publica cuotas de goles para este partido.</p></div>`;

 if(m.odds.x12.BTN&&m.btn)h+=`<div class="panel"><h4>${esc(m.btn.label)} · referencia</h4><div class="kv">${lab.map((x,i)=>`<div>${esc(x)}</div><div>${od(m.odds.x12.BTN[i])}${m.fair?` <small>${sg(m.odds.x12.BTN[i]*m.fair.p[i]-1)}</small>`:""}</div>`).join("")}</div><p class="meta">Es la cuota de Betano en otro país (${fmtDT(Date.parse(m.btn.at))}, OddsPapi). La de Betano Argentina suele parecerse, pero puede variar: confirmala en tu app. No genera señales.</p></div>`;
 return h}
function bindMyOdds(r){const m=r.m,b=$("moAdd");if(!b)return;const show=()=>{const L=(store.get("acc_myodds",{})[m.key]||[]);$("moOut").innerHTML=L.length?`<table style="margin-top:8px"><tr><th>Cargada</th><th>Resultado</th><th>Cuota</th><th>Valor</th></tr>${L.map(x=>`<tr><td>${esc(x.book||"Tu casa")} · ${fmtHM(x.at)}</td><td>${esc(SEL(m)[x.sel])}</td><td>${od(x.odd)}</td><td class="${x.odd*m.fair.p[x.sel]-1>0?"pos":"neg"}">${m.fair?sg(x.odd*m.fair.p[x.sel]-1):"–"}</td></tr>`).join("")}</table><p class="meta">Cuota cargada a mano por vos: la página no la verifica. Valor contra la probabilidad sin margen del mercado.</p>`:""};show();
 b.onclick=()=>{const o=pnum($("moOdd").value),sel=+$("moSel").value;if(!(o>1)||!m.fair){$("moOut").innerHTML=`<p class="meta">Poné una cuota válida, por ejemplo 2,10.</p>`;return}const all=store.get("acc_myodds",{});(all[m.key]=all[m.key]||[]).unshift({sel,odd:o,book:$("moBook").value.trim(),at:Date.now()});all[m.key]=all[m.key].slice(0,10);store.set("acc_myodds",all);$("moOdd").value="";show()}}
function fichaMercados(r){const m=r.m,p=m.fair?m.fair.p:null,rows=[];const L=lambdas(m);
 const row=(mk,g,sel,prob,justa,best,book,ev,st)=>(mk?`<tr><td colspan="4" style="text-align:left;padding-top:12px"><b>${mk}</b>${g?" "+ib(g):""}</td></tr>`:"")+`<tr><td style="text-align:left">${esc(sel)}</td><td>${prob}<small>justa ${justa}</small></td><td>${best}</td><td class="${ev>0?"pos":ev<0?"neg":""}">${ev==null?"–":sg(ev)}</td></tr>`;
 if(p){SEL(m).forEach((s,i)=>{const b=bestFor(m,i,true);rows.push(row(i?"":"Resultado (1X2)","",s,pc(p[i],1),od(1/p[i]),b?`${od(b.odd)}<small>${esc(bookLabel(b))}</small>`:"–",null,b?b.odd*p[i]-1:null))});
  [["Local o empate",p[0]+p[1]],["Empate o visitante",p[1]+p[2]],["Local o visitante",p[0]+p[2]]].forEach(([s,q],i)=>rows.push(row(i?"":"Doble oportunidad","dc",s,pc(q,1),od(1/q),"sin cuota","",null)));
  [[m.home,(p[0]+p[2])/p[0]],[m.away,(p[0]+p[2])/p[2]]].forEach(([s,j],i)=>rows.push(row(i?"":"Empate no apuesta","dnb",s,"–",od(j),"sin cuota","",null)))}
 const ouRef=["PIN","BFE","PS","Avg","AvgE"].find(b=>m.odds.ou25[b]);
 if(ouRef){const f=powerFair(m.odds.ou25[ouRef]);["Más de 2,5","Menos de 2,5"].forEach((s,i)=>{let best=null,bk=null;["B365","PS","Max"].forEach(b=>{const o=m.odds.ou25[b];if(o&&(best===null||o[i]>best)){best=o[i];bk=b}});rows.push(row(i?"":"Más/menos 2,5 goles","ou",s,pc(f[i],1),od(1/f[i]),best?`${od(best)}<small>${esc(bk==="Max"?"no ident.":BOOK_NAMES[bk])}</small>`:"–","",best?best*f[i]-1:null))})}
 else rows.push(row("Más/menos goles","ou","–","–","–","sin datos","",null));
 const ah=m.odds.ah;
 if(ah){const ref=["BFE","PS","Avg"].find(b=>ah[b]);const f=ref?powerFair(ah[ref]):null;const ln=x=>(x>0?"+":"")+String(x).replace(".",",");
  [[m.home+" "+ln(ah.line),0],[m.away+" "+ln(-ah.line),1]].forEach(([s,i],k)=>{let best=null,bk=null;["B365","PS","Max"].forEach(b=>{const o=ah[b];if(o&&(best===null||o[i]>best)){best=o[i];bk=b}});rows.push(row(k?"":"Hándicap asiático","ah",s,f?pc(f[i],1)+"*":"–",f?od(1/f[i]):"–",best?`${od(best)}<small>${esc(bk==="Max"?"no ident.":BOOK_NAMES[bk])}</small>`:"–","",best&&f?best*f[i]-1:null))})}
 if(L){const G=grid(L.lh,L.la,-.13);let bt=0,o15=0,o35=0;const sc=[];for(let i=0;i<=10;i++)for(let j=0;j<=10;j++){const q=G[i][j];if(i&&j)bt+=q;if(i+j>1)o15+=q;if(i+j>3)o35+=q;sc.push([i+"-"+j,q])}sc.sort((a,b)=>b[1]-a[1]);
  rows.push(row("Ambos marcan","btts","Sí",pc(bt,1)+"†",od(1/bt),"sin cuota","",null));rows.push(row("","","No",pc(1-bt,1)+"†",od(1/(1-bt)),"sin cuota","",null));
  rows.push(row("Más de 1,5 goles","ou","Sí",pc(o15,1)+"†",od(1/o15),"sin cuota","",null));rows.push(row("Más de 3,5 goles","ou","Sí",pc(o35,1)+"†",od(1/o35),"sin cuota","",null));
  sc.slice(0,4).forEach((x,i)=>rows.push(row(i?"":"Resultado exacto","exacto",x[0],pc(x[1],1)+"†",od(1/x[1]),"sin cuota","",null)))}
 const cc=m.model&&m.model.cc;
 [["corners","Córners totales","esperados"],["cards","Tarjetas amarillas totales","esperadas"]].forEach(([k,t,e])=>{const c=cc&&cc[k];if(!c)return;Object.entries(c.p).sort((a,b)=>a[0]-b[0]).forEach(([l,q],i)=>rows.push(row(i?"":`${t} · ${e} ${n1(c.lam)}`,k==="cards"?"tarjetas":"corners","Más de "+String(l).replace(".",","),pc(q,1)+"‡",od(1/q),"sin cuota","",null)))});
 const na=[["Córners","corners"],["Tarjetas","tarjetas"],["Descanso / final","htft"],["Jugadores","jugadores"]].filter(x=>!(cc&&((x[1]==="corners"&&cc.corners)||(x[1]==="tarjetas"&&cc.cards))));
 return`<div class="panel"><div class="tw"><table class="mk"><tr><th style="text-align:left">Selección</th><th>Prob. ${ib("estimada")}</th><th>Mejor cuota</th><th>Valor</th></tr>${rows.join("")}</table></div>
 <p class="meta">Probabilidades: mercado sin margen ${KE}. * Hándicap asiático: probabilidad efectiva descontando devoluciones; para ver cada caso (ganar, medio, devolución) usá la herramienta Hándicap asiático. † Estimado con Poisson y Dixon-Coles a partir de las cuotas de goles: no hay cuotas de ese mercado en la fuente.${cc&&(cc.corners||cc.cards)?" ‡ Modelo propio de córners y tarjetas (historial de cada equipo con más peso a lo reciente). Probado con más de 15.000 partidos que no usó para aprender: predice mejor que el promedio de la liga y está bien calibrado, pero no hay cuotas para comparar: usá la cuota justa como referencia con tu casa.":""}</p></div>
 <details class="panel"><summary><b>Reglas de liquidación</b> ${ib("liquidacion")}</summary><div class="kv" style="margin-top:8px">
  <div>Resultado (1X2)</div><div>Se decide a los 90 minutos más el descuento. No cuentan prórroga ni penales.</div>
  <div>Doble oportunidad</div><div>Gana si sale cualquiera de los dos resultados elegidos.</div>
  <div>Empate no apuesta</div><div>Si empatan, te devuelven lo apostado.</div>
  <div>Más/menos 2,5 goles</div><div>Cuenta los goles de los 90 minutos. Con línea de ,5 no hay devolución.</div>
  <div>Hándicap asiático</div><div>Línea entera (0, −1): si queda igualado, se devuelve. Línea ,5: no hay devolución. Línea ,25 o ,75: la apuesta se parte en dos mitades (ej. −0,25 = mitad a 0 y mitad a −0,5), por eso se puede ganar o perder la mitad.</div>
  <div>Ambos marcan</div><div>Gana "Sí" si los dos equipos hacen al menos un gol en los 90 minutos.</div>
  <div>Resultado exacto</div><div>El marcador al final de los 90 minutos.</div>
  <div>Partido suspendido</div><div>Cada casa tiene su regla (muchas anulan la apuesta si no se completa en 24 a 48 horas). Revisala en tu casa antes de comparar cuotas.</div>
 </div><p class="meta">Reglas generales del mercado; pueden variar entre casas. Dos cuotas solo son comparables si se liquidan igual.</p></details>
 <div class="panel"><h4>Mercados no disponibles</h4>${na.map(([n,g])=>`<div class="meta" style="margin:4px 0"><b style="color:var(--tx)">${n}</b>${ib(g)} · la fuente no publica cuotas de este mercado. No se estiman valores.</div>`).join("")}</div>`}
function fichaCuotas(r){const m=r.m,lab=["1","X","2"];const books=Object.keys(m.odds.x12).sort((a,b)=>(b==="B3A")-(a==="B3A")||(REAL.includes(b)-REAL.includes(a)));
 const best=[0,1,2].map(i=>Math.max(...REAL.filter(b=>m.odds.x12[b]).map(b=>m.odds.x12[b][i]),0));
 let h=`<div class="panel"><h4>Resultado (1X2) ${KO}</h4><div class="tw"><table><tr><th>Casa</th>${lab.map(x=>`<th>${x}</th>`).join("")}<th>Margen ${ib("margen")}</th></tr>${books.map(b=>{const o=m.odds.x12[b],mg=implied(o)-1;return`<tr><td>${b==="BTN"?`${esc(m.btn?m.btn.label:"Betano")}<small>referencia</small>`:b==="B3A"?`<b>Bet365 Argentina</b><small>${m.b3a?fmtHM(Date.parse(m.b3a.at))+" h · OddsPapi":""}</small>`:esc(BOOK_NAMES[b]||b)}</td>${o.map((x,i)=>`<td class="${REAL.includes(b)&&x===best[i]?"best":""}">${od(x)}</td>`).join("")}<td>${b==="Max"?"–":pc(mg,1)}</td></tr>`}).join("")}${m.fair?`<tr><td><b>Cuota justa</b> ${KE}</td>${m.fair.p.map(x=>`<td><b>${od(1/x)}</b></td>`).join("")}<td>0%</td></tr>`:""}</table></div><p class="meta">Resaltada: la mejor cuota entre casas identificadas. football-data.co.uk: publicadas ${fmtDT(fileAt(m))}${m.oa?` · "actualizada": The Odds API, ${fmtDT(oaAt(m))}`:""}. Betfair Exchange cobra comisión sobre la ganancia (no incluida). "Mejor cuota" puede ser de una casa que no opera en Argentina.</p></div>`;
 if(m.oa)h+=`<div class="panel"><h4>Casas europeas · The Odds API</h4><div class="tw"><table><tr><th></th>${lab.map(x=>`<th>${x}</th>`).join("")}</tr><tr><td>Mejor cuota</td>${[0,1,2].map(i=>m.oa.best&&m.oa.best[i]?`<td>${od(m.oa.best[i][0])}<small>${esc(m.oa.best[i][1])}</small></td>`:"<td>–</td>").join("")}</tr>${m.oa.avg?`<tr><td>Promedio (${m.oa.n} casas)</td>${m.oa.avg.map(x=>`<td>${od(x)}</td>`).join("")}</tr>`:""}</table></div><p class="meta">Actualizadas ${fmtDT(oaAt(m))}. Son casas que operan en Europa, no en Argentina: sirven como referencia de precio, no como lugar para apostar.</p></div>`;
 const ou=m.odds.ou25;if(Object.keys(ou).length)h+=`<div class="panel"><h4>Más/menos 2,5 goles ${KO}</h4><div class="tw"><table><tr><th>Casa</th><th>Más</th><th>Menos</th><th>Margen</th></tr>${Object.entries(ou).map(([b,o])=>`<tr><td>${esc(BOOK_NAMES[b]||b)}</td><td>${od(o[0])}</td><td>${od(o[1])}</td><td>${b==="Max"?"–":pc(implied(o)-1,1)}</td></tr>`).join("")}</table></div></div>`;
 const ah=m.odds.ah;if(ah)h+=`<div class="panel"><h4>Hándicap asiático ${KO} ${ib("ah")}</h4><p class="meta" style="margin:0 0 6px">Línea del local: ${String(ah.line).replace(".",",")}</p><div class="tw"><table><tr><th>Casa</th><th>Local</th><th>Visitante</th><th>Margen</th></tr>${Object.entries(ah).filter(([k])=>k!=="line").map(([b,o])=>`<tr><td>${esc(BOOK_NAMES[b]||b)}</td><td>${od(o[0])}</td><td>${od(o[1])}</td><td>${b==="Max"?"–":pc(implied(o)-1,1)}</td></tr>`).join("")}</table></div></div>`;
 h+=`<p class="meta">Movimiento de cuotas: el servidor guarda cada captura nueva desde el 25/10/2026; el gráfico aparecerá cuando haya al menos dos capturas del mismo partido.</p>`;
 if(m.issues&&m.issues.length)h+=`<div class="alert">Datos descartados por incoherentes: ${esc(m.issues.join("; "))}.</div>`;
 return h}
function formBlock(f,title){if(!f||!f.n)return`<div class="panel"><h4>${esc(title)}</h4><p class="meta">Datos insuficientes.</p></div>`;
 return`<div class="panel"><h4>${esc(title)}</h4><div class="seq" aria-label="Resultados: ${f.seq}">${f.seq.split("").map(x=>`<span class="${x}">${x}</span>`).join("")}</div><div class="meta">${f.n} partidos · ${f.from.split("-").reverse().join("/")} a ${f.to.split("-").reverse().join("/")}</div>
 <div class="kv" style="margin-top:6px"><div>Ganó / empató / perdió</div><div>${f.w} / ${f.d} / ${f.l}</div><div>Goles a favor / en contra</div><div>${n1(f.gf)} / ${n1(f.ga)}</div>${f.xgN?`<div>xG / xGA ${ib("xg")} <span class="meta">(${f.xgN} pj)</span></div><div>${n1(f.xgf)} / ${n1(f.xga)}</div>`:""}${f.sf!=null?`<div>Remates (al arco)</div><div>${n1(f.sf)} (${n1(f.stf)})</div>`:""}${f.cf!=null?`<div>Córners a favor / en contra ${ib("corners")}</div><div>${n1(f.cf)} / ${n1(f.ca)}</div>`:""}${f.cards!=null?`<div>Tarjetas ${ib("tarjetas")}</div><div>${n1(f.cards)}</div>`:""}<div>Ambos marcan</div><div>${pc(f.btts)}</div><div>Más de 2,5 goles</div><div>${pc(f.over25)}</div><div>Valla invicta</div><div>${pc(f.cs)}</div></div>
 <details><summary>Últimos ${f.last.length}</summary>${f.last.map(x=>`<div class="meta">${x[0].split("-").reverse().join("/")} · ${x[1]==="L"?"de local":"de visitante"} vs ${esc(x[2])}: <b style="color:var(--tx)">${x[3]}-${x[4]}</b></div>`).join("")}</details></div>`}
function fichaEquipos(r){const k=r.m.key,f=FORMS[k];if(f===undefined)return`<div class="skel"></div><div class="skel"></div><p class="meta">Cargando estadísticas…</p>`;if(f===null)return`<div class="alert red">No se pudieron cargar las estadísticas. <button class="btn sm lt" id="fRetry">Reintentar</button></div>`;
 const m=r.m,rest=x=>x&&x.all&&x.all.n?Math.round((r.ts-Date.parse(x.all.to))/864e5):null;
 return`<p class="meta">Solo partidos de liga. Fuente: ${esc((f.home||f.away||{}).source||"football-data.co.uk")}. Estadísticas al ${f.at?fmtDT(Date.parse(f.at)):"–"}. ${ib("forma")}</p>
 <div class="kv panel"><div>Días de descanso antes del partido</div><div>${esc(m.home)}: ${rest(f.home)??"–"} · ${esc(m.away)}: ${rest(f.away)??"–"}</div></div>
 ${h2hBlock(f,m)}
 <div class="form"><div>${formBlock(f.home&&f.home.all,m.home+" · últimos")}${formBlock(f.home&&f.home.home,m.home+" · de local")}</div><div>${formBlock(f.away&&f.away.all,m.away+" · últimos")}${formBlock(f.away&&f.away.away,m.away+" · de visitante")}</div></div>
 <p class="meta">Una racha corta no predice mucho: el mercado ya la tiene en cuenta. Faltan en la fuente: alineaciones, lesiones y sanciones.</p>`}
function h2hBlock(f,m){const H=f.home&&f.home.hist;if(!H)return"";const L=H.filter(x=>x[2]===m.away).slice(-6).reverse();
 const res=L.map(x=>x[3]>x[4]?"G":x[3]<x[4]?"P":"E");
 return`<div class="panel"><h4>Historial entre ellos ${ib("h2h")}</h4>${L.length?`<div class="meta">${L.length} partido${L.length>1?"s":""} de liga en los últimos 2 años · vista de ${esc(m.home)}: ${res.filter(x=>x==="G").length} G · ${res.filter(x=>x==="E").length} E · ${res.filter(x=>x==="P").length} P</div>${L.map(x=>`<div class="meta">${x[0].split("-").reverse().join("/")} · ${x[1]==="L"?esc(m.home)+" de local":esc(m.home)+" de visitante"}: <b style="color:var(--tx)">${x[3]}-${x[4]}</b></div>`).join("")}<p class="meta">Dato secundario: muestra chica y planteles que cambian.</p>`:`<p class="meta">No se enfrentaron por la liga en los últimos 2 años (según la fuente).</p>`}</div>`}
async function loadForm(r){const k=r.m.key;if(FORMS[k]!==undefined)return;try{const j=await fetchJSON(`${API}?api=ficha&lg=${encodeURIComponent(r.m.lg)}&home=${encodeURIComponent(r.m.home)}&away=${encodeURIComponent(r.m.away)}`);FORMS[k]=j}catch(e){FORMS[k]=null}if(ROUTE.v==="p"&&ROUTE.a===k&&(ROUTE.b||"")==="equipos")renderFicha(k,"equipos");const b=$("fRetry");if(b)b.onclick=()=>{delete FORMS[k];renderFicha(k,"equipos")}}
function fichaModelo(r){const m=r.m,V=VALID&&VALID.modelos.prueba;let h="";
 if(!m.model)return`<div class="alert">El modelo propio no tiene datos suficientes para este partido (hacen falta al menos 6 partidos de liga por equipo).</div>`;
 h+=`<div class="panel"><h4>Mercado ${KE} vs modelo propio ${KX} ${ib("modelo")}</h4><b style="font-size:14px">Mercado sin margen</b>${bars(SEL(m),m.fair.p)}<b style="font-size:14px">Modelo poisson-fuerzas-v1</b>${bars(SEL(m),m.model.x12,"m")}
 <div class="kv" style="margin-top:8px"><div>Diferencia máxima</div><div>${pc(Math.max(...m.model.x12.map((x,i)=>Math.abs(x-m.fair.p[i]))))}</div><div>Goles esperados del modelo</div><div>${n1(m.model.lh)} – ${n1(m.model.la)}</div><div>Partidos usados</div><div>${m.model.n[0]} y ${m.model.n[1]}</div></div></div>`;
 if(V)h+=`<div class="alert red"><b>Cómo leer esto:</b> en la prueba fuera de muestra (${V.mercado.n.toLocaleString("es-AR")} partidos) el modelo predijo peor que el mercado: log loss ${String(V.modelo.logloss).replace(".",",")} contra ${String(V.mercado.logloss).replace(".",",")} (más bajo es mejor). Si el modelo y el mercado no coinciden, lo más probable es que el modelo esté equivocado. Por eso no genera señales. ${ib("logloss")}</div>`;
 return h}

/* ---------- señales ---------- */
function renderOpp(){const el=$("v-oportunidades");if(!P){el.innerHTML=`<h2>Señales</h2><div class="skel"></div>`;return}
 const live=[],old=[];ROWS.forEach(r=>{if(r.state==="live")r.sig.forEach(s=>live.push([r,s]));else if(r.state==="old")r.sig.forEach(s=>old.push([r,s]))});
 live.sort((a,b)=>b[1].ev-a[1].ev);old.sort((a,b)=>a[0].ts-b[0].ts);const h=VALID?VALID.backtest:null;
 el.innerHTML=`<h2>Señales ${ib("oportunidad")}</h2><p class="lead">Cuotas que pagan más que la cuota justa del mercado. No son recomendaciones: son puntos de partida para mirar con cuidado.</p>
 <label class="chip${CFG.named?" on":""}" style="display:inline-flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" id="namedOnly" ${CFG.named?"checked":""} style="accent-color:var(--g)"> Solo casas identificadas</label>
 ${live.length?live.map(([r,s])=>sigCard(r,s,true)).join(""):`<div class="alert ok">${old.length?"Ahora no hay señales con cuotas recientes.":"No se encontró ninguna oportunidad suficientemente respaldada."} Eso también es información: no apostar es una buena decisión.</div>`}
 ${(()=>{const gs=[];ROWS.forEach(r=>goalSigs(r.m).forEach(g=>gs.push([r,g])));return gs.length?`<h3 style="margin:16px 0 8px">Goleadores</h3>`+gs.sort((a,b)=>b[1].ev-a[1].ev).map(([r,g])=>`<button class="m1 mrow" onclick="go('#/p/'+encodeURIComponent('${esc(r.m.key).replace(/'/g,"\\'")}')+'/goleadores')"><span class="t">${fmtHM(r.ts)}</span><span class="n"><b>${esc(g.player)} anota</b><i>${esc(r.m.home)} vs ${esc(r.m.away)} · Bet365 Argentina</i></span><span class="badge y">${od(g.odd)} · ${sg(g.ev)}</span></button>`).join(''):''})()}
 ${(()=>{const os=[];OROWS.forEach(r=>{if(r.state==='live')r.sig.forEach(s=>os.push([r,s]))});return os.length?`<h3 style="margin:16px 0 8px">Tenis, NBA y NFL</h3>`+os.sort((a,b)=>b[1].ev-a[1].ev).map(([r,s])=>`<button class="m1 mrow" data-okey="${esc(r.e.key)}"><span class="t">${fmtHM(r.ts)}</span><span class="n"><b>${esc(OSEL(r.e)[s.sel])}</b><i>${esc(r.e.league)} · ${esc(s.bname)}</i></span><span class="badge y">${od(s.odd)} · ${sg(s.ev)}</span></button>`).join(''):''})()}
 ${old.length?`<details${live.length?"":" open"}><summary>Señales con cuotas viejas (${old.length})</summary><p class="meta">Se publicaron hace más de ${CFG.fresh} h. Solo sirven si tu casa todavía paga la cuota mínima.</p>${old.map(([r,s])=>sigCard(r,s,true)).join("")}</details>`:""}
 ${h?`<div class="panel"><h4>Qué tan confiable es la regla</h4><p style="margin:0 0 8px">Probada con ${VALID.datos.partidos.toLocaleString("es-AR")} partidos de 22 ligas (${VALID.datos.temporadas.join(" y ")}), usando solo cuotas disponibles antes de cada partido.</p><div class="tw"><table><tr><th>Cuota usada</th><th>Apuestas</th><th>Rendimiento</th><th>Le ganó al cierre ${ib("clv")}</th></tr>${[["Mejor del mercado",h.max],["Casas identificadas",h.nombradas],["Solo Bet365",h.b365]].map(([n,b])=>`<tr><td>${n}</td><td>${b.apuestas.toLocaleString("es-AR")}</td><td>${sg(b.roi)} ± ${pc(b.errorRoi,1)}</td><td>${pc(b.clvPositivo)} (${sg(b.clvPromedio)})</td></tr>`).join("")}</table></div><p class="meta">El rendimiento tiene margen de error grande: con la mejor cuota del mercado podría ser desde ${sg(h.max.roi-h.max.errorRoi)} hasta ${sg(h.max.roi+h.max.errorRoi)}. Que le gane al cierre 2 de cada 3 veces es la evidencia más sólida a favor. Con las casas que se pueden usar desde Argentina la ventaja es menor y no está demostrada. <a href="#/mas/modelos">Ver el detalle</a></p></div>`:""}`;
 const c=$("namedOnly");if(c)c.onchange=()=>{CFG.named=c.checked?1:0;saveCFG();derive();renderOpp()}}

/* ---------- registro: predicciones del sistema ---------- */
let PRED=undefined;
function renderRegistro(){document.querySelectorAll("#regTabs button").forEach(b=>b.onclick=()=>{document.querySelectorAll("#regTabs button").forEach(x=>x.classList.toggle("on",x===b));$("rt-mias").hidden=b.dataset.rt!=="mias";$("rt-sistema").hidden=b.dataset.rt!=="sistema";if(b.dataset.rt==="sistema")renderPred()});renderBets()}
async function renderPred(){const el=$("rt-sistema");
 if(PRED===undefined){el.innerHTML=`<div class="skel"></div><p class="meta">Cargando predicciones guardadas en el servidor…</p>`;try{PRED=await fetchJSON(API+"?api=predicciones")}catch(e){PRED=null}}
 if(PRED===null){el.innerHTML=`<div class="alert red">No se pudieron cargar las predicciones. <button class="btn sm lt" id="pRetry">Reintentar</button></div>`;$("pRetry").onclick=()=>{PRED=undefined;renderPred()};return}
 const nv=PRED.filter(p=>p.anulada).length,ev=PRED.filter(p=>p.evaluacion&&!p.anulada&&p.evaluacion.res!=="Nula"),won=ev.filter(p=>p.evaluacion.res===p.seleccion),pnl=ev.reduce((s,p)=>s+(p.evaluacion.res===p.seleccion?p.cuota-1:-1),0);
 el.innerHTML=`<p class="lead">Cada señal que detecta el servidor se guarda una sola vez, con la cuota, la probabilidad y la hora de ese momento, y no se modifica después. Los resultados se cargan aparte. Esto es distinto de tus apuestas: mide al sistema, no a vos.</p>
 <div class="stat3"><div class="st"><div class="k2">Predicciones</div><div class="v">${PRED.length}</div></div><div class="st"><div class="k2">Evaluadas</div><div class="v">${ev.length}</div></div><div class="st"><div class="k2">Aciertos</div><div class="v">${ev.length?pc(won.length/ev.length):"–"}</div></div><div class="st"><div class="k2">Rendimiento</div><div class="v">${ev.length?sg(pnl/ev.length):"–"}</div></div></div>
 ${ev.length<100?`<p class="meta">Con menos de 100 evaluadas el rendimiento es casi todo azar.</p>`:""}${nv?`<p class="meta">${nv} predicción${nv>1?"es anuladas":" anulada"}: siguen visibles abajo pero no cuentan en las estadísticas. El registro original no se modificó; el motivo se guarda aparte.</p>`:""}
 ${PRED.length?`<div class="tw"><table><tr><th>Creada</th><th>Partido</th><th>Selección</th><th>Cuota</th><th>Valor</th><th>Resultado</th></tr>${PRED.slice().reverse().slice(0,200).map(p=>`<tr><td>${fmtDT(Date.parse(p.creada))}</td><td style="text-align:left">${esc(p.local)} vs ${esc(p.visitante)}</td><td>${esc(p.seleccion)}</td><td>${od(+p.cuota)} <span class="meta">${esc(p.casa)}</span></td><td>${sg(+p.valor_esperado)}</td><td>${p.anulada?`<span class="badge r" title="${esc(p.anulada.motivo)}">Anulada</span><div class="meta">${esc(p.anulada.motivo)}</div>`:p.evaluacion?(p.evaluacion.res==="Nula"?'<span class="badge n">Devuelta</span>':p.evaluacion.res===p.seleccion?'<span class="badge g">Ganó</span>':'<span class="badge r">Perdió</span>')+(p.evaluacion.hg!==""&&p.evaluacion.hg!=null?` ${p.evaluacion.hg}-${p.evaluacion.ag}`:""):'<span class="badge n">Pendiente</span>'}</td></tr>`).join("")}</table></div>`:`<div class="empty">Todavía no hay predicciones guardadas: se registran desde la primera actualización automática.</div>`}`}

/* ---------- más ---------- */
const MAS=[["herramientas","▦","Herramientas","Calculadoras: valor, stake, combinadas, hándicap asiático y más."],["registro","▤","Mi registro","Tus apuestas, resultados y límites (solo en este dispositivo)."],["explorador","≡","Explorador de mercados","Todas las cuotas con filtros: liga, mercado, casa, cuota, probabilidad, valor y calidad."],["modelos","∿","Modelos y backtesting","Qué tan bien predice cada método, con datos reales."],["estado","●","Estado de los datos","Fuentes, última actualización y errores."],["glosario","A","Glosario","Todas las palabras, explicadas con ejemplos."],["fuentes","?","Fuentes y casas de apuestas","Qué datos hay, de dónde salen y qué no se puede."],["ajustes","⚙","Ajustes","Umbrales de señales y frescura de cuotas."],["juego","♥","Juego responsable","Límites, pausa y dónde pedir ayuda."]];
function renderMas(sub){const el=$("v-mas");
 if(!sub){el.innerHTML=`<h2>Más</h2><div class="mlist">${MAS.map(([k,ic,t,s])=>`<button class="mitem" data-m="${k}"><span class="ic">${ic}</span><span><b>${t}</b><span>${s}</span></span><span class="ar">›</span></button>`).join("")}</div><p class="meta" style="margin-top:14px">Versión ${APP_VERSION} de la web · datos versión ${P?esc(P.version):"–"}.</p>`;el.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{const k=b.dataset.m;if(k==="herramientas")showView("herramientas");else if(k==="registro")go("#/registro");else go("#/mas/"+k)});return}
 const back=`<button class="back" onclick="location.hash='#/mas'">‹ Más</button>`;
 if(sub==="comparador"||sub==="explorador"){el.innerHTML=back+explorador();bindExplorador()}
 else if(sub==="modelos"){el.innerHTML=back+modelos();loadCube()}
 else if(sub==="estado"){el.innerHTML=back+`<h2>Estado de los datos</h2><div class="skel"></div>`;estado()}
 else if(sub==="glosario"){el.innerHTML=back+`<h2>Glosario</h2><input class="search" id="glq" type="search" placeholder="Buscar (ej. margen, CLV, hándicap)" style="width:100%;margin-bottom:8px"><div id="gll"></div>`;const draw=q=>{$("gll").innerHTML=Object.entries(GL).filter(([k,g])=>!q||(g.join(" ")).toLowerCase().includes(q)).map(([k,g])=>`<div class="gl-item"><b>${esc(g[0])}</b><p>${esc(g[1])}</p>${g[3]?`<p class="meta">Ejemplo: ${esc(g[3])}</p>`:""}${g[2]?`<details><summary>Explicación avanzada</summary><p class="adv">${esc(g[2])}</p></details>`:""}</div>`).join("")||`<div class="empty">Sin resultados.</div>`};draw("");$("glq").oninput=e=>draw(e.target.value.trim().toLowerCase())}
 else if(sub==="fuentes")el.innerHTML=back+fuentes();
 else if(sub==="ajustes"){el.innerHTML=back+ajustes();bindAjustes()}
 else if(sub==="juego")el.innerHTML=back+juego();
}
/* ---------- explorador de mercados ---------- */
const EXP_DEF={fecha:"all",pais:"",liga:"",equipo:"",mk:"1X2",casa:"best",omin:"",omax:"",pmin:"",vmin:"",cal:"all",ord:"ev",lim:60};
let EXP=Object.assign({},EXP_DEF,store.get("acc_exp",{}));
function expRows(){const out=[],t0=dayKey(Date.now());
 const books=EXP.casa==="best"?REAL.concat(["Max"]):EXP.casa==="named"?REAL:[EXP.casa];
 ROWS.filter(r=>r.st==="prox").forEach(r=>{const m=r.m,dk=dayKey(r.ts);
  if(EXP.fecha==="hoy"&&dk!==t0)return;if(EXP.fecha==="man"&&dk!==t0+1)return;if(EXP.fecha==="3d"&&dk>t0+2)return;
  if(EXP.pais&&m.country!==EXP.pais)return;if(EXP.liga&&m.league!==EXP.liga)return;
  if(EXP.equipo&&!(m.home+" "+m.away).toLowerCase().includes(EXP.equipo.toLowerCase()))return;
  const qual=r.fr==="ok"&&!(m.issues&&m.issues.length)&&fairSet(m).length>=4?"ok":r.fr!=="ok"?"old":"warn";
  if(EXP.cal==="fresh"&&r.fr!=="ok")return;if(EXP.cal==="full"&&qual!=="ok")return;
  const add=(sel,odds,p,book,line,note)=>{let best=null,bk=null;books.forEach(b=>{const o=odds[b];if(o&&(best===null||o>best)){best=o;bk=b}});if(best===null||!p)return;out.push({r,sel,odd:best,book:bk,p,ev:best*p-1,qual,line,note})};
  if(EXP.mk==="1X2"&&m.fair){[0,1,2].forEach(i=>{const o={};Object.entries(m.odds.x12).forEach(([b,v])=>o[b]=v[i]);add(SEL(m)[i],o,m.fair.p[i])})}
  if(EXP.mk==="OU"){const ref=["BFE","PS","Avg"].find(b=>m.odds.ou25[b]);if(ref){const f=powerFair(m.odds.ou25[ref]);["Más de 2,5 goles","Menos de 2,5 goles"].forEach((s,i)=>{const o={};Object.entries(m.odds.ou25).forEach(([b,v])=>o[b]=v[i]);add(s,o,f[i])})}}
  if(EXP.mk==="AH"&&m.odds.ah){const ah=m.odds.ah,ref=["BFE","PS","Avg"].find(b=>ah[b]);if(ref){const f=powerFair(ah[ref]),ln=x=>(x>0?"+":"")+String(x).replace(".",",");[[m.home+" "+ln(ah.line),0],[m.away+" "+ln(-ah.line),1]].forEach(([s,i])=>{const o={};Object.entries(ah).forEach(([b,v])=>{if(b!=="line")o[b]=v[i]});add(s,o,f[i],null,ah.line,"*")})}}
 });
 const om=pnum(EXP.omin),oM=pnum(EXP.omax),pm=pnum(EXP.pmin),vm=pnum(EXP.vmin);
 let L=out.filter(x=>(!(om>0)||x.odd>=om)&&(!(oM>0)||x.odd<=oM)&&(!(pm>0)||x.p*100>=pm)&&(isNaN(vm)||x.ev*100>=vm));
 const ord={ev:(a,b)=>b.ev-a.ev,p:(a,b)=>b.p-a.p,odd:(a,b)=>b.odd-a.odd,hora:(a,b)=>a.r.ts-b.r.ts}[EXP.ord]||((a,b)=>b.ev-a.ev);
 return L.sort(ord)}
function explorador(){if(!P)return`<div class="skel"></div>`;
 const paises=[...new Set(ROWS.map(r=>r.m.country))].sort(),ligas=[...new Set(ROWS.filter(r=>!EXP.pais||r.m.country===EXP.pais).map(r=>r.m.league))].sort();
 const L=expRows(),shown=L.slice(0,EXP.lim);
 const opt=(v,l,cur)=>`<option value="${esc(v)}"${String(v)===String(cur)?" selected":""}>${esc(l)}</option>`;
 const f=(k,lab,html)=>`<div class="ef"><label for="ex_${k}">${lab}</label>${html}</div>`;
 const sel=(k,opts)=>`<select id="ex_${k}" data-ex="${k}">${opts.map(([v,l])=>opt(v,l,EXP[k])).join("")}</select>`;
 const inp=(k,ph)=>`<input id="ex_${k}" data-ex="${k}" inputmode="decimal" placeholder="${ph}" value="${esc(EXP[k])}">`;
 const QL={ok:'<span class="badge g">Completa</span>',warn:'<span class="badge n">Con avisos</span>',old:'<span class="badge o">Cuota vieja</span>'};
 return`<h2>Explorador de mercados</h2><p class="lead">Todas las cuotas publicadas de los próximos partidos, con su probabilidad sin margen y su valor. Tocá una fila para ver el partido.</p>
 <details class="panel" open><summary><b>Filtros</b> · ${L.length} resultados</summary><div class="efs">
 ${f("fecha","Fecha",sel("fecha",[["all","Todas"],["hoy","Hoy"],["man","Mañana"],["3d","Próximos 3 días"]]))}
 ${f("pais","País",sel("pais",[["","Todos"]].concat(paises.map(x=>[x,x]))))}
 ${f("liga","Liga",sel("liga",[["","Todas"]].concat(ligas.map(x=>[x,x]))))}
 ${f("equipo","Equipo",`<input id="ex_equipo" data-ex="equipo" placeholder="Ej. Boca" value="${esc(EXP.equipo)}">`)}
 ${f("mk","Mercado "+ib("ou"),sel("mk",[["1X2","Resultado (1X2)"],["OU","Más/menos 2,5 goles"],["AH","Hándicap asiático"]]))}
 ${f("casa","Casa "+ib("mejor"),sel("casa",[["best","Mejor cuota (cualquiera)"],["named","Mejor entre casas identificadas"]].concat(REAL.map(b=>[b,BOOK_NAMES[b]]))))}
 ${f("omin","Cuota desde",inp("omin","1,50"))}${f("omax","Cuota hasta",inp("omax","4"))}
 ${f("pmin","Probabilidad desde (%)",inp("pmin","40"))}${f("vmin","Valor desde (%) "+ib("ev"),inp("vmin","2"))}
 ${f("cal","Calidad de datos "+ib("frescura"),sel("cal",[["all","Todas"],["fresh","Solo cuotas recientes"],["full","Solo datos completos"]]))}
 ${f("ord","Ordenar por",sel("ord",[["ev","Valor"],["p","Probabilidad"],["odd","Cuota"],["hora","Hora"]]))}
 </div><button class="btn sm lt" id="exReset">Limpiar filtros</button></details>
 ${shown.length?`<div class="tw"><table><tr><th>Partido</th><th style="text-align:left">Selección</th><th>Cuota</th><th>Prob.</th><th>Justa</th><th>Valor</th><th>Datos</th></tr>${shown.map(x=>`<tr data-ck="${esc(x.r.m.key)}" style="cursor:pointer"><td style="text-align:left">${esc(x.r.m.home)} – ${esc(x.r.m.away)}<div class="meta">${fmtDT(x.r.ts)} · ${esc(x.r.m.league)}</div></td><td style="text-align:left">${esc(x.sel)}</td><td>${od(x.odd)}<div class="meta">${esc(x.book==="Max"?"no ident.":BOOK_NAMES[x.book])}</div></td><td>${pc(x.p,1)}${x.note||""}</td><td>${od(1/x.p)}</td><td class="${x.ev>0?"pos":"neg"}">${sg(x.ev)}</td><td>${QL[x.qual]}</td></tr>`).join("")}</table></div>
 ${L.length>shown.length?`<p><button class="btn sm lt" id="exMore">Ver ${Math.min(60,L.length-shown.length)} más (quedan ${L.length-shown.length})</button></p>`:""}`:`<div class="empty">Ningún resultado con esos filtros.</div>`}
 <p class="meta">Probabilidad: mercado sin margen (Betfair → Pinnacle → promedio). Solo se comparan cuotas del mismo mercado, selección y línea. ${EXP.mk==="AH"?"* Hándicap asiático: probabilidad efectiva, descontando devoluciones. ":""}"Datos completos" = cuota reciente, sin avisos de la fuente y al menos dos referencias para contrastar. Las cuotas pueden no seguir disponibles: confirmalas en la casa. Betfair no entra en "mejor cuota" porque cobra comisión.</p>`}
function bindExplorador(){const el=$("v-mas");
 el.querySelectorAll("[data-ex]").forEach(i=>{const ev=i.tagName==="SELECT"?"change":"change";i.addEventListener(ev,()=>{EXP[i.dataset.ex]=i.value;if(i.dataset.ex==="pais")EXP.liga="";EXP.lim=60;store.set("acc_exp",EXP);renderMas("explorador")})});
 const r=$("exReset");if(r)r.onclick=()=>{EXP=Object.assign({},EXP_DEF);store.set("acc_exp",EXP);renderMas("explorador")};
 const mo=$("exMore");if(mo)mo.onclick=()=>{EXP.lim+=60;renderMas("explorador")};
 el.querySelectorAll("[data-ck]").forEach(tr=>tr.onclick=()=>go("#/p/"+encodeURIComponent(tr.dataset.ck)))}
function svgLine(series,W,H,opts){const all=series.flatMap(s=>s.pts.map(p=>p[1]));const lo=Math.min(0,...all),hi=Math.max(0,...all);const n=Math.max(...series.map(s=>s.pts.length));const sx=i=>(i/(n-1||1))*(W-40)+36,sy=y=>H-18-(y-lo)/(hi-lo||1)*(H-30);
 const ticks=[lo,0,hi].filter((v,i,a)=>a.indexOf(v)===i);
 return`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label)}">${ticks.map(t=>`<line x1="36" x2="${W}" y1="${sy(t)}" y2="${sy(t)}" stroke="var(--li)"/><text x="32" y="${sy(t)+4}" font-size="10" text-anchor="end" fill="var(--mu)">${Math.round(t)}</text>`).join("")}${series.map(s=>`<polyline fill="none" stroke="${s.c}" stroke-width="2" points="${s.pts.map((p,i)=>sx(i).toFixed(1)+","+sy(p[1]).toFixed(1)).join(" ")}"/>`).join("")}<text x="36" y="${H-3}" font-size="10" fill="var(--mu)">${esc(series[0].pts[0][0])}</text><text x="${W}" y="${H-3}" font-size="10" text-anchor="end" fill="var(--mu)">${esc(series[0].pts[series[0].pts.length-1][0])}</text></svg>`}
function calibSvg(c){const W=300,H=300,s=v=>20+v*(W-30),y=v=>H-20-v*(H-30);
 return`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calibración: probabilidad estimada contra frecuencia real" style="max-width:340px"><rect x="20" y="10" width="${W-30}" height="${H-30}" fill="none" stroke="var(--li)"/><line x1="${s(0)}" y1="${y(0)}" x2="${s(1)}" y2="${y(1)}" stroke="var(--mu)" stroke-dasharray="4 4"/>${[[c.mercado,"var(--g)"],[c.modelo,"#7f97b9"]].map(([pts,col])=>pts.map(p=>`<circle cx="${s(p.prob)}" cy="${y(p.real)}" r="${Math.max(3,Math.min(8,Math.sqrt(p.n)/5))}" fill="${col}" fill-opacity=".8"><title>${pc(p.prob)} estimado → ${pc(p.real)} real (${p.n})</title></circle>`).join("")).join("")}<text x="${W/2}" y="${H-4}" font-size="10" text-anchor="middle" fill="var(--mu)">probabilidad estimada</text><text x="8" y="${H/2}" font-size="10" text-anchor="middle" fill="var(--mu)" transform="rotate(-90 8 ${H/2})">frecuencia real</text></svg>`}
function modelos(){if(!VALID)return`<div class="alert">No hay resultados de validación cargados.</div>`;const V=VALID,M=V.modelos,B=V.backtest;const f=x=>String(x).replace(".",",");
 return`<h2>Modelos y backtesting</h2><p class="lead">Todo calculado con el mismo código de la web, usando solo información anterior a cada partido. ${V.datos.partidos.toLocaleString("es-AR")} partidos de ${V.datos.ligas} ligas · ${V.datos.temporadas.join(" y ")} · ${esc(V.datos.fuente)}.</p>
 <h3>Modelos en prueba</h3><div class="panel"><div class="tw"><table><tr><th>Deporte</th><th>Modelo</th><th>Estado</th></tr><tr><td>Tenis</td><td style="text-align:left">Elo por superficie</td><td style="text-align:left">${P&&P.sombra&&P.sombra.tenis&&P.sombra.tenis.n?`${P.sombra.tenis.n} partidos: modelo ${(P.sombra.tenis.llm/P.sombra.tenis.n).toFixed(3).replace(".",",")} · mercado ${(P.sombra.tenis.llk/P.sombra.tenis.n).toFixed(3).replace(".",",")} (log loss)`:"juntando resultados"}. Se publica si le gana al mercado con 300 partidos o más.</td></tr><tr><td>NBA</td><td style="text-align:left">Elo con localía</td><td style="text-align:left">Descartado: predijo peor que el mercado (0,636 contra 0,613; 11.656 partidos).</td></tr><tr><td>NFL</td><td style="text-align:left">Elo</td><td style="text-align:left">Descartado: 0,640 contra 0,611 del mercado.</td></tr><tr><td>Béisbol</td><td style="text-align:left">Elo con lanzador abridor</td><td style="text-align:left">En preparación con datos de Retrosheet; se prueba contra el mercado desde marzo, con la temporada.</td></tr></table></div><p class="meta">Tenis: datos de Jeff Sackmann (CC BY-NC-SA 4.0). Béisbol: información obtenida gratis de Retrosheet (www.retrosheet.org).</p></div>
 <h3>Cómo se le saca el margen a las cuotas, por deporte</h3><div class="panel"><p style="margin:0 0 8px">Se probaron 5 métodos con resultados reales (cuotas de cierre). Gana el de menor log loss. Las diferencias son chicas, pero el método proporcional, el más usado, fue siempre el peor.</p><div class="tw"><table><tr><th>Mercado</th><th>Partidos</th><th>Mejor método</th><th>Se usa</th></tr><tr><td style="text-align:left">Fútbol 1X2 · Pinnacle</td><td>56.257</td><td>aditivo ≈ potencia</td><td>potencia</td></tr><tr><td style="text-align:left">Fútbol 1X2 · Bet365</td><td>55.056</td><td>potencia</td><td>potencia</td></tr><tr><td style="text-align:left">Fútbol 1X2 · Argentina, Brasil y otras</td><td>59.399</td><td>potencia</td><td>potencia</td></tr><tr><td style="text-align:left">Fútbol más/menos 2,5</td><td>48.504</td><td>potencia</td><td>potencia</td></tr><tr><td style="text-align:left">NFL ganador</td><td>5.385</td><td>odds ratio</td><td>odds ratio (también NBA y MLB)</td></tr><tr><td style="text-align:left">Tenis</td><td>sin historial</td><td>–</td><td>potencia (recomendado para tenis)</td></tr><tr><td style="text-align:left">Goleadores (sí/no)</td><td>sin historial</td><td>–</td><td>potencia</td></tr></table></div><p class="meta">Métodos: proporcional, aditivo, potencia, Shin y odds ratio. Prueba del 26/10/2026.</p></div>
 <h3>¿Qué método predice mejor? ${ib("logloss")}</h3><div class="panel"><div class="tw"><table><tr><th>Método</th><th>Brier ${ib("brier")}</th><th>Log loss</th><th>Partidos</th></tr>
 <tr><td>Mercado sin margen</td><td><b>${f(M.prueba.mercado.brier)}</b></td><td><b>${f(M.prueba.mercado.logloss)}</b></td><td>${M.prueba.mercado.n.toLocaleString("es-AR")}</td></tr>
 <tr><td>Modelo propio ${KX}</td><td>${f(M.prueba.modelo.brier)}</td><td>${f(M.prueba.modelo.logloss)}</td><td>${M.prueba.modelo.n.toLocaleString("es-AR")}</td></tr>
 <tr><td>Mezcla (peso elegido con 2022–2025: ${pc(M.pesoMezcla)})</td><td>${f(M.prueba.mezcla.brier)}</td><td>${f(M.prueba.mezcla.logloss)}</td><td>${M.prueba.mezcla.n.toLocaleString("es-AR")}</td></tr>
 <tr><td>Sin información (33% cada uno)</td><td>${f(M.prueba.uniforme.brier)}</td><td>${f(M.prueba.uniforme.logloss)}</td><td></td></tr></table></div>
 <p class="meta">Período de prueba: ${esc(M.prueba.periodo)}. Más bajo es mejor. <b>Conclusión:</b> el mercado predice mejor que el modelo propio, y mezclarlos no mejora nada (el mejor peso para el modelo fue 0). El modelo queda como referencia experimental y no genera señales.</p></div>
 <h3>Calibración ${ib("calibracion")}</h3><div class="panel">${calibSvg(M.calibracion)}<div class="legend"><span><i style="background:var(--g)"></i>Mercado</span><span><i style="background:#7f97b9"></i>Modelo</span><span><i style="background:var(--mu)"></i>Perfecta</span></div><p class="meta">Cada punto agrupa predicciones de un rango (el tamaño indica cuántas). Si cae sobre la diagonal, las probabilidades se cumplen. Fuera de muestra.</p></div>
 <h3>Backtest de la regla de señales</h3><div class="panel"><p style="margin:0 0 8px">Regla: valor entre 2% y 25%, cuota de 8 o menos, probabilidad justa de Betfair/Pinnacle/promedio con cuotas de apertura, 1 unidad por apuesta.</p><div class="tw"><table><tr><th>Cuota usada</th><th>Apuestas</th><th>Aciertos</th><th>Cuota prom.</th><th>Rendimiento ${ib("roi")}</th><th>CLV ${ib("clv")}</th><th>Caída máx. ${ib("drawdown")}</th></tr>${[["Mejor del mercado",B.max],["Casas identificadas",B.nombradas],["Solo Bet365",B.b365]].map(([n,b])=>`<tr><td>${n}</td><td>${b.apuestas.toLocaleString("es-AR")}</td><td>${pc(b.aciertos)}</td><td>${od(b.cuotaPromedio)}</td><td>${sg(b.roi)}<div class="meta">± ${pc(b.errorRoi,1)}</div></td><td>${sg(b.clvPromedio)}<div class="meta">${pc(b.clvPositivo)} a favor</div></td><td>${Math.round(b.caidaMax)} u</td></tr>`).join("")}</table></div>
 ${svgLine([{pts:B.max.curva,c:"var(--g)"}],600,190,{label:"Ganancia acumulada de la regla con la mejor cuota del mercado"})}<p class="meta">Ganancia acumulada en unidades con la mejor cuota del mercado, apuesta por apuesta.</p>
 <h4>Por temporada (mejor cuota del mercado)</h4><div class="tw"><table><tr><th>Temporada</th><th>Apuestas</th><th>Rendimiento</th></tr>${Object.entries(B.max.porTemporada).map(([k,v])=>`<tr><td>20${k.slice(0,2)}/${k.slice(2)}</td><td>${v.n}</td><td class="${v.roi>0?"pos":"neg"}">${sg(v.roi)}</td></tr>`).join("")}</table></div>
 <h4>Por rango de cuota</h4><div class="tw"><table><tr><th>Cuota</th><th>Apuestas</th><th>Rendimiento</th></tr>${B.max.porCuota.map(x=>`<tr><td>${x.rango}</td><td>${x.n}</td><td class="${x.roi>0?"pos":"neg"}">${sg(x.roi)}</td></tr>`).join("")}</table></div></div>
 ${V.sensibilidad?sensBlock(V):""}
 <h3>Probá la regla vos</h3><div class="panel" id="btBox"><div class="skel"></div><p class="meta">Cargando el detalle del backtest…</p></div>
 <div class="note"><b>Qué se puede afirmar:</b> con la mejor cuota del mercado, la regla le ganó a la cuota de cierre en ${pc(B.max.clvPositivo)} de ${B.max.apuestas.toLocaleString("es-AR")} apuestas (CLV ${sg(B.max.clvPromedio)}): es evidencia sólida de que encuentra precios mejores que el mercado final. La ganancia (${sg(B.max.roi)}) todavía no está demostrada estadísticamente (±${pc(B.max.errorRoi,1)}) y tuvo temporadas negativas. Con casas que se pueden usar desde Argentina la ventaja es menor. <b>Diferencia con la guía:</b> el +3,8% de la guía original no se pudo reproducir con exactitud porque no se conservaron sus reglas y datos; esta es la versión reproducible.</div>`}
function sensBlock(V){const S=V.sensibilidad.filter(s=>s.cuota==="max"),H=V.seleccionHonesta&&V.seleccionHonesta.max,f=x=>String(x*100).replace(".",",");
 const cell=(vmin,omax)=>{const s=S.find(x=>x.vmin===vmin&&x.vmax===0.25&&x.omax===omax);return s?`<td class="${s.roi-s.err>0?"pos":""}">${sg(s.roi)}<div class="meta">±${pc(s.err,1)} · ${s.n.toLocaleString("es-AR")}</div></td>`:"<td>–</td>"};
 return`<h3>¿Depende de los umbrales elegidos? ${ib("sensibilidad")}</h3><div class="panel"><p style="margin:0 0 8px">La misma regla con otros umbrales (valor máximo 25%, mejor cuota del mercado). Cada celda: rendimiento ± margen y cantidad de apuestas.</p>
 <div class="tw"><table><tr><th>Valor desde</th><th>Cuota ≤ 4</th><th>Cuota ≤ 8 (actual)</th><th>Cuota ≤ 15</th></tr>${[0.01,0.02,0.03,0.05].map(v=>`<tr><td>${f(v)}%${v===0.02?" (actual)":""}</td>${cell(v,4)}${cell(v,8)}${cell(v,15)}</tr>`).join("")}</table></div>
 <p class="meta">En verde: el rendimiento sigue siendo positivo aun restando el margen de error. Que las cuotas bajas rindan más es consistente en todas las filas, pero elegir la mejor celda mirando todos los datos infla el resultado.</p>
 ${H?`<p style="margin:8px 0 0"><b>Prueba honesta:</b> eligiendo los umbrales solo con 2018/19–2024/25, la mejor combinación fue valor desde ${f(H.elegido.vmin)}% y cuota ≤ ${H.elegido.omax}. En las temporadas 2025/26–2026/27, que no se usaron para elegir, rindió ${sg(H.prueba.roi)} ± ${pc(H.prueba.err,1)} (${H.prueba.n.toLocaleString("es-AR")} apuestas), contra ${sg(H.actualEnPrueba.roi)} ± ${pc(H.actualEnPrueba.err,1)} de la regla actual. Con tan pocas apuestas la diferencia no es concluyente, así que la web mantiene los umbrales actuales. Podés cambiarlos en Ajustes.</p>`:""}</div>`}
/* ---------- backtest elegible (se descarga solo si se abre) ---------- */
let CUBE=undefined;const BT=Object.assign({c:"max",lg:"",s0:"1819",s1:"2627",b:"0123"},store.get("acc_bt",{}));
async function loadCube(){if(CUBE===undefined){try{CUBE=await fetchJSON(API+"?api=backtest",25000)}catch(e){CUBE=null}}renderCube()}
function renderCube(){const el=$("btBox");if(!el||ROUTE.a!=="modelos")return;
 if(!CUBE){el.innerHTML=`<p class="meta">No se pudo cargar el detalle del backtest. <button class="btn sm lt" id="btRetry">Reintentar</button></p>`;$("btRetry").onclick=()=>{CUBE=undefined;loadCube()};return}
 const seasons=[...new Set(Object.keys(CUBE.max).map(k=>k.split("|")[1]))].sort(),sl=s=>"20"+s.slice(0,2)+"/"+s.slice(2);
 const agg={},per={};let n=0,pr=0,p2=0,w=0,cs=0,cn=0,cp=0;
 Object.entries(CUBE[BT.c]||{}).forEach(([k,x])=>{const[lg,s,b]=k.split("|");if(BT.lg&&lg!==BT.lg)return;if(s<BT.s0||s>BT.s1)return;if(!BT.b.includes(b))return;n+=x[0];pr+=x[1];p2+=x[2];w+=x[3];cs+=x[4];cn+=x[5];cp+=x[6];const q=per[s]=per[s]||[0,0];q[0]+=x[0];q[1]+=x[1]});
 const roi=n?pr/n:0,sd=n>1?Math.sqrt(Math.max(0,(p2-pr*pr/n)/(n-1))):0,err=n?1.96*sd/Math.sqrt(n):0;
 const o=(v,l,c)=>`<option value="${v}"${String(v)===String(c)?" selected":""}>${esc(l)}</option>`;
 el.innerHTML=`<p style="margin:0 0 8px">Elegí qué parte de la historia mirar. La regla es siempre la misma: ${esc(CUBE.regla)}.</p>
 <div class="efs"><div class="ef"><label for="bt_c">Cuota usada</label><select id="bt_c" data-bt="c">${o("max","Mejor del mercado",BT.c)}${o("nombradas","Casas identificadas",BT.c)}${o("b365","Solo Bet365",BT.c)}</select></div>
 <div class="ef"><label for="bt_lg">Liga</label><select id="bt_lg" data-bt="lg">${o("","Todas",BT.lg)}${Object.entries(CUBE.ligas).sort((a,b)=>a[1].localeCompare(b[1])).map(([k,v])=>o(k,v,BT.lg)).join("")}</select></div>
 <div class="ef"><label for="bt_s0">Desde</label><select id="bt_s0" data-bt="s0">${seasons.map(s=>o(s,sl(s),BT.s0)).join("")}</select></div>
 <div class="ef"><label for="bt_s1">Hasta</label><select id="bt_s1" data-bt="s1">${seasons.map(s=>o(s,sl(s),BT.s1)).join("")}</select></div></div>
 <div class="ef"><label>Rango de cuota</label><div class="chips" style="margin:4px 0 0">${CUBE.rangos.map((r,i)=>`<button class="chip${BT.b.includes(i)?" on":""}" data-bb="${i}" aria-pressed="${BT.b.includes(i)}">${r.replace(".",",")}</button>`).join("")}</div></div>
 ${n?`<div class="stat3" style="margin-top:10px"><div class="st"><div class="k2">Apuestas</div><div class="v">${n.toLocaleString("es-AR")}</div></div><div class="st"><div class="k2">Aciertos</div><div class="v">${pc(w/n)}</div></div><div class="st"><div class="k2">Rendimiento ${ib("roi")}</div><div class="v ${roi>0?"pos":"neg"}">${sg(roi)}</div><div class="meta">± ${pc(err,1)}</div></div><div class="st"><div class="k2">Le ganó al cierre ${ib("clv")}</div><div class="v">${cn?pc(cp/cn):"–"}</div><div class="meta">CLV ${cn?sg(cs/cn):"–"}</div></div></div>
 <p class="meta">${roi-err>0?"El rendimiento es positivo aun restando el margen de error.":roi+err<0?"El rendimiento es negativo aun sumando el margen de error.":"El margen de error incluye el cero: con esta muestra no se puede afirmar si gana o pierde."} ${n<500?"Con menos de 500 apuestas el resultado es casi todo azar. ":""}Probar muchas combinaciones y quedarse con la mejor infla el resultado.</p>
 <div class="tw"><table><tr><th>Temporada</th><th>Apuestas</th><th>Rendimiento</th></tr>${Object.keys(per).sort().map(s=>`<tr><td>${sl(s)}</td><td>${per[s][0]}</td><td class="${per[s][1]>0?"pos":"neg"}">${sg(per[s][1]/per[s][0])}</td></tr>`).join("")}</table></div>`:`<div class="empty">No hay apuestas con esa selección.</div>`}`;
 el.querySelectorAll("[data-bt]").forEach(s=>s.onchange=()=>{BT[s.dataset.bt]=s.value;if(BT.s0>BT.s1){const x=BT.s0;BT.s0=BT.s1;BT.s1=x}store.set("acc_bt",BT);renderCube()});
 el.querySelectorAll("[data-bb]").forEach(b=>b.onclick=()=>{const i=b.dataset.bb;BT.b=BT.b.includes(i)?BT.b.replace(i,""):(BT.b+i).split("").sort().join("");if(!BT.b)BT.b=i;store.set("acc_bt",BT);renderCube()})}
async function estado(){const el=$("v-mas"),back=`<button class="back" onclick="location.hash='#/mas'">‹ Más</button>`;let S=null,err=null;try{S=await fetchJSON(API+"?api=estado")}catch(e){err=String(e.message||e)}
 if(ROUTE.v!=="mas"||ROUTE.a!=="estado")return;
 const src=(k,label)=>{const s=P&&P.sources&&P.sources[k];const sv=S&&S.fuentes&&S.fuentes[k];const x=sv||s||{};return`<tr><td>${label}</td><td>${x.at?fmtDT(Date.parse(x.at)):"–"}</td><td>${x.checked?fmtDT(Date.parse(x.checked)):"–"}</td><td>${x.error?`<span class="badge r">Error</span> ${esc(x.error)}`:x.at?'<span class="badge g">OK</span>':"–"}</td></tr>`};
 el.innerHTML=back+`<h2>Estado de los datos</h2>
 ${err?`<div class="alert red">No se pudo consultar el servidor (${esc(err)}). ${P?"Se muestra lo que hay en la última copia.":""}</div>`:""}
 <div class="panel"><h4>Fuentes</h4><div class="tw"><table><tr><th>Archivo</th><th>Publicado por la fuente</th><th>Último control</th><th>Estado</th></tr>${src("fixtures","Ligas europeas principales")}${src("newFixtures","Argentina y otras ligas")}</table></div>
 <p class="meta">"Publicado por la fuente" es la fecha de modificación que informa football-data.co.uk para ese archivo; si no la informa, se usa la hora en que el servidor lo vio por primera vez. El servidor controla cada 3 horas; football-data.co.uk publica cuotas nuevas 2 o 3 veces por semana.</p>
 <div class="kv"><div>Paquete generado</div><div>${P?fmtDT(Date.parse(P.generated)):"–"}</div><div>Partidos en el paquete</div><div>${P?P.counts.matches:"–"}</div><div>Repetidos quitados</div><div>${P?P.counts.duplicates:"–"}</div><div>Excluidos por datos inválidos</div><div>${P?P.counts.excluded:"–"}</div><div>Resultados y estadísticas</div><div>${S&&S.resultados?fmtDT(Date.parse(S.resultados.at))+" · "+S.resultados.files+" archivos":"–"}</div><div>Copia en este dispositivo</div><div>${SRC==="cache"?"sí (sin conexión al servidor)":SRC==="api"?"actualizada":"no"}</div></div></div>
 ${S&&S.log?`<div class="panel"><h4>Registro de las últimas tareas</h4><div class="tw"><table><tr><th>Momento</th><th>Tarea</th><th>Paso</th><th>Estado</th><th style="text-align:left">Detalle</th></tr>${S.log.map(l=>`<tr><td>${fmtDT(Date.parse(l.at))}</td><td>${esc(l.tarea)}</td><td>${esc(l.paso)}</td><td>${l.estado==="ok"?'<span class="badge g">ok</span>':l.estado==="error"?'<span class="badge r">error</span>':`<span class="badge n">${esc(l.estado)}</span>`}</td><td style="text-align:left">${esc(l.detalle)}</td></tr>`).join("")}</table></div></div>`:""}
 ${P&&P.op&&P.op.configured?`<div class="panel"><h4>Bet365 Argentina · OddsPapi (plan gratis)</h4><div class="kv"><div>Consultas que quedan este mes</div><div>${P.op.limit!=null?(P.op.limit-P.op.used)+" de "+P.op.limit:"–"}</div><div>Partidos de fútbol con cuota de Bet365 Argentina</div><div>${P.op.matched}</div><div>Última descarga</div><div>${P.op.lastAt?fmtDT(Date.parse(P.op.lastAt))+" · "+ago(Date.parse(P.op.lastAt)):"todavía ninguna"}</div></div></div>`:""}
 <div class="panel"><h4>Cuotas actualizadas · The Odds API (plan gratis)</h4>${P&&P.oa&&P.oa.configured?`<div class="kv"><div>Créditos que quedan este mes</div><div>${P.oa.remaining!=null?P.oa.remaining:"–"} de 500</div><div>Partidos con cuotas actualizadas</div><div>${P.oa.matched}</div><div>Última descarga</div><div>${P.oa.lastAt?fmtDT(Date.parse(P.oa.lastAt)):"–"}</div></div>${P.oa.last&&Object.keys(P.oa.last).length?`<div class="tw" style="margin-top:8px"><table><tr><th>Liga</th><th>Descargada</th></tr>${Object.entries(P.oa.last).sort((a,b)=>a[1]<b[1]?1:-1).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${fmtDT(Date.parse(v))}</td></tr>`).join("")}</table></div>`:""}`:`<p class="meta">Sin configurar.</p>`}<p class="meta">500 créditos por mes: se reparten entre los días que faltan, primero Argentina y las ligas principales, solo con partidos en las próximas 36 h, y otra vez unas horas antes del partido. Trae Pinnacle, Betfair Exchange y ~20 casas europeas; no incluye casas argentinas.</p></div>
 <div class="note"><b>API-Football:</b> la cuenta gratis funciona, pero solo da acceso a las temporadas 2022–2024. Para alineaciones y lesiones de la temporada actual hace falta un plan pago (desde US$19 por mes): no se usa.</div>`}
function fuentes(){return`<h2>Fuentes y casas de apuestas</h2>
 <div class="panel"><h4>De dónde salen los datos</h4><div class="kv"><div>Partidos, cuotas, resultados</div><div>football-data.co.uk</div><div>Cuotas actualizadas</div><div>The Odds API (plan gratis): Pinnacle, Betfair Exchange y casas europeas, varias veces por día en las ligas principales y Argentina</div><div>Bet365 Argentina</div><div>OddsPapi (plan gratis, 250 consultas por mes): cuotas de bet365.bet.ar para Liga Profesional, Premier, LaLiga, Serie A, Bundesliga, Ligue 1, NBA, NFL y tenis ATP/WTA, cada 3 h como máximo, con la hora de cada cuota.</div><div>Tenis, NBA, NFL y béisbol</div><div>The Odds API (mismo plan): ganador del partido de Pinnacle y casas europeas, cuando hay partidos en las próximas 36 h. Béisbol aparece solo durante la temporada de la MLB (marzo a octubre). Solo mercado: sin modelo propio validado. Resultados automáticos con The Odds API (1 vez por día).</div><div>Goleadores</div><div>"Anota en cualquier momento" en los 10 partidos más importantes de la semana de las 5 ligas grandes: cuota justa con casas de EE. UU. (The Odds API) y cuota de Bet365 Argentina (OddsPapi). Resultado del jugador con OddsPapi.</div><div>Casas con nombre</div><div>Bet365, Betfred, BetVictor, Bwin, Paddy Power, Sky Bet, Pinnacle, Betfair Exchange</div><div>Mercados con cuotas</div><div>1X2 · más/menos 2,5 · hándicap asiático</div><div>Estadísticas</div><div>Goles, remates, córners, tarjetas; xG en algunas ligas</div><div>Frecuencia</div><div>2–3 veces por semana (el servidor controla cada 3 h)</div></div></div>
 <div class="panel"><h4>Casas argentinas</h4><div class="tw"><table><tr><th>Casa</th><th>API pública</th><th>Fuente autorizada</th><th>Qué se puede hacer</th></tr>
 <tr><td>Casino Club</td><td>No encontrada</td><td>No</td><td style="text-align:left">Cargar la cuota a mano en la ficha</td></tr>
 <tr><td>Betano (Argentina)</td><td>No</td><td>No para Argentina (The Odds API la tiene solo en Reino Unido y Canadá)</td><td style="text-align:left">Cargar la cuota a mano en la ficha</td></tr>
 <tr><td>BetWarrior</td><td>No encontrada</td><td>No</td><td style="text-align:left">Cargar la cuota a mano en la ficha</td></tr></table></div>
 <p class="meta">No se usan programas que copien cuotas de las páginas de las casas: van contra sus condiciones de uso. Revisado el 25/10/2026.</p></div>
 <div class="panel"><h4>Lo que no hay</h4><p style="margin:0">Partidos en vivo, alineaciones, lesiones y sanciones (API-Football gratis solo cubre 2022–2024), cuotas de córners, tarjetas, descanso/final y jugadores. Se muestran como "no disponible" en vez de inventar números.</p></div>`}
function ajustes(){const L={fresh:"Cuota reciente hasta (horas)",stale:"Cuota vieja hasta (horas); después, vencida",vmin:"Señal desde (% de valor)",vmax:"Señal hasta (% de valor; más es sospechoso)",omax:"Cuota máxima para marcar señal",live:"Horas que dura un partido"};
 return`<h2>Ajustes</h2><p class="lead">Cambian qué se considera señal y cuándo una cuota es vieja. Se guardan solo en este dispositivo. Los valores originales son los que se probaron en el backtest. Con "Que operan en Argentina" la regla rindió +0,1% ± 6,5% en 2.684 apuestas: sin ventaja demostrada, pero son cuotas que de verdad se pueden tomar.</p><div class="cfg">${Object.keys(L).map(k=>`<label for="cfg_${k}">${L[k]}</label><input id="cfg_${k}" data-cfg="${k}" inputmode="decimal" value="${String(CFG[k]).replace(".",",")}">`).join("")}<label for="cfg_casas">Casas para las señales</label><select id="cfg_casas"><option value="ar"${CFG.casas==="ar"?" selected":""}>Que operan en Argentina (Bet365)</option><option value="id"${CFG.casas==="id"?" selected":""}>Todas las casas con nombre (incluye europeas)</option><option value="all"${CFG.casas==="all"?" selected":""}>Todas, incluso "mejor cuota" sin nombre</option></select></div><button class="btn lt sm" id="cfgReset">Volver a los valores originales</button><p class="meta" id="cfgMsg"></p>`}
function bindAjustes(){document.querySelectorAll("[data-cfg]").forEach(i=>i.onchange=()=>{const v=pnum(i.value);if(v>0){CFG[i.dataset.cfg]=v;saveCFG();derive();$("cfgMsg").textContent="Guardado."}else i.value=String(CFG[i.dataset.cfg]).replace(".",",")});$("cfg_casas").onchange=e=>{CFG.casas=e.target.value;saveCFG();derive();$("cfgMsg").textContent="Guardado."};$("cfgReset").onclick=()=>{CFG=Object.assign({},CFG_DEF);saveCFG();derive();renderMas("ajustes")}}
function juego(){return`<h2>Juego responsable</h2><div class="note red"><b>Esta página no garantiza ganar.</b> Aun con un método que le gana al mercado, hubo caídas de casi 100 unidades. Nunca apuestes plata que necesitás.</div>
 <div class="panel"><h4>Herramientas para cuidarte</h4><p style="margin:0">En <a href="#/registro">Registro → Mi banca, mi límite y pausa</a> podés fijar cuánto aceptás perder por semana o mes, y pausar el registro 7 días. La herramienta <a href="#/herramientas">Simulador</a> muestra qué rachas son normales.</p></div>
 <div class="panel"><h4>Señales de alerta</h4><ul style="margin:0;padding-left:18px"><li>Apostar más para recuperar lo perdido.</li><li>Esconder cuánto apostás.</li><li>Pedir plata prestada para apostar.</li><li>Sentir ansiedad cuando no apostás.</li></ul></div>
 <div class="panel"><h4>Dónde pedir ayuda</h4><div class="kv"><div>CABA</div><div>0800-666-6006</div><div>Provincia de Buenos Aires</div><div>0800-444-4000</div></div><p class="meta">Atención gratuita.</p></div>`}

/* ---------- pausa y exposición ---------- */
function paused(){return S&&S.pausedUntil&&S.pausedUntil>Date.now()}
function renderPause(){const b=$("pauseBtn");if(!b)return;if(paused()){b.textContent="Quitar la pausa";$("pauseMsg").textContent=`Registro en pausa hasta el ${new Date(S.pausedUntil).toLocaleDateString("es-AR")}. Mientras tanto no se pueden anotar apuestas nuevas.`}else{b.textContent="Pausar el registro 7 días";$("pauseMsg").textContent=""}}
$("pauseBtn").onclick=()=>{if(paused()){if(!confirmPause())return;S.pausedUntil=0}else S.pausedUntil=Date.now()+7*864e5;saveS();renderPause()};
let _unp=0;function confirmPause(){if(Date.now()-_unp<5000)return true;_unp=Date.now();$("pauseMsg").textContent="¿Seguro? Tocá de nuevo para quitar la pausa. Tomarte un descanso suele ser buena idea.";return false}
const _addBet=addBet;addBet=function(d,o,s,x){if(paused()){$("aMsg").textContent="El registro está en pausa: no se anotan apuestas nuevas.";return}_addBet(d,o,s,x)};

/* ---------- arranque ---------- */
toolHome();renderBets();renderPause();renderChips();
if(!location.hash)location.hash="#/partidos";
// Enlaces internos: se resuelven con el hash para que funcionen también dentro de un marco (Google Sites).
document.addEventListener("click",e=>{const a=e.target.closest('a[href^="#"]');if(a){e.preventDefault();location.hash=a.getAttribute("href")}});
route();loadData();
setInterval(()=>{derive();if(ROUTE.v==="partidos"||ROUTE.v==="oportunidades")render()},60000);
