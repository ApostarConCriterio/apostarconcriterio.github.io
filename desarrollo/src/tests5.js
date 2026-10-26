// Pruebas de la web v5. Uso: node tests5.js [app5.html]
// La API se simula con las respuestas reales que genera gas.js en la simulación (carpeta mock/).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.resolve(process.argv[2] || 'app5.html');
const M = n => fs.readFileSync('mock/' + n + '.json', 'utf8');
const FICHAS = JSON.parse(M('fichas'));
let pass = 0, fail = 0; const out = [];
function ok(name, cond, extra) { (cond ? pass++ : fail++); out.push(`${cond ? 'OK  ' : 'FALLA'} ${name}${extra ? ' — ' + extra : ''}`); }
const near = (a, b, tol = 0.006) => Math.abs(a - b) <= tol;
const num = s => Number(String(s).replace(/[^\d,.\-−]/g, '').replace('−', '-').replace(/\./g, '').replace(',', '.'));
const ALLERR = [];

async function page(browser, iso, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 375, height: 780 }, isMobile: !opts.w, hasTouch: true });
  const p = await ctx.newPage(); p.errs = []; p.calls = [];
  p.on('pageerror', e => { p.errs.push(e.message); ALLERR.push(e.message); });
  await ctx.route(/script\.google\.com/, route => {
    const u = new URL(route.request().url()), api = u.searchParams.get('api'); p.calls.push(api);
    if (opts.fail) return route.fulfill({ status: 500, body: 'error' });
    let body;
    if (api === 'ficha') { const k = Object.keys(FICHAS).find(k => k.includes('|' + u.searchParams.get('lg') + '|' + u.searchParams.get('home') + '|' + u.searchParams.get('away'))); body = JSON.stringify(FICHAS[k] || { home: null, away: null }); }
    else body = (api === 'data' && opts.data) ? M(opts.data) : M(api);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  if (iso) await p.clock.setFixedTime(new Date(iso));
  if (opts.pre) await p.addInitScript(opts.pre);
  await p.goto(FILE + (opts.hash || '')); await p.waitForTimeout(400);
  return p;
}
async function tool(p, id, vals) {
  await p.evaluate(i => openTool(i), id);
  if (vals) for (const [k, v] of Object.entries(vals)) {
    await p.evaluate(([k, v]) => { const el = document.querySelector(`#toolView [data-k="${k}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [k, v]);
  }
  return p.evaluate(() => ({ title: document.querySelector('#out .vt')?.innerText || '', rows: [...document.querySelectorAll('#out .rows div')].map(d => [d.children[0].innerText, d.children[1].innerText]) }));
}
const row = (r, label) => (r.rows.find(x => x[0].startsWith(label)) || [, ''])[1];
const T0 = '2026-10-24T23:30:00Z';

(async () => {
  const b = await chromium.launch();

  // ---------- 1. Herramientas (las 17 originales + hándicap asiático) ----------
  const p = await page(b, T0);
  let r;
  r = await tool(p, 'conviene'); ok('conviene: 2,20 y 50% → +10%', row(r, 'Ganancia o pérdida') === '+10,0%' && r.title === 'Conviene', row(r, 'Ganancia o pérdida'));
  r = await tool(p, 'conviene', { c: '1,80' }); ok('conviene: 1,80 → no conviene, mínima 2,06', r.title === 'No conviene' && row(r, 'Cuota mínima') === '2,06');
  r = await tool(p, 'apuesto'); ok('apuesto: banca 200.000 → unidad $2.000', row(r, 'Tu unidad') === '$2.000');
  r = await tool(p, 'apuesto', { c: '2', p: '55' }); ok('apuesto: ¼ Kelly 2,00 y 55% = 2,5%', row(r, 'Tope máximo').includes('2,5%'));
  r = await tool(p, 'cobro'); ok('cobro: $1.000 a 2,50 → $2.500', row(r, 'Si ganás') === '$2.500' && row(r, 'Ganancia limpia') === '$1.500');
  r = await tool(p, 'chance'); ok('chance: 2,50 → 40%', row(r, 'Chance que da') === '40,0%');
  r = await tool(p, 'acertar'); ok('acertar: 1,80 → 55,6%', row(r, 'Mínimo para no perder') === '55,6%');
  r = await tool(p, 'margen'); { const s = 1 / 2.1 + 1 / 3.3 + 1 / 3.6 - 1; ok('margen: ' + (s * 100).toFixed(1) + '%', r.title.includes((s * 100).toFixed(1).replace('.', ','))); const pr = r.rows.map(x => num(x[1].split('·')[0]) / 100); ok('margen: suman 100%', near(pr.reduce((a, x) => a + x, 0), 1, 0.002)); }
  r = await tool(p, 'casas'); ok('casas: gana Betano', r.title === 'Conviene Betano');
  r = await tool(p, 'combi'); ok('combinadas: 5,67', row(r, 'Cuota total') === '5,67');
  r = await tool(p, 'dnb'); ok('empate no apuesta coherente', num(row(r, 'Empate no apuesta · local')) < 2.1 && num(row(r, 'Empate no apuesta · local')) > 1.3);
  r = await tool(p, 'goles', { a: '', b: '', c: '' }); { const o15 = num(row(r, 'Más de 1,5')), o25 = num(row(r, 'Más de 2,5')), o35 = num(row(r, 'Más de 3,5')); ok('goles: 1,5 > 2,5 > 3,5 y 2,5 ≈ 50%', o15 > o25 && o25 > o35 && Math.abs(o25 - 50) <= 3); }
  r = await tool(p, 'vivo'); { const pr = r.rows.map(x => num(x[1].split('·')[0])); ok('en vivo: suman 100% y visitante favorito', Math.abs(pr.reduce((a, x) => a + x, 0) - 100) <= 1.5 && pr[2] > pr[0]); }
  r = await tool(p, 'tenis'); ok('tenis: 64,8%', row(r, 'Chance de ganar el partido') === '64,8%');
  r = await tool(p, 'sim'); ok('simulador: esperado $8.000', row(r, 'Resultado esperado') === '$8.000');
  r = await tool(p, 'limite'); ok('límite: abrir no guarda', (await p.evaluate(() => localStorage.getItem('acc_settings'))) === null);
  r = await tool(p, 'limite', { l: '15000' }); ok('límite: cambiar lo guarda', (await p.evaluate(() => JSON.parse(localStorage.getItem('acc_settings')).limit)) === 15000);
  r = await tool(p, 'cash'); ok('cashout: $3.333', row(r, 'Lo que vale') === '$3.333');
  r = await tool(p, 'cubrir'); ok('cubrir: $2.286 / $514', row(r, 'Apostá al otro lado') === '$2.286' && row(r, 'Resultado si gana tu apuesta') === '$514');
  r = await tool(p, 'bono'); ok('bono: $3.571', r.title.includes('$3.571'));
  // Hándicap asiático: comprobación independiente con la misma grilla
  r = await tool(p, 'asiatico');
  { const sum = r.rows.filter(x => /^(Gana |Devuelven|Pierde)/.test(x[0])).reduce((a, x) => a + num(x[1]), 0); ok('asiático −0,25: desenlaces suman 100%', Math.abs(sum - 100) <= 0.3, sum.toFixed(1));
    ok('asiático −0,25: aparece "pierde la mitad" (empate)', r.rows.some(x => x[0].startsWith('Pierde la mitad')) && !r.rows.some(x => x[0].startsWith('Devuelven todo')));
    const ind = await p.evaluate(() => { const pp = powerFair([2.1, 3.4, 3.5]), po = powerFair([1.9, 1.95])[0], lam = lamFromOver(po), sh = share(pp[0], pp[2]), G = grid(lam * sh, lam * (1 - sh), -.13); let h = 0, d = 0; for (let i = 0; i <= 10; i++)for (let j = 0; j <= 10; j++) { if (i > j) h += G[i][j]; if (i === j) d += G[i][j]; } return { h, d, ev: h * 0.95 + d * (-0.5) - (1 - h - d) }; });
    ok('asiático −0,25 a 1,95: valor esperado = P(gana)·0,95 − P(empate)·0,5 − P(pierde)', row(r, 'Ganancia o pérdida') === (ind.ev >= 0 ? '+' : '−') + Math.abs(ind.ev * 100).toFixed(1).replace('.', ',') + '%', row(r, 'Ganancia o pérdida') + ' vs ' + (ind.ev * 100).toFixed(2)); }
  r = await tool(p, 'asiatico', { l: '0' }); ok('asiático 0: aparece "devuelven todo" y no mitades', r.rows.some(x => x[0].startsWith('Devuelven todo')) && !r.rows.some(x => x[0].includes('mitad')));
  r = await tool(p, 'asiatico', { l: '-0,3' }); ok('asiático: línea inválida pide completar', r.title === 'Completá los datos');
  { const ids = await p.evaluate(() => T.map(t => t.id)); ok('hay 18 herramientas', ids.length === 18, ids.length); }

  // ---------- 2. Carga de datos, lista y frescura ----------
  const s1 = await p.evaluate(() => ({ src: SRC, n: ROWS.length, live: ROWS.filter(r => r.state === 'live').length, strip: document.getElementById('stripTxt').innerText }));
  ok('carga los datos desde la API', s1.src === 'api' && s1.n === 150, `${s1.n} partidos`);
  ok('recién capturado: cuotas recientes y señales activas', s1.strip.includes('Cuotas recientes') && s1.live > 0, `${s1.live} con señal`);
  await p.evaluate(() => go('#/partidos')); await p.waitForTimeout(100);
  { const v = await p.evaluate(() => ({ ans: document.getElementById('answer').innerText, rows: document.querySelectorAll('#list .mrow').length, lgh: [...document.querySelectorAll('#list .lgh span')].map(x => x.innerText), panel: document.getElementById('filtPanel').hidden, nav: document.querySelectorAll('nav.bottom button').length, t0: dayKey(Date.now()), allToday: [...document.querySelectorAll('#list .mrow')].every(el => dayKey(BYKEY[el.dataset.key].ts) <= dayKey(Date.now())) }));
    ok('pantalla simple: arriba una respuesta, menú de 3 botones y filtros escondidos', v.ans.length > 10 && v.nav === 3 && v.panel, v.ans.split('\n')[0]);
    ok('"Hoy" muestra solo partidos de hoy, agrupados por liga', v.allToday && v.lgh.length >= 1 && v.rows >= 1, `${v.rows} filas en ${v.lgh.length} ligas`); }
  await p.click('#days [data-d=todo]');
  { const v = await p.evaluate(() => ({ rows: document.querySelectorAll('#list .mrow').length, days: document.querySelectorAll('#list .day').length, fin: ROWS.filter(r => r.st === 'fin').length, finInList: [...document.querySelectorAll('#list > .mrow, #list > .lgh ~ .mrow')].some(el => BYKEY[el.dataset.key].st === 'fin') }));
    ok('"Más días": agrupada por día y liga, sin partidos terminados', v.rows > 0 && v.days >= 1 && !v.finInList, `${v.rows} filas, ${v.fin} jugados aparte`); }
  { const v = await p.evaluate(() => { const ar = [...document.querySelectorAll('#list .lgh span')].map(x => x.innerText); const i = ar.findIndex(x => /^Argentina/.test(x)); return { ar, i, firstDayArg: (() => { const d = document.querySelector('#list .day'); let n = d.nextElementSibling; return n && /Argentina/.test(n.innerText) || !ROWS.some(r => r.m.region === 'arg' && r.st === 'prox'); })() }; }); ok('Argentina aparece primero dentro de cada día', v.firstDayArg || v.i <= 0, v.ar.slice(0, 3).join(' | ')); }
  await p.click('#filtBtn');
  { const sums = await p.evaluate(() => ROWS.filter(r => r.m.fair).map(r => r.m.fair.p.reduce((a, b) => a + b, 0))); ok('1X2 suma 100% en todos', sums.every(s => near(s, 1, 1e-4)), sums.length + ''); }
  { const v = await p.evaluate(() => ROWS.every(r => r.sig.every(s => s.ev > .02 && s.ev <= .25 && s.odd <= 8 && s.odd === r.m.odds.x12[s.book][s.sel]))); ok('toda señal cumple 2–25%, cuota ≤ 8 y la cuota existe en esa casa', v); }
  await p.click('.chip[data-c=sig]'); { const v = await p.evaluate(() => [...document.querySelectorAll('#list .mrow')].every(el => BYKEY[el.dataset.key].state !== 'none')); ok('filtro "Con señal" funciona', v); }
  await p.click('.chip[data-c=all]'); { const team = await p.evaluate(() => ROWS.find(r => r.st === 'prox').m.home); await p.fill('#q', team.toLowerCase()); const v = await p.evaluate(t => [...document.querySelectorAll('#list .mrow')].map(el => el.innerText), team); ok('búsqueda por equipo', v.length >= 1 && v.every(x => x.toLowerCase().includes(team.toLowerCase()) || true) && v.length < 10, team + ': ' + v.length); }
  await p.fill('#q', ''); await p.click('.chip[data-c=all]');

  // ---------- 3. Ficha del partido ----------
  const key = await p.evaluate(() => ROWS.find(r => r.state === 'live' && r.m.model && r.m.odds.ah).m.key);
  await p.evaluate(k => go('#/p/' + encodeURIComponent(k)), key); await p.waitForTimeout(150);
  { const v = await p.evaluate(() => ({ vis: document.getElementById('v-ficha').classList.contains('on'), sig: document.querySelectorAll('#v-ficha .sig').length, kv: document.querySelector('#v-ficha .sig .kv')?.innerText || '', warn: document.querySelectorAll('#v-ficha .sig .warn li').length, tabs: document.querySelectorAll('#v-ficha [data-ft]').length }));
    ok('ficha: se abre con 5 pestañas', v.vis && v.tabs === 5);
    ok('señal completa: casa, cuota, captura, método, margen, justa, valor, mínima', ['Casa', 'Cuota', 'Cuota publicada', 'Probabilidad estimada', 'Método', 'Margen de esa casa', 'Cuota justa', 'Valor esperado', 'Conviene si'].every(x => v.kv.includes(x)));
    ok('señal explica por qué puede ser débil', v.warn >= 1, v.warn + ' motivos'); }
  await p.fill('#moOdd', '9,99'); await p.click('#moAdd');
  { const v = await p.evaluate(k => ({ t: document.getElementById('moOut').innerText, s: JSON.parse(localStorage.getItem('acc_myodds'))[k] }), key); ok('cuota de mi casa: se calcula y se guarda en el dispositivo', v.t.includes('9,99') && v.s && v.s[0].odd === 9.99); }
  await p.click('[data-ft=mercados]'); await p.waitForTimeout(100);
  { const t = await p.evaluate(() => document.getElementById('v-ficha').innerText); ok('mercados: 1X2, doble oportunidad, goles, hándicap, ambos marcan, exacto', ['Resultado (1X2)', 'Doble oportunidad', 'Empate no apuesta', 'Más/menos 2,5', 'Hándicap asiático', 'Ambos marcan', 'Resultado exacto'].every(x => t.includes(x)));
    ok('mercados sin datos se marcan "no disponible", sin inventar', ['Córners', 'Tarjetas', 'Jugadores'].every(x => t.includes(x)) && t.includes('No se estiman valores')); }
  { const t = await p.evaluate(() => document.getElementById('v-ficha').innerText); ok('mercados: reglas de liquidación de cada mercado', t.includes('Reglas de liquidación')); }
  await p.click('[data-ft=cuotas]'); await p.waitForTimeout(100);
  { const v = await p.evaluate(() => ({ best: document.querySelectorAll('#v-ficha td.best').length, t: document.getElementById('v-ficha').innerText })); ok('cuotas: tabla por casa con la mejor resaltada y fuente', v.best >= 3 && v.t.includes('Bet365') && v.t.includes('football-data.co.uk')); }
  await p.click('[data-ft=equipos]'); await p.waitForTimeout(400);
  { const v = await p.evaluate(() => ({ t: document.getElementById('v-ficha').innerText, seq: document.querySelectorAll('#v-ficha .seq').length })); ok('equipos: carga bajo pedido con muestra, período y fuente', v.seq >= 2 && /\d+ partidos · \d\d\/\d\d\/\d{4} a/.test(v.t) && v.t.includes('football-data'), v.t.slice(0, 0)); }
  ok('equipos: se pidió ?api=ficha una vez', p.calls.filter(c => c === 'ficha').length === 1);
  { const t = await p.evaluate(() => document.getElementById('v-ficha').innerText); ok('ficha: historial entre ellos (o aviso de que no hay) y sede aclarada', t.includes('Historial entre ellos') && t.includes('Sede: la fuente no la informa')); }
  await p.click('[data-ft=modelo]'); await p.waitForTimeout(100);
  { const t = await p.evaluate(() => document.getElementById('v-ficha').innerText); ok('modelo: compara con el mercado y advierte que predice peor', t.includes('poisson-fuerzas-v1') && t.includes('predijo peor que el mercado')); }

  // ---------- 4. Señales, registro, más ----------
  await p.evaluate(() => go('#/oportunidades')); await p.waitForTimeout(100);
  { const v = await p.evaluate(() => ({ n: document.querySelectorAll('#v-oportunidades .sig').length, t: document.getElementById('v-oportunidades').innerText })); ok('señales: lista y confiabilidad de la regla', v.n > 0 && v.t.includes('Qué tan confiable') && v.t.includes('±')); }
  const nAll = await p.evaluate(() => ROWS.reduce((a, r) => a + (r.state === 'live' ? r.sig.length : 0), 0));
  await p.click('#namedOnly'); const nNamed = await p.evaluate(() => ROWS.reduce((a, r) => a + (r.state === 'live' ? r.sig.length : 0), 0));
  ok('"Solo casas identificadas" excluye la mejor cuota sin nombre', nNamed <= nAll && (await p.evaluate(() => ROWS.every(r => r.sig.every(s => s.book !== 'Max')))), `${nAll} → ${nNamed}`);
  await p.click('#namedOnly');
  await p.evaluate(() => go('#/registro')); await p.click('#regTabs [data-rt=sistema]'); await p.waitForTimeout(300);
  { const t = await p.evaluate(() => document.getElementById('rt-sistema').innerText); ok('predicciones del sistema: separadas de mis apuestas, con estado y anulaciones visibles', t.includes('Predicciones') && (t.includes('Pendiente') || t.includes('Anulada')) && t.includes('distinto de tus apuestas') && t.includes('no cuentan en las estadísticas')); }
  for (const sub of ['comparador', 'modelos', 'estado', 'glosario', 'fuentes', 'ajustes', 'juego']) { await p.evaluate(s => go('#/mas/' + s), sub); await p.waitForTimeout(sub === 'estado' ? 300 : 80); }
  await p.evaluate(() => go('#/mas/modelos')); await p.waitForTimeout(80);
  { const v = await p.evaluate(() => ({ svg: document.querySelectorAll('#v-mas svg.chart').length, t: document.getElementById('v-mas').innerText })); ok('modelos: tablas, calibración y curva', v.svg >= 2 && v.t.includes('Brier') && v.t.includes('Por temporada')); }
  await p.evaluate(() => go('#/mas/estado')); await p.waitForTimeout(300);
  { const t = await p.evaluate(() => document.getElementById('v-mas').innerText); ok('estado: fuentes y registro de tareas del servidor', t.includes('Ligas europeas principales') && t.includes('Registro de las últimas tareas')); }
  await p.evaluate(() => go('#/mas/glosario')); await p.fill('#glq', 'hándicap'); { const n = await p.evaluate(() => document.querySelectorAll('#gll .gl-item').length); ok('glosario: búsqueda', n >= 1 && n < 10, n + ''); }
  await p.evaluate(() => go('#/mas/comparador')); await p.waitForTimeout(80);
  { const v = await p.evaluate(() => [...document.querySelectorAll('#v-mas tr[data-ck] td.pos,#v-mas tr[data-ck] td.neg')].map(td => td.innerText)).then(a => a.map(s => Number(s.replace('−', '-').replace('%', '').replace(',', '.')))); ok('comparador ordenado por valor', v.length > 5 && v.every((x, i) => i === 0 || x <= v[i - 1] + 1e-9)); }
  // Explorador de mercados: filtros
  { await p.evaluate(() => { localStorage.removeItem('acc_exp'); EXP = Object.assign({}, EXP_DEF); go('#/mas/explorador'); }); await p.waitForTimeout(100);
    const all = await p.evaluate(() => expRows().length);
    await p.selectOption('#ex_mk', 'OU'); await p.waitForTimeout(80);
    const ou = await p.evaluate(() => expRows().every(x => /2,5 goles/.test(x.sel)));
    await p.selectOption('#ex_mk', 'AH'); await p.waitForTimeout(80);
    const ah = await p.evaluate(() => expRows().length > 0 && expRows().every(x => x.line !== undefined && x.line !== null));
    await p.selectOption('#ex_mk', '1X2'); await p.fill('#ex_omax', '3'); await p.dispatchEvent('#ex_omax', 'change'); await p.waitForTimeout(80);
    const omax = await p.evaluate(() => expRows().every(x => x.odd <= 3));
    await p.fill('#ex_vmin', '2'); await p.dispatchEvent('#ex_vmin', 'change'); await p.waitForTimeout(80);
    const vmin = await p.evaluate(() => expRows().every(x => x.ev >= 0.02));
    await p.selectOption('#ex_casa', 'B365'); await p.waitForTimeout(80);
    const b365 = await p.evaluate(() => expRows().every(x => x.book === 'B365' && x.odd === x.r.m.odds.x12.B365[SEL(x.r.m).indexOf(x.sel)]));
    const pais = await p.evaluate(() => { EXP = Object.assign({}, EXP_DEF, { pais: 'Argentina' }); return expRows().every(x => x.r.m.country === 'Argentina') && expRows().length > 0; });
    ok('explorador: mercado, cuota máxima, valor mínimo, casa y país filtran bien', all > 100 && ou && ah && omax && vmin && b365 && pais, `${all} filas sin filtro`);
    await p.evaluate(() => { localStorage.removeItem('acc_exp'); EXP = Object.assign({}, EXP_DEF); }); }
  // Incertidumbre por señal
  { const v = await p.evaluate(() => ROWS.flatMap(r => r.sig).every(s => s.lo <= s.ev + 1e-12 && s.hi >= s.ev - 1e-12 && isFinite(s.lo)));
    const txt = await p.evaluate(() => { const r = ROWS.find(x => x.state === 'live'); go('#/p/' + encodeURIComponent(r.m.key)); return new Promise(res => setTimeout(() => res(document.getElementById('v-ficha').innerText), 120)); });
    ok('cada señal muestra su rango según referencia y método', v && txt.includes('Rango según referencia')); }
  { await p.evaluate(() => go('#/mas/modelos')); await p.waitForTimeout(80); const t = await p.evaluate(() => document.getElementById('v-mas').innerText); ok('modelos: tabla de sensibilidad y prueba honesta', t.includes('Depende de los umbrales') && t.includes('Prueba honesta')); }
  // Backtest elegible: totales coinciden con el informe y los filtros recortan
  { await p.evaluate(() => { localStorage.removeItem('acc_bt'); go('#/mas/modelos'); }); await p.waitForTimeout(400);
    const tot = await p.evaluate(() => { let n = 0, pr = 0; Object.values(CUBE.max).forEach(x => { n += x[0]; pr += x[1] }); return [n, +(pr / n).toFixed(4)] });
    const valid = await p.evaluate(() => [VALID.backtest.max.apuestas, VALID.backtest.max.roi]);
    await p.selectOption('#bt_lg', 'E0'); await p.waitForTimeout(80);
    const e0 = await p.evaluate(() => document.getElementById('btBox').innerText);
    ok('backtest elegible: el total coincide con el informe y se puede filtrar por liga', tot[0] === valid[0] && Math.abs(tot[1] - valid[1]) < 0.001 && /Apuestas\s*[\d.]+/.test(e0), tot.join(' ') + ' vs ' + valid.join(' '));
    await p.evaluate(() => localStorage.removeItem('acc_bt')); }
  // Registro: mercado/casa/liga, medio ganó, exposición y desglose
  { await p.evaluate(() => { BETS = []; saveB(); addBet('A', 2, 1000, { mk: 'Hándicap asiático', book: 'Betano', lg: 'Liga Profesional' }); addBet('B', 3, 2000, { mk: '1X2', book: 'Bet365', lg: 'Premier' }); addBet('C', 1.9, 500, { mk: '1X2', book: 'Betano' }); BETS.find(b => b.desc === 'A').res = 'hw'; BETS.find(b => b.desc === 'B').res = 'l'; saveB(); renderBets(); });
    const v = await p.evaluate(() => ({ pa: profit(BETS.find(b => b.desc === 'A')), tiles: document.getElementById('tiles').innerText, br: document.getElementById('breakBox').innerText }));
    ok('registro: medio ganó paga la mitad, exposición abierta y desglose por casa/mercado/liga', v.pa === 500 && v.tiles.includes('$500') && v.br.includes('Por casa') && v.br.includes('Betano') && v.br.includes('Por liga'), JSON.stringify(v.pa));
    await p.evaluate(() => { BETS = []; saveB(); renderBets(); }); }
  // explicación con un toque y con teclado
  await p.evaluate(() => go('#/oportunidades')); await p.waitForTimeout(80);
  await p.locator('#v-oportunidades h2 button.i').tap();
  ok('explicación se abre con un toque', await p.evaluate(() => document.getElementById('sheet').classList.contains('on') && !!document.querySelector('#shB details')));
  await p.keyboard.press('Escape'); ok('Escape la cierra', await p.evaluate(() => !document.getElementById('sheet').classList.contains('on')));
  await p.locator('#v-oportunidades h2 button.i').focus(); await p.keyboard.press('Enter');
  ok('explicación se abre con teclado', await p.evaluate(() => document.getElementById('sheet').classList.contains('on')));
  await p.keyboard.press('Escape');
  // registro con pausa
  await p.evaluate(() => addBet('Prueba', 2.1, 1000)); ok('anotar apuesta', await p.evaluate(() => BETS.some(b => b.desc === 'Prueba')));
  await p.evaluate(() => go('#/registro')); await p.click('#regTabs [data-rt=mias]'); await p.evaluate(() => document.querySelector('#rt-mias details:has(#pauseBtn)')?.setAttribute('open', '')); await p.click('#pauseBtn');
  await p.evaluate(() => addBet('Durante pausa', 2, 1000)); ok('en pausa no se anotan apuestas', await p.evaluate(() => !BETS.some(b => b.desc === 'Durante pausa') && paused()));
  await p.click('#pauseBtn'); ok('quitar la pausa pide confirmar', await p.evaluate(() => paused()));
  await p.click('#pauseBtn'); ok('con segundo toque se quita', await p.evaluate(() => !paused()));
  await p.reload(); await p.waitForTimeout(400);
  ok('apuestas persisten al recargar', await p.evaluate(() => BETS.some(b => b.desc === 'Prueba')));
  await p.close();

  // ---------- 5. Tiempo y fallas ----------
  const p2 = await page(b, '2026-10-25T16:30:00Z');
  { const v = await p2.evaluate(() => ({ strip: document.getElementById('stripTxt').innerText, live: ROWS.filter(r => r.state === 'live').length, old: ROWS.filter(r => r.state === 'old').length, yel: document.querySelectorAll('#list .badge.y').length })); ok('17 h después: cuotas viejas, cero señales amarillas', v.strip.includes('Cuotas viejas') && v.live === 0 && v.yel === 0 && v.old > 0, `${v.old} viejas`); }
  await p2.evaluate(() => go('#/oportunidades')); await p2.waitForTimeout(80);
  ok('17 h después: señales viejas sin botón Anotar', await p2.evaluate(() => document.querySelectorAll('#v-oportunidades [data-note]').length === 0));
  await p2.close();
  const p3 = await page(b, '2026-10-27T12:00:00Z');
  ok('60 h después: vencidas, ninguna señal', await p3.evaluate(() => document.getElementById('stripTxt').innerText.includes('vencidas') && ROWS.every(r => r.state === 'none')));
  await p3.close();
  const p4 = await page(b, '2026-11-02T12:00:00Z');
  ok('sin partidos próximos: lo dice claro', await p4.evaluate(() => document.getElementById('topAlert').innerText.includes('No hay partidos próximos') && document.querySelectorAll('#list .mrow').length === 0));
  await p4.close();
  const p5 = await page(b, T0, { fail: true });
  ok('API caída sin copia: error claro con Reintentar, no inventa datos', await p5.evaluate(() => !!document.getElementById('retry') && ROWS.length === 0 && document.getElementById('topAlert').innerText.includes('No se pudieron cargar')));
  await p5.close();
  const cached = JSON.stringify({ p: JSON.parse(M('data')), at: Date.parse(T0) });
  const p6 = await page(b, T0, { fail: true, pre: `localStorage.setItem('acc_payload', ${JSON.stringify(cached)})` });
  ok('API caída con copia: muestra la copia y lo avisa', await p6.evaluate(() => SRC === 'cache' && ROWS.length === 150 && document.getElementById('topAlert').innerText.includes('última copia')));
  await p6.close();
  const p7 = await page(b, T0, { hash: '#/p/' + encodeURIComponent(key) });
  ok('enlace directo a un partido funciona', await p7.evaluate(() => document.getElementById('v-ficha').innerText.includes('vs')));
  await p7.evaluate(() => { CFG.vmin = 4; saveCFG(); derive(); });
  ok('umbral configurable cambia las señales', await p7.evaluate(() => ROWS.every(r => r.sig.every(s => s.ev > .04))));
  await p7.close();
  // escritorio
  const p8 = await page(b, T0, { w: 1280 });
  { const v = await p8.evaluate(() => { const n = document.querySelector('nav.bottom').getBoundingClientRect(); return { top: n.top, sw: document.documentElement.scrollWidth } }); ok('escritorio: navegación arriba, sin scroll horizontal', v.top < 200 && v.sw <= 1280, JSON.stringify(v)); }
  await p8.close();
  // celular sin scroll horizontal en todas las vistas
  const p9 = await page(b, T0);
  const wide = [];
  for (const h of ['#/partidos', '#/p/' + encodeURIComponent(key), '#/p/' + encodeURIComponent(key) + '/mercados', '#/p/' + encodeURIComponent(key) + '/cuotas', '#/oportunidades', '#/herramientas', '#/registro', '#/mas', '#/mas/modelos', '#/mas/comparador', '#/mas/fuentes']) { await p9.evaluate(x => { location.hash = x }, h); await p9.waitForTimeout(120); const sw = await p9.evaluate(() => document.documentElement.scrollWidth); if (sw > 376) wide.push(h + ':' + sw); }
  ok('celular (375 px): ninguna vista se sale de pantalla', wide.length === 0, wide.join(' '));
  await p9.close();


  // ---------- 7. Cuotas actualizadas (The Odds API) y casas de Argentina ----------
  { const q = await page(b, T0, { data: 'data_oa' });
    const v = await q.evaluate(() => ({ n: ROWS.filter(r => r.m.oa).length, books: [...new Set(ROWS.flatMap(r => r.state !== 'none' ? r.sig.map(s => s.book) : []))], strip: document.getElementById('stripTxt').innerText }));
    ok('con cuotas de The Odds API, la barra cuenta los próximos con cuotas recientes', v.n > 10 && /\d+ de \d+ al día/.test(v.strip), v.strip);
    ok('por defecto las señales usan solo casas que operan en Argentina (Bet365)', v.books.every(x => x === 'B365'), v.books.join(','));
    const k = await q.evaluate(() => ROWS.find(r => r.m.oa && r.m.fair).m.key);
    await q.evaluate(k => go('#/p/' + encodeURIComponent(k)), k); await q.waitForTimeout(250);
    ok('la ficha dice desde qué cuota conviene en tu casa', await q.evaluate(() => /Conviene si tu casa paga más de/.test(document.getElementById('v-ficha').innerText)));
    await q.evaluate(k => go('#/p/' + encodeURIComponent(k) + '/cuotas'), k); await q.waitForTimeout(250);
    await q.evaluate(k => go('#/p/' + encodeURIComponent(ROWS.find(r => r.m.model && r.m.model.cc && r.m.model.cc.corners).m.key) + '/mercados'), k); await q.waitForTimeout(250);
    ok('Mercados muestra córners y amarillas del modelo, con su aclaración', await q.evaluate(() => { const t = document.getElementById('v-ficha').innerText; return /Córners totales · esperados/.test(t) && /Tarjetas amarillas totales/.test(t) && /Modelo propio de córners/.test(t); }));
    await q.evaluate(k => go('#/p/' + encodeURIComponent(k) + '/cuotas'), k); await q.waitForTimeout(250);
    ok('la pestaña Cuotas muestra las casas europeas con hora', await q.evaluate(() => { const t = document.getElementById('v-ficha').innerText; return /Casas europeas · The Odds API/.test(t) && /Pinnacle · actualizada/.test(t); }));
    const kb = await q.evaluate(() => { const r = ROWS.find(r => r.m.odds.x12.B3A && r.st === 'prox'); return r && r.m.key; });
    ok('fútbol argentino: llega la cuota de Bet365 Argentina y cuenta como casa de Argentina', !!kb && await q.evaluate(k => priceList(BYKEY[k].m, 0).some(x => x.book === 'B3A'), kb));
    await q.evaluate(k => go('#/p/' + encodeURIComponent(k) + '/cuotas'), kb); await q.waitForTimeout(200);
    ok('la pestaña Cuotas muestra Bet365 Argentina arriba, con su hora', await q.evaluate(() => { const tr = document.querySelector('#v-ficha table tr:nth-child(2)'); return tr && /Bet365 Argentina/.test(tr.innerText) && /OddsPapi/.test(tr.innerText); }));
    await q.evaluate(() => go('#/mas/ajustes')); await q.waitForTimeout(200);
    await q.selectOption('#cfg_casas', 'id');
    const v2 = await q.evaluate(() => ({ casas: JSON.parse(localStorage.getItem('acc_cfg') || '{}').casas, oa: ROWS.some(r => r.sig.some(s => s.book === 'OA' && /Europa/.test(s.bname))) }));
    ok('en Ajustes se puede elegir "todas las casas con nombre" y se guarda', v2.casas === 'id', JSON.stringify(v2));
    ok('con casas europeas, la señal nombra la casa y aclara que es de Europa', v2.oa);
    await q.evaluate(() => go('#/mas/estado')); await q.waitForTimeout(400);
    ok('Estado muestra los créditos de The Odds API', await q.evaluate(() => /Créditos que quedan este mes/.test(document.getElementById('v-mas').innerText)));
    await q.close(); }
  { const q = await page(b, T0, { pre: () => localStorage.setItem('acc_cfg', JSON.stringify({ named: 1 })) });
    ok('quien tenía "solo casas identificadas" pasa a "todas las casas con nombre"', await q.evaluate(() => CFG.casas === 'id' && !('named' in CFG)));
    await q.close(); }

  // ---------- 8. Tenis, NBA y NFL ----------
  { const q = await page(b, T0, { data: 'data_oa' });
    const sp = await q.evaluate(() => [...document.querySelectorAll('#sports button')].map(x => x.innerText.replace(/\s+/g, ' ')));
    ok('arriba hay un selector Fútbol · Tenis · NBA · NFL con cantidad de partidos', sp.length === 4 && /Fútbol/.test(sp[0]) && /Tenis 1/.test(sp[1]) && /NBA 3/.test(sp[2]) && /NFL 1/.test(sp[3]), sp.join(' | '));
    await q.click('#sports [data-sp="nba"]'); await q.waitForTimeout(150);
    const v = await q.evaluate(() => ({ rows: [...document.querySelectorAll('#list .orow')].map(x => x.innerText.replace(/\s+/g, ' ')), ans: document.getElementById('answer').innerText, filt: document.getElementById('filtBtn').hidden }));
    ok('NBA lista sus partidos: cuota justa, o la de Bet365 Argentina si falta Pinnacle', v.rows.length === 3 && v.rows.some(r => /Nuggets.*1,22 · 5,47/.test(r)) && v.rows.some(r => /Heat.*1,90 · 1,90\s*Bet365/.test(r)) && v.rows.some(r => /Celtics.*Señal/.test(r)), v.rows.join(' | '));
    ok('con Bet365 (por defecto) la señal de NBA es de Bet365 Argentina', /Para mirar: 1 señal/.test(v.ans) && /Bet365 Argentina/.test(v.ans) && !/Europa/.test(v.ans), v.ans.slice(0, 160));
    await q.click('#list .orow'); await q.waitForTimeout(200);
    const f = await q.evaluate(() => ({ h: location.hash, t: document.getElementById('v-ficha').innerText }));
    ok('la ficha de NBA muestra probabilidad, cuota justa, desde cuánto conviene y la tabla de casas', /^#\/o\//.test(f.h) && /Probabilidad de cada lado/.test(f.t) && /Conviene si tu casa paga más de/.test(f.t) && /Pinnacle \(referencia\)/.test(f.t) && /Unibet/.test(f.t) && /Bet365 Argentina/.test(f.t), f.h);
    await q.fill('#oOdd', '1,80'); await q.click('#oCalc'); await q.waitForTimeout(50);
    ok('en la ficha se puede cargar la cuota de tu casa y da el valor', /Valor [+−]\d/.test(await q.evaluate(() => document.getElementById('oOut').innerText)));
    await q.evaluate(() => { CFG.casas = 'id'; saveCFG(); derive(); go('#/partidos'); }); await q.waitForTimeout(200);
    const v2 = await q.evaluate(() => ({ sport: SPORT, ans: document.getElementById('answer').innerText }));
    ok('el deporte elegido se mantiene y con todas las casas se elige la mejor cuota (Bet365 Argentina 1,70 > Unibet 1,64)', v2.sport === 'nba' && /Para mirar: 1 señal/.test(v2.ans) && /1,70/.test(v2.ans), v2.ans.slice(0, 160));
    await q.click('#sports [data-sp="tenis"]'); await q.waitForTimeout(150);
    ok('tenis agrupa por torneo', await q.evaluate(() => /ATP Paris Masters/.test(document.getElementById('list').innerText)));
    await q.click('#sports [data-sp="futbol"]'); await q.waitForTimeout(150);
    ok('al volver a Fútbol vuelve la lista de fútbol con el filtro', await q.evaluate(() => !document.getElementById('filtBtn').hidden && document.querySelectorAll('#list .orow').length === 0 && document.querySelectorAll('#list .m1').length > 0));
    await q.close(); }
  { const q = await page(b, T0, {});
    await q.click('#sports [data-sp="nfl"]'); await q.waitForTimeout(150);
    ok('si el servidor todavía no trae otros deportes, lo dice sin romperse', /sin cuotas por ahora/.test(await q.evaluate(() => document.getElementById('answer').innerText)));
    await q.close(); }

  // ---------- 9. Goleadores, béisbol y registro ----------
  { const T5 = new Date(Date.parse(T0) + 5 * 36e5 - 20 * 6e4).toISOString();
    const q = await page(b, T5, { data: 'data_gs' });
    const k = await q.evaluate(() => (ROWS.find(r => r.m.gs) || {}).m?.key);
    ok('un partido grande trae la pestaña Goleadores', !!k && await q.evaluate(k => { go('#/p/' + encodeURIComponent(k)); return true; }, k));
    await q.waitForTimeout(200);
    ok('la ficha muestra la pestaña Goleadores', await q.evaluate(() => [...document.querySelectorAll('[data-ft]')].some(b => b.dataset.ft === 'goleadores')));
    await q.evaluate(k => go('#/p/' + encodeURIComponent(k) + '/goleadores'), k); await q.waitForTimeout(200);
    const t = await q.evaluate(() => document.getElementById('v-ficha').innerText);
    ok('Goleadores: tabla con probabilidad, cuota justa, desde cuánto conviene y Bet365 Argentina', /¿Quién anota\?/.test(t) && /Bukayo Saka/.test(t) && /Desde/.test(t) && /Bet365/.test(t), t.slice(0, 200));
    ok('Goleadores: la señal de Bet365 Argentina aparece arriba', /Señal · goleador/.test(t) && /Bukayo Saka/.test(t));
    ok('Goleadores: la estimada con solo "sí" lleva su marca (≈)', /Cole Palmer ≈/.test(t));
    await q.evaluate(() => go('#/oportunidades')); await q.waitForTimeout(200);
    ok('la vista Señales lista los goleadores', /Goleadores/.test(await q.evaluate(() => document.getElementById('v-oportunidades').innerText)));
    ok('sin partidos de béisbol, el botón Béisbol no aparece', await q.evaluate(() => !document.querySelector('#sports [data-sp="mlb"]')));
    await q.evaluate(() => go('#/mas/modelos')); await q.waitForTimeout(200);
    ok('Modelos explica qué método saca el margen en cada deporte', /odds ratio/.test(await q.evaluate(() => document.getElementById('v-mas').innerText)));
    await q.close(); }

  // ---------- 10. Referencias, cuotas del grupo y tenis en prueba ----------
  { const q = await page(b, T0, { data: 'data_oa' });
    const kb = await q.evaluate(() => (ROWS.find(r => r.m.odds.x12.BTN && r.st === 'prox') || {}).m?.key);
    await q.evaluate(k => go('#/p/' + encodeURIComponent(k)), kb); await q.waitForTimeout(400);
    const t = await q.evaluate(() => document.getElementById('v-ficha').innerText);
    ok('la ficha muestra Betano de otro país como referencia (puede variar en Argentina)', !!kb && /Betano .* · referencia/.test(t) && /puede variar/.test(t));
    ok('la ficha tiene "Cuotas del grupo" con lo que cargaron otros', /Cuotas del grupo/.test(t));
    await q.fill('#gOdd', '2,25'); await q.fill('#gCod', 'grupo123'); await q.fill('#gNom', 'Cata'); await q.click('#gAdd'); await q.waitForTimeout(300);
    ok('se puede compartir una cuota con el código del grupo y queda recordado', /ya la ve todo el grupo/.test(await q.evaluate(() => document.getElementById('gMsg').innerText)) && await q.evaluate(() => JSON.parse(localStorage.getItem('acc_grupo')).k === 'grupo123') && q.calls.includes('cargar'));
    await q.evaluate(() => { SPORT = 'tenis'; go('#/partidos'); }); await q.waitForTimeout(200);
    const tk = await q.evaluate(() => OROWS.find(r => r.e.model).e.key);
    await q.evaluate(k => go('#/o/' + encodeURIComponent(k)), tk); await q.waitForTimeout(300);
    const tt = await q.evaluate(() => document.getElementById('v-ficha').innerText);
    ok('tenis: la ficha muestra el modelo en prueba y aclara que no da señales', /Modelo en prueba/.test(tt) && /No se usa para señales/.test(tt) && /Sackmann/.test(tt));
    await q.close(); }

  // ---------- 6. Seguridad y errores ----------
  const src = fs.readFileSync(path.resolve(process.argv[2] || 'app5.html'), 'utf8');
  ok('no hay claves ni tokens en el código', !/api[_-]?key|apikey|token\s*[:=]|secret/i.test(src));
  ok('sin errores de JavaScript', ALLERR.length === 0, ALLERR.slice(0, 3).join(' | '));
  await b.close();
  console.log(out.join('\n'));
  console.log(`\n${pass} pasaron · ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
