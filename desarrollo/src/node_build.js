// Arma el paquete con los mismos pasos que hará Apps Script, usando archivos locales.
const fs=require('fs'), C=require('./core.js');
const rd=f=>C.parseCsv(fs.readFileSync(f,'utf8'));
const now=Date.parse(process.argv[2]||new Date().toISOString());
const fixtures=rd('fixtures.csv'), newFixtures=rd('new_league_fixtures.csv');
const results={}, resultSource={};
const lgs=new Set(fixtures.map(r=>r.Div));
for(const d of lgs){ let R=[]; for(const s of ['2526','2627']){ const f=`res/${s}_${d}.csv`; if(fs.existsSync(f)) R=R.concat(C.normalizeResults(rd(f))); } results[d]=R.sort((a,b)=>a.ts-b.ts); resultSource[d]=`football-data.co.uk temporadas 2025/26 y 2026/27 (${R.length} partidos)`; }
for(const r of newFixtures){ const c=C.NEW_LEAGUES[r.Country]; if(!c) continue; const lg=c[0]+':'+String(r.League).trim(); if(results[lg]) continue;
  const all=C.normalizeResults(rd(`res/new_${c[0]}.csv`)).filter(g=>g.ts>now-2*365*864e5); const byLg={}; all.forEach(g=>{(byLg[g.lg]=byLg[g.lg]||[]).push(g)});
  Object.assign(results,byLg); Object.keys(byLg).forEach(k=>resultSource[k]=`football-data.co.uk últimos 2 años (${byLg[k].length} partidos)`); }
const t0=Date.now();
const P=C.buildPayload({fixtures,newFixtures,results,resultSource,fetched:{fixtures:{at:new Date(now).toISOString()},newFixtures:{at:new Date(now).toISOString()}},now});
const js=JSON.stringify(P); fs.writeFileSync('payload.json',js);
console.log('ms',Date.now()-t0,'KB',Math.round(js.length/1024),'partidos',P.matches.length,'excluidos',P.counts.excluded,'dup',P.counts.duplicates);
const withForm=P.matches.filter(m=>m.form&&m.form.home.n), withModel=P.matches.filter(m=>m.model), sig=P.matches.filter(m=>m.signals.length);
console.log('con forma',withForm.length,'con modelo',withModel.length,'con señal',sig.length);
const nf=P.matches.filter(m=>!m.form||!m.form.home.n).map(m=>m.lg); console.log('sin forma:',[...new Set(nf)].join(' '));
const ex=P.matches.find(m=>m.home==='Liverpool')||withModel[0]; console.log(JSON.stringify({k:ex.key,fair:ex.fair,model:ex.model,books:Object.keys(ex.odds.x12),ou:ex.odds.ou25,ah:ex.odds.ah,sig:ex.signals,form:ex.form&&ex.form.home},null,0).slice(0,1500));
console.log('issues',JSON.stringify(P.issues.slice(0,5)));
