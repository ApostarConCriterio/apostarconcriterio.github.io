// Backtest y validación reproducibles con el MISMO código que usa la web (core.js).
// Regla: solo se usa información disponible antes de cada partido (validación temporal).
const fs = require('fs'), C = require('./core.js');
const rd = f => C.parseCsv(fs.readFileSync(f, 'utf8'));
const LGS = Object.keys(C.MAIN_LEAGUES);
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : null; };
const tri = (r, p) => { const o = [num(r[p + 'H']), num(r[p + 'D']), num(r[p + 'A'])]; return o.every(x => x && x > 1.001) ? o : null; };
const imp = o => o.reduce((s, x) => s + 1 / x, 0);

const games = [];
const SEASONS = ['1819','1920','2021','2122','2223','2324','2425','2526','2627'];
for (const lg of LGS) for (const s of SEASONS) {
  const f = `res/${s}_${lg}.csv`; if (!fs.existsSync(f)) continue;
  rd(f).forEach(r => {
    const ts = C.ukToUtcMs(r.Date, r.Time), hg = num(r.FTHG), ag = num(r.FTAG); if (ts === null || hg === null || ag === null) return;
    games.push({ lg, season: s, ts, home: r.HomeTeam, away: r.AwayTeam, hg, ag, res: hg > ag ? 0 : hg === ag ? 1 : 2,
      bfe: tri(r, 'BFE'), ps: tri(r, 'PS'), avg: tri(r, 'Avg'), max: tri(r, 'Max'), b365: tri(r, 'B365'),
      named: ['B365', 'BFD', 'BV', 'BW', 'PP', 'SKB'].map(b => tri(r, b)).filter(Boolean),
      avgC: tri(r, 'AvgC'), bfeC: tri(r, 'BFEC'), psC: tri(r, 'PSC'), maxC: tri(r, 'MaxC') });
  });
}
games.sort((a, b) => a.ts - b.ts);
console.error('partidos con resultado:', games.length);

function fairOpen(g) { for (const o of [g.bfe, g.ps, g.avg]) if (o) { const s = imp(o); if (s > 0.97 && s < 1.12) return C.powerFair(o); } return null; }
function fairClose(g) { for (const o of [g.bfeC, g.psC, g.avgC]) if (o) { const s = imp(o); if (s > 0.97 && s < 1.12) return C.powerFair(o); } return null; }

// --- Modelo propio con datos previos a cada partido ---
const byLg = {}; games.forEach(g => (byLg[g.lg] = byLg[g.lg] || []).push(g));
const cacheStr = {};
function strengthsAt(lg, ts) { const day = Math.floor(ts / 864e5); const k = lg + day; if (!cacheStr[k]) cacheStr[k] = C.teamStrengths(byLg[lg].map(g => ({ ts: g.ts, home: g.home, away: g.away, hg: g.hg, ag: g.ag })), day * 864e5); return cacheStr[k]; }

const rows = [];
for (const g of games) {
  const fm = fairOpen(g); if (!fm) continue;
  const st = strengthsAt(g.lg, g.ts); const mp = st ? C.modelPredict(st, g.home, g.away) : null;
  rows.push({ g, fm, mp: mp ? mp.x12 : null, fc: fairClose(g) });
}
const brier = (p, y) => p.reduce((s, x, i) => s + (x - (i === y ? 1 : 0)) ** 2, 0);
const ll = (p, y) => -Math.log(Math.max(1e-9, p[y]));
function score(set, f) { let b = 0, l = 0, n = 0; set.forEach(r => { const p = f(r); if (!p) return; b += brier(p, r.g.res); l += ll(p, r.g.res); n++; }); return { n, brier: +(b / n).toFixed(4), logloss: +(l / n).toFixed(4) }; }
const valid = rows.filter(r => r.mp && ['2223','2324','2425'].includes(r.g.season)), test = rows.filter(r => r.mp && ['2526','2627'].includes(r.g.season));
const blend = w => r => r.fm.map((x, i) => (1 - w) * x + w * r.mp[i]);
// El peso de la mezcla se elige SOLO con 2025/26 y se prueba en 2026/27.
let bestW = 0, bestL = 1e9; for (let w = 0; w <= 0.5001; w += 0.05) { const s = score(valid, blend(w)); if (s.logloss < bestL) { bestL = s.logloss; bestW = +w.toFixed(2); } }
const models = {
  validacion: { periodo: '2022/23 a 2024/25', mercado: score(valid, r => r.fm), modelo: score(valid, r => r.mp), mezcla: score(valid, blend(bestW)) },
  prueba: { periodo: '2025/26 y 2026/27 (fuera de muestra)', mercado: score(test, r => r.fm), modelo: score(test, r => r.mp), mezcla: score(test, blend(bestW)), uniforme: score(test, () => [1 / 3, 1 / 3, 1 / 3]) },
  pesoMezcla: bestW
};
// Calibración del mercado y del modelo (fuera de muestra)
function calib(set, f) { const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 })); set.forEach(r => { const p = f(r); p.forEach((x, i) => { const b = Math.min(9, Math.floor(x * 10)); bins[b].n++; bins[b].p += x; bins[b].y += (i === r.g.res ? 1 : 0); }); }); return bins.filter(b => b.n >= 20).map(b => ({ n: b.n, prob: +(b.p / b.n).toFixed(3), real: +(b.y / b.n).toFixed(3) })); }
models.calibracion = { mercado: calib(test, r => r.fm), modelo: calib(test, r => r.mp) };

// --- Backtest de la regla de la web: valor entre 2% y 25%, cuota ≤ 8 ---
function backtest(bookPick, label, o) {
  o = o || { vmin: 0.02, vmax: 0.25, omax: 8 };
  const bets = [];
  for (const r of rows) {
    if (o.seasons && !o.seasons.includes(r.g.season)) continue;
    const g = r.g, best = bookPick(g); if (!best) continue;
    let pick = -1, pv = o.vmin;
    for (let i = 0; i < 3; i++) { const ev = best[i] * r.fm[i] - 1; if (ev > pv && ev <= o.vmax && best[i] <= o.omax) { pv = ev; pick = i; } }
    if (pick < 0) continue;
    const won = g.res === pick, pnl = won ? best[pick] - 1 : -1;
    const clv = r.fc ? best[pick] * r.fc[pick] - 1 : null;
    bets.push({ ts: g.ts, lg: g.lg, season: g.season, odd: best[pick], ev: pv, won, pnl, clv });
  }
  let cum = 0, peak = 0, mdd = 0; bets.forEach(b => { cum += b.pnl; peak = Math.max(peak, cum); mdd = Math.max(mdd, peak - cum); });
  const n = bets.length, profit = bets.reduce((s, b) => s + b.pnl, 0), sd = Math.sqrt(bets.reduce((s, b) => s + (b.pnl - profit / n) ** 2, 0) / Math.max(1, n - 1));
  const clvs = bets.filter(b => b.clv !== null);
  const bySeason = {}; bets.forEach(b => { const s = bySeason[b.season] = bySeason[b.season] || { n: 0, pnl: 0 }; s.n++; s.pnl += b.pnl; });
  const byOdds = [[1, 2], [2, 3], [3, 5], [5, 8.01]].map(([a, b]) => { const x = bets.filter(t => t.odd >= a && t.odd < b); const p = x.reduce((s, t) => s + t.pnl, 0); return { rango: `${a}–${b > 8 ? 8 : b}`, n: x.length, roi: x.length ? +(p / x.length).toFixed(4) : null }; });
  const curve = []; cum = 0; bets.forEach((b, i) => { cum += b.pnl; if (i % Math.max(1, Math.floor(n / 120)) === 0 || i === n - 1) curve.push([new Date(b.ts).toISOString().slice(0, 10), +cum.toFixed(2)]); });
  return { regla: label, apuestas: n, aciertos: +(bets.filter(b => b.won).length / n).toFixed(4), cuotaPromedio: +(bets.reduce((s, b) => s + b.odd, 0) / n).toFixed(2),
    ganancia: +profit.toFixed(2), roi: +(profit / n).toFixed(4), errorRoi: +(1.96 * sd / Math.sqrt(n)).toFixed(4), caidaMax: +mdd.toFixed(2),
    clvPromedio: clvs.length ? +(clvs.reduce((s, b) => s + b.clv, 0) / clvs.length).toFixed(4) : null, clvPositivo: clvs.length ? +(clvs.filter(b => b.clv > 0).length / clvs.length).toFixed(4) : null,
    porTemporada: Object.fromEntries(Object.entries(bySeason).map(([k, v]) => [k, { n: v.n, roi: +(v.pnl / v.n).toFixed(4) }])), porCuota: byOdds, curva: curve };
}
const bt = {
  max: backtest(g => g.max, 'Mejor cuota del mercado (casa no identificada)'),
  nombradas: backtest(g => g.named.length ? [0, 1, 2].map(i => Math.max(...g.named.map(o => o[i]))) : null, 'Mejor cuota entre casas identificadas (Bet365, Betfred, BetVictor, Bwin, Paddy Power, Sky Bet)'),
  b365: backtest(g => g.b365, 'Solo Bet365')
};
// --- Sensibilidad: la misma regla con otros umbrales (para ver si el resultado depende de un número elegido a dedo) ---
const picks = { max: g => g.max, nombradas: g => g.named.length ? [0, 1, 2].map(i => Math.max(...g.named.map(o => o[i]))) : null };
const sens = [];
for (const [k, f] of Object.entries(picks)) for (const vmin of [0.01, 0.02, 0.03, 0.05]) for (const vmax of [0.15, 0.25, 0.5]) for (const omax of [4, 8, 15]) {
  const b = backtest(f, k, { vmin, vmax, omax }); sens.push({ cuota: k, vmin, vmax, omax, n: b.apuestas, roi: b.roi, err: b.errorRoi, clv: b.clvPromedio, clvPos: b.clvPositivo, caida: b.caidaMax });
}
// Selección honesta: los umbrales se eligen con 2018/19–2024/25 y se prueban en 2025/26–2026/27 (que no se miraron al elegir).
const TRAIN = ['1819','1920','2021','2122','2223','2324','2425'], TEST = ['2526','2627'];
const honest = {};
for (const [k, f] of Object.entries(picks)) {
  let best = null;
  for (const vmin of [0.01, 0.02, 0.03, 0.05]) for (const vmax of [0.15, 0.25, 0.5]) for (const omax of [4, 8, 15]) {
    const b = backtest(f, k, { vmin, vmax, omax, seasons: TRAIN }); if (b.apuestas < 1000) continue;
    const score = b.roi - b.errorRoi; // se premia el rendimiento con menos incertidumbre
    if (!best || score > best.score) best = { vmin, vmax, omax, score, train: { n: b.apuestas, roi: b.roi, err: b.errorRoi } };
  }
  const tb = backtest(f, k, { vmin: best.vmin, vmax: best.vmax, omax: best.omax, seasons: TEST });
  const base = backtest(f, k, { vmin: 0.02, vmax: 0.25, omax: 8, seasons: TEST });
  honest[k] = { elegido: { vmin: best.vmin, vmax: best.vmax, omax: best.omax }, entrenamiento: best.train, prueba: { n: tb.apuestas, roi: tb.roi, err: tb.errorRoi, clv: tb.clvPromedio }, actualEnPrueba: { n: base.apuestas, roi: base.roi, err: base.errorRoi, clv: base.clvPromedio } };
}
// --- Cubo para el backtest elegible en la web: regla × liga × temporada × rango de cuota ---
const BUCK = [[1, 2], [2, 3], [3, 5], [5, 8.01]];
function cube(bookPick) {
  const c = {};
  for (const r of rows) {
    const g = r.g, best = bookPick(g); if (!best) continue;
    let pick = -1, pv = 0.02;
    for (let i = 0; i < 3; i++) { const ev = best[i] * r.fm[i] - 1; if (ev > pv && ev <= 0.25 && best[i] <= 8) { pv = ev; pick = i; } }
    if (pick < 0) continue;
    const odd = best[pick], b = BUCK.findIndex(([a, z]) => odd >= a && odd < z), k = g.lg + '|' + g.season + '|' + b;
    const won = g.res === pick, pnl = won ? odd - 1 : -1, clv = r.fc ? odd * r.fc[pick] - 1 : null;
    const x = c[k] = c[k] || [0, 0, 0, 0, 0, 0, 0]; // n, ganancia, ganancia², aciertos, suma CLV, n CLV, CLV positivos
    x[0]++; x[1] += pnl; x[2] += pnl * pnl; x[3] += won ? 1 : 0; if (clv !== null) { x[4] += clv; x[5]++; x[6] += clv > 0 ? 1 : 0; }
  }
  Object.values(c).forEach(x => { x[1] = +x[1].toFixed(3); x[2] = +x[2].toFixed(3); x[4] = +x[4].toFixed(4); });
  return c;
}
const cubeOut = { generado: new Date().toISOString(), regla: 'valor 2%–25%, cuota ≤ 8, probabilidad justa de apertura (Betfair → Pinnacle → promedio), 1 unidad', rangos: BUCK.map(([a, z]) => a + '–' + (z > 8 ? 8 : z)), ligas: Object.fromEntries(LGS.map(l => [l, C.MAIN_LEAGUES[l]])), campos: ['n', 'ganancia', 'ganancia2', 'aciertos', 'sumaCLV', 'nCLV', 'clvPositivos'], max: cube(picks.max), nombradas: cube(picks.nombradas), b365: cube(g => g.b365) };
fs.writeFileSync('cubo_backtest.json', JSON.stringify(cubeOut));
const out = { sensibilidad: sens, seleccionHonesta: honest, generado: new Date().toISOString(), datos: { fuente: 'football-data.co.uk (cuotas de apertura y cierre + resultados)', ligas: LGS.length, temporadas: ['2018/19 a 2025/26', '2026/27 hasta ' + new Date(games[games.length - 1].ts).toISOString().slice(0, 10)], partidos: rows.length, conModelo: rows.filter(r => r.mp).length }, modelos: models, backtest: bt };
fs.writeFileSync('validacion.json', JSON.stringify(out));
const short = JSON.parse(JSON.stringify(out)); Object.values(short.backtest).forEach(b => delete b.curva);
console.log(JSON.stringify(short, null, 1));
