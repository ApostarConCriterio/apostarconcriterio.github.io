// Ejecuta core.js + gas.js con simulaciones de los servicios de Google y archivos locales reales.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
let pass = 0, fail = 0; const ok = (n, c, x) => { (c ? pass++ : fail++); console.log((c ? 'OK   ' : 'FALLA ') + n + (x ? ' — ' + x : '')); };

function makeEnv(opts) {
  const props = {}, cache = {}, sheets = {}, logs = [];
  let failUrls = opts.failUrls || [];
  function Sheet(name) { this.name = name; this.rows = []; }
  Sheet.prototype = {
    appendRow(r) { this.rows.push(r.slice()); }, setFrozenRows() { }, getLastRow() { return this.rows.length; },
    getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); },
    getRange(r, c, nr, nc) { const sh = this; nr = nr || 1; nc = nc || 1; return {
      getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = sh.rows[r - 1 + i] || []; o.push(Array.from({ length: nc }, (_, j) => row[c - 1 + j] === undefined ? '' : row[c - 1 + j])); } return o; },
      setValues(v) { if (v.length !== nr || v.some(x => x.length !== nc)) throw new Error('dimensiones incorrectas en setValues'); v.forEach((row, i) => { const R = sh.rows[r - 1 + i] = sh.rows[r - 1 + i] || []; row.forEach((x, j) => { if (typeof x === 'string' && x.length > 50000) throw new Error('celda > 50000 caracteres'); R[c - 1 + j] = x; }); }); },
      clearContent() { for (let i = 0; i < nr; i++) { const R = sh.rows[r - 1 + i]; if (R) for (let j = 0; j < nc; j++) R[c - 1 + j] = ''; } sh.rows = sh.rows.filter((row, idx) => idx === 0 || row.some(x => x !== '')); }
    }; }
  };
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getSheets: () => Object.values(sheets), deleteSheet: s => delete sheets[s.name], getId: () => 'SSID', getUrl: () => 'https://docs.google.com/spreadsheets/d/SSID' };
  const local = url => {
    const u = url.replace('https://football-data.co.uk/', '');
    let m;
    if (u === 'fixtures.csv' || u === 'new_league_fixtures.csv') return u;
    if ((m = u.match(/^mmz4281\/(\d{4})\/(\w+)\.csv$/))) return `res/${m[1]}_${m[2]}.csv`;
    if ((m = u.match(/^new\/(\w+)\.csv$/))) return `res/new_${m[1]}.csv`;
    return null;
  };
  const env = {
    console, JSON, Math, Date, Object, String, Number, Array, isFinite, parseFloat,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { if (String(v).length > 9000) throw new Error('propiedad > 9 KB: ' + k); props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { if (String(v).length > 100000) throw new Error('caché > 100 KB'); cache[k] = v; }, putAll: o => { Object.entries(o).forEach(([k, v]) => { if (String(v).length > 100000) throw new Error('caché > 100 KB'); cache[k] = v; }); }, getAll: ks => Object.fromEntries(ks.filter(k => cache[k]).map(k => [k, cache[k]])), remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => true, releaseLock: () => { } }) },
    SpreadsheetApp: { openById: () => ss, create: () => { sheets['Hoja 1'] = new Sheet('Hoja 1'); return ss; } },
    UrlFetchApp: { fetch: (url, op) => { if (url.includes('api.telegram.org')) { const m = url.split('/').pop(); global.__TG = (global.__TG || []).concat([{ m, body: op && op.payload ? JSON.parse(op.payload) : {} }]); return { getResponseCode: () => 200, getContentText: () => JSON.stringify(m === 'getUpdates' ? { ok: true, result: [{ message: { chat: { id: -1001, type: 'supergroup', title: 'Apuestas' } } }] } : { ok: true }) }; } if (url.includes('api.oddspapi.io')) { global.__OPCALLS = (global.__OPCALLS || []).concat([url.replace(/apiKey=[^&]*/, 'apiKey=***')]); const body = global.__OP ? global.__OP(url) : {}; return { getHeaders: () => ({}), getResponseCode: () => 200, getContentText: () => JSON.stringify(body) }; } if (url.includes('the-odds-api.com')) { if (/\/odds\//.test(url)) global.__OACALLS = (global.__OACALLS || 0) + 1; else global.__OAFREE = (global.__OAFREE || 0) + 1; if (!/\/odds\//.test(url)) return { getHeaders: () => ({}), getResponseCode: () => 200, getContentText: () => JSON.stringify(global.__OA ? global.__OA(url) : []) }; global.__OAREM = (global.__OAREM == null ? 500 : global.__OAREM) - (url.includes('totals') ? 2 : 1); const body = global.__OA ? global.__OA(url) : []; return { getHeaders: () => ({ 'x-requests-remaining': String(global.__OAREM), 'x-requests-last': url.includes('totals') ? '2' : '1' }), getResponseCode: () => 200, getContentText: () => JSON.stringify(body) }; } const f = local(url); const failing = failUrls.some(x => url.includes(x)); return { getHeaders: () => (global.__LM ? { 'Last-Modified': global.__LM } : {}), getResponseCode: () => failing ? 503 : (f && fs.existsSync(f) ? 200 : 404), getContentText: () => (!failing && f && fs.existsSync(f)) ? fs.readFileSync(f, 'utf8') : '' }; } },
    Utilities: { sleep: () => { }, DigestAlgorithm: { MD5: 'md5' }, computeDigest: (a, s) => [...crypto.createHash('md5').update(s).digest()], base64Encode: b => Buffer.from(b).toString('base64') },
    ContentService: { MimeType: { JSON: 'json', TEXT: 'text' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
    HtmlService: { createHtmlOutput: h => ({ h }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() { }, newTrigger: n => { const t = { timeBased: () => t, everyHours: () => t, everyDays: () => t, atHour: () => t, create: () => logs.push('trigger ' + n) }; return t; } },
    _setFail: x => { failUrls = x; }, _sheets: sheets, _cache: cache, _props: props
  };
  vm.createContext(env);
  vm.runInContext(process.env.CODEGS ? fs.readFileSync('Code.gs', 'utf8') : fs.readFileSync('core.js', 'utf8') + '\n' + fs.readFileSync('gas.js', 'utf8') + '\nvar TENNIS_ELO_INIT = ' + fs.readFileSync('tenis_elo.json', 'utf8') + ';', env, { filename: 'Code.gs' });
  return env;
}
const api = (E, q) => JSON.parse(E.doGet({ parameter: q }).t);
const logRows = E => E._sheets.log.rows.slice(1);

// Reloj fijo: justo después de la descarga real de los archivos.
const RealDate = Date; const FIXED = RealDate.parse('2026-10-24T23:10:00Z');
global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [global.__NOW || FIXED])); } static now() { return global.__NOW || FIXED; } };

const E = makeEnv({});
const t0 = RealDate.now();
console.log(E.instalar());
console.log('instalación + 3 corridas:', RealDate.now() - t0, 'ms');
const L = logRows(E); L.filter(r => r[3] !== 'ok').forEach(r => console.log('  log:', r.slice(1).join(' | ')));
ok('se crearon todas las hojas', ['publicado', 'equipos', 'modelo', 'capturas', 'predicciones', 'evaluacion', 'log'].every(n => E._sheets[n]));
ok('no quedó la hoja vacía por defecto', !E._sheets['Hoja 1']);
const D = api(E, { api: 'data' });
ok('la API devuelve partidos', D.matches && D.matches.length > 100, D.matches && D.matches.length + ' partidos');
ok('el paquete trae fuentes con hora y hash', D.sources.fixtures && D.sources.fixtures.at && D.sources.fixtures.hash);
ok('el modelo propio quedó cargado en la segunda corrida', D.matches.filter(m => m.model).length > 100, D.matches.filter(m => m.model).length + ' con modelo');
ok('las fichas existen para casi todos', D.matches.filter(m => m.hasForm).length / D.matches.length > 0.9);
ok('córners y amarillas del modelo propio en los partidos de ligas principales', D.matches.filter(m => m.model && m.model.cc && m.model.cc.corners && m.model.cc.cards).length > 50 && D.matches.every(m => !(m.model && m.model.cc && m.model.cc.corners) || (m.model.cc.corners.lam > 5 && m.model.cc.corners.lam < 16 && m.model.cc.corners.p['9.5'] > 0.1 && m.model.cc.corners.p['9.5'] < 0.9)), D.matches.filter(m => m.model && m.model.cc && m.model.cc.corners).length + ' con córners');
const F = api(E, { api: 'ficha', lg: 'E0', home: 'Liverpool', away: 'Brighton' });
ok('ficha de Liverpool–Brighton con muestra y fuente', F.home && F.home.all.n === 10 && /football-data/.test(F.home.source), F.home && `${F.home.all.n} partidos, ${F.home.all.from} a ${F.home.all.to}`);
const nPred = E._sheets.predicciones.rows.length - 1;
ok('se registraron predicciones', nPred > 0, nPred + ' predicciones');
const capt1 = E._sheets.capturas.rows.length;
E.actualizarCuotas();
ok('sin archivo nuevo no se duplican capturas', E._sheets.capturas.rows.length === capt1);
ok('sin cambios no se duplican predicciones', E._sheets.predicciones.rows.length - 1 === nPred);
const snapshot = E.loadPayload_();
E._setFail(['fixtures.csv']); E._cache['raw_fixtures'] = undefined; delete E._cache['raw_fixtures']; delete E._cache['raw_newFixtures'];
E.actualizarCuotas();
ok('si la fuente falla y no hay copia, NO se pisa el paquete bueno', E.loadPayload_() === snapshot);
ok('la falla quedó en el registro', logRows(E).slice(-3).some(r => r[3] === 'error'));
ok('el estado de la fuente muestra el error', !!JSON.parse(E._props['E_fuentes']).fixtures.error);
E._setFail([]); E.actualizarCuotas();
ok('al volver la fuente, se recupera', !JSON.parse(E._props['E_fuentes']).fixtures.error);
const S = api(E, { api: 'estado' });
ok('la API de estado devuelve el registro', S.log.length > 0 && S.fuentes.lastRun);
const PR = api(E, { api: 'predicciones' });
ok('la API de predicciones devuelve lo guardado', PR.length === nPred && PR[0].version_modelo === 'mercado-v2');
ok('el paquete entra en la caché (partes < 100 KB)', +E._cache.pl_n >= 1);
console.log('tamaño del paquete:', Math.round(snapshot.length / 1024), 'KB');
if (process.env.DUMP) { fs.mkdirSync('mock', { recursive: true });
  fs.writeFileSync('mock/data.json', E.doGet({ parameter: { api: 'data' } }).t);
  fs.writeFileSync('mock/estado.json', E.doGet({ parameter: { api: 'estado' } }).t);
  fs.writeFileSync('mock/predicciones.json', E.doGet({ parameter: { api: 'predicciones' } }).t);
  const fx = {}; D.matches.forEach(m => { fx[m.key] = JSON.parse(E.doGet({ parameter: { api: 'ficha', lg: m.lg, home: m.home, away: m.away } }).t); });
  fs.writeFileSync('mock/fichas.json', JSON.stringify(fx)); console.log('mock escrito'); }
// Hora de publicación: se usa Last-Modified y con cuotas viejas no se registran predicciones
{ global.__LM = 'Fri, 23 Oct 2026 13:46:58 GMT'; const before = E._sheets.predicciones.rows.length; E.actualizarCuotas();
  const f = JSON.parse(E._props['E_fuentes']).fixtures; ok('la hora de las cuotas es la de publicación (Last-Modified)', f.at === '2026-10-23T13:46:58.000Z' && f.atSource === 'publicado', f.at);
  ok('con cuotas de más de 12 h no se registran predicciones', E._sheets.predicciones.rows.length === before); global.__LM = null; }
{ const PR2 = api(E, { api: 'predicciones' }); const nA = PR2.filter(x => x.anulada).length;
  ok('predicciones de antes de la corrección quedan anuladas aparte, sin tocar el registro', nA === PR2.length && nA > 0 && E._sheets.predicciones.rows.length - 1 === PR2.length && E._sheets.anulaciones.rows.length - 1 === nA, nA + ' anuladas');
  E.actualizarCuotas(); ok('las anulaciones no se duplican', E._sheets.anulaciones.rows.length - 1 === nA); }
{ const bt = E.doGet({ parameter: { api: 'boot' } }).t; const m = bt.match(/^<script>window.__BOOT=([\s\S]*?);<\/script>/); let okb = false; try { okb = JSON.parse(m[1]).matches.length > 100; } catch (e) { }
  ok('?api=boot trae la web con los datos adentro', okb && !m[1].includes('<')); }

// The Odds API: sin clave no se llama; con clave se respeta el presupuesto, se unen los partidos y la probabilidad justa usa la cuota más nueva.
{ const E2 = makeEnv({}); E2.instalar(); global.__OACALLS = 0; E2.actualizarCuotas();
  ok('sin clave de The Odds API no se hace ninguna llamada', global.__OACALLS === 0);
  const P0 = JSON.parse(E2.loadPayload_());
  const ren = { 'Man United': 'Manchester United', 'Nott\'m Forest': 'Nottingham Forest', 'Wolves': 'Wolverhampton Wanderers', 'Ath Madrid': 'Atlético Madrid', 'Ath Bilbao': 'Athletic Bilbao' };
  const SPORT = { soccer_epl: 'E0', soccer_spain_la_liga: 'SP1', soccer_argentina_primera_division: 'ARG' };
  const T0 = Date.now(), iso = h => new Date(T0 + h * 36e5).toISOString();
  const OTH = { basketball_nba: [['Boston Celtics', 'New York Knicks', 10, [1.55, 2.6]], ['Denver Nuggets', 'Utah Jazz', 12, [1.2, 5.0]]], americanfootball_nfl: [['Kansas City Chiefs', 'Buffalo Bills', 20, [1.9, 2.0]]], tennis_atp_paris_masters: [['Jannik Sinner', 'Casper Ruud', 8, [1.25, 4.2]]] };
  const otherOdds = sp => (OTH[sp] || []).map(([H, A, h, p], i) => { const b = (k, t, o) => ({ key: k, title: t, markets: [{ key: 'h2h', last_update: iso(-1), outcomes: [{ name: H, price: o[0] }, { name: A, price: o[1] }] }] });
    return { id: sp + i, sport_title: sp === 'tennis_atp_paris_masters' ? 'ATP Paris Masters' : sp, home_team: H, away_team: A, commence_time: iso(h), bookmakers: [b('pinnacle', 'Pinnacle', p), b('williamhill', 'William Hill', p.map(x => Math.round(x * 0.97 * 100) / 100)), b('unibet_eu', 'Unibet', i === 0 ? [p[0] * 1.06, p[1] * 0.9].map(x => Math.round(x * 100) / 100) : p.map(x => Math.round(x * 0.96 * 100) / 100))] }; });
  global.__OA = url => {
    if (/\/v4\/sports\/\?apiKey/.test(url)) return [{ key: 'basketball_nba', group: 'Basketball', title: 'NBA', active: true, has_outrights: false }, { key: 'americanfootball_nfl', group: 'American Football', title: 'NFL', active: true, has_outrights: false }, { key: 'tennis_atp_paris_masters', group: 'Tennis', title: 'ATP Paris Masters', active: true, has_outrights: false }, { key: 'basketball_nba_championship_winner', group: 'Basketball', title: 'NBA Championship Winner', active: true, has_outrights: true }];
    const ev = url.match(/sports\/(\w+)\/events/); if (ev) return (OTH[ev[1]] || []).map(([H, A, h]) => ({ home_team: H, away_team: A, commence_time: iso(h) }));
    const sp = url.match(/sports\/(\w+)\/odds/)[1], k = SPORT[sp]; if (OTH[sp]) return otherOdds(sp); if (!k) return [];
    return P0.matches.filter(m => m.lg.split(':')[0] === k).map(m => { const H = ren[m.home] || m.home, A = ren[m.away] || m.away, f = m.fair ? m.fair.p : [0.45, 0.27, 0.28];
      const pr = (mg) => f.map(p => Math.round(1 / (p * mg) * 100) / 100);
      const mk = (o) => [{ key: 'h2h', last_update: '2026-10-24T23:10:01Z', outcomes: [{ name: H, price: o[0] }, { name: 'Draw', price: o[1] }, { name: A, price: o[2] }] }];
      return { id: m.key, home_team: H, away_team: A, commence_time: m.kickoff, bookmakers: [{ key: 'pinnacle', title: 'Pinnacle', markets: mk(pr(1.02)) }, { key: 'betfair_ex_eu', title: 'Betfair', markets: mk(pr(1.0)) }, { key: 'williamhill', title: 'William Hill', markets: mk(pr(1.06)) }, { key: 'tipico_de', title: 'Tipico', markets: mk(pr(0.97)) }] }; }); };
  // OddsPapi (Bet365 Argentina): nombres un poco distintos y una cuota de NBA mejor que la justa.
  const fx = (sid, tid, H, A, t, mk, ids, pr) => ({ fixtureId: 'id' + tid + H.length + A.length, sportId: sid, tournamentId: tid, tournamentName: tid === 3061 ? 'WTA Osaka, Japan Women Singles' : 'x', participant1Name: H, participant2Name: A, startTime: t, bookmakerOdds: { 'bet365.bet.ar': { bookmakerIsActive: true, suspended: false, markets: { [mk]: { outcomes: Object.fromEntries(ids.map((id, i) => [id, { players: { 0: { active: true, price: pr[i], changedAt: iso(-0.5) } } }])) } } } } });
  const argM = P0.matches.filter(m => m.lg.split(':')[0] === 'ARG' && Date.parse(m.kickoff) > T0).slice(0, 4);
  global.__OP = url => {
    if (url.includes('/account')) return { api_key: 'NO-DEBE-APARECER', request_limit: 250, request_count: 11 };
    if (url.includes('/tournaments')) return [{ tournamentId: 3061, categoryName: 'WTA', tournamentName: 'WTA Osaka, Japan Women Singles', upcomingFixtures: 2 }, { tournamentId: 3063, categoryName: 'WTA', tournamentName: 'WTA Osaka, Japan Women Doubles', upcomingFixtures: 1 }];
    if (url.includes('odds-by-tournaments') && /\b155\b/.test(url)) { const bk = (url.match(/bookmaker=([^&]+)/) || [])[1]; const L = __opA(); return bk === 'bet365.bet.ar' ? L : L.map(f => { const o = JSON.parse(JSON.stringify(f)); o.bookmakerOdds = { [bk]: o.bookmakerOdds['bet365.bet.ar'] }; return o; }); }
    return __opRest(url); };
  const __opA = () => [fx(10, 155, 'Tigre', 'Barracas Central', iso(40), '101', ['101', '102', '103'], [2.2, 3.0, 3.6])].concat(argM.map(m => fx(10, 155, m.home + ' FC', m.away, m.kickoff, '101', ['101', '102', '103'], [2.5, 3.1, 2.9])).concat([fx(11, 132, 'Boston Celtics', 'New York Knicks', iso(10), '111', ['111', '112'], [1.7, 2.2]), fx(11, 132, 'Miami Heat', 'Orlando Magic', iso(30), '111', ['111', '112'], [1.9, 1.9]), fx(14, 31, 'Kansas City Chiefs', 'Buffalo Bills', iso(20), '141', ['141', '142'], [1.85, 1.95])]));
  const __opRest = url => { if (url.includes('odds-by-tournaments')) return [];
    return {}; };
  E2._props.ODDSPAPI_KEY = 'clave-op';
  E2._props.ODDS_API_KEY = ' clave-de-prueba '; global.__OACALLS = 0; global.__OAREM = 500; E2.actualizarCuotas();
  const P1 = JSON.parse(E2.loadPayload_()), st = JSON.parse(E2._props.E_oa);
  ok('con clave se llama a The Odds API dentro del presupuesto diario', global.__OACALLS > 0 && st.usedDay <= Math.floor((500 - 25) / 8), global.__OACALLS + ' llamadas · ' + st.usedDay + ' créditos hoy');
  const withOA = P1.matches.filter(m => m.oa);
  ok('los partidos se unen con The Odds API aunque los nombres difieran', withOA.length > 10 && withOA.some(m => m.home === 'Man United' || m.away === 'Man United' || m.home === "Nott'm Forest" || m.away === "Nott'm Forest"), withOA.length + ' unidos');
  ok('no se une un partido con otro equivocado', withOA.every(m => require('./core.js').teamSim(m.home, m.oa.names[0]) >= 0.5 && require('./core.js').teamSim(m.away, m.oa.names[1]) >= 0.5));
  ok('la probabilidad justa usa Pinnacle actualizada cuando es más nueva', withOA.filter(m => m.fair && /The Odds API/.test(m.fair.ref)).length === withOA.filter(m => m.fair).length);
  ok('la mejor casa europea queda con nombre', withOA.every(m => m.oa.best[0] && typeof m.oa.best[0][1] === 'string'));
  ok('el paquete informa el estado de The Odds API', P1.oa && P1.oa.configured && P1.oa.matched === withOA.length && P1.oa.remaining === global.__OAREM);
  ok('quedó registrada la descarga en la hoja cuotas_api', E2._sheets.cuotas_api.rows.length > 1);
  const sig = P1.matches.filter(m => (m.signals || []).length);
  ok('las señales v2 traen casa y hora de la cuota', sig.every(m => m.signals.every(s => s.book && s.at)), sig.length + ' partidos con señal');
  const O = P1.other;
  ok('tenis, NBA y NFL llegan al paquete con probabilidad justa de Pinnacle', O && O.events.filter(e => e.fair).length === 4 && O.events.filter(e => e.fair).every(e => e.fair && e.fair.ref === 'Pinnacle' && Math.abs(e.fair.p[0] + e.fair.p[1] - 1) < 1e-4), O ? O.events.length + ' eventos' : 'sin otros');
  ok('el tenis lleva el nombre del torneo', O.events.some(e => e.sport === 'tenis' && e.league === 'ATP Paris Masters'));
  const osig = O.events.filter(e => e.signals.length);
  ok('una cuota europea por encima de la justa da señal con casa y hora (y solo esas)', osig.length === 3 && osig.every(e => ['Boston Celtics', 'Kansas City Chiefs', 'Jannik Sinner'].includes(e.home) && e.signals.length === 1 && e.signals[0].sel === 0 && e.signals[0].book === (e.home === 'Boston Celtics' ? 'Bet365 Argentina' : 'Unibet') && e.signals[0].at), osig.map(e => e.home).join(','));
  ok('la señal de otro deporte queda en el registro de predicciones', E2._sheets.predicciones.rows.some(r => r[1] === 'mercado-otros-v1' && r[7] === 'Ganador' && r[8] === 'Gana Boston Celtics' && r[12] === 'Bet365 Argentina' && r[13] === 1.7));
  ok('los mercados de campeón (outrights) no se piden', !Object.keys(JSON.parse(E2._props.E_oa).last).some(k => /winner/.test(k)));
  const b3 = P1.matches.filter(m => m.odds.x12.B3A && m.src !== 'oddspapi');
  ok('fútbol argentino: se une la cuota de Bet365 Argentina aunque el nombre difiera', b3.length === argM.length && b3.every(m => m.b3a && m.b3a.at), b3.length + ' de ' + argM.length);
  if (process.env.DBG) console.log(global.__OPCALLS, logRows(E2).filter(r => /oddspapi/.test(r[2])));
  ok('OddsPapi: como mucho 5 torneos por consulta y una sola casa (Argentina, NBA, NFL y tenis juntos; Europa aparte)', global.__OPCALLS.filter(u => u.includes('odds-by-tournaments') && u.includes('bet365.bet.ar')).length === 2 && global.__OPCALLS.filter(u => u.includes('odds-by-tournaments')).every(u => u.match(/tournamentIds=([\d,]+)/)[1].split(',').length <= 5) && global.__OPCALLS.some(u => /bookmaker=bet365\.bet\.ar/.test(u) && /tournamentIds=[\d,]*\b155\b/.test(u) && /\b132\b/.test(u) && /3061/.test(u) && !/3063/.test(u)));
  const tig = P1.matches.find(m => m.home === 'Tigre');
  ok('un partido argentino que solo publicó Bet365 Argentina se agrega a la lista con su cuota', tig && tig.src === 'oddspapi' && tig.region === 'arg' && tig.odds.x12.B3A[0] === 2.2 && P1.matches.filter(m => m.home === 'Tigre').length === 1);
  ok('tenis: "Rune, Holger" se reconoce como "Holger Rune"', require('./core.js').teamSim('Rune, Holger', 'Holger Rune') === 1);
  const cel = P1.other.events.find(e => e.home === 'Boston Celtics');
  ok('NBA: el partido lleva la cuota de Bet365 Argentina y su hora', cel.b365 && cel.b365[0] === 1.7 && cel.b365At);
  ok('si Bet365 Argentina paga más que la justa, la señal es de Bet365 Argentina', cel.signals.some(s => s.book === 'Bet365 Argentina' && s.sel === 0));
  const heat = P1.other.events.find(e => e.home === 'Miami Heat');
  ok('un partido que solo tiene Bet365 Argentina aparece sin cuota justa', heat && !heat.fair && heat.b365 && heat.signals.length === 0);
  ok('la clave de OddsPapi y la respuesta de la cuenta no quedan en la planilla', !JSON.stringify(E2._sheets).includes('NO-DEBE-APARECER') && !JSON.stringify(E2._sheets).includes('clave-op'));
  ok('el paquete informa el estado de OddsPapi', P1.op && P1.op.configured && P1.op.matched === argM.length + 1 && P1.op.used === 16);
  const sinner = P1.other.events.find(e => e.home === 'Jannik Sinner');
  ok('tenis: el modelo en prueba (Elo por superficie) acompaña la cuota justa, sin generar señales propias', sinner && sinner.model && sinner.model.version === 'tenis-elo-v1' && sinner.model.p[0] > 0.6 && sinner.signals.every(x => x.book !== 'modelo'), sinner && JSON.stringify(sinner.model));
  ok('tenis: queda guardado para compararlo con el mercado cuando haya resultado', E2._sheets.modelos_prueba.rows.some(r => r[0] === 'tenis_pend' && /Sinner/.test(r[2])));
  ok('Betano de otro país queda como referencia rotulada (no da señales)', P1.ref && /Betano/.test(P1.ref.betano) && P1.matches.some(m => m.odds.x12.BTN && m.btn && /Betano/.test(m.btn.label)) && P1.matches.every(m => (m.signals || []).every(x => !/Betano/.test(x.book))), P1.ref && P1.ref.betano);
  const opCalls = global.__OPCALLS.length; E2.actualizarCuotas();
  ok('una segunda corrida enseguida no gasta consultas de OddsPapi (solo mira la cuenta)', global.__OPCALLS.slice(opCalls).every(u => u.includes('/account')));
  const calls = global.__OACALLS; E2.actualizarCuotas();
  ok('una segunda corrida enseguida no gasta créditos', global.__OACALLS === calls);
  if (process.env.DUMP) fs.writeFileSync('mock/data_oa.json', E2.doGet({ parameter: { api: 'data' } }).t);
  // ---- Goleadores (+5 h: los partidos de la Premier quedan a menos de 12 h), mercados genéricos y resultados ----
  const m0 = P0.matches.find(m => m.lg === 'E0'), H0 = ren[m0.home] || m0.home, A0 = ren[m0.away] || m0.away;
  const prevOA = global.__OA, prevOP = global.__OP;
  global.__OA = url => {
    const evo = url.match(/events\/([^/]+)\/odds/);
    if (evo) { global.__GSCALLS = (global.__GSCALLS || 0) + 1; const yn = (b, t, rows) => ({ key: b, title: t, markets: [{ key: 'player_goal_scorer_anytime', last_update: new Date(Date.now() - 36e5).toISOString(), outcomes: rows.flatMap(([n, y, no]) => [{ name: 'Yes', description: n, price: y }].concat(no ? [{ name: 'No', description: n, price: no }] : [])) }] });
      return { id: decodeURIComponent(evo[1]), home_team: H0, away_team: A0, commence_time: m0.kickoff, bookmakers: [yn('draftkings', 'DraftKings', [['Bukayo Saka', 2.6, 1.45], ['Cole Palmer', 3.0]]), yn('fanduel', 'FanDuel', [['Bukayo Saka', 2.5], ['Cole Palmer', 3.2]])] }; }
    return prevOA(url); };
  global.__OP = url => {
    if (url.includes('/markets')) return [{ marketId: 1501, sportId: 10, playerProp: true, marketName: 'Anytime Goalscorer', marketLength: 1, outcomes: [{ outcomeId: 1501, outcomeName: 'Yes' }] }, { marketId: 131, sportId: 13, playerProp: false, marketName: 'Winner (incl. extra innings)', marketLength: 2, handicap: 0, outcomes: [{ outcomeId: 132, outcomeName: '2' }, { outcomeId: 131, outcomeName: '1' }] }];
    if (url.includes('odds-by-tournaments') && /\b17\b/.test(url)) { const f = fx(10, 17, m0.home, m0.away, m0.kickoff, '101', ['101', '102', '103'], [2.1, 3.4, 3.5]); f.bookmakerOdds['bet365.bet.ar'].markets['1501'] = { outcomes: { 1501: { players: { 9001: { active: true, price: 3.0, playerName: 'Saka, Bukayo', changedAt: new Date(Date.now() - 18e5).toISOString() }, 9002: { active: true, price: 3.1, playerName: 'Palmer, Cole' } } } } }; return [f]; }
    if (url.includes('/settlements')) return { fixtureId: 'x', markets: { 1501: { outcomes: { 1501: { players: { 9001: { result: 'WIN' } } } } } } };
    return prevOP(url); };
  global.__NOW = FIXED + 5 * 36e5; global.__GSCALLS = 0; { const so = JSON.parse(E2._props.E_op); delete so.okB; E2._props.E_op = JSON.stringify(so); }
  E2.actualizarCuotas();
  const P2 = JSON.parse(E2.loadPayload_()), g0 = P2.matches.find(m => m.key === m0.key);
  if (process.env.DUMP) fs.writeFileSync('mock/data_gs.json', E2.doGet({ parameter: { api: 'data' } }).t);
  ok('goleadores: se pide la cuota de "anota en cualquier momento" solo de partidos grandes a menos de 12 h', global.__GSCALLS >= 1 && global.__GSCALLS <= 4, global.__GSCALLS + ' consultas');
  ok('goleadores: cuota justa sin margen con "sí" y "no" (método potencia) y aproximada con solo "sí"', g0 && g0.gs && g0.gs.players.find(p => p.n === 'Bukayo Saka').m === 'dos lados' && g0.gs.players.find(p => p.n === 'Cole Palmer').m === 'aproximada', g0 && g0.gs ? JSON.stringify(g0.gs.players.map(p => [p.n, p.p, p.m])) : 'sin gs');
  ok('goleadores: se une la cuota de Bet365 Argentina aunque el nombre venga "Apellido, Nombre"', g0.gs.players.find(p => p.n === 'Bukayo Saka').b3a === 3.0);
  ok('goleadores: Bet365 Argentina por encima de la justa da señal; la aproximada pide más margen', g0.gs.signals.length === 1 && g0.gs.signals[0].player === 'Bukayo Saka', JSON.stringify(g0.gs.signals));
  ok('goleadores: la señal queda en el registro con la casa, la cuota y el jugador', E2._sheets.predicciones.rows.some(r => r[1] === 'goleador-v1' && r[8] === 'Anota: Bukayo Saka' && r[12] === 'Bet365 Argentina' && /OP:[^:]+:9001/.test(r[10])));
  ok('mercados de OddsPapi descubiertos (béisbol y goleadores)', JSON.parse(E2._props.E_op).mk.goal.id === '1501' && JSON.parse(E2._props.E_op).mk['13'][0] === '131' && JSON.parse(E2._props.E_op).mk['13'][1][0] === '131');
  ok('hoja "mercados": capturas genéricas por deporte, mercado y jugador', E2._sheets.mercados && E2._sheets.mercados.rows.some(r => r[7] === 'Anota en cualquier momento' && r[9] === 'Bukayo Saka') && E2._sheets.mercados.rows.some(r => r[1] === 'nba' && r[7] === 'Ganador'));
  ok('el paquete informa el motor y el método para sacar el margen de cada deporte', P2.engine && P2.engine.version === 'motor-v1' && P2.engine.devig.nba === 'odds_ratio' && P2.engine.devig.futbol === 'potencia');
  // Resultados: NBA por The Odds API /scores y goleadores por OddsPapi /settlements.
  global.__OA = url => { if (url.includes('/scores')) { const sp = url.match(/sports\/(\w+)\/scores/)[1]; if (sp === 'tennis_atp_paris_masters') return [{ id: 'tennis_atp_paris_masters0', completed: true, home_team: 'Jannik Sinner', away_team: 'Casper Ruud', scores: [{ name: 'Jannik Sinner', score: '2' }, { name: 'Casper Ruud', score: '0' }] }]; return sp === 'basketball_nba' ? [{ id: 'basketball_nba0', completed: true, home_team: 'Boston Celtics', away_team: 'New York Knicks', scores: [{ name: 'Boston Celtics', score: '112' }, { name: 'New York Knicks', score: '104' }] }] : []; } return prevOA(url); };
  global.__NOW = FIXED + 20 * 36e5;
  const nEv = E2.evaluarOtros_(Date.now()), evr = E2._sheets.evaluacion.rows;
  ok('resultados automáticos de NBA: la señal se marca con el ganador real', evr.some(r => r[0] === 'NBA|basketball_nba0' && r[1] === 'Gana Boston Celtics' && r[2] === 112), nEv + ' evaluadas');
  ok('tenis: con el resultado se actualiza el rating y se suma a la comparación modelo contra mercado', (() => { const so = JSON.parse(E2._props.E_sombra || 'null'); return so && so.tenis.n === 1 && so.tenis.llm > 0 && so.tenis.llk > 0; })(), E2._props.E_sombra);
  ok('resultados de goleadores: OddsPapi dice si el jugador anotó', evr.some(r => r[0] === m0.key + '#Bukayo Saka' && r[1] === 'Anota: Bukayo Saka'));
  // Telegram: señales nuevas (solo Bet365) y alertas con tope de una cada 6 h.
  E2._props.TELEGRAM_TOKEN = 'tok'; global.__TG = [];
  const rowsT = [[new Date(), 'goleador-v1', m0.key + '#Bukayo Saka', 'Inglaterra · Premier League', m0.kickoff, m0.home, m0.away, 'Anota en cualquier momento', 'Anota: Bukayo Saka', 0.34, 'x', 3.0, 'Bet365 Argentina', 3.0, 0.02, new Date().toISOString(), 'completa · goleador'], [new Date(), 'mercado-v2', 'k2', 'Liga', m0.kickoff, 'A', 'B', '1X2', 'Local', 0.5, 'x', 2.2, 'Tipico (The Odds API)', '', 0.1, '', 'completa']];
  const nT = E2.avisarSenales_(rowsT), sent = global.__TG.filter(x => x.m === 'sendMessage');
  ok('Telegram: toma solo el chat del grupo, saluda y manda solo las señales de Bet365 con link a la ficha', nT === 1 && sent.length === 2 && sent[1].body.chat_id === -1001 && /Bukayo Saka/.test(sent[1].body.text) && /goleadores/.test(sent[1].body.text) && !/Tipico/.test(sent[1].body.text), sent.map(x => x.body.text.slice(0, 60)).join(' | '));
  const a1 = E2.alerta_('prueba', 'algo falló'), a2 = E2.alerta_('prueba', 'algo falló otra vez');
  ok('Telegram: las alertas de fallas no se repiten más de una vez cada 6 h', a1 === true && a2 === false);
  ok('Telegram: el token nunca queda en la planilla ni en el registro', !JSON.stringify(E2._sheets).includes('tok/'));
  delete E2._props.TELEGRAM_TOKEN;
  // Cuotas compartidas por el grupo.
  const q1 = JSON.parse(E2.doGet({ parameter: { api: 'cargar', k: 'x', m: m0.key, b: 'Betano', sel: '0', o: '2,30' } }).t);
  ok('cuotas compartidas: sin código configurado no se puede cargar', /no está activada/.test(q1.error || ''));
  E2._props.CARGA_CODIGO = 'grupo123';
  const q2 = JSON.parse(E2.doGet({ parameter: { api: 'cargar', k: 'mal', m: m0.key, b: 'Betano', sel: '0', o: '2,30' } }).t);
  const q3 = JSON.parse(E2.doGet({ parameter: { api: 'cargar', k: 'grupo123', m: m0.key, b: 'Betano', sel: '0', o: '2,30', n: 'Cata' } }).t);
  const q4 = JSON.parse(E2.doGet({ parameter: { api: 'cargar', k: 'grupo123', m: m0.key, b: 'CasaRara', sel: '0', o: '2,30' } }).t);
  const us = JSON.parse(E2.doGet({ parameter: { api: 'usuarios' } }).t);
  ok('cuotas compartidas: código incorrecto o casa no válida se rechazan; la correcta se guarda y la ven todos', /incorrecto/.test(q2.error) && q3.ok && /inválidos/.test(q4.error) && us[m0.key] && us[m0.key][0].o === 2.3 && us[m0.key][0].b === 'Betano' && us[m0.key][0].n === 'Cata', JSON.stringify(us[m0.key]));
  if (process.env.DUMP) fs.writeFileSync('mock/usuarios.json', JSON.stringify(us));
  global.__NOW = null;
  global.__OA = null; global.__OP = null; }

// Motor único y béisbol (unidades).
{ const c = require('./core.js');
  const pr = c.devig([1.9, 1.95], 'odds_ratio'), pp = c.devig([1.5, 4.0, 6.0], 'potencia');
  ok('motor: odds ratio y potencia devuelven probabilidades que suman 1', Math.abs(pr[0] + pr[1] - 1) < 1e-9 && Math.abs(pp.reduce((a, b) => a + b) - 1) < 1e-9);
  const fair = c.fairFromRefs([{ key: 'pin', name: 'Pinnacle', o: null }, { key: 'avg', name: 'Promedio', o: [1.8, 2.1], n: 2, minBooks: 4 }, { key: 'bfx', name: 'Betfair', o: [1.85, 2.15] }], 'odds_ratio');
  ok('motor: usa la primera referencia válida (salta las vacías y los promedios con pocas casas)', fair && fair.refKey === 'bfx' && fair.method === 'odds_ratio');
  const sg = c.pickSignals({ p: [0.55, 0.45] }, [[{ odd: 1.9, book: 'A', at: 1000 }, { odd: 1.95, book: 'B', at: 1000 }], [{ odd: 2.0, book: 'C', at: 1000 }]], 2000);
  ok('motor: elige la mejor cuota por resultado y marca señal solo si supera el umbral', sg.length === 1 && sg[0].book === 'B' && sg[0].sel === 0);
  const mlbFx = { fixtureId: 'm1', sportId: 13, tournamentId: 109, tournamentName: 'MLB', participant1Name: 'New York Yankees', participant2Name: 'Boston Red Sox', startTime: '2027-04-01T23:05:00Z', bookmakerOdds: { 'bet365.bet.ar': { markets: { 131: { outcomes: { 131: { players: { 0: { price: 1.8, changedAt: '2027-04-01T12:00:00Z' } } }, 132: { players: { 0: { price: 2.05 } } } } } } } } };
  const op = c.compactOP(mlbFx, { 13: ['131', ['131', '132']] });
  ok('béisbol (MLB): se lee la cuota de Bet365 Argentina del ganador', op && op.code === 'MLB' && op.o[0] === 1.8 && op.o[1] === 2.05);
  const bo = c.buildOther({ MLB: { fetched: '2027-04-01T12:00:00Z', events: [{ id: 'g1', home: 'New York Yankees', away: 'Boston Red Sox', t: '2027-04-01T23:05:00Z', at: '2027-04-01T12:00:00Z', pin: [1.75, 2.2], best: [[1.8, 'Unibet'], [2.3, 'Marathon']], n: 3, books: {} }] } }, Date.parse('2027-04-01T13:00:00Z'), [op]);
  ok('béisbol (MLB): entra al mismo motor (cuota justa con odds ratio, Bet365 Argentina y señal)', bo.events.length === 1 && bo.events[0].sport === 'mlb' && bo.events[0].fair.method === 'odds_ratio' && bo.events[0].b365[0] === 1.8, JSON.stringify(bo.events[0] && bo.events[0].signals)); }

if (process.env.CODEGS) ok('?api=app devuelve la web v5', E.doGet({ parameter: { api: 'app' } }).t === fs.readFileSync('app5.html', 'utf8'));
console.log(`\n${pass} pasaron · ${fail} fallaron`); process.exit(fail ? 1 : 0);
