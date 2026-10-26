/* =========================================================================
   Apostar con criterio · núcleo de datos (compartido entre Apps Script y Node)
   - Sin dependencias. Las funciones de este archivo no tocan servicios de
     Google: reciben texto CSV y devuelven objetos. Así se pueden probar fuera.
   ========================================================================= */
var CORE_VERSION = '2026-10-26.1';

var BOOKS = {
  B365: 'Bet365', BFD: 'Betfred', BV: 'BetVictor', BW: 'Bwin', PP: 'Paddy Power',
  SKB: 'Sky Bet', PS: 'Pinnacle', BFE: 'Betfair Exchange', Max: 'Mejor cuota (casa no identificada)', PIN: 'Pinnacle · actualizada', BFX: 'Betfair Exchange · actualizada', B3A: 'Bet365 Argentina',
  Avg: 'Promedio de casas'
};
var BOOK_KEYS = ['B365', 'BFD', 'BV', 'BW', 'PP', 'SKB', 'PS', 'BFE', 'Max', 'Avg'];
var REAL_BOOKS = ['B365', 'BFD', 'BV', 'BW', 'PP', 'SKB', 'PS']; // casas identificadas (sin Betfair, que cobra comisión)

var MAIN_LEAGUES = {
  E0: 'Inglaterra · Premier League', E1: 'Inglaterra · Championship', E2: 'Inglaterra · League One', E3: 'Inglaterra · League Two', EC: 'Inglaterra · National League',
  SC0: 'Escocia · Premiership', SC1: 'Escocia · Championship', SC2: 'Escocia · League One', SC3: 'Escocia · League Two',
  D1: 'Alemania · Bundesliga', D2: 'Alemania · 2. Bundesliga', I1: 'Italia · Serie A', I2: 'Italia · Serie B',
  SP1: 'España · LaLiga', SP2: 'España · LaLiga 2', F1: 'Francia · Ligue 1', F2: 'Francia · Ligue 2',
  N1: 'Países Bajos · Eredivisie', B1: 'Bélgica · Pro League', P1: 'Portugal · Primeira Liga', T1: 'Turquía · Süper Lig', G1: 'Grecia · Super League'
};
var NEW_LEAGUES = { // país en el CSV → [código de archivo, nombre en castellano]
  Argentina: ['ARG', 'Argentina'], Austria: ['AUT', 'Austria'], Brazil: ['BRA', 'Brasil'], China: ['CHN', 'China'],
  Denmark: ['DNK', 'Dinamarca'], Finland: ['FIN', 'Finlandia'], Ireland: ['IRL', 'Irlanda'], Japan: ['JPN', 'Japón'],
  Mexico: ['MEX', 'México'], Norway: ['NOR', 'Noruega'], Poland: ['POL', 'Polonia'], Romania: ['ROU', 'Rumania'],
  Russia: ['RUS', 'Rusia'], Sweden: ['SWE', 'Suecia'], Switzerland: ['SWZ', 'Suiza'], USA: ['USA', 'Estados Unidos']
};
var EURO_COUNTRIES = ['Austria', 'Denmark', 'Finland', 'Ireland', 'Norway', 'Poland', 'Romania', 'Russia', 'Sweden', 'Switzerland'];

/* ---------- CSV ---------- */
function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  var rows = [], row = [], cell = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  rows = rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  if (!rows.length) return [];
  var head = rows[0].map(function (h) { return String(h).trim(); });
  return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, j) { if (h) o[h] = r[j] === undefined ? '' : String(r[j]).trim(); }); return o; });
}
function num(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }
function odd(v) { var x = num(v); return x !== null && x > 1.001 && x < 1000 ? x : null; }

/* ---------- fechas: football-data publica la hora del Reino Unido ---------- */
function lastSundayUTC(y, m) { var d = new Date(Date.UTC(y, m + 1, 0)); return d.getUTCDate() - d.getUTCDay(); }
function ukToUtcMs(dateStr, timeStr) {
  var p = String(dateStr || '').split('/'); if (p.length !== 3) return null;
  var dd = +p[0], mm = +p[1], yy = +p[2]; if (yy < 100) yy += 2000;
  var t = String(timeStr || '12:00').split(':'); var hh = +t[0] || 0, mi = +t[1] || 0;
  if (!dd || !mm || !yy) return null;
  var u = Date.UTC(yy, mm - 1, dd, hh, mi);
  var a = Date.UTC(yy, 2, lastSundayUTC(yy, 2), 1), b = Date.UTC(yy, 9, lastSundayUTC(yy, 9), 1);
  if (u - 36e5 >= a && u - 36e5 < b) u -= 36e5; // horario de verano británico
  return u;
}
function isoDate(ms) { return new Date(ms).toISOString().slice(0, 10); }

/* ---------- normalización de partidos próximos ---------- */
function implied(arr) { return arr.reduce(function (s, x) { return s + 1 / x; }, 0); }
function pickTriple(r, pre, suf) { var o = [odd(r[pre + 'H' + (suf || '')]), odd(r[pre + 'D' + (suf || '')]), odd(r[pre + 'A' + (suf || '')])]; return o.every(Boolean) ? o : null; }

function normalizeFixture(r, issues) {
  var main = !!r.Div, lg, lgName, country, home, away;
  if (main) { lg = r.Div; lgName = MAIN_LEAGUES[lg] || lg; country = lgName.split(' · ')[0]; home = r.HomeTeam; away = r.AwayTeam; }
  else {
    var c = NEW_LEAGUES[r.Country]; var league = String(r.League || '').trim();
    lg = (c ? c[0] : r.Country) + ':' + league; lgName = (c ? c[1] : r.Country) + ' · ' + league; country = c ? c[1] : r.Country; home = r.Home; away = r.Away;
  }
  if (!home || !away) { issues.push({ type: 'sin_equipos', row: r }); return null; }
  var ts = ukToUtcMs(r.Date, r.Time);
  if (ts === null) { issues.push({ type: 'fecha_invalida', match: home + ' vs ' + away, value: r.Date + ' ' + r.Time }); return null; }
  var m = {
    key: isoDate(ts) + '|' + lg + '|' + home + '|' + away,
    lg: lg, league: lgName, country: country,
    region: main ? 'eur' : (r.Country === 'Argentina' ? 'arg' : (EURO_COUNTRIES.indexOf(r.Country) >= 0 ? 'eur' : 'otr')),
    home: home, away: away, kickoff: new Date(ts).toISOString(), referee: r.Referee || null,
    odds: { x12: {}, ou25: {}, ah: null }, issues: []
  };
  BOOK_KEYS.forEach(function (b) {
    var t = pickTriple(r, b);
    if (!t) return;
    var s = implied(t);
    // Una cuota cuya suma de probabilidades no tiene sentido es un dato roto o un mercado sin liquidez.
    var lo = b === 'Max' ? 0.85 : 0.97, hi = b === 'BFE' ? 1.12 : 1.25;
    if (s < lo || s > hi) { m.issues.push(b + ': cuotas incoherentes (suma ' + (s * 100).toFixed(0) + '%)'); return; }
    m.odds.x12[b] = t;
  });
  ['B365', 'Max', 'Avg', 'BFE', 'PS'].forEach(function (b) {
    var o = odd(r[b + '>2.5']), u = odd(r[b + '<2.5']);
    if (o && u) { var s = 1 / o + 1 / u; if (s > (b === 'Max' ? 0.9 : 0.97) && s < 1.2) m.odds.ou25[b] = [o, u]; else m.issues.push(b + ' más/menos 2,5: incoherente'); }
  });
  var line = num(r.AHh);
  if (line !== null) {
    var ah = { line: line };
    ['B365', 'Max', 'Avg', 'BFE', 'PS'].forEach(function (b) { var h = odd(r[b + 'AHH']), a = odd(r[b + 'AHA']); if (h && a) ah[b] = [h, a]; });
    if (Object.keys(ah).length > 1) m.odds.ah = ah;
  }
  if (!Object.keys(m.odds.x12).length) { issues.push({ type: 'sin_cuotas', match: m.key }); return null; }
  return m;
}

function normalizeFixtures(rows) {
  var issues = [], seen = {}, out = [], dups = 0;
  rows.forEach(function (r) {
    var m = normalizeFixture(r, issues); if (!m) return;
    if (seen[m.key]) { dups++; return; } seen[m.key] = 1; out.push(m);
  });
  out.sort(function (a, b) { return a.kickoff < b.kickoff ? -1 : a.kickoff > b.kickoff ? 1 : 0; });
  return { matches: out, issues: issues, duplicates: dups };
}

/* ---------- resultados históricos ---------- */
function normalizeResult(r, lgOverride) {
  var main = !!r.Div;
  var hg = num(main ? r.FTHG : r.HG), ag = num(main ? r.FTAG : r.AG);
  var ts = ukToUtcMs(r.Date, r.Time);
  if (hg === null || ag === null || ts === null) return null;
  var c = NEW_LEAGUES[r.Country];
  return {
    ts: ts, lg: lgOverride || (main ? r.Div : (c ? c[0] : r.Country) + ':' + String(r.League || '').trim()),
    home: main ? r.HomeTeam : r.Home, away: main ? r.AwayTeam : r.Away, hg: hg, ag: ag,
    hthg: num(r.HTHG), htag: num(r.HTAG), hxg: num(r.HxG), axg: num(r.AxG),
    hs: num(r.HS), as: num(r.AS), hst: num(r.HST), ast: num(r.AST), hc: num(r.HC), ac: num(r.AC),
    hy: num(r.HY), ay: num(r.AY), hr: num(r.HR), ar: num(r.AR),
    closing: pickTriple(r, 'PSC') || pickTriple(r, 'AvgC') || pickTriple(r, 'B365C')
  };
}
function normalizeResults(rows, lgOverride) { return rows.map(function (r) { return normalizeResult(r, lgOverride); }).filter(Boolean).sort(function (a, b) { return a.ts - b.ts; }); }

/* ---------- forma de los equipos (siempre con muestra, período y fuente) ---------- */
function avg(a) { var v = a.filter(function (x) { return x !== null && x !== undefined; }); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; }
function teamForm(results, team, beforeMs, n, venue) {
  var games = results.filter(function (g) { return g.ts < beforeMs && (venue === 'home' ? g.home === team : venue === 'away' ? g.away === team : (g.home === team || g.away === team)); });
  games = games.slice(-n);
  if (!games.length) return { n: 0 };
  var rows = games.map(function (g) {
    var h = g.home === team;
    return {
      gf: h ? g.hg : g.ag, ga: h ? g.ag : g.hg, xgf: h ? g.hxg : g.axg, xga: h ? g.axg : g.hxg,
      sf: h ? g.hs : g.as, sa: h ? g.as : g.hs, stf: h ? g.hst : g.ast, cf: h ? g.hc : g.ac, ca: h ? g.ac : g.hc,
      y: h ? g.hy : g.ay, r: h ? g.hr : g.ar, opp: h ? g.away : g.home, venue: h ? 'L' : 'V', ts: g.ts
    };
  });
  var res = rows.map(function (x) { return x.gf > x.ga ? 'G' : x.gf === x.ga ? 'E' : 'P'; });
  function r1(x, d) { return x === null ? null : Math.round(x * Math.pow(10, d || 2)) / Math.pow(10, d || 2); }
  return {
    n: rows.length, from: isoDate(rows[0].ts), to: isoDate(rows[rows.length - 1].ts),
    seq: res.join(''), w: res.filter(function (x) { return x === 'G'; }).length, d: res.filter(function (x) { return x === 'E'; }).length, l: res.filter(function (x) { return x === 'P'; }).length,
    gf: r1(avg(rows.map(function (x) { return x.gf; }))), ga: r1(avg(rows.map(function (x) { return x.ga; }))),
    xgf: r1(avg(rows.map(function (x) { return x.xgf; }))), xga: r1(avg(rows.map(function (x) { return x.xga; }))),
    xgN: rows.filter(function (x) { return x.xgf !== null; }).length,
    sf: r1(avg(rows.map(function (x) { return x.sf; })), 1), stf: r1(avg(rows.map(function (x) { return x.stf; })), 1),
    cf: r1(avg(rows.map(function (x) { return x.cf; })), 1), ca: r1(avg(rows.map(function (x) { return x.ca; })), 1),
    cards: r1(avg(rows.map(function (x) { return x.y === null ? null : x.y + 2 * (x.r || 0); })), 1),
    btts: r1(rows.filter(function (x) { return x.gf > 0 && x.ga > 0; }).length / rows.length),
    over25: r1(rows.filter(function (x) { return x.gf + x.ga > 2; }).length / rows.length),
    cs: r1(rows.filter(function (x) { return x.ga === 0; }).length / rows.length),
    last: rows.slice(-5).map(function (x) { return [isoDate(x.ts), x.venue, x.opp, x.gf, x.ga]; }),
    restDays: Math.round((beforeMs - rows[rows.length - 1].ts) / 864e5 * 10) / 10
  };
}

/* ---------- modelo propio v1: Poisson con fuerzas de ataque y defensa ----------
   Experimental: se muestra al lado del mercado y NO genera oportunidades hasta
   que la validación fuera de muestra demuestre que suma información. */
var MODEL_VERSION = 'poisson-fuerzas-v1';
function teamStrengths(results, beforeMs, halfLifeDays) {
  var hl = (halfLifeDays || 180) * 864e5, games = results.filter(function (g) { return g.ts < beforeMs; });
  if (games.length < 40) return null;
  var W = 0, HG = 0, AG = 0, t = {};
  games.forEach(function (g) {
    var w = Math.pow(0.5, (beforeMs - g.ts) / hl); W += w; HG += w * g.hg; AG += w * g.ag;
    [g.home, g.away].forEach(function (x) { if (!t[x]) t[x] = { gfH: 0, gaH: 0, wH: 0, gfA: 0, gaA: 0, wA: 0, n: 0 }; });
    t[g.home].gfH += w * g.hg; t[g.home].gaH += w * g.ag; t[g.home].wH += w; t[g.home].n++;
    t[g.away].gfA += w * g.ag; t[g.away].gaA += w * g.hg; t[g.away].wA += w; t[g.away].n++;
  });
  var mh = HG / W, ma = AG / W, K = 3; // K = partidos "fantasma" en el promedio de la liga (encoge muestras chicas)
  var out = { homeAvg: mh, awayAvg: ma, n: games.length, teams: {} };
  Object.keys(t).forEach(function (x) {
    var s = t[x];
    out.teams[x] = {
      attH: (s.gfH + K * mh) / (s.wH + K) / mh, defH: (s.gaH + K * ma) / (s.wH + K) / ma,
      attA: (s.gfA + K * ma) / (s.wA + K) / ma, defA: (s.gaA + K * mh) / (s.wA + K) / mh, n: s.n
    };
  });
  return out;
}
function poissonP(k, l) { var r = Math.exp(-l); for (var i = 1; i <= k; i++) r *= l / i; return r; }
function scoreGrid(lh, la, rho) {
  var g = [], s = 0;
  for (var i = 0; i <= 10; i++) { g[i] = []; for (var j = 0; j <= 10; j++) {
    var t = 1; if (i === 0 && j === 0) t = 1 - lh * la * rho; else if (i === 0 && j === 1) t = 1 + lh * rho; else if (i === 1 && j === 0) t = 1 + la * rho; else if (i === 1 && j === 1) t = 1 - rho;
    var v = Math.max(0, poissonP(i, lh) * poissonP(j, la) * t); g[i][j] = v; s += v; } }
  for (i = 0; i <= 10; i++) for (j = 0; j <= 10; j++) g[i][j] /= s;
  return g;
}
function marketsFromGrid(g) {
  var H = 0, D = 0, A = 0, o15 = 0, o25 = 0, o35 = 0, bt = 0;
  for (var i = 0; i <= 10; i++) for (var j = 0; j <= 10; j++) { var q = g[i][j];
    if (i > j) H += q; else if (i === j) D += q; else A += q; if (i + j > 1) o15 += q; if (i + j > 2) o25 += q; if (i + j > 3) o35 += q; if (i && j) bt += q; }
  return { x12: [H, D, A], over15: o15, over25: o25, over35: o35, btts: bt };
}
function modelPredict(str, home, away) {
  if (!str) return null; var h = str.teams[home], a = str.teams[away];
  if (!h || !a || h.n < 6 || a.n < 6) return null;
  var lh = str.homeAvg * h.attH * a.defA, la = str.awayAvg * a.attA * h.defH;
  var mk = marketsFromGrid(scoreGrid(lh, la, -0.13));
  mk.lh = lh; mk.la = la; mk.nHome = h.n; mk.nAway = a.n; mk.version = MODEL_VERSION;
  return mk;
}


/* ---------- córners y tarjetas: totales del partido (modelo propio, validado fuera de muestra) ----------
   Fuerzas de cada equipo para generar y conceder, con más peso a lo reciente (vida media 150 días),
   encogidas hacia el promedio de la liga. Validación 2024–2027 (15.462 y 16.587 partidos): mejor que el
   promedio de la liga en log loss en todas las líneas y calibración dentro de ±3 puntos. Sin cuota de referencia. */
var CC_MODEL = {
  corners: { kh: 'hc', ka: 'ac', K: 15, HL: 150, a: 0.5, sc: 0.9982, disp: 1.139, lines: [8.5, 9.5, 10.5, 11.5], version: 'corners-v1' },
  cards: { kh: 'hy', ka: 'ay', K: 30, HL: 150, a: 1, sc: 0.9866, disp: 1.018, lines: [3.5, 4.5, 5.5], version: 'amarillas-v1' }
};
function countRatings(results, beforeMs, cfg) {
  var T = {}, LH = [0, 0], LA = [0, 0], last = null, n = 0;
  function decay(f) { Object.keys(T).forEach(function (k) { var t = T[k]; t[0] *= f; t[1] *= f; t[2] *= f; t[3] *= f; }); LH[0] *= f; LH[1] *= f; LA[0] *= f; LA[1] *= f; }
  results.forEach(function (r) {
    if (r.ts >= beforeMs) return;
    var vh = r[cfg.kh], va = r[cfg.ka]; if (vh === null || vh === undefined || va === null || va === undefined) return;
    if (last !== null && r.ts > last) decay(Math.pow(0.5, (r.ts - last) / 864e5 / cfg.HL));
    last = r.ts;
    var mh = LH[1] ? LH[0] / LH[1] : (vh || 1), ma = LA[1] ? LA[0] / LA[1] : (va || 1);
    [[r.home, vh, va, mh, ma], [r.away, va, vh, ma, mh]].forEach(function (x) { var t = T[x[0]] = T[x[0]] || [0, 0, 0, 0, 0]; t[0] += x[1] / Math.max(x[3], 0.1); t[1] += 1; t[2] += x[2] / Math.max(x[4], 0.1); t[3] += 1; t[4] += 1; });
    LH[0] += vh; LH[1] += 1; LA[0] += va; LA[1] += 1; n++;
  });
  if (n < 40) return null;
  decay(Math.pow(0.5, Math.max(0, beforeMs - last) / 864e5 / cfg.HL));
  var out = { mh: LH[0] / LH[1], ma: LA[0] / LA[1], n: n, teams: {} };
  Object.keys(T).forEach(function (k) { var t = T[k]; out.teams[k] = [Math.round(t[0] * 1e4) / 1e4, Math.round(t[1] * 1e4) / 1e4, Math.round(t[2] * 1e4) / 1e4, Math.round(t[3] * 1e4) / 1e4, t[4]]; });
  return out;
}
function nbCdf(k, lam, disp) {
  var s = 0, i;
  if (disp <= 1.0001) { for (i = 0; i <= k; i++) s += poissonP(i, lam); return s; }
  var p = 1 / disp, r = lam * p / (1 - p), q = Math.pow(p, r);
  for (i = 0; i <= k; i++) { s += q; q = q * (i + r) / (i + 1) * (1 - p); }
  return s;
}
function countPredict(R, cfg, home, away) {
  if (!R || !R.teams) return null; var h = R.teams[home], a = R.teams[away];
  if (!h || !a || h[4] < 6 || a[4] < 6) return null;
  var K = cfg.K, lh = R.mh * (h[0] + K) / (h[1] + K) * (a[2] + K) / (a[3] + K), la = R.ma * (a[0] + K) / (a[1] + K) * (h[2] + K) / (h[3] + K);
  var lam = Math.pow(R.mh + R.ma, 1 - cfg.a) * Math.pow(lh + la, cfg.a) * cfg.sc, p = {};
  cfg.lines.forEach(function (L) { p[L] = r5(1 - nbCdf(Math.floor(L), lam, cfg.disp)); });
  return { lam: r2(lam), lh: r2(lh * cfg.sc), la: r2(la * cfg.sc), p: p, n: [h[4], a[4]], version: cfg.version };
}

/* ---------- probabilidad de mercado sin margen (método de potencia) ---------- */
function powerFair(o) {
  var r = o.map(function (x) { return 1 / x; }), lo = 1, hi = 4;
  for (var i = 0; i < 60; i++) { var e = (lo + hi) / 2, s = r.reduce(function (a, x) { return a + Math.pow(x, e); }, 0); if (s > 1) lo = e; else hi = e; }
  var k = (lo + hi) / 2, p = r.map(function (x) { return Math.pow(x, k); }), t = p.reduce(function (a, b) { return a + b; }, 0);
  return p.map(function (x) { return x / t; });
}
function marketFair(m, preferOA) {
  var fd = [['BFE', 'Betfair Exchange'], ['PS', 'Pinnacle'], ['Avg', 'Promedio de casas']], oa = [['PIN', 'Pinnacle (The Odds API)'], ['BFX', 'Betfair Exchange (The Odds API)']];
  var refs = preferOA ? oa.concat(fd) : fd.concat(oa);
  for (var i = 0; i < refs.length; i++) { var o = m.odds.x12[refs[i][0]]; if (o) { var s = implied(o); if (s > 0.97 && s < 1.12) return { p: powerFair(o), ref: refs[i][1], refKey: refs[i][0] }; } }
  return null;
}

/* ---------- The Odds API: cuotas actualizadas (plan gratis, 500 créditos por mes) ---------- */
var OA_SPORT = {
  E0: 'soccer_epl', E1: 'soccer_efl_champ', E2: 'soccer_england_league1', E3: 'soccer_england_league2', SC0: 'soccer_spl',
  D1: 'soccer_germany_bundesliga', D2: 'soccer_germany_bundesliga2', I1: 'soccer_italy_serie_a', I2: 'soccer_italy_serie_b',
  SP1: 'soccer_spain_la_liga', SP2: 'soccer_spain_segunda_division', F1: 'soccer_france_ligue_one', F2: 'soccer_france_ligue_two',
  N1: 'soccer_netherlands_eredivisie', B1: 'soccer_belgium_first_div', P1: 'soccer_portugal_primeira_liga', T1: 'soccer_turkey_super_league', G1: 'soccer_greece_super_league',
  ARG: 'soccer_argentina_primera_division', AUT: 'soccer_austria_bundesliga', BRA: 'soccer_brazil_campeonato', DNK: 'soccer_denmark_superliga', FIN: 'soccer_finland_veikkausliiga',
  IRL: 'soccer_league_of_ireland', JPN: 'soccer_japan_j_league', MEX: 'soccer_mexico_ligamx', NOR: 'soccer_norway_eliteserien', POL: 'soccer_poland_ekstraklasa',
  RUS: 'soccer_russia_premier_league', SWE: 'soccer_sweden_allsvenskan', SWZ: 'soccer_switzerland_superleague', USA: 'soccer_usa_mls'
};
// Orden en que se gastan los créditos: primero Argentina, después las ligas más seguidas.
var OA_PRIORITY = ['ARG', 'E0', 'SP1', 'I1', 'D1', 'F1', 'P1', 'N1', 'BRA', 'E1', 'B1', 'T1', 'MEX', 'SC0', 'USA', 'G1', 'D2', 'I2', 'SP2', 'F2', 'AUT', 'DNK', 'SWZ', 'NOR', 'SWE', 'POL', 'JPN', 'E2', 'E3', 'IRL', 'FIN', 'RUS'];
function oaLgKey(lg) { return String(lg).split(':')[0]; }
var TEAM_ALIAS = {
  'man united': 'manchester united', 'man utd': 'manchester united', 'man city': 'manchester city', 'nott m forest': 'nottingham forest', 'nottm forest': 'nottingham forest',
  'wolves': 'wolverhampton wanderers', 'spurs': 'tottenham hotspur', 'tottenham': 'tottenham hotspur', 'sheffield weds': 'sheffield wednesday', 'sheffield utd': 'sheffield united',
  'ath bilbao': 'athletic bilbao', 'ath madrid': 'atletico madrid', 'sociedad': 'real sociedad', 'betis': 'real betis', 'espanol': 'espanyol', 'vallecano': 'rayo vallecano',
  'sp lisbon': 'sporting lisbon', 'sporting cp': 'sporting lisbon', 'sp braga': 'braga', 'inter': 'inter milan', 'internazionale': 'inter milan', 'milan': 'ac milan',
  'paris sg': 'paris saint germain', 'psg': 'paris saint germain', 'st etienne': 'saint etienne', 'm gladbach': 'borussia monchengladbach', 'ein frankfurt': 'eintracht frankfurt',
  'fc koln': 'koln', 'cologne': 'koln', 'bayern munich': 'bayern munchen', 'leverkusen': 'bayer leverkusen', 'dortmund': 'borussia dortmund', 'mainz': 'mainz 05',
  'qpr': 'queens park rangers', 'west brom': 'west bromwich albion', 'brighton': 'brighton and hove albion', 'newcastle': 'newcastle united', 'leeds': 'leeds united',
  'psv eindhoven': 'psv', 'az alkmaar': 'az', 'olympiakos': 'olympiacos', 'olympiacos piraeus': 'olympiacos', 'paok': 'paok thessaloniki',
  'estudiantes l p': 'estudiantes', 'gimnasia l p': 'gimnasia la plata', 'gimnasia lp': 'gimnasia la plata', 'velez sarsfield': 'velez', 'argentinos jrs': 'argentinos juniors',
  'newells old boys': 'newells', 'central cordoba': 'central cordoba santiago', 'racing club': 'racing', 'atl tucuman': 'atletico tucuman', 'ind rivadavia': 'independiente rivadavia', 'buyuksehyr': 'istanbul basaksehir', 'basaksehir': 'istanbul basaksehir', 'karagumruk': 'fatih karagumruk'
};
var TEAM_STOP = ['fc', 'cf', 'afc', 'sc', 'ac', 'cd', 'club', 'de', 'the', 'ca', 'cs', 'sd', 'ud', 'rc', 'fk', 'sk', 'if', 'bk', 'ss', 'us', 'calcio', 'sv', 'vfb', 'vfl', 'tsg', 'bsc', 'rcd', 'and'];
function normTeam(s) {
  s = String(s || '').toLowerCase();
  var cm = s.split(','); if (cm.length === 2 && cm[1].trim()) s = cm[1].trim() + ' ' + cm[0].trim(); // tenis: "Rune, Holger
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { }
  s = s.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (TEAM_ALIAS[s]) s = TEAM_ALIAS[s];
  var t = s.split(' ').filter(function (x) { return x && TEAM_STOP.indexOf(x) < 0; });
  return t.length ? t.join(' ') : s;
}
function teamSim(a, b) {
  a = normTeam(a); b = normTeam(b);
  if (!a || !b) return 0; if (a === b) return 1;
  var A = a.split(' '), B = b.split(' '), hit = 0;
  A.forEach(function (x) { if (B.some(function (y) { return y === x || (x.length >= 4 && y.length >= 4 && (y.indexOf(x) === 0 || x.indexOf(y) === 0)); })) hit++; });
  var j = hit / Math.max(A.length, B.length);
  if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) j = Math.max(j, 0.8);
  return j;
}
// Resume un evento de The Odds API: Pinnacle, Betfair Exchange, mejor cuota con nombre de casa y promedio.
function compactOA(ev) {
  var H = ev.home_team, A = ev.away_team, out = { id: ev.id, home: H, away: A, t: ev.commence_time, at: null, pin: null, bfx: null, best: [null, null, null], avg: null, n: 0 }, sums = [0, 0, 0], ouS = [0, 0], ouN = 0;
  (ev.bookmakers || []).forEach(function (bk) {
    (bk.markets || []).forEach(function (mk) {
      var lu = mk.last_update || bk.last_update;
      if (mk.key === 'h2h') {
        var o = [null, null, null];
        (mk.outcomes || []).forEach(function (x) { var i = x.name === H ? 0 : x.name === A ? 2 : x.name === 'Draw' ? 1 : -1; if (i >= 0) o[i] = odd(x.price); });
        if (!o.every(Boolean)) return;
        if (lu && (!out.at || lu > out.at)) out.at = lu;
        if (bk.key === 'pinnacle') out.pin = o;
        else if (bk.key === 'betfair_ex_eu' || bk.key === 'betfair_ex_uk') { if (!out.bfx) out.bfx = o; }
        else if (bk.key !== 'matchbook' && bk.key !== 'smarkets') {
          out.n++; for (var i = 0; i < 3; i++) { sums[i] += o[i]; if (!out.best[i] || o[i] > out.best[i][0]) out.best[i] = [o[i], bk.title]; }
        }
      } else if (mk.key === 'totals') {
        var ov = null, un = null;
        (mk.outcomes || []).forEach(function (x) { if (x.point === 2.5) { if (x.name === 'Over') ov = odd(x.price); if (x.name === 'Under') un = odd(x.price); } });
        if (ov && un) { if (bk.key === 'pinnacle') out.ouPin = [ov, un]; else if (bk.key.indexOf('betfair') < 0 && bk.key !== 'matchbook') { ouS[0] += ov; ouS[1] += un; ouN++; } }
      }
    });
  });
  if (out.n) out.avg = sums.map(function (x) { return r2(x / out.n); });
  if (ouN) out.ouAvg = ouS.map(function (x) { return r2(x / ouN); });
  return out;
}
// Une los eventos con los partidos de football-data por liga, horario (±4 h) y parecido de nombres.
function mergeOA(matches, store) {
  var n = 0;
  matches.forEach(function (m) {
    var S = store[oaLgKey(m.lg)]; if (!S || !S.events) return;
    var ko = Date.parse(m.kickoff), best = null, bs = 0, second = 0;
    S.events.forEach(function (e) {
      if (Math.abs(Date.parse(e.t) - ko) > 4 * 36e5) return;
      var sh = teamSim(m.home, e.home), sa = teamSim(m.away, e.away); if (sh < 0.3 || sa < 0.3) return;
      var sc = sh + sa; if (sc > bs) { second = bs; bs = sc; best = e; } else if (sc > second) second = sc;
    });
    if (!best || bs < 1.0 || bs - second < 0.3) return;
    m.oa = { at: best.at || S.fetched, fetched: S.fetched, n: best.n, best: best.best, avg: best.avg, names: [best.home, best.away], id: best.id };
    if (best.pin) m.odds.x12.PIN = best.pin;
    if (best.bfx) m.odds.x12.BFX = best.bfx;
    if (best.ouPin) { m.odds.ou25 = m.odds.ou25 || {}; m.odds.ou25.PIN = best.ouPin; }
    if (best.ouAvg) { m.odds.ou25 = m.odds.ou25 || {}; if (!m.odds.ou25.Avg) m.odds.ou25.AvgE = best.ouAvg; }
    n++;
  });
  return n;
}
/* ---------- OddsPapi: cuotas de Bet365 Argentina (bet365.bet.ar), plan gratis de 250 consultas por mes ---------- */
// Torneos con id de OddsPapi → código propio. Una sola consulta trae todos los torneos de la lista.
var OP_TOURNAMENTS = { 155: 'ARG', 17: 'E0', 8: 'SP1', 23: 'I1', 35: 'D1', 34: 'F1', 132: 'NBA', 31: 'NFL', 109: 'MLB' };
var OP_BOOK = 'bet365.bet.ar';
// Mercado principal por deporte: fútbol 1X2 (101-103); NBA ganador con alargue (111-112); tenis ganador (121-122); NFL ganador (141-142).
var OP_MAIN = { 10: ['101', ['101', '102', '103']], 11: ['111', ['111', '112']], 12: ['121', ['121', '122']], 14: ['141', ['141', '142']], 13: ['131', ['131', '132']] };
function compactOP(f, mk, book) {
  var b = (f.bookmakerOdds || {})[book || OP_BOOK], mm = (mk && mk[f.sportId]) || OP_MAIN[f.sportId];
  if (!b || !mm || b.bookmakerIsActive === false || b.suspended) return null;
  var M = (b.markets || {})[mm[0]]; if (!M || M.marketActive === false) return null;
  var o = [], at = '';
  for (var i = 0; i < mm[1].length; i++) {
    var oc = (M.outcomes || {})[mm[1][i]], pl = oc && oc.players ? oc.players : {}, p = pl[Object.keys(pl)[0]];
    if (!p || p.active === false || !odd(p.price)) return null;
    o.push(odd(p.price)); var c = p.changedAt || p.bookmakerChangedAt || ''; if (c > at) at = c;
  }
  var code = f.sportId === 12 ? 'TEN' : OP_TOURNAMENTS[f.tournamentId] || null, out = { id: f.fixtureId, sp: f.sportId, code: code, lg: f.tournamentName || '', home: f.participant1Name, away: f.participant2Name, t: f.startTime, o: o, at: at || null };
  // Goleadores ("anota en cualquier momento"), si Bet365 Argentina lo ofrece: { nombre: [cuota, idJugador] }.
  var G = mk && mk.goal ? (b.markets || {})[mk.goal.id] : null;
  if (G && f.sportId === 10) {
    var oc = (G.outcomes || {})[mk.goal.yes], gs = {}, k = 0;
    Object.keys((oc && oc.players) || {}).forEach(function (pid) { var p = oc.players[pid]; if (p && p.active !== false && odd(p.price) && p.playerName && k < 40) { gs[p.playerName] = [odd(p.price), pid]; k++; } });
    if (k) out.gs = gs;
  }
  return out;
}
function opMatch(list, home, away, t, filter) {
  var ko = Date.parse(t), best = null, bs = 0, second = 0;
  (list || []).forEach(function (e) {
    if (filter && !filter(e)) return;
    if (Math.abs(Date.parse(e.t) - ko) > 4 * 36e5) return;
    var sh = teamSim(home, e.home), sa = teamSim(away, e.away); if (sh < 0.3 || sa < 0.3) return;
    var sc = sh + sa; if (sc > bs) { second = bs; bs = sc; best = e; } else if (sc > second) second = sc;
  });
  return best && bs >= 1.0 && bs - second >= 0.3 ? best : null;
}
// Fútbol: suma la cuota de Bet365 Argentina al partido de football-data (no reemplaza ninguna otra).
function mergeOP(matches, ev) {
  var n = 0;
  matches.forEach(function (m) {
    var k = oaLgKey(m.lg), e = opMatch(ev, m.home, m.away, m.kickoff, function (e) { return e.sp === 10 && e.code === k && e.o.length === 3; });
    if (!e) return;
    m.odds.x12.B3A = e.o; m.b3a = { at: e.at, names: [e.home, e.away], id: e.id }; n++;
  });
  return n;
}
// Partidos de fútbol que football-data todavía no publicó pero Bet365 Argentina sí: se agregan con sus cuotas.
var OP_LG = { ARG: ['ARG:Liga Profesional', 'Argentina · Liga Profesional', 'Argentina', 'arg'], E0: ['E0', 'Inglaterra · Premier League', 'Inglaterra', 'eur'], SP1: ['SP1', 'España · LaLiga', 'España', 'eur'], I1: ['I1', 'Italia · Serie A', 'Italia', 'eur'], D1: ['D1', 'Alemania · Bundesliga', 'Alemania', 'eur'], F1: ['F1', 'Francia · Ligue 1', 'Francia', 'eur'] };
function addOPMatches(matches, ev, now) {
  var used = {}, n = 0;
  matches.forEach(function (m) { if (m.b3a && m.b3a.id) used[m.b3a.id] = 1; });
  (ev || []).forEach(function (e) {
    var L = OP_LG[e.code], t = Date.parse(e.t);
    if (e.sp !== 10 || !L || used[e.id] || e.o.length !== 3 || !(t > now - 2 * 36e5 && t < now + 5 * 864e5)) return;
    if (matches.some(function (m) { return oaLgKey(m.lg) === e.code && Math.abs(Date.parse(m.kickoff) - t) < 4 * 36e5 && teamSim(m.home, e.home) >= 0.5 && teamSim(m.away, e.away) >= 0.5; })) return;
    matches.push({ key: isoDate(t) + '|' + L[0] + '|' + e.home + '|' + e.away, lg: L[0], league: L[1], country: L[2], region: L[3], home: e.home, away: e.away, kickoff: new Date(t).toISOString(), referee: null, odds: { x12: { B3A: e.o }, ou25: {}, ah: null }, issues: [], fair: null, signals: [], b3a: { at: e.at, names: [e.home, e.away], id: e.id }, src: 'oddspapi' });
    n++;
  });
  matches.sort(function (x, y) { return x.kickoff < y.kickoff ? -1 : 1; });
  return n;
}
/* ---------- mercado de jugadores: "anota en cualquier momento" (solo los partidos más importantes de las 5 ligas grandes) ---------- */
var GOAL_VERSION = 'goleador-v1', GOAL_MARKET = 'player_goal_scorer_anytime', GOAL_MARGIN_APROX = 1.08;
var GS_LEAGUES = { E0: 'soccer_epl', SP1: 'soccer_spain_la_liga', I1: 'soccer_italy_serie_a', D1: 'soccer_germany_bundesliga', F1: 'soccer_france_ligue_one' };
function normPlayer(s) { s = String(s || '').toLowerCase(); try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { } var cm = s.split(','); if (cm.length === 2) s = cm[1] + ' ' + cm[0]; return s.replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function playerSim(a, b) {
  a = normPlayer(a); b = normPlayer(b); if (!a || !b) return false; if (a === b) return true;
  var A = a.split(' '), B = b.split(' ');
  return A[A.length - 1] === B[B.length - 1] && (A.length === 1 || B.length === 1 || A[0][0] === B[0][0]);
}
// Cuota justa por jugador: casas que dan "sí" y "no" → se saca el margen (potencia) y se promedia.
// Si solo hay "sí" en 2 o más casas → mediana de la probabilidad implícita dividida por un margen típico (aproximada).
function compactGoalOA(ev) {
  var P = {}, at = null;
  (ev.bookmakers || []).forEach(function (bk) {
    (bk.markets || []).forEach(function (mk) {
      if (mk.key !== GOAL_MARKET) return;
      var lu = mk.last_update || bk.last_update; if (lu && (!at || lu > at)) at = lu;
      (mk.outcomes || []).forEach(function (x) {
        var yesNo = x.name === 'Yes' || x.name === 'No', pl = yesNo ? x.description : x.name, side = yesNo ? x.name : (x.description === 'No' ? 'No' : 'Yes');
        if (!pl || !odd(x.price)) return;
        var q = P[pl] = P[pl] || {}; q[bk.title] = q[bk.title] || {}; q[bk.title][side === 'Yes' ? 'y' : 'n'] = odd(x.price);
      });
    });
  });
  var players = {};
  Object.keys(P).forEach(function (pl) {
    var both = [], yes = [], books = {};
    Object.keys(P[pl]).forEach(function (b) { var q = P[pl][b]; if (q.y) { yes.push(1 / q.y); books[b] = q.y; } if (q.y && q.n && 1 / q.y + 1 / q.n > 1) both.push(devig([q.y, q.n], DEVIG.goleador)[0]); });
    var p = null, m = null;
    if (both.length) { p = both.reduce(function (a, b) { return a + b; }, 0) / both.length; m = 'dos lados'; }
    else if (yes.length >= 2) { yes.sort(function (a, b) { return a - b; }); var md = yes.length % 2 ? yes[(yes.length - 1) / 2] : (yes[yes.length / 2 - 1] + yes[yes.length / 2]) / 2; p = md / GOAL_MARGIN_APROX; m = 'aproximada'; }
    if (p && p > 0.01 && p < 0.95) players[pl] = { p: r5(p), m: m, nb: Object.keys(books).length, best: Object.keys(books).reduce(function (a, b) { return !a || books[b] > a[0] ? [books[b], b] : a; }, null) };
  });
  var top = Object.keys(players).sort(function (a, b) { return players[b].p - players[a].p; }).slice(0, 30), out = {};
  top.forEach(function (k) { out[k] = players[k]; });
  return { id: ev.id, home: ev.home_team, away: ev.away_team, t: ev.commence_time, at: at, players: out };
}
// Une los goleadores al partido: cuota justa (casas de EE. UU. vía The Odds API) + cuota de Bet365 Argentina si la hay.
function attachGoals(matches, gsStore, opEv, now, cfg) {
  cfg = cfg || { vmin: 0.02, vminAprox: 0.05, vmax: 0.30, omax: 15, maxAgeH: 12 };
  var n = 0, byId = {}; (opEv || []).forEach(function (e) { byId[e.id] = e; });
  matches.forEach(function (m) {
    var G = m.oa && m.oa.id && gsStore ? gsStore[m.oa.id] : null; if (!G) return;
    var op = m.b3a && m.b3a.id ? byId[m.b3a.id] : null, b3 = op && op.gs ? op.gs : null, b3At = op ? Date.parse(op.at) : NaN, gAt = Date.parse(G.at || G.fetched);
    var list = Object.keys(G.players).map(function (name) {
      var g = G.players[name], hit = null;
      if (b3) Object.keys(b3).some(function (k) { if (playerSim(k, name)) { hit = b3[k]; return true; } return false; });
      var row = { n: name, p: g.p, m: g.m, nb: g.nb, best: g.best, b3a: hit ? hit[0] : null, pid: hit ? hit[1] : null };
      if (row.b3a) row.ev = r5(valueOf(row.b3a, g.p));
      return row;
    });
    var sig = [], fresh = now - gAt <= cfg.maxAgeH * 36e5 && now - b3At <= cfg.maxAgeH * 36e5;
    if (fresh) list.forEach(function (r) { var vm = r.m === 'aproximada' ? cfg.vminAprox : cfg.vmin; if (r.b3a && r.ev > vm && r.ev <= cfg.vmax && r.b3a <= cfg.omax) sig.push({ player: r.n, pid: r.pid, odd: r.b3a, book: 'Bet365 Argentina', p: r.p, ev: r.ev, at: op.at, m: r.m }); });
    m.gs = { at: G.at || G.fetched, b3aAt: op ? op.at : null, opId: op ? op.id : null, players: list, signals: sig };
    n++;
  });
  return n;
}
/* ---------- modelo de tenis en prueba (Elo por superficie, entrenado con los datos de Jeff Sackmann, CC BY-NC-SA 4.0) ---------- */
// No se usa para señales: se muestra como "en prueba" y se compara contra el mercado a medida que hay resultados.
var TENNIS_ELO_VERSION = 'tenis-elo-v1';
var CLAY_RE = /roland|french open|monte|madrid|rome|roma|italian|barcelona|hamburg|rio|buenos aires|santiago|estoril|munich|geneva|lyon|bastad|gstaad|umag|kitzbuhel|houston|marrakech|bucharest|cordoba|charleston|rabat|palermo|parma|prague|strasbourg|bogota|iasi|warsaw|bad homburg/i;
var GRASS_RE = /wimbledon|halle|queen|hertogenbosch|stuttgart open|eastbourne|mallorca|newport|nottingham|birmingham|berlin|libema/i;
function tennisSurface(title, month) { title = String(title || ''); if (GRASS_RE.test(title)) return 'Grass'; if (CLAY_RE.test(title)) return 'Clay'; return 'Hard'; }
function tennisFind(players, name) {
  if (!players) return null; if (players[name]) return players[name];
  var hit = null, n = 0; Object.keys(players).forEach(function (k) { if (playerSim(k, name)) { hit = players[k]; n++; } });
  return n === 1 ? hit : null;
}
function tennisPredict(T, tour, home, away, title, cfg) {
  var D = T && T[tour]; if (!D) return null; cfg = D.params || { w: 0.3 };
  var a = tennisFind(D.jugadores, home), b = tennisFind(D.jugadores, away); if (!a || !b || a[2] < 20 || b[2] < 20) return null;
  var surf = tennisSurface(title), sk = surf[0], sa = a[1][sk] || a[0], sb = b[1][sk] || b[0];
  var pw = 1 / (1 + Math.pow(10, (b[0] - a[0]) / 400)), ps = 1 / (1 + Math.pow(10, (sb - sa) / 400)), p = (1 - cfg.w) * pw + cfg.w * ps;
  return { p: [r5(p), r5(1 - p)], surface: surf, n: [a[2], b[2]], version: TENNIS_ELO_VERSION, hasta: D.hasta };
}
// Actualiza los ratings con un resultado nuevo (mismo K que en el entrenamiento).
function tennisUpdate(T, tour, winner, loser, title) {
  var D = T && T[tour]; if (!D) return false; var c = (D.params || {}).c || 0.4, surf = tennisSurface(title);
  var P = D.jugadores, wk = Object.keys(P).filter(function (k) { return playerSim(k, winner); }), lk = Object.keys(P).filter(function (k) { return playerSim(k, loser); });
  var w = wk.length === 1 ? P[wk[0]] : (P[winner] = P[winner] || [1500, {}, 0]), l = lk.length === 1 ? P[lk[0]] : (P[loser] = P[loser] || [1500, {}, 0]);
  var sk = surf[0], pw = 1 / (1 + Math.pow(10, (l[0] - w[0]) / 400)), sw = w[1][sk] || 1500, sl = l[1][sk] || 1500, ps = 1 / (1 + Math.pow(10, (sl - sw) / 400));
  var kw = 250 / Math.pow(w[2] + 5, c), kl = 250 / Math.pow(l[2] + 5, c);
  w[0] = Math.round(w[0] + kw * (1 - pw)); l[0] = Math.round(l[0] - kl * (1 - pw)); w[1][sk] = Math.round(sw + kw * (1 - ps)); l[1][sk] = Math.round(sl - kl * (1 - ps)); w[2]++; l[2]++;
  return true;
}
// Señales versión 2: probabilidad justa de la fuente más reciente y solo precios de casas con nombre, con su hora.
var SIGNAL_VERSION = 'mercado-v2';
function signalsV2(m, fileAtMs, now, cfg) {
  cfg = cfg || { vmin: 0.02, vmax: 0.25, omax: 8, maxAgeH: 12 };
  var oaMs = m.oa ? Date.parse(m.oa.at) : NaN, maxAge = (cfg.maxAgeH || 12) * 36e5;
  var fileFresh = isFinite(fileAtMs) && now - fileAtMs <= maxAge, oaFresh = isFinite(oaMs) && now - oaMs <= maxAge;
  var fair = marketFair(m, oaFresh && (!isFinite(fileAtMs) || oaMs > fileAtMs));
  if (!fair) return { fair: null, signals: [] };
  var fairAt = fair.refKey === 'PIN' || fair.refKey === 'BFX' ? oaMs : fileAtMs;
  if (!(now - fairAt <= maxAge)) return { fair: fair, fairAt: fairAt, signals: [] };
  var out = [];
  [0, 1, 2].forEach(function (i) {
    var c = [];
    if (fileFresh) REAL_BOOKS.forEach(function (b) { var o = m.odds.x12[b]; if (o) c.push({ odd: o[i], book: BOOKS[b], at: fileAtMs }); });
    if (oaFresh && m.oa.best && m.oa.best[i]) c.push({ odd: m.oa.best[i][0], book: m.oa.best[i][1] + ' (The Odds API)', at: oaMs });
    var b3Ms = m.b3a ? Date.parse(m.b3a.at) : NaN;
    if (m.odds.x12.B3A && isFinite(b3Ms) && now - b3Ms <= maxAge) c.push({ odd: m.odds.x12.B3A[i], book: 'Bet365 Argentina', at: b3Ms });
    if (!c.length) return;
    c.sort(function (a, b) { return b.odd - a.odd; });
    var b = c[0], ev = b.odd * fair.p[i] - 1;
    if (ev > cfg.vmin && ev <= cfg.vmax && b.odd <= cfg.omax) out.push({ sel: i, odd: b.odd, book: b.book, at: new Date(b.at).toISOString(), p: r5(fair.p[i]), ev: r5(ev) });
  });
  return { fair: fair, fairAt: fairAt, signals: out };
}

/* =========================================================================
   MOTOR ÚNICO DE MERCADOS (motor-v1): sirve para cualquier deporte y mercado
   - devig(o, método): saca el margen a N resultados (2 o 3 o "sí/no").
   - fairFromRefs(refs): primera referencia válida, en orden de confianza.
   - pickSignals(fair, sides): mejor cuota por resultado contra la probabilidad justa.
   Métodos elegidos con datos reales (26/10/2026, ver carpeta devig/):
     fútbol 1X2 y más/menos: potencia (56.257 partidos con cierre de Pinnacle);
     NFL: odds ratio (5.385 partidos, cierre); NBA y MLB: odds ratio (mismo tipo de mercado, sin historial propio);
     tenis: potencia (sin historial propio; es el recomendado en la literatura por el sesgo favorito-batacazo);
     goleadores (sí/no): potencia.
   ========================================================================= */
var ENGINE_VERSION = 'motor-v1';
var DEVIG = { futbol: 'potencia', tenis: 'potencia', nba: 'odds_ratio', nfl: 'odds_ratio', mlb: 'odds_ratio', goleador: 'potencia' };
function oddsRatioFair(o) {
  var r = o.map(function (x) { return 1 / x; }), lo = 1, hi = 20;
  function f(c) { return r.reduce(function (a, x) { return a + x / (c + x - c * x); }, 0) - 1; }
  if (f(1) <= 0) return r.map(function (x) { return x / r.reduce(function (a, b) { return a + b; }, 0); });
  for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  var c = (lo + hi) / 2, p = r.map(function (x) { return x / (c + x - c * x); }), t = p.reduce(function (a, b) { return a + b; }, 0);
  return p.map(function (x) { return x / t; });
}
function devig(o, method) {
  if (method === 'odds_ratio') return oddsRatioFair(o);
  if (method === 'proporcional') { var t = o.reduce(function (a, x) { return a + 1 / x; }, 0); return o.map(function (x) { return 1 / x / t; }); }
  return powerFair(o);
}
// refs: [{ key, name, o: [cuotas], at, minBooks? , n? }] en orden de preferencia.
function fairFromRefs(refs, method) {
  for (var i = 0; i < refs.length; i++) {
    var R = refs[i], o = R.o; if (!o || o.some(function (x) { return !(x > 1); })) continue;
    if (R.minBooks && (R.n || 0) < R.minBooks) continue;
    var s = o.reduce(function (a, x) { return a + 1 / x; }, 0); if (!(s > 0.97 && s < 1.15)) continue;
    return { p: devig(o, method).map(r5), ref: R.name, refKey: R.key, at: R.at || null, method: method };
  }
  return null;
}
function valueOf(odd, p) { return odd * p - 1; }
function convieneDesde(p, vmin) { return p > 0 ? (1 + vmin) / p : null; }
// sides[i] = [{ odd, book, at(ms) }]. Devuelve como mucho una señal por resultado (la mejor cuota).
function pickSignals(fair, sides, now, cfg) {
  cfg = cfg || { vmin: 0.02, vmax: 0.25, omax: 8, maxAgeH: 12 };
  var out = [], maxAge = (cfg.maxAgeH || 12) * 36e5;
  if (!fair) return out;
  sides.forEach(function (cands, i) {
    var c = (cands || []).filter(function (x) { return x && x.odd > 1 && isFinite(x.at) && now - x.at <= maxAge; });
    if (!c.length) return; c.sort(function (a, b) { return b.odd - a.odd; }); var b = c[0], ev = valueOf(b.odd, fair.p[i]);
    if (ev > cfg.vmin && ev <= cfg.vmax && b.odd <= cfg.omax) out.push({ sel: i, odd: b.odd, book: b.book, at: new Date(b.at).toISOString(), p: fair.p[i], ev: r5(ev) });
  });
  return out;
}
// Registro de deportes: cada deporte nuevo es una entrada acá (fuentes, mercado principal, cómo se lee el resultado).
var SPORT_CFG = {
  futbol: { n: 3, devig: DEVIG.futbol, op: 10 },
  tenis: { n: 2, devig: DEVIG.tenis, op: 12, oaRe: /^tennis_(atp|wta)_/, scores: true },
  nba: { n: 2, devig: DEVIG.nba, op: 11, oa: 'basketball_nba', opT: 132, scores: true },
  nfl: { n: 2, devig: DEVIG.nfl, op: 14, oa: 'americanfootball_nfl', opT: 31, scores: true },
  mlb: { n: 2, devig: DEVIG.mlb, op: 13, oa: 'baseball_mlb', opT: 109, scores: true }
};

/* ---------- otros deportes: tenis, NBA y NFL (solo mercado; The Odds API) ---------- */
// Códigos: 'NBA', 'NFL' y 'TEN:<clave del torneo>'. Los torneos de tenis se descubren con /sports (gratis).
var OTHER_SPORTS = {
  NBA: { key: 'basketball_nba', name: 'NBA', sport: 'nba' },
  NFL: { key: 'americanfootball_nfl', name: 'NFL', sport: 'nfl' },
  MLB: { key: 'baseball_mlb', name: 'MLB', sport: 'mlb' }
};
var OTHER_VERSION = 'mercado-otros-v1';
function otherSportOf(code) { code = String(code); return code.indexOf('TEN:') === 0 ? 'tenis' : OTHER_SPORTS[code] ? OTHER_SPORTS[code].sport : null; }
function otherApiKey(code) { code = String(code); return code.indexOf('TEN:') === 0 ? code.slice(4) : OTHER_SPORTS[code] ? OTHER_SPORTS[code].key : null; }
// Resume un evento a dos resultados (gana local/jugador 1, gana visitante/jugador 2). Si hay empate en la oferta (NFL), se guarda aparte.
function compactOther(ev) {
  var H = ev.home_team, A = ev.away_team, out = { id: ev.id, title: ev.sport_title || '', home: H, away: A, t: ev.commence_time, at: null, pin: null, bfx: null, best: [null, null], avg: null, n: 0, books: {} }, sums = [0, 0];
  (ev.bookmakers || []).forEach(function (bk) {
    (bk.markets || []).forEach(function (mk) {
      if (mk.key !== 'h2h') return;
      var o = [null, null], draw = false;
      (mk.outcomes || []).forEach(function (x) { if (x.name === H) o[0] = odd(x.price); else if (x.name === A) o[1] = odd(x.price); else if (x.name === 'Draw') draw = true; });
      if (!o[0] || !o[1] || draw) return; // con empate ofrecido el mercado no es de dos resultados: no se usa
      var lu = mk.last_update || bk.last_update; if (lu && (!out.at || lu > out.at)) out.at = lu;
      if (bk.key === 'pinnacle') out.pin = o;
      else if (bk.key === 'betfair_ex_eu' || bk.key === 'betfair_ex_uk') { if (!out.bfx) out.bfx = o; }
      else if (bk.key !== 'matchbook' && bk.key !== 'smarkets') {
        out.n++; out.books[bk.title] = o;
        for (var i = 0; i < 2; i++) { sums[i] += o[i]; if (!out.best[i] || o[i] > out.best[i][0]) out.best[i] = [o[i], bk.title]; }
      }
    });
  });
  if (out.n) out.avg = sums.map(function (x) { return r2(x / out.n); });
  return out;
}
// Probabilidad justa: Pinnacle, después Betfair Exchange, después el promedio (con 4 casas o más). Margen razonable o no se usa.
function otherFair(e) {
  var cfg = SPORT_CFG[e.sport] || SPORT_CFG.tenis;
  return fairFromRefs([{ key: 'pin', name: 'Pinnacle', o: e.pin }, { key: 'bfx', name: 'Betfair Exchange', o: e.bfx }, { key: 'avg', name: 'Promedio de casas', o: e.avg, n: e.n, minBooks: 4 }], cfg.devig);
}
function otherSignals(e, fair, now, cfg) {
  var at = Date.parse(e.at || e.fetched), b3 = e.b365 ? Date.parse(e.b365At) : NaN;
  if (!fair || !(now - at <= ((cfg && cfg.maxAgeH) || 12) * 36e5)) return [];
  return pickSignals(fair, [0, 1].map(function (i) { var c = []; if (e.best && e.best[i]) c.push({ odd: e.best[i][0], book: e.best[i][1], at: at }); if (e.b365) c.push({ odd: e.b365[i], book: 'Bet365 Argentina', at: b3 }); return c; }), now, cfg);
}
// Arma la lista pública de otros deportes desde lo guardado por código.
function buildOther(store, now, opEv, T) {
  var ev = [], fetched = {}, used = {};
  Object.keys(store || {}).forEach(function (code) {
    var sp = otherSportOf(code), S = store[code]; if (!sp || !S || !S.events) return;
    fetched[code] = S.fetched;
    S.events.forEach(function (e) {
      if (Date.parse(e.t) < now - 4 * 36e5) return;
      var x = { key: code + '|' + e.id, code: code, sport: sp, league: sp === 'tenis' ? (S.title || e.title) : OTHER_SPORTS[code].name, home: e.home, away: e.away, kickoff: e.t, at: e.at || S.fetched, fetched: S.fetched, pin: e.pin, bfx: e.bfx, avg: e.avg, n: e.n, best: e.best, books: e.books };
      var op = opMatch(opEv, e.home, e.away, e.t, function (o) { return o.sp !== 10 && o.o.length === 2 && (sp === 'tenis' ? o.code === 'TEN' : o.code === code); });
      if (op) { x.b365 = op.o; x.b365At = op.at; used[op.id] = 1; }
      var f = otherFair(x); x.fair = f; x.signals = otherSignals(x, f, now);
      if (sp === 'tenis' && T) { var tm = tennisPredict(T, /tennis_wta_/.test(code) ? 'wta' : 'atp', e.home, e.away, x.league); if (tm) x.model = tm; }
      ev.push(x);
    });
  });
  // Partidos que solo tiene Bet365 Argentina (sin Pinnacle no hay cuota justa: se muestran sus cuotas y nada más).
  (opEv || []).forEach(function (o) {
    if (used[o.id] || o.sp === 10 || o.o.length !== 2 || Date.parse(o.t) < now - 4 * 36e5 || Date.parse(o.t) > now + 4 * 864e5) return;
    var sp = o.sp === 12 ? 'tenis' : o.code === 'NBA' ? 'nba' : o.code === 'NFL' ? 'nfl' : o.code === 'MLB' ? 'mlb' : null; if (!sp) return;
    ev.push({ key: 'OP|' + o.id, code: o.code, sport: sp, league: sp === 'tenis' ? o.lg : OTHER_SPORTS[o.code].name, home: o.home, away: o.away, kickoff: o.t, at: o.at, fetched: o.at, pin: null, bfx: null, avg: null, n: 0, best: [null, null], books: {}, b365: o.o, b365At: o.at, fair: null, signals: [] });
  });
  ev.sort(function (a, b) { return a.kickoff < b.kickoff ? -1 : 1; });
  return { version: OTHER_VERSION, fetched: fetched, events: ev };
}

/* ---------- señales (modelo de mercado v1, el que ya estaba validado en el backtest) ---------- */
function signalsFor(m, fair, cfg) {
  cfg = cfg || { vmin: 0.02, vmax: 0.25, omax: 8 };
  var out = [];
  if (!fair) return out;
  [0, 1, 2].forEach(function (i) {
    var best = null, bestBook = null;
    BOOK_KEYS.forEach(function (b) { if (b === 'Avg' || b === 'BFE') return; var o = m.odds.x12[b]; if (o && (best === null || o[i] > best)) { best = o[i]; bestBook = b; } });
    if (best === null) return;
    // Si la mejor cuota la da una casa identificada además del agregado "Max", se usa esa casa.
    var named = REAL_BOOKS.filter(function (b) { return m.odds.x12[b] && m.odds.x12[b][i] === best; });
    var ev = best * fair.p[i] - 1;
    if (ev > cfg.vmin && ev <= cfg.vmax && best <= cfg.omax) out.push({ sel: i, odd: best, book: named.length ? named[0] : bestBook, books: named, p: fair.p[i], ev: ev });
  });
  return out;
}

/* ---------- armado del paquete que consume la web ---------- */
function buildPayload(opts) {
  // opts: {fixtures:[rows], newFixtures:[rows], results:{lg:[normalized]}, fetched:{...}, now}
  var now = opts.now || Date.now();
  var a = normalizeFixtures(opts.fixtures || []), b = normalizeFixtures(opts.newFixtures || []);
  var matches = a.matches.concat(b.matches).sort(function (x, y) { return x.kickoff < y.kickoff ? -1 : 1; });
  var keepFrom = now - (opts.keepHours || 6) * 36e5, dropped = matches.filter(function (m) { return Date.parse(m.kickoff) < keepFrom; }).length;
  matches = matches.filter(function (m) { return Date.parse(m.kickoff) >= keepFrom; });
  var strengths = {};
  Object.keys(opts.results || {}).forEach(function (lg) { strengths[lg] = teamStrengths(opts.results[lg], now); });
  matches.forEach(function (m) {
    var fair = marketFair(m); m.fair = fair ? { p: fair.p.map(function (x) { return Math.round(x * 1e5) / 1e5; }), ref: fair.ref } : null;
    var R = (opts.results || {})[m.lg], ko = Date.parse(m.kickoff);
    if (R && R.length) {
      m.form = { home: teamForm(R, m.home, ko, 10), away: teamForm(R, m.away, ko, 10), homeAtHome: teamForm(R, m.home, ko, 5, 'home'), awayAway: teamForm(R, m.away, ko, 5, 'away'), source: opts.resultSource ? opts.resultSource[m.lg] : null };
      var mp = modelPredict(strengths[m.lg], m.home, m.away);
      if (mp) m.model = { x12: mp.x12.map(r5), over25: r5(mp.over25), btts: r5(mp.btts), lh: r2(mp.lh), la: r2(mp.la), n: [mp.nHome, mp.nAway], version: mp.version };
    }
    m.signals = signalsFor(m, fair).map(function (s) { s.p = r5(s.p); s.ev = r5(s.ev); return s; });
  });
  return {
    version: CORE_VERSION, generated: new Date(now).toISOString(),
    sources: opts.fetched || {}, books: BOOKS,
    counts: { matches: matches.length, alreadyPlayed: dropped, duplicates: a.duplicates + b.duplicates, excluded: a.issues.length + b.issues.length },
    issues: a.issues.concat(b.issues).slice(0, 50),
    matches: matches
  };
}
function r5(x) { return Math.round(x * 1e5) / 1e5; }
function r2(x) { return Math.round(x * 100) / 100; }

if (typeof module !== 'undefined') module.exports = { parseCsv: parseCsv, ukToUtcMs: ukToUtcMs, normalizeFixtures: normalizeFixtures, normalizeResults: normalizeResults, teamForm: teamForm, teamStrengths: teamStrengths, modelPredict: modelPredict, marketFair: marketFair, signalsFor: signalsFor, buildPayload: buildPayload, compactOA: compactOA, countRatings: countRatings, countPredict: countPredict, nbCdf: nbCdf, CC_MODEL: CC_MODEL, mergeOA: mergeOA, teamSim: teamSim, normTeam: normTeam, signalsV2: signalsV2, OTHER_SPORTS: OTHER_SPORTS, OTHER_VERSION: OTHER_VERSION, otherSportOf: otherSportOf, otherApiKey: otherApiKey, compactOther: compactOther, otherFair: otherFair, otherSignals: otherSignals, buildOther: buildOther, compactOP: compactOP, mergeOP: mergeOP, addOPMatches: addOPMatches, compactGoalOA: compactGoalOA, tennisPredict: tennisPredict, tennisUpdate: tennisUpdate, tennisSurface: tennisSurface, attachGoals: attachGoals, playerSim: playerSim, devig: devig, fairFromRefs: fairFromRefs, pickSignals: pickSignals, SPORT_CFG: SPORT_CFG, DEVIG: DEVIG, GS_LEAGUES: GS_LEAGUES, opMatch: opMatch, OP_TOURNAMENTS: OP_TOURNAMENTS, OA_SPORT: OA_SPORT, oaLgKey: oaLgKey, powerFair: powerFair, scoreGrid: scoreGrid, marketsFromGrid: marketsFromGrid, MAIN_LEAGUES: MAIN_LEAGUES, NEW_LEAGUES: NEW_LEAGUES, BOOKS: BOOKS };
