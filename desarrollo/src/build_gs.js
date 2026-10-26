// Arma Code.gs = core.js + gas.js + la web v5 (con la URL de la API) como texto.
const fs=require('fs');
const app=fs.readFileSync('app5.html','utf8');
const gs=fs.readFileSync('core.js','utf8').replace(/\nif \(typeof module[\s\S]*$/,'\n')+'\n'+fs.readFileSync('gas.js','utf8')+'\n/* ---------- ratings iniciales del modelo de tenis en prueba (Jeff Sackmann, CC BY-NC-SA 4.0) ---------- */\nvar TENNIS_ELO_INIT = '+fs.readFileSync('tenis_elo.json','utf8')+';\n/* ---------- web v5 (se sirve con ?api=app) ---------- */\nvar APP_HTML = '+JSON.stringify(app)+';\n/* ---------- backtest por liga, temporada y cuota (se sirve con ?api=backtest) ---------- */\nvar BACKTEST_CUBE = '+JSON.stringify(fs.readFileSync('cubo_backtest.json','utf8'))+';\n';
fs.writeFileSync('Code.gs',gs);console.log('Code.gs',gs.length,require('crypto').createHash('sha256').update(gs).digest('hex'));
