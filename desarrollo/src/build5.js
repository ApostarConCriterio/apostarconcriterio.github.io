const fs=require('fs');
const API='https://script.google.com/macros/s/AKfycbxR2phSdvly1VeKvTZcAjF0HZuPsk2WQze1Pv2H3crIiU23p_shqYWqp5HkhC4IAR8SKg/exec';
const api=process.argv[2]||API;
const V=JSON.parse(fs.readFileSync('validacion.json','utf8'));
// curva reducida para la web
['max','nombradas','b365'].forEach(k=>{if(k!=='max')delete V.backtest[k].curva});
if(V.sensibilidad)V.sensibilidad=V.sensibilidad.filter(s=>s.cuota==='max').map(s=>({cuota:s.cuota,vmin:s.vmin,vmax:s.vmax,omax:s.omax,n:s.n,roi:s.roi,err:s.err}));
const main=fs.readFileSync('main.js','utf8'),cut=main.indexOf('/* ---------- pausa');
const js=fs.readFileSync('gl.js','utf8')+'\n'+main.slice(0,cut).replace('"/*API*/"',JSON.stringify(api)).replace('/*VALID*/null',JSON.stringify(V))+'\n'+fs.readFileSync('tools_registro.js','utf8')+'\n'+main.slice(cut);
let shell=fs.readFileSync('app5_shell.html','utf8');
const MIN=process.env.NOMIN?null:require('/home/claude/web/v3/node_modules/terser');
(async()=>{let code=js;if(MIN){const r=await MIN.minify(js,{compress:{passes:2},mangle:true});code=r.code}
const out=shell+'\n<script>\n'+code+'\n</script>\n';
if(out===shell)throw new Error('no </body>');
fs.writeFileSync('app5.html',out);console.log('app5.html',out.length,'bytes');})();
