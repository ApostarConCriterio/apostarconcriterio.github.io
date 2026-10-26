/* =========================================================================
   Apostar con criterio · servidor (Google Apps Script)
   Este archivo va DESPUÉS de core.js en el mismo proyecto de Apps Script.
   Qué hace:
     actualizarCuotas()     cada 3 h: baja próximos partidos y cuotas, arma el paquete,
                            guarda capturas (solo si cambiaron) y predicciones.
     actualizarResultados() 1 vez por día: baja resultados, calcula forma y modelo.
     doGet()                API pública de solo lectura (JSON) para la web.
   Nunca borra datos buenos: si una descarga falla, conserva lo anterior y lo anota en "log".
   ========================================================================= */
var FD = 'https://football-data.co.uk/';
var SHEETS = { publicado: 'publicado', equipos: 'equipos', modelo: 'modelo', capturas: 'capturas', predicciones: 'predicciones', evaluacion: 'evaluacion', log: 'log', estado: 'estado', anulaciones: 'anulaciones', cuotasApi: 'cuotas_api', mercados: 'mercados', prueba: 'modelos_prueba', usuarios: 'cuotas_usuarios' };
var HEADERS = {
  publicado: ['parte', 'json'], equipos: ['liga', 'equipo', 'actualizado', 'json'], modelo: ['liga', 'actualizado', 'json'],
  capturas: ['capturado', 'archivo_hash', 'clave', 'json_cuotas'],
  predicciones: ['creada', 'version_modelo', 'clave', 'liga', 'inicio', 'local', 'visitante', 'mercado', 'seleccion', 'prob_estimada', 'metodo', 'cuota', 'casa', 'cuota_bet365', 'valor_esperado', 'cuotas_capturadas', 'calidad'],
  evaluacion: ['clave', 'resultado', 'goles_local', 'goles_visitante', 'evaluado'],
  log: ['momento', 'tarea', 'paso', 'estado', 'filas', 'ms', 'detalle'], estado: ['clave', 'valor'],
  anulaciones: ['id_prediccion', 'motivo', 'anulada'],
  cuotasApi: ['liga', 'deporte', 'descargado', 'creditos', 'json'],
  prueba: ['clave', 'actualizado', 'json'],
  usuarios: ['cargada', 'clave', 'deporte', 'casa', 'seleccion', 'cuota', 'nombre'],
  mercados: ['capturada', 'deporte', 'liga', 'evento', 'inicio', 'local', 'visitante', 'mercado', 'seleccion', 'jugador', 'casa', 'cuota', 'hora_cuota', 'prob_justa', 'fuente']
};

/* ---------- planilla ---------- */
function ss_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('SPREADSHEET_ID'), s = null;
  if (id) { try { s = SpreadsheetApp.openById(id); } catch (e) { s = null; } }
  if (!s) { s = SpreadsheetApp.create('Apostar con criterio — datos'); p.setProperty('SPREADSHEET_ID', s.getId()); }
  Object.keys(SHEETS).forEach(function (k) {
    var sh = s.getSheetByName(SHEETS[k]);
    if (!sh) { sh = s.insertSheet(SHEETS[k]); sh.appendRow(HEADERS[k]); sh.setFrozenRows(1); }
  });
  var def = s.getSheetByName('Hoja 1') || s.getSheetByName('Sheet1'); if (def && s.getSheets().length > 1) s.deleteSheet(def);
  return s;
}
function sheet_(name) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { var key = Object.keys(SHEETS).filter(function (k) { return SHEETS[k] === name; })[0]; sh = ss.insertSheet(name); if (key && HEADERS[key]) sh.getRange(1, 1, 1, HEADERS[key].length).setValues([HEADERS[key]]); }
  return sh;
}
function log_(tarea, paso, estado, filas, ms, detalle) {
  try { sheet_(SHEETS.log).appendRow([new Date(), tarea, paso, estado, filas || 0, ms || 0, String(detalle || '').slice(0, 500)]); } catch (e) { console.error(e); }
}
function getEstado_(k) { var v = PropertiesService.getScriptProperties().getProperty('E_' + k); return v ? JSON.parse(v) : null; }
function setEstado_(k, v) { PropertiesService.getScriptProperties().setProperty('E_' + k, JSON.stringify(v)); }

/* ---------- descargas con reintentos ---------- */
function fetch_(url) {
  var last = null;
  for (var i = 1; i <= 3; i++) {
    var t0 = Date.now();
    try {
      var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      var code = r.getResponseCode();
      if (code === 200) { var txt = r.getContentText('UTF-8'); if (txt && txt.length > 50) { var hd = {}; try { hd = r.getHeaders() || {}; } catch (e) { } var lm = hd['Last-Modified'] || hd['last-modified'] || null; return { ok: true, code: code, text: txt, ms: Date.now() - t0, tries: i, lastModified: lm }; } last = 'respuesta vacía'; }
      else last = 'HTTP ' + code;
      if (code === 404) break; // no tiene sentido reintentar
    } catch (e) { last = String(e && e.message || e); }
    Utilities.sleep(1500 * i);
  }
  return { ok: false, error: last };
}
function hash_(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s)).slice(0, 12); }

/* ---------- guardar el paquete público en partes (una celda admite 50.000 caracteres) ---------- */
function savePayload_(json) {
  var sh = sheet_(SHEETS.publicado), parts = [];
  for (var i = 0; i < json.length; i += 45000) parts.push([parts.length, json.slice(i, i + 45000)]);
  var last = sh.getLastRow(); if (last > 1) sh.getRange(2, 1, last - 1, 2).clearContent();
  sh.getRange(2, 1, parts.length, 2).setValues(parts);
  try { CacheService.getScriptCache().putAll(chunks_(json), 21600); } catch (e) { /* la caché es opcional */ }
}
function chunks_(json) { var o = { 'pl_n': '0' }, n = 0; for (var i = 0; i < json.length; i += 90000) { o['pl_' + n] = json.slice(i, i + 90000); n++; } o.pl_n = String(n); return o; }
function loadPayload_() {
  try { var c = CacheService.getScriptCache(), n = +c.get('pl_n'); if (n > 0) { var keys = []; for (var i = 0; i < n; i++) keys.push('pl_' + i); var got = c.getAll(keys); if (keys.every(function (k) { return got[k]; })) return keys.map(function (k) { return got[k]; }).join(''); } } catch (e) { }
  var sh = sheet_(SHEETS.publicado), last = sh.getLastRow(); if (last < 2) return null;
  return sh.getRange(2, 1, last - 1, 2).getValues().sort(function (a, b) { return a[0] - b[0]; }).map(function (r) { return r[1]; }).join('');
}

/* ---------- modelos en prueba (no dan señales): se guardan aparte y se comparan contra el mercado ---------- */
function readPrueba_(k) {
  var sh = sheet_(SHEETS.prueba), last = sh.getLastRow();
  if (last > 1) { var v = sh.getRange(2, 1, last - 1, 3).getValues(); for (var i = 0; i < v.length; i++) if (v[i][0] === k) { try { return JSON.parse(v[i][2]); } catch (e) { return null; } } }
  return null;
}
function savePrueba_(k, obj) {
  var sh = sheet_(SHEETS.prueba), last = sh.getLastRow(), row = [k, new Date(), JSON.stringify(obj)];
  if (row[2].length > 49000) throw new Error('modelo ' + k + ' demasiado grande');
  if (last > 1) { var v = sh.getRange(2, 1, last - 1, 1).getValues(); for (var i = 0; i < v.length; i++) if (v[i][0] === k) { sh.getRange(i + 2, 1, 1, 3).setValues([row]); return; } }
  sh.appendRow(row);
}
function tennisRatings_() { var T = { atp: readPrueba_('tenis_atp'), wta: readPrueba_('tenis_wta') }; if (!T.atp && typeof TENNIS_ELO_INIT === 'object') T.atp = TENNIS_ELO_INIT.atp; if (!T.wta && typeof TENNIS_ELO_INIT === 'object') T.wta = TENNIS_ELO_INIT.wta; return T; }
// Pasa la actualización de cuotas a cada hora (una sola vez). Las fuentes igual respetan sus propios intervalos y presupuestos.
function ensureHourly_() {
  if ((getEstado_('trig') || {}).v === 'h1') return;
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction && t.getHandlerFunction() === 'actualizarCuotas') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('actualizarCuotas').timeBased().everyHours(1).create();
    setEstado_('trig', { v: 'h1', at: new Date().toISOString() }); log_('cuotas', 'disparador', 'ok', 0, 0, 'la actualización pasa a correr cada hora');
  } catch (e) { log_('cuotas', 'disparador', 'error', 0, 0, String(e)); }
}

/* ---------- tarea 1: cuotas y partidos próximos (cada 3 h) ---------- */
function actualizarCuotas() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) { log_('cuotas', 'inicio', 'omitida', 0, 0, 'otra actualización en curso'); return; }
  var T = Date.now();
  try {
    ensureHourly_();
    var srcs = [['fixtures', 'fixtures.csv'], ['newFixtures', 'new_league_fixtures.csv']], rows = {}, fetched = getEstado_('fuentes') || {}, changed = false, hashes = {};
    var cache = CacheService.getScriptCache(), aborted = false;
    srcs.forEach(function (s) {
      var r = fetch_(FD + s[1]), parsed = null;
      if (r.ok) { parsed = parseCsv(r.text); if (parsed.length < 5) { log_('cuotas', s[1], 'error', parsed.length, r.ms, 'muy pocas filas'); parsed = null; } }
      else log_('cuotas', s[1], 'error', 0, 0, r.error);
      if (!parsed) {
        // Falló la descarga: se usa la última copia buena. Si no hay, no se publica nada nuevo.
        var raw = cache.get('raw_' + s[0]);
        if (raw) { rows[s[0]] = parseCsv(raw); log_('cuotas', s[1], 'aviso', rows[s[0]].length, 0, 'se usa la última copia buena'); }
        else aborted = true;
        fetched[s[0]] = Object.assign(fetched[s[0]] || {}, { lastError: new Date().toISOString(), error: r.error || 'datos inválidos' });
        return;
      }
      try { cache.put('raw_' + s[0], r.text, 21600); } catch (e) { }
      var h = hash_(r.text); hashes[s[0]] = h;
      var isNew = !fetched[s[0]] || fetched[s[0]].hash !== h; if (isNew) changed = true;
      if (isNew) fetched[s[0]] = { at: new Date().toISOString(), seen: new Date().toISOString(), atSource: 'detectado', hash: h, rows: parsed.length, file: s[1] };
      // La hora que vale es la de publicación del archivo (Last-Modified), no la de descarga.
      var lmMs = r.lastModified ? Date.parse(r.lastModified) : NaN;
      if (isFinite(lmMs)) { fetched[s[0]].at = new Date(lmMs).toISOString(); fetched[s[0]].atSource = 'publicado'; }
      fetched[s[0]].checked = new Date().toISOString(); delete fetched[s[0]].error; delete fetched[s[0]].lastError;
      rows[s[0]] = parsed; log_('cuotas', s[1], 'ok', parsed.length, r.ms, (isNew ? 'archivo nuevo' : 'sin cambios') + ' · intentos ' + r.tries);
    });
    if (aborted) { try { alerta_('fuente', 'Una fuente de partidos (football-data) falló y no hay copia guardada. La web sigue mostrando la última versión buena.'); } catch (e) { } setEstado_('fuentes', fetched); log_('cuotas', 'fin', 'error', 0, Date.now() - T, 'una fuente falló y no hay copia: la web sigue mostrando la última versión buena'); return; }

    var strengths = readModel_(), forms = readTeams_(), now = Date.now();
    var payload = buildPayload({ fixtures: rows.fixtures || [], newFixtures: rows.newFixtures || [], results: {}, fetched: fetched, now: now });
    payload.matches.forEach(function (m) {
      var st = strengths[m.lg];
      if (st) { var mp = modelPredict(st, m.home, m.away); if (mp) m.model = { x12: mp.x12.map(r5), over25: r5(mp.over25), btts: r5(mp.btts), lh: r2(mp.lh), la: r2(mp.la), n: [mp.nHome, mp.nAway], version: mp.version };
        if (st.cc) { var cc = { corners: countPredict(st.cc.corners, CC_MODEL.corners, m.home, m.away), cards: countPredict(st.cc.cards, CC_MODEL.cards, m.home, m.away) }; if (m.model && (cc.corners || cc.cards)) m.model.cc = cc; } }
      var fh = forms[m.lg + '|' + m.home], fa = forms[m.lg + '|' + m.away];
      m.hasForm = !!(fh && fa);
    });
    // Cuotas actualizadas de The Odds API (si hay clave): se suman a las de football-data, nunca las reemplazan.
    var oaInfo = null;
    try { oaInfo = actualizarOA_(payload, now); } catch (e) { log_('cuotas', 'the-odds-api', 'error', 0, 0, String(e && e.stack || e)); }
    var opInfo = null;
    try { opInfo = actualizarOP_(now); } catch (e) { log_('cuotas', 'oddspapi', 'error', 0, 0, String(e && e.stack || e)); }
    var nGS = 0, store0 = readOA_();
    try { actualizarGoleadores_(store0, now); } catch (e) { log_('cuotas', 'goleadores', 'error', 0, 0, String(e && e.stack || e)); }
    var nOA = 0, nOP = 0, store = readOA_(), opEv = [].concat.apply([], Object.keys(store).filter(function (k) { return /^OP\d*$/.test(k); }).map(function (k) { return store[k].events || []; })), seenOP = {};
    var gsById = {}; ((store.OPG || {}).events || []).forEach(function (x) { gsById[x.id] = x.gs; });
    opEv.forEach(function (e) { if (gsById[e.id]) e.gs = gsById[e.id]; });
    opEv = opEv.filter(function (e) { if (seenOP[e.id]) return false; seenOP[e.id] = 1; return true; });
    var nAdd = 0;
    try { nOP = mergeOP(payload.matches, opEv); nAdd = addOPMatches(payload.matches, opEv, now); } catch (e) { log_('cuotas', 'oddspapi', 'error', 0, 0, 'unión: ' + String(e)); }
    try { nOA = mergeOA(payload.matches, store); } catch (e) { log_('cuotas', 'the-odds-api', 'error', 0, 0, 'unión: ' + String(e)); }
    try { nGS = attachGoals(payload.matches, store.GS && store.GS.events, opEv, now); } catch (e) { log_('cuotas', 'goleadores', 'error', 0, 0, 'unión: ' + String(e)); }
    payload.matches.forEach(function (m) {
      var src = payload.sources[m.lg.indexOf(':') >= 0 ? 'newFixtures' : 'fixtures'] || {}, r = signalsV2(m, Date.parse(src.at), now);
      m.fair = r.fair ? { p: r.fair.p.map(r5), ref: r.fair.ref, refKey: r.fair.refKey } : null;
      m.signals = r.signals;
    });
    var oaSt = getEstado_('oa');
    payload.oa = { configured: !!PropertiesService.getScriptProperties().getProperty('ODDS_API_KEY'), matched: nOA, remaining: oaSt ? oaSt.remaining : null, usedMonth: oaSt ? oaSt.usedMonth : 0, last: oaSt ? oaSt.last : {}, lastAt: oaSt ? oaSt.lastAt : null, run: oaInfo };
    var opSt = getEstado_('op');
    payload.op = { configured: !!PropertiesService.getScriptProperties().getProperty('ODDSPAPI_KEY'), matched: nOP + nAdd, added: nAdd, lastAt: store.OP ? store.OP.fetched : null, used: opSt ? opSt.used : null, limit: opSt ? opSt.limit : null, run: opInfo };
    var TR = null; try { TR = tennisRatings_(); } catch (e) { log_('cuotas', 'tenis modelo', 'error', 0, 0, String(e)); }
    try { payload.other = buildOther(store, now, opEv, TR); } catch (e) { log_('cuotas', 'otros deportes', 'error', 0, 0, String(e)); payload.other = null; }
    try { guardarSombra_(payload, now); } catch (e) { log_('cuotas', 'tenis modelo', 'error', 0, 0, 'sombra: ' + String(e)); }
    payload.sombra = getEstado_('sombra') || null;
    try { mergeReferencias_(payload, store); } catch (e) { log_('cuotas', 'referencias', 'error', 0, 0, String(e)); }
    payload.results = getEstado_('resultados') || null;
    payload.engine = { version: ENGINE_VERSION, devig: DEVIG };
    var json = JSON.stringify(payload);
    savePayload_(json);
    try { saveMercados_(payload, now); } catch (e) { log_('cuotas', 'mercados', 'error', 0, 0, String(e)); }
    if (changed) saveCaptures_(payload, (hashes.fixtures || '') + (hashes.newFixtures || ''));
    if (oaInfo && oaInfo.ligas && oaInfo.ligas.length) saveCaptures_({ matches: payload.matches.filter(function (m) { return m.oa && m.oa.fetched === new Date(now).toISOString(); }) }, 'the-odds-api');
    var nPred = savePredictions_(payload); applyKnownVoids_();
    try { avisarSenales_(LAST_PRED_ROWS || []); revisarAlertas_(payload); } catch (e) { log_('cuotas', 'telegram', 'error', 0, 0, String(e)); }
    fetched.lastRun = new Date().toISOString(); setEstado_('fuentes', fetched);
    log_('cuotas', 'fin', 'ok', payload.matches.length, Date.now() - T, payload.matches.length + ' partidos · ' + nOA + ' con cuotas de The Odds API · ' + (nOP + nAdd) + ' con Bet365 Argentina (' + nAdd + ' agregados) · ' + nGS + ' con goleadores · ' + (payload.other ? payload.other.events.length : 0) + ' de tenis, NBA y NFL · ' + nPred + ' predicciones nuevas · ' + Math.round(json.length / 1024) + ' KB');
  } catch (e) {
    log_('cuotas', 'fin', 'error', 0, Date.now() - T, String(e && e.stack || e));
    try { alerta_('error_cuotas', 'La actualización de cuotas falló: ' + String(e).slice(0, 200)); } catch (e2) { }
  } finally { lock.releaseLock(); }
}
function saveCaptures_(payload, h) {
  var at = new Date(), rows = payload.matches.map(function (m) { return [at, h, m.key, JSON.stringify(m.odds)]; });
  if (rows.length) { var sh = sheet_(SHEETS.capturas); sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows); }
}
// Las predicciones se guardan una sola vez por partido, mercado y versión de modelo, y nunca se modifican.
// Desde el 25/10/2026 (mercado-v2): la cuota y la probabilidad justa tienen que tener menos de 12 h, y solo cuentan casas con nombre.
function savePredictions_(payload) {
  var sh = sheet_(SHEETS.predicciones), last = sh.getLastRow(), seen = {};
  if (last > 1) sh.getRange(2, 2, last - 1, 8).getValues().forEach(function (r) { seen[r[0] + '|' + r[1] + '|' + r[6] + '|' + r[7]] = 1; });
  var out = [], created = new Date(), names = ['Local', 'Empate', 'Visitante'];
  payload.matches.forEach(function (m) {
    if (Date.parse(m.kickoff) <= Date.now()) return;
    (m.signals || []).forEach(function (s) {
      if (!s.at || Date.now() - Date.parse(s.at) > 12 * 36e5) return;
      var id = SIGNAL_VERSION + '|' + m.key + '|1X2|' + names[s.sel]; if (seen[id]) return; seen[id] = 1;
      var b365 = m.odds.x12.B3A ? m.odds.x12.B3A[s.sel] : m.odds.x12.B365 ? m.odds.x12.B365[s.sel] : '';
      out.push([created, SIGNAL_VERSION, m.key, m.league, m.kickoff, m.home, m.away, '1X2', names[s.sel], s.p, 'Probabilidad justa de ' + (m.fair ? m.fair.ref : '?') + ' (método de potencia)', s.odd, s.book, b365, s.ev, s.at, m.issues.length ? 'con avisos: ' + m.issues.join('; ') : 'completa']);
    });
  });
  // Goleadores: una predicción por jugador y partido, con la casa, la cuota y la hora.
  payload.matches.forEach(function (m) {
    if (!m.gs || Date.parse(m.kickoff) <= Date.now()) return;
    m.gs.signals.forEach(function (g) {
      if (!g.at || Date.now() - Date.parse(g.at) > 12 * 36e5) return;
      var clave = m.key + '#' + g.player, sel = 'Anota: ' + g.player, id = GOAL_VERSION + '|' + clave + '|Anota en cualquier momento|' + sel; if (seen[id]) return; seen[id] = 1;
      out.push([created, GOAL_VERSION, clave, m.league, m.kickoff, m.home, m.away, 'Anota en cualquier momento', sel, g.p, 'Consenso sin margen de casas de EE. UU. (' + g.m + ') · OP:' + (m.gs.opId || '') + ':' + (g.pid || ''), g.odd, g.book, g.odd, g.ev, g.at, 'completa · goleador']);
    });
  });
  // Tenis, NBA, NFL y MLB: mercado "Ganador" (dos resultados), misma regla de 12 h.
  ((payload.other && payload.other.events) || []).forEach(function (e) {
    if (Date.parse(e.kickoff) <= Date.now()) return;
    (e.signals || []).forEach(function (s) {
      if (!s.at || Date.now() - Date.parse(s.at) > 12 * 36e5) return;
      var nm = 'Gana ' + (s.sel === 0 ? e.home : e.away), id = OTHER_VERSION + '|' + e.key + '|Ganador|' + nm; if (seen[id]) return; seen[id] = 1;
      out.push([created, OTHER_VERSION, e.key, e.league, e.kickoff, e.home, e.away, 'Ganador', nm, s.p, 'Probabilidad justa de ' + (e.fair ? e.fair.ref : '?') + ' (método de potencia)', s.odd, s.book, e.b365 ? e.b365[s.sel] : '', s.ev, s.at, 'completa · ' + e.sport]);
    });
  });
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
  LAST_PRED_ROWS = out;
  return out.length;
}

/* ---------- The Odds API: presupuesto de créditos y descarga ---------- */
// Plan gratis: 500 créditos por mes. Cada liga cuesta 1 crédito por mercado (región "eu": Pinnacle, Betfair y ~20 casas europeas).
// Se reparte lo que queda entre los días que faltan, se guarda una reserva, y solo se piden ligas con partidos en las próximas 36 h.
function actualizarOA_(payload, now) {
  var key = PropertiesService.getScriptProperties().getProperty('ODDS_API_KEY');
  if (!key) return { omitida: 'sin clave' };
  key = key.trim();
  var st = getEstado_('oa') || {}, d = new Date(now), month = d.toISOString().slice(0, 7), day = d.toISOString().slice(0, 10);
  if (st.month !== month) { st.month = month; st.usedMonth = 0; if (st.remaining != null && st.remaining < 500) st.remaining = 500; }
  if (st.day !== day) { st.day = day; st.usedDay = 0; }
  st.last = st.last || {};
  var remaining = st.remaining == null ? 500 : st.remaining, RESERVE = 25;
  var daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(), daysLeft = daysInMonth - d.getUTCDate() + 1;
  var dayCap = Math.max(0, Math.floor((remaining - RESERVE) / daysLeft)), budget = dayCap - (st.usedDay || 0);
  var soon = {}, other = {};
  payload.matches.forEach(function (m) { var ko = Date.parse(m.kickoff), k = oaLgKey(m.lg); if (OA_SPORT[k] && ko > now && ko < now + 36 * 36e5) soon[k] = Math.min(soon[k] || Infinity, ko); });
  // Tenis, NBA y NFL: /sports y /events no gastan créditos; sirven para saber si hay partidos en las próximas 36 h.
  try { other = otrosProximos_(key, now); } catch (e) { log_('cuotas', 'the-odds-api otros', 'error', 0, 0, String(e)); }
  Object.keys(other).forEach(function (k) { soon[k] = other[k].ko; });
  st.activos = Object.keys(other);
  var cand = Object.keys(soon).map(function (k) {
    var age = now - (st.last[k] ? Date.parse(st.last[k]) : 0), until = soon[k] - now;
    var pk = k.indexOf('TEN:') === 0 ? 'TEN' : k, pri = OA_PRIORITY_ALL.indexOf(pk);
    return { k: k, need: age > 12 * 36e5 || (until < 5 * 36e5 && age > 3 * 36e5), pri: pri < 0 ? 99 : pri, until: until };
  }).filter(function (c) { return c.need; }).sort(function (a, b) { return a.pri - b.pri || a.until - b.until; });
  var done = [], skipped = [];
  cand.forEach(function (c) {
    var markets = c.k === 'ARG' ? 'h2h,totals' : 'h2h', cost = markets.split(',').length, isOther = !OA_SPORT[c.k], sportKey = isOther ? otherApiKey(c.k) : OA_SPORT[c.k];
    if (cost > budget) { skipped.push(c.k); return; }
    var url = 'https://api.the-odds-api.com/v4/sports/' + sportKey + '/odds/?regions=eu&markets=' + markets + '&oddsFormat=decimal&dateFormat=iso&apiKey=' + encodeURIComponent(key);
    var t0 = Date.now(), r;
    try { r = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); } catch (e) { log_('cuotas', 'the-odds-api ' + c.k, 'error', 0, Date.now() - t0, String(e)); return; }
    var h = r.getHeaders(), rem = parseInt(h['x-requests-remaining'] || h['X-Requests-Remaining'], 10), lastCost = parseInt(h['x-requests-last'] || h['X-Requests-Last'], 10);
    if (isFinite(rem)) st.remaining = rem;
    var spent = isFinite(lastCost) ? lastCost : cost; budget -= spent; st.usedDay = (st.usedDay || 0) + spent; st.usedMonth = (st.usedMonth || 0) + spent;
    if (r.getResponseCode() !== 200) { log_('cuotas', 'the-odds-api ' + c.k, 'error', 0, Date.now() - t0, 'HTTP ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200)); return; }
    var events = JSON.parse(r.getContentText()).map(isOther ? compactOther : compactOA).filter(function (e) { return e.pin || e.bfx || e.n; });
    saveOA_(c.k, sportKey, new Date(now).toISOString(), spent, events, isOther && other[c.k] ? other[c.k].title : null);
    st.last[c.k] = new Date(now).toISOString(); st.lastAt = st.last[c.k]; done.push(c.k + ':' + events.length);
    log_('cuotas', 'the-odds-api ' + c.k, 'ok', events.length, Date.now() - t0, events.length + ' partidos · ' + spent + ' crédito(s) · quedan ' + st.remaining);
  });
  setEstado_('oa', st);
  return { ligas: done, sinPresupuesto: skipped, presupuestoDia: dayCap, usadoHoy: st.usedDay, quedan: st.remaining };
}
// Orden de gasto con todos los deportes: Argentina y Premier primero, después NBA, LaLiga, NFL, tenis y el resto.
var OA_PRIORITY_ALL = ['ARG', 'E0', 'NBA', 'SP1', 'NFL', 'MLB', 'TEN', 'I1', 'D1', 'F1', 'P1', 'N1', 'BRA', 'E1', 'B1', 'T1', 'MEX', 'SC0', 'USA', 'G1', 'D2', 'I2', 'SP2', 'F2', 'AUT', 'DNK', 'SWZ', 'NOR', 'SWE', 'POL', 'JPN', 'E2', 'E3', 'IRL', 'FIN', 'RUS'];
function otrosProximos_(key, now) {
  var base = 'https://api.the-odds-api.com/v4/sports', out = {}, codes = {};
  var r = UrlFetchApp.fetch(base + '/?apiKey=' + encodeURIComponent(key), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) { log_('cuotas', 'the-odds-api deportes', 'error', 0, 0, 'HTTP ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200).split(key).join('***')); if (r.getResponseCode() === 401) try { alerta_('clave_oa', 'The Odds API rechazó la clave (ODDS_API_KEY) o se quedó sin créditos. Sin eso no hay cuota justa de Pinnacle.'); } catch (e) { } return out; }
  JSON.parse(r.getContentText()).forEach(function (s) {
    if (!s.active || s.has_outrights) return;
    if (s.key === OTHER_SPORTS.NBA.key) codes.NBA = s.title;
    else if (s.key === OTHER_SPORTS.NFL.key) codes.NFL = s.title;
    else if (s.key === OTHER_SPORTS.MLB.key) codes.MLB = s.title;
    else if (s.group === 'Tennis' && /^tennis_(atp|wta)_/.test(s.key)) codes['TEN:' + s.key] = s.title;
  });
  Object.keys(codes).forEach(function (code) {
    var e = UrlFetchApp.fetch(base + '/' + otherApiKey(code) + '/events?dateFormat=iso&apiKey=' + encodeURIComponent(key), { muteHttpExceptions: true });
    if (e.getResponseCode() !== 200) return;
    var ko = Infinity;
    JSON.parse(e.getContentText()).forEach(function (x) { var t = Date.parse(x.commence_time); if (t > now && t < now + 36 * 36e5) ko = Math.min(ko, t); });
    if (ko < Infinity) out[code] = { ko: ko, title: codes[code] };
  });
  return out;
}
function saveOA_(k, sport, at, credits, events, title) {
  var sh = sheet_(SHEETS.cuotasApi), last = sh.getLastRow(), row = [k, sport, at, credits, JSON.stringify({ fetched: at, title: title || null, events: events })];
  if (last > 1) { var keys = sh.getRange(2, 1, last - 1, 1).getValues(); for (var i = 0; i < keys.length; i++) if (keys[i][0] === k) { sh.getRange(i + 2, 1, 1, 5).setValues([row]); return; } }
  sh.appendRow(row);
}
function readOA_() {
  var sh = sheet_(SHEETS.cuotasApi), last = sh.getLastRow(), o = {};
  if (last > 1) sh.getRange(2, 1, last - 1, 5).getValues().forEach(function (r) { try { o[r[0]] = JSON.parse(r[4]); } catch (e) { } });
  return o;
}

/* ---------- OddsPapi: Bet365 Argentina (250 consultas por mes) ---------- */
// La cuenta (/account) no gasta. Se reparte lo que queda entre los días del mes: como mucho una consulta cada 3 h.
// La respuesta de /account trae la clave adentro: nunca se guarda ni se registra entera.
function opClient_() {
  var key = (PropertiesService.getScriptProperties().getProperty('ODDSPAPI_KEY') || '').trim();
  if (!key) return null;
  return { key: key, g: function (path) { var r = UrlFetchApp.fetch('https://api.oddspapi.io/v4/' + path + (path.indexOf('?') < 0 ? '?' : '&') + 'apiKey=' + encodeURIComponent(key), { muteHttpExceptions: true }); var t = r.getContentText(), j = null; try { j = JSON.parse(t); } catch (e) { } return { http: r.getResponseCode(), j: j, msg: r.getResponseCode() === 200 ? '' : t.slice(0, 300).split(key).join('***') }; } };
}
// Mercados de OddsPapi por deporte (ganador y "anota en cualquier momento"): se buscan una vez por semana.
function discoverMarkets_(list) {
  var mk = {};
  (list || []).forEach(function (x) {
    if (x.playerProp || !x.outcomes || x.marketLength !== 2 || x.handicap) return;
    if ([11, 12, 13, 14].indexOf(x.sportId) >= 0 && /^winner( \(incl\. (overtime|extra innings|ot)\))?$/i.test(String(x.marketName).trim())) {
      var prev = mk[x.sportId], incl = /incl/i.test(x.marketName);
      if (!prev || (incl && !prev.incl)) { var oc = x.outcomes.slice().sort(function (a, b) { return String(a.outcomeName).localeCompare(String(b.outcomeName)); }); mk[x.sportId] = [String(x.marketId), [String(oc[0].outcomeId), String(oc[1].outcomeId)]]; mk[x.sportId].incl = incl; }
    }
  });
  (list || []).forEach(function (x) {
    if (x.sportId !== 10 || !x.playerProp || mk.goal) return;
    if (/anytime (goal)?scorer|to score anytime|anytime goal/i.test(String(x.marketName))) {
      var yes = (x.outcomes || []).filter(function (o) { return /yes|anytime|score/i.test(String(o.outcomeName)); })[0] || (x.outcomes || [])[0];
      if (yes) mk.goal = { id: String(x.marketId), yes: String(yes.outcomeId), name: x.marketName };
    }
  });
  Object.keys(mk).forEach(function (k) { if (mk[k] && mk[k].incl !== undefined) mk[k] = [mk[k][0], mk[k][1]]; });
  return mk;
}
function actualizarOP_(now) {
  var C = opClient_(); if (!C) return { omitida: 'sin clave' };
  var g = C.g, st = getEstado_('op') || {};
  var a = g('account'), A = a.j || {}, sub = (A.subscriptions || [])[0] || {};
  if (a.http !== 200) { log_('cuotas', 'oddspapi', 'error', 0, 0, 'cuenta: HTTP ' + a.http); return { error: 'cuenta HTTP ' + a.http }; }
  st.limit = A.request_limit != null ? A.request_limit : sub.request_limit; st.used = A.request_count != null ? A.request_count : sub.request_count;
  var d = new Date(now), daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(), daysLeft = daysInMonth - d.getUTCDate() + 1;
  var left = (st.limit || 0) - (st.used || 0) - 5, perDay = Math.floor(left / daysLeft);
  if (perDay < 1) { setEstado_('op', st); return { omitida: 'sin presupuesto', quedan: left }; }
  if (st.errAt && now - Date.parse(st.errAt) < 10 * 6e4) { setEstado_('op', st); return { omitida: 'reintento en 10 min' }; }
  // Torneos: A = Argentina, NBA, NFL, MLB (si hay temporada) y tenis; B = las 5 ligas de Europa (cada 12 h si alcanza).
  var activos = (getEstado_('oa') || {}).activos || [], mlb = activos.indexOf('MLB') >= 0;
  function makeGroups() { var ids = [155, 132, 31].concat(mlb ? [109] : []).concat((st.ten || []).slice(0, 3)), gr = []; for (var i = 0; i < ids.length; i += 5) gr.push({ row: i ? 'OP' + (i / 5 + 2) : 'OP', ids: ids.slice(i, i + 5) }); return gr; }
  // Se reservan 2 consultas por día para resultados de goleadores y búsquedas semanales.
  var nG = makeGroups().length, every = Math.max(3, 24 * nG / Math.max(1, perDay - 2)) * 36e5, last = st.okAt ? Date.parse(st.okAt) : 0;
  var day = new Date(now).toISOString().slice(0, 10); if (st.day !== day) { st.day = day; st.usedDay = 0; st.usedStart = st.used; }
  st.usedDay = (st.used || 0) - (st.usedStart != null ? st.usedStart : st.used || 0);
  // Antes de los partidos: si algo empieza en menos de 2 h, se vuelve a pedir cada hora (dentro del presupuesto del día).
  var prevEv = [].concat.apply([], ['OP', 'OP3', 'OP4'].map(function (k) { return ((readOA_()[k] || {}).events) || []; }));
  var soon = prevEv.some(function (e) { var t = Date.parse(e.t); return t > now && t < now + 2 * 36e5; });
  var due = now - last >= every || (soon && now - last >= 55 * 6e4 && st.usedDay + nG <= perDay);
  if (!due) { setEstado_('op', st); return { omitida: 'todavía no', proxima: new Date(last + every).toISOString(), quedan: left }; }
  if (perDay >= 3 && (!st.mkAt || now - Date.parse(st.mkAt) > 7 * 864e5)) {
    var mm = g('markets'); st.used++; if (mm.j && mm.j.filter) { st.mk = discoverMarkets_(mm.j); st.mkAt = new Date(now).toISOString(); log_('cuotas', 'oddspapi mercados', 'ok', Object.keys(st.mk).length, 0, JSON.stringify(st.mk).slice(0, 400)); }
    Utilities.sleep(1100);
  }
  if (perDay >= 3 && (!st.tenAt || st.tenV !== 2 || now - Date.parse(st.tenAt) > 24 * 36e5)) {
    var t = g('tournaments?sportId=12'); st.used++;
    // "upcoming" = próximos días; "future" = más adelante en el torneo (las rondas siguientes todavía sin rival).
    if (t.j && t.j.filter) { st.ten = t.j.filter(function (x) { return /^(ATP|WTA)$/i.test(x.categoryName || '') && /Singles/i.test(x.tournamentName || '') && (x.upcomingFixtures || 0) + (x.futureFixtures || 0) > 0; }).sort(function (x, y) { return (y.upcomingFixtures || 0) - (x.upcomingFixtures || 0) || (y.futureFixtures || 0) - (x.futureFixtures || 0); }).slice(0, 4).map(function (x) { return x.tournamentId; }); st.tenAt = new Date(now).toISOString(); st.tenV = 2; }
    Utilities.sleep(1100);
  }
  var groups = makeGroups();
  if (perDay >= groups.length + 3 && (!st.okB || now - Date.parse(st.okB) > 12 * 36e5)) groups.push({ row: 'OP2', ids: [17, 8, 23, 35, 34], b: true });
  var res = [], fail = false, gsOut = [];
  groups.forEach(function (gr, n) {
    if (n) Utilities.sleep(1100);
    var t0 = Date.now(), o = g('odds-by-tournaments?tournamentIds=' + gr.ids.join(',') + '&bookmaker=' + OP_BOOK + '&oddsFormat=decimal&verbosity=3');
    st.used++; st.lastAt = new Date(now).toISOString();
    if (o.http === 404 && /FIXTURE_NOT_FOUND/.test(o.msg)) { log_('cuotas', 'oddspapi', 'ok', 0, Date.now() - t0, 'sin partidos con Bet365 Argentina en los torneos ' + gr.ids.join(',')); saveOA_(gr.row, OP_BOOK, st.lastAt, 1, [], 'Bet365 Argentina'); res.push(gr.row + ':0'); return; }
    if (o.http !== 200 || !o.j) { fail = true; log_('cuotas', 'oddspapi', 'error', 0, Date.now() - t0, 'HTTP ' + o.http + ' ' + o.msg + ' · torneos ' + gr.ids.join(',')); return; }
    var raw = o.j.map ? o.j : (o.j.events || o.j.data || []);
    var ev = raw.map(function (f) { return compactOP(f, st.mk); }).filter(function (e) { var t = Date.parse(e && e.t); return e && t > now - 3 * 36e5 && t < now + 5 * 864e5; }).sort(function (x, y) { return x.t < y.t ? -1 : 1; });
    ev.forEach(function (e) { if (e.gs) { if (Date.parse(e.t) < now + 48 * 36e5) gsOut.push({ id: e.id, gs: e.gs }); delete e.gs; } });
    while (JSON.stringify(ev).length > 44000 && ev.length) ev.pop();
    saveOA_(gr.row, OP_BOOK, st.lastAt, 1, ev, 'Bet365 Argentina');
    if (gr.b) st.okB = st.lastAt;
    res.push(gr.row + ':' + ev.length);
    log_('cuotas', 'oddspapi', 'ok', ev.length, Date.now() - t0, ev.length + ' partidos con Bet365 Argentina (de ' + raw.length + ', torneos ' + gr.ids.join(',') + ') · quedan ' + ((st.limit || 0) - st.used) + ' consultas este mes');
  });
  // Betano de otro país como referencia (1 por día). Se busca una vez cuál tiene la Liga Profesional.
  if (perDay >= 5 && (!st.bnAt || now - Date.parse(st.bnAt) > 24 * 36e5)) {
    var BN = { 'betano.pe': 'Perú', 'betano.mx': 'México', 'betano.bet.br': 'Brasil', 'betano': 'internacional', 'betano.pt': 'Portugal' };
    var slugs = st.betano ? [st.betano] : Object.keys(BN);
    for (var bi = 0; bi < slugs.length; bi++) {
      Utilities.sleep(1100);
      var ob = g('odds-by-tournaments?tournamentIds=155,132,31&bookmaker=' + slugs[bi] + '&oddsFormat=decimal&verbosity=3'); st.used++;
      if (ob.http !== 200 || !ob.j) continue;
      var evb = (ob.j.map ? ob.j : []).map(function (f) { return compactOP(f, st.mk, slugs[bi]); }).filter(function (e) { var t = Date.parse(e && e.t); return e && t > now - 3 * 36e5 && t < now + 5 * 864e5; });
      evb.forEach(function (e) { delete e.gs; });
      if (evb.filter(function (e) { return e.code === 'ARG'; }).length >= 3 || st.betano) {
        st.betano = slugs[bi]; st.bnAt = new Date(now).toISOString();
        while (JSON.stringify(evb).length > 44000 && evb.length) evb.pop();
        saveOA_('OPB', slugs[bi], st.bnAt, 1, evb, 'Betano ' + BN[slugs[bi]]);
        log_('cuotas', 'oddspapi betano', 'ok', evb.length, 0, evb.length + ' partidos con Betano ' + BN[slugs[bi]] + ' (referencia)');
        break;
      }
    }
    if (!st.bnAt) st.bnAt = new Date(now - 18 * 36e5).toISOString(); // si ninguna sirvió, reintenta en 6 h
  }
  // Betfair Exchange para goleadores (casi sin margen): cuando se pidieron las ligas de Europa y hay partidos en menos de 24 h.
  if (groups.some(function (x) { return x.b; }) && st.mk && st.mk.goal) {
    var soonEU = ['E0', 'SP1', 'I1', 'D1', 'F1'].some(function (k) { return ((readOA_()[k] || {}).events || []).some(function (e) { var t = Date.parse(e.t); return t > now && t < now + 24 * 36e5; }); });
    if (soonEU) {
      Utilities.sleep(1100);
      var ox = g('odds-by-tournaments?tournamentIds=17,8,23,35,34&bookmaker=betfair-ex&oddsFormat=decimal&verbosity=3'); st.used++;
      if (ox.http === 200 && ox.j && ox.j.map) {
        var xs = ox.j.map(function (f) { var c = compactOP(f, st.mk, 'betfair-ex'); return c && c.gs && Date.parse(c.t) < now + 48 * 36e5 ? { id: c.id, gs: c.gs } : null; }).filter(Boolean).slice(0, 20);
        xs.forEach(function (x) { var ks = Object.keys(x.gs).slice(0, 25), o = {}; ks.forEach(function (k) { o[k] = x.gs[k]; }); x.gs = o; });
        while (JSON.stringify(xs).length > 44000 && xs.length) xs.pop();
        saveOA_('OPX', 'betfair-ex', new Date(now).toISOString(), 1, xs, 'Betfair Exchange · goleadores');
        log_('cuotas', 'oddspapi betfair', 'ok', xs.length, 0, xs.length + ' partidos con goleadores en Betfair Exchange');
      } else log_('cuotas', 'oddspapi betfair', 'error', 0, 0, 'HTTP ' + ox.http + ' ' + (ox.msg || ''));
    }
  }
  if (gsOut.length) {
    var prev = (readOA_().OPG || {}).events || [], keep = prev.filter(function (x) { return !gsOut.some(function (y) { return y.id === x.id; }); });
    var all = gsOut.concat(keep).slice(0, 30);
    all.forEach(function (x) { var ks = Object.keys(x.gs).slice(0, 25), o = {}; ks.forEach(function (k) { o[k] = x.gs[k]; }); x.gs = o; });
    while (JSON.stringify(all).length > 44000 && all.length) all.pop();
    saveOA_('OPG', OP_BOOK, new Date(now).toISOString(), 0, all, 'Bet365 Argentina · goleadores');
  }
  if (fail) st.errAt = st.lastAt; else { st.okAt = st.lastAt; delete st.errAt; }
  setEstado_('op', st);
  return { grupos: res, goleadoresBet365: gsOut.length, quedan: (st.limit || 0) - st.used };
}
// Goleadores: casas de EE. UU. en The Odds API (1 crédito por partido). Los 10 partidos más importantes por semana
// de las 5 ligas grandes, cuando faltan menos de 12 h. Prioridad: Premier, LaLiga, Serie A, Bundesliga, Ligue 1; dentro de cada una, el más cercano.
function actualizarGoleadores_(store, now) {
  var key = (PropertiesService.getScriptProperties().getProperty('ODDS_API_KEY') || '').trim(); if (!key) return { omitida: 'sin clave' };
  var st = getEstado_('gs') || {}, oa = getEstado_('oa') || {}, d = new Date(now), monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
  if (st.week !== monday) { st.week = monday; st.count = 0; }
  st.done = st.done || {};
  if ((oa.remaining != null && oa.remaining < 40) || st.count >= 10) { setEstado_('gs', st); return { omitida: st.count >= 10 ? 'tope semanal' : 'pocos créditos' }; }
  var order = ['E0', 'SP1', 'I1', 'D1', 'F1'], cand = [];
  order.forEach(function (k, pri) { ((store[k] || {}).events || []).forEach(function (e) { var t = Date.parse(e.t); if (e.id && !st.done[e.id] && t > now && t < now + 12 * 36e5) cand.push({ k: k, e: e, pri: pri, t: t }); }); });
  cand.sort(function (a, b) { return a.pri - b.pri || a.t - b.t; });
  var G = (store.GS || {}).events || {}, got = 0;
  cand.slice(0, Math.min(4, 10 - st.count)).forEach(function (c) {
    var url = 'https://api.the-odds-api.com/v4/sports/' + GS_LEAGUES[c.k] + '/events/' + c.e.id + '/odds?regions=us&markets=' + GOAL_MARKET + '&oddsFormat=decimal&dateFormat=iso&apiKey=' + encodeURIComponent(key);
    var t0 = Date.now(), r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    st.done[c.e.id] = new Date(now).toISOString(); st.count++;
    if (r.getResponseCode() !== 200) { log_('cuotas', 'goleadores', 'error', 0, Date.now() - t0, 'HTTP ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200).split(key).join('***')); return; }
    var x = compactGoalOA(JSON.parse(r.getContentText())); x.fetched = new Date(now).toISOString(); x.lg = c.k;
    G[c.e.id] = x; got++;
    log_('cuotas', 'goleadores', 'ok', Object.keys(x.players).length, Date.now() - t0, x.home + ' vs ' + x.away + ': ' + Object.keys(x.players).length + ' jugadores con cuota justa · ' + st.count + ' de 10 esta semana');
  });
  Object.keys(st.done).forEach(function (id) { if (now - Date.parse(st.done[id]) > 10 * 864e5) delete st.done[id]; });
  Object.keys(G).forEach(function (id) { if (Date.parse(G[id].t) < now - 36e5 * 30) delete G[id]; });
  if (got) { var js = JSON.stringify(G); while (js.length > 44000) { var ks = Object.keys(G).sort(function (a, b) { return G[a].t < G[b].t ? -1 : 1; }); delete G[ks[0]]; js = JSON.stringify(G); } saveOA_('GS', GOAL_MARKET, new Date(now).toISOString(), got, G, 'goleadores'); }
  setEstado_('gs', st);
  return { partidos: got, semana: st.count };
}
// Hoja "mercados": capturas genéricas (cualquier deporte, mercado o jugador) de los eventos que empiezan en menos de 24 h.
function saveMercados_(payload, now) {
  var rows = [], at = new Date(now), soon = function (k) { var t = Date.parse(k); return t > now && t < now + 24 * 36e5; };
  function push(dep, lg, key, ko, h, a, mk, sel, jug, casa, odd, oat, p, src) { if (rows.length < 600 && odd) rows.push([at, dep, lg, key, ko, h, a, mk, sel, jug || '', casa, odd, oat || '', p != null ? p : '', src]); }
  payload.matches.forEach(function (m) {
    if (!soon(m.kickoff)) return; var lab = ['Local', 'Empate', 'Visitante'];
    [0, 1, 2].forEach(function (i) {
      var p = m.fair ? m.fair.p[i] : null;
      if (m.odds.x12.B3A) push('futbol', m.league, m.key, m.kickoff, m.home, m.away, '1X2', lab[i], '', 'Bet365 Argentina', m.odds.x12.B3A[i], m.b3a && m.b3a.at, p, 'oddspapi');
      if (m.odds.x12.PIN) push('futbol', m.league, m.key, m.kickoff, m.home, m.away, '1X2', lab[i], '', 'Pinnacle', m.odds.x12.PIN[i], m.oa && m.oa.at, p, 'the-odds-api');
    });
    if (m.gs) m.gs.players.forEach(function (g) { push('futbol', m.league, m.key, m.kickoff, m.home, m.away, 'Anota en cualquier momento', 'Sí', g.n, g.b3a ? 'Bet365 Argentina' : (g.best ? g.best[1] : 'consenso'), g.b3a || (g.best ? g.best[0] : null), g.b3a ? m.gs.b3aAt : m.gs.at, g.p, g.b3a ? 'oddspapi' : 'the-odds-api'); });
  });
  ((payload.other && payload.other.events) || []).forEach(function (e) {
    if (!soon(e.kickoff)) return;
    [0, 1].forEach(function (i) {
      var p = e.fair ? e.fair.p[i] : null, sel = i ? e.away : e.home;
      if (e.b365) push(e.sport, e.league, e.key, e.kickoff, e.home, e.away, 'Ganador', sel, '', 'Bet365 Argentina', e.b365[i], e.b365At, p, 'oddspapi');
      if (e.pin) push(e.sport, e.league, e.key, e.kickoff, e.home, e.away, 'Ganador', sel, '', 'Pinnacle', e.pin[i], e.at, p, 'the-odds-api');
    });
  });
  if (rows.length) { var sh = sheet_(SHEETS.mercados); sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows); }
  return rows.length;
}
// Resultados de tenis, NBA, NFL y MLB (The Odds API /scores, 2 créditos por deporte) y de goleadores (OddsPapi /settlements, 1 consulta por partido).
// Se corre 1 vez por día y solo para deportes o partidos con predicciones pendientes.
function evaluarOtros_(now) {
  var ps = sheet_(SHEETS.predicciones), ev = sheet_(SHEETS.evaluacion), lp = ps.getLastRow(), le = ev.getLastRow(), done = {}, out = [];
  if (lp < 2) return 0;
  if (le > 1) ev.getRange(2, 1, le - 1, 1).getValues().forEach(function (r) { done[r[0]] = 1; });
  var P = ps.getRange(2, 1, lp - 1, 11).getValues(), pend = {}, goals = {};
  P.forEach(function (r) {
    var ver = r[1], clave = String(r[2]), ko = r[4] instanceof Date ? r[4].getTime() : Date.parse(r[4]);
    if (done[clave] || !(ko < now - 4 * 36e5) || now - ko > 3 * 864e5) return;
    if (ver === OTHER_VERSION && clave.indexOf('OP|') !== 0) { var code = clave.split('|')[0]; (pend[code] = pend[code] || []).push(clave); }
    if (ver === GOAL_VERSION) { var mm = String(r[10]).match(/OP:([^:]*):(\S*)/); if (mm && mm[1]) (goals[mm[1]] = goals[mm[1]] || []).push({ clave: clave, pid: mm[2], sel: r[8] }); }
  });
  var key = (PropertiesService.getScriptProperties().getProperty('ODDS_API_KEY') || '').trim(), bySport = {};
  Object.keys(pend).forEach(function (code) { var sk = otherApiKey(code); if (sk) bySport[sk] = (bySport[sk] || []).concat(pend[code]); });
  // Tenis en prueba: también se piden los resultados de los torneos con partidos pendientes del modelo.
  var TP = readPrueba_('tenis_pend') || {}, tpKeys = Object.keys(TP).filter(function (k) { return Date.parse(TP[k].t) < now - 4 * 36e5; });
  tpKeys.forEach(function (k) { var sk = otherApiKey(TP[k].code); if (sk && !bySport[sk]) bySport[sk] = []; });
  var TR = null, SO = getEstado_('sombra') || { tenis: { n: 0, llm: 0, llk: 0, desde: new Date(now).toISOString() } }, trChanged = false;
  if (key) Object.keys(bySport).forEach(function (sk) {
    var r = UrlFetchApp.fetch('https://api.the-odds-api.com/v4/sports/' + sk + '/scores/?daysFrom=3&dateFormat=iso&apiKey=' + encodeURIComponent(key), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) { log_('resultados', 'scores ' + sk, 'error', 0, 0, 'HTTP ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 150).split(key).join('***')); return; }
    var games = {}; JSON.parse(r.getContentText()).forEach(function (gm) { games[gm.id] = gm; });
    if (/^tennis_/.test(sk)) tpKeys.forEach(function (k) {
      if (otherApiKey(TP[k].code) !== sk) return; var gm = games[k.split('|').slice(1).join('|')]; if (!gm || !gm.completed || !gm.scores) return;
      var sc = {}; gm.scores.forEach(function (x) { sc[x.name] = parseFloat(x.score); }); var h = sc[gm.home_team], a = sc[gm.away_team]; if (!isFinite(h) || !isFinite(a) || h === a) return;
      var y = h > a ? 1 : 0, P = TP[k], T = SO.tenis; T.n++; T.llm -= Math.log(Math.max(1e-6, y ? P.pm : 1 - P.pm)); T.llk -= Math.log(Math.max(1e-6, y ? P.pk : 1 - P.pk));
      if (!TR) TR = tennisRatings_(); tennisUpdate(TR, /tennis_wta_/.test(P.code) ? 'wta' : 'atp', y ? P.h : P.a, y ? P.a : P.h, P.lg); trChanged = true;
      delete TP[k];
    });
    bySport[sk].forEach(function (clave) {
      var gm = games[clave.split('|').slice(1).join('|')]; if (!gm || !gm.completed || !gm.scores) return;
      var sc = {}; gm.scores.forEach(function (x) { sc[x.name] = parseFloat(x.score); });
      var h = sc[gm.home_team], a = sc[gm.away_team]; if (!isFinite(h) || !isFinite(a)) return;
      done[clave] = 1; out.push([clave, h === a ? 'Nula' : 'Gana ' + (h > a ? gm.home_team : gm.away_team), h, a, new Date()]);
    });
  });
  if (trChanged) { savePrueba_('tenis_atp', TR.atp); savePrueba_('tenis_wta', TR.wta); savePrueba_('tenis_pend', TP); SO.tenis.at = new Date(now).toISOString(); setEstado_('sombra', SO); }
  var C = opClient_(), mk = (getEstado_('op') || {}).mk || {};
  if (C && mk.goal) Object.keys(goals).slice(0, 4).forEach(function (fid, n) {
    if (n) Utilities.sleep(2100);
    var s = C.g('settlements?fixtureId=' + encodeURIComponent(fid)); if (s.http !== 200 || !s.j) { log_('resultados', 'goleadores', 'error', 0, 0, 'HTTP ' + s.http + ' ' + s.msg); return; }
    var oc = (((s.j.markets || {})[mk.goal.id] || {}).outcomes || {})[mk.goal.yes] || {}, pl = oc.players || {};
    goals[fid].forEach(function (g) {
      var res = pl[g.pid] && pl[g.pid].result; if (!res || res === 'UNDECIDED') return;
      done[g.clave] = 1; out.push([g.clave, res === 'WIN' ? g.sel : res === 'LOSE' ? 'No anota' : 'Nula', '', '', new Date()]);
    });
  });
  if (out.length) ev.getRange(ev.getLastRow() + 1, 1, out.length, 5).setValues(out);
  return out.length;
}

// Guarda la probabilidad del modelo de tenis y la del mercado antes del partido, para compararlas cuando haya resultado.
function guardarSombra_(payload, now) {
  var P = readPrueba_('tenis_pend') || {}, n = 0;
  ((payload.other && payload.other.events) || []).forEach(function (e) {
    if (e.sport !== 'tenis' || !e.model || !e.fair || Date.parse(e.kickoff) <= now) return;
    P[e.key] = { pm: e.model.p[0], pk: e.fair.p[0], t: e.kickoff, h: e.home, a: e.away, lg: e.league, code: e.code }; n++;
  });
  Object.keys(P).forEach(function (k) { if (now - Date.parse(P[k].t) > 4 * 864e5) delete P[k]; });
  var keys = Object.keys(P); while (JSON.stringify(P).length > 45000 && keys.length) delete P[keys.shift()];
  savePrueba_('tenis_pend', P);
  return n;
}
// Referencias de otros países (Betano) y Betfair Exchange: se agregan a los partidos con su rótulo; no generan señales.
function mergeReferencias_(payload, store) {
  var B = store.OPB, X = store.OPX;
  if (B && B.events) {
    payload.matches.forEach(function (m) { var e = opMatch(B.events, m.home, m.away, m.kickoff, function (e) { return e.sp === 10 && e.code === oaLgKey(m.lg) && e.o.length === 3; }); if (e) { m.odds.x12.BTN = e.o; m.btn = { at: e.at, label: B.title }; } });
    ((payload.other && payload.other.events) || []).forEach(function (x) { var e = opMatch(B.events, x.home, x.away, x.kickoff, function (e) { return e.sp !== 10 && e.o.length === 2; }); if (e) { x.btn = e.o; x.btnAt = e.at; x.btnLabel = B.title; } });
    payload.ref = { betano: B.title, at: B.fetched };
  }
  if (X && X.events) {
    var byId = {}; X.events.forEach(function (x) { byId[x.id] = x.gs; });
    payload.matches.forEach(function (m) {
      var gs = m.b3a && m.b3a.id ? byId[m.b3a.id] : null; if (!gs) return;
      if (m.gs) m.gs.players.forEach(function (r) { Object.keys(gs).some(function (k) { if (playerSim(k, r.n)) { r.bfx = gs[k][0]; return true; } return false; }); });
      else {
        // Sin casas de EE. UU.: la cuota justa sale de Betfair Exchange (apuestas entre personas, casi sin margen).
        var b3 = {}; ((store.OPG || {}).events || []).forEach(function (x) { if (x.id === m.b3a.id) b3 = x.gs; });
        var list = Object.keys(gs).map(function (k) { var p = r5(1 / gs[k][0] * 0.98), hit = null; Object.keys(b3).some(function (q) { if (playerSim(q, k)) { hit = b3[q]; return true; } return false; }); var row = { n: k, p: p, m: 'exchange', nb: 1, best: null, bfx: gs[k][0], b3a: hit ? hit[0] : null, pid: hit ? hit[1] : null }; if (row.b3a) row.ev = r5(row.b3a * p - 1); return row; }).filter(function (r) { return r.p > 0.03 && r.p < 0.9; });
        var sig = list.filter(function (r) { return r.b3a && r.ev > 0.03 && r.ev <= 0.30 && r.b3a <= 15; }).map(function (r) { return { player: r.n, pid: r.pid, odd: r.b3a, book: 'Bet365 Argentina', p: r.p, ev: r.ev, at: m.b3a.at, m: 'exchange' }; });
        if (list.length) m.gs = { at: X.fetched, b3aAt: m.b3a.at, opId: m.b3a.id, players: list, signals: sig, src: 'betfair' };
      }
    });
  }
}

/* ---------- cuotas compartidas por el grupo (Betano, Codere, BetWarrior y otras que no tienen fuente abierta) ---------- */
// Solo se puede cargar con el código del grupo (propiedad CARGA_CODIGO). Se guarda quién, cuándo, casa y cuota; no generan señales.
var CASAS_USUARIOS = ['Betano', 'Codere', 'BetWarrior', 'Bplay', 'Jugadón', 'Casino Club', 'Bet365', 'Otra'];
function cargarCuota_(q) {
  var code = (PropertiesService.getScriptProperties().getProperty('CARGA_CODIGO') || '').trim();
  if (!code) return { error: 'La carga compartida todavía no está activada.' };
  if (String(q.k || '').trim() !== code) return { error: 'Código del grupo incorrecto.' };
  var o = parseFloat(String(q.o || '').replace(',', '.')), sel = parseInt(q.sel, 10), casa = String(q.b || ''), clave = String(q.m || '').slice(0, 200), dep = String(q.s || 'futbol').slice(0, 10), nom = String(q.n || '').replace(/[<>]/g, '').slice(0, 30);
  if (!(o > 1.01 && o < 100) || !(sel >= 0 && sel <= 2) || CASAS_USUARIOS.indexOf(casa) < 0 || !clave) return { error: 'Datos inválidos.' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { sheet_(SHEETS.usuarios).appendRow([new Date(), clave, dep, casa, sel, o, nom]); CacheService.getScriptCache().remove('usuarios'); } finally { lock.releaseLock(); }
  return { ok: true };
}
function cuotasUsuarios_() {
  var c = CacheService.getScriptCache(), hit = c.get('usuarios'); if (hit) return JSON.parse(hit);
  var sh = sheet_(SHEETS.usuarios), last = sh.getLastRow(), out = {}, now = Date.now();
  if (last > 1) sh.getRange(Math.max(2, last - 1500), 1, Math.min(1500, last - 1), 7).getValues().forEach(function (r) {
    var at = r[0] instanceof Date ? r[0].getTime() : Date.parse(r[0]); if (!(now - at < 3 * 864e5)) return;
    (out[r[1]] = out[r[1]] || []).push({ at: new Date(at).toISOString(), b: r[3], sel: r[4], o: r[5], n: r[6] });
  });
  try { c.put('usuarios', JSON.stringify(out), 60); } catch (e) { }
  return out;
}

/* ---------- Telegram: avisos de señales nuevas y alertas de fallas ---------- */
// Token del bot en la propiedad TELEGRAM_TOKEN (nunca se muestra). El chat se toma solo del último grupo que le escribió al bot.
var LAST_PRED_ROWS = null, SITE_URL = 'https://apostarconcriterio.github.io/';
function tg_(method, payload) {
  var token = (PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN') || '').trim(); if (!token) return null;
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true });
  var j = null; try { j = JSON.parse(r.getContentText()); } catch (e) { }
  if (!j || !j.ok) log_('cuotas', 'telegram ' + method, 'error', 0, 0, 'HTTP ' + r.getResponseCode() + ' ' + String(j && j.description || '').slice(0, 150));
  return j;
}
function tgChat_() {
  var st = getEstado_('tg') || {}; if (st.chat) return st.chat;
  var u = tg_('getUpdates', { limit: 50 }); if (!u || !u.ok) return null;
  var chat = null; (u.result || []).forEach(function (x) { var m = x.message || x.channel_post || x.my_chat_member; var c = m && m.chat; if (c && (c.type === 'group' || c.type === 'supergroup' || c.type === 'channel' || c.type === 'private')) chat = c; });
  if (!chat) return null;
  st.chat = chat.id; st.title = chat.title || chat.first_name || ''; setEstado_('tg', st);
  tg_('sendMessage', { chat_id: chat.id, text: '✅ Listo: este chat va a recibir las señales nuevas de Apostar con criterio (Bet365 Argentina) y los avisos si algo falla.\n' + SITE_URL, disable_web_page_preview: true });
  return chat.id;
}
function escTg_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtOdd_(x) { return (Math.round(x * 100) / 100).toFixed(2).replace('.', ','); }
function horaAR_(iso) { var d = new Date(Date.parse(iso) - 3 * 36e5); return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); }
// Solo señales que se pueden apostar desde Argentina (Bet365 Argentina o Bet365); como mucho 10 por mensaje.
function avisarSenales_(rows) {
  if (!rows.length || !(PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN'))) return 0;
  var chat = tgChat_(); if (!chat) return 0;
  var ok = rows.filter(function (r) { return /^Bet365/.test(String(r[12])); });
  if (!ok.length) return 0;
  var icon = function (r) { return r[1] === GOAL_VERSION ? '⚽🎯' : /tenis/.test(r[16]) ? '🎾' : /nba/.test(r[16]) ? '🏀' : /nfl/.test(r[16]) ? '🏈' : /mlb/.test(r[16]) ? '⚾' : '⚽'; };
  var lines = ok.slice(0, 10).map(function (r) {
    var clave = String(r[2]), link = SITE_URL + '#/' + (r[1] === OTHER_VERSION ? 'o/' : 'p/') + encodeURIComponent(clave.split('#')[0]) + (r[1] === GOAL_VERSION ? '/goleadores' : '');
    return icon(r) + ' <b>' + escTg_(r[8]) + '</b> a <b>' + fmtOdd_(r[11]) + '</b> en ' + escTg_(r[12]) + '\n' + escTg_(r[5]) + ' vs ' + escTg_(r[6]) + ' · ' + escTg_(r[3]) + ' · ' + horaAR_(r[4]) + '\nValor ' + (r[14] >= 0 ? '+' : '') + (Math.round(r[14] * 1000) / 10).toString().replace('.', ',') + '% · justa ' + fmtOdd_(1 / r[9]) + ' · <a href="' + link + '">ver</a>';
  });
  var txt = '📈 <b>' + ok.length + (ok.length === 1 ? ' señal nueva' : ' señales nuevas') + '</b>\n\n' + lines.join('\n\n') + (ok.length > 10 ? '\n\n…y ' + (ok.length - 10) + ' más en la web.' : '') + '\n\n<i>Revisá que tu casa pague esa cuota antes de apostar. No es una garantía.</i>';
  tg_('sendMessage', { chat_id: chat, text: txt, parse_mode: 'HTML', disable_web_page_preview: true });
  return ok.length;
}
// Alertas de fallas: como mucho una cada 6 h por tipo.
function alerta_(tipo, texto) {
  if (!(PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN'))) return false;
  var st = getEstado_('alertas') || {}, now = Date.now();
  if (st[tipo] && now - Date.parse(st[tipo]) < 6 * 36e5) return false;
  var chat = tgChat_(); if (!chat) return false;
  tg_('sendMessage', { chat_id: chat, text: '⚠️ ' + texto });
  st[tipo] = new Date(now).toISOString(); setEstado_('alertas', st); return true;
}
function revisarAlertas_(payload) {
  var oa = payload.oa || {}, op = payload.op || {};
  if (oa.configured && oa.remaining != null && oa.remaining < 50) alerta_('creditos_oa', 'Quedan ' + oa.remaining + ' créditos de The Odds API este mes. El sistema prioriza Argentina, NBA y NFL.');
  if (op.configured && op.limit && op.limit - op.used < 25) alerta_('creditos_op', 'Quedan ' + (op.limit - op.used) + ' consultas de OddsPapi (Bet365 Argentina) este mes.');
  if (op.run && op.run.error) alerta_('oddspapi', 'OddsPapi (Bet365 Argentina) respondió con error: ' + op.run.error + '. Revisá la clave ODDSPAPI_KEY si se repite.');
  var last = (getEstado_('oa_err') || {}); if (oa.run && oa.run.omitida === 'sin clave' && oa.configured) alerta_('the_odds_api', 'The Odds API no tiene clave válida.');
  var fx = payload.sources && payload.sources.fixtures; if (fx && fx.at && Date.now() - Date.parse(fx.at) > 5 * 864e5) alerta_('fixtures_viejo', 'football-data no publica partidos nuevos desde ' + horaAR_(fx.at) + '.');
}

// Probabilidad justa de cierre (la última captura de Pinnacle antes del inicio) para medir si la cuota tomada le ganó al cierre (CLV).
function cierreKey_(r) {
  var ver = r[1], clave = String(r[2]), sel = String(r[8]);
  if (ver === GOAL_VERSION) return clave.split('#')[0] + '|Anota en cualquier momento|' + sel.replace(/^Anota: /, '');
  if (ver === OTHER_VERSION) return clave + '|Ganador|' + sel.replace(/^Gana /, '');
  return clave + '|1X2|' + sel;
}
function cierres_() {
  var c = CacheService.getScriptCache(), hit = c.get('cierres'); if (hit) try { return JSON.parse(hit); } catch (e) { }
  var sh = sheet_(SHEETS.mercados), last = sh.getLastRow(), out = {};
  if (last > 1) sh.getRange(Math.max(2, last - 25000), 1, Math.min(25000, last - 1), 15).getValues().forEach(function (r) {
    var at = r[0] instanceof Date ? r[0].getTime() : Date.parse(r[0]), ko = r[4] instanceof Date ? r[4].getTime() : Date.parse(r[4]); if (!(at < ko) || r[13] === '' || r[13] == null) return;
    var pin = String(r[10]) === 'Pinnacle', k = r[3] + '|' + r[7] + '|' + (r[7] === 'Anota en cualquier momento' ? r[9] : r[8]);
    if (r[7] === 'Anota en cualquier momento' || pin) { var prev = out[k]; if (!prev || at > prev.t) out[k] = { t: at, p: Math.round(r[13] * 1e5) / 1e5 }; }
  });
  Object.keys(out).forEach(function (k) { out[k] = { at: new Date(out[k].t).toISOString(), p: out[k].p }; });
  try { var js = JSON.stringify(out); if (js.length < 90000) c.put('cierres', js, 900); } catch (e) { }
  return out;
}

/* ---------- tarea 2: resultados, forma y modelo (1 vez por día) ---------- */
function resultFiles_(payload) {
  var files = {}, season = currentSeason_();
  (payload ? payload.matches : []).forEach(function (m) {
    if (MAIN_LEAGUES[m.lg]) files[m.lg] = [FD + 'mmz4281/' + season.prev + '/' + m.lg + '.csv', FD + 'mmz4281/' + season.cur + '/' + m.lg + '.csv'];
    else { var code = m.lg.split(':')[0]; files['new:' + code] = [FD + 'new/' + code + '.csv']; }
  });
  return files;
}
function currentSeason_() { var d = new Date(), y = d.getFullYear() % 100, start = d.getMonth() >= 6 ? y : y - 1; function two(n) { return ('0' + n).slice(-2); } return { cur: two(start) + two(start + 1), prev: two(start - 1) + two(start) }; }
function actualizarResultados() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) { log_('resultados', 'inicio', 'omitida', 0, 0, 'otra actualización en curso'); return; }
  var T = Date.now(), now = Date.now();
  try {
    var pj = loadPayload_(); var payload = pj ? JSON.parse(pj) : null;
    if (!payload) { log_('resultados', 'inicio', 'error', 0, 0, 'todavía no hay partidos: corré primero actualizarCuotas'); return; }
    var files = resultFiles_(payload), byLg = {}, src = {}, okFiles = 0, badFiles = 0;
    Object.keys(files).forEach(function (k) {
      files[k].forEach(function (url) {
        var r = fetch_(url);
        if (!r.ok) { badFiles++; log_('resultados', url.replace(FD, ''), 'error', 0, 0, r.error); return; }
        okFiles++;
        var res = normalizeResults(parseCsv(r.text)).filter(function (g) { return g.ts > now - 2 * 365 * 864e5; });
        res.forEach(function (g) { (byLg[g.lg] = byLg[g.lg] || []).push(g); });
      });
    });
    var teamRows = [], modelRows = [], at = new Date();
    Object.keys(byLg).forEach(function (lg) {
      var R = byLg[lg].sort(function (a, b) { return a.ts - b.ts; }); src[lg] = R.length;
      var st = teamStrengths(R, now); if (st) { st.cc = { corners: countRatings(R, now, CC_MODEL.corners), cards: countRatings(R, now, CC_MODEL.cards) }; modelRows.push([lg, at, JSON.stringify(st)]); }
      var teams = {}; R.forEach(function (g) { teams[g.home] = 1; teams[g.away] = 1; });
      Object.keys(teams).forEach(function (t) {
        var f = { all: teamForm(R, t, now, 10), home: teamForm(R, t, now, 5, 'home'), away: teamForm(R, t, now, 5, 'away'), hist: R.filter(function (g) { return g.ts < now && (g.home === t || g.away === t); }).map(function (g) { var h = g.home === t; return [isoDate(g.ts), h ? 'L' : 'V', h ? g.away : g.home, h ? g.hg : g.ag, h ? g.ag : g.hg]; }), source: 'football-data.co.uk · ' + R.length + ' partidos de la liga en los últimos 2 años' };
        if (f.all.n) teamRows.push([lg, t, at, JSON.stringify(f)]);
      });
    });
    if (!teamRows.length) { log_('resultados', 'fin', 'error', 0, Date.now() - T, 'no se pudo calcular nada — se conservan los datos anteriores'); return; }
    replaceSheet_(SHEETS.equipos, teamRows); replaceSheet_(SHEETS.modelo, modelRows);
    var nEval = evaluate_(byLg), nOtros = 0;
    try { nOtros = evaluarOtros_(now); nEval += nOtros; } catch (e) { log_('resultados', 'otros deportes', 'error', 0, 0, String(e && e.stack || e)); }
    setEstado_('resultados', { at: at.toISOString(), files: okFiles, failed: badFiles, leagues: Object.keys(src).length });
    log_('resultados', 'fin', 'ok', teamRows.length, Date.now() - T, okFiles + ' archivos · ' + badFiles + ' con error · ' + teamRows.length + ' equipos · ' + nEval + ' predicciones evaluadas');
  } catch (e) { log_('resultados', 'fin', 'error', 0, Date.now() - T, String(e && e.stack || e)); }
  finally { lock.releaseLock(); }
}
function replaceSheet_(name, rows) {
  var sh = sheet_(name), last = sh.getLastRow(), w = rows[0].length;
  if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
  sh.getRange(2, 1, rows.length, w).setValues(rows);
}
function readModel_() { var sh = sheet_(SHEETS.modelo), last = sh.getLastRow(), o = {}; if (last > 1) sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r) { try { o[r[0]] = JSON.parse(r[2]); } catch (e) { } }); return o; }
function readTeams_() { var sh = sheet_(SHEETS.equipos), last = sh.getLastRow(), o = {}; if (last > 1) sh.getRange(2, 1, last - 1, 4).getValues().forEach(function (r) { o[r[0] + '|' + r[1]] = r[3]; }); return o; }
// Evalúa predicciones pendientes con resultados reales. Se escribe en otra hoja: la predicción original no se toca.
function evaluate_(byLg) {
  var ps = sheet_(SHEETS.predicciones), ev = sheet_(SHEETS.evaluacion), lp = ps.getLastRow(), le = ev.getLastRow(), done = {}, out = [];
  if (lp < 2) return 0;
  if (le > 1) ev.getRange(2, 1, le - 1, 1).getValues().forEach(function (r) { done[r[0]] = 1; });
  var idx = {}; Object.keys(byLg).forEach(function (lg) { byLg[lg].forEach(function (g) { idx[isoDate(g.ts) + '|' + g.home + '|' + g.away] = g; }); });
  ps.getRange(2, 3, lp - 1, 5).getValues().forEach(function (r) {
    var key = r[0]; if (done[key]) return;
    var p = String(key).split('|'), g = idx[p[0] + '|' + p[2] + '|' + p[3]]; if (!g) return;
    done[key] = 1; out.push([key, g.hg > g.ag ? 'Local' : g.hg === g.ag ? 'Empate' : 'Visitante', g.hg, g.ag, new Date()]);
  });
  if (out.length) ev.getRange(ev.getLastRow() + 1, 1, out.length, 5).setValues(out);
  return out.length;
}

/* ---------- anulaciones: el registro original no se toca; se agrega una marca aparte ---------- */
// Antes de las 16:48 UTC del 25/10/2026 la hora de las cuotas era la de descarga y no la de publicación:
// las predicciones de ese lapso usaron cuotas de más de 48 h y no eran oportunidades reales.
var VOID_RULES = [{ antes: '2026-10-25T16:48:00Z', motivo: 'Cuotas publicadas hace más de 48 h: el servidor registraba la hora de descarga en lugar de la de publicación (corregido el 25/10/2026).' }];
function predId_(r) { return r[1] + '|' + r[2] + '|' + r[7] + '|' + r[8]; }
function applyKnownVoids_() {
  var ps = sheet_(SHEETS.predicciones), an = sheet_(SHEETS.anulaciones), lp = ps.getLastRow(), la = an.getLastRow(), done = {}, out = [];
  if (lp < 2) return 0;
  if (la > 1) an.getRange(2, 1, la - 1, 1).getValues().forEach(function (r) { done[r[0]] = 1; });
  ps.getRange(2, 1, lp - 1, 9).getValues().forEach(function (r) {
    var created = r[0] instanceof Date ? r[0].getTime() : Date.parse(r[0]), id = predId_(r);
    VOID_RULES.forEach(function (v) { if (!done[id] && created < Date.parse(v.antes)) { done[id] = 1; out.push([id, v.motivo, new Date()]); } });
  });
  if (out.length) { an.getRange(an.getLastRow() + 1, 1, out.length, 3).setValues(out); log_('cuotas', 'anulaciones', 'ok', out.length, 0, out.length + ' predicciones anuladas (se conservan en el registro original)'); }
  return out.length;
}

/* ---------- API pública de solo lectura ---------- */
function doGet(e) {
  var q = (e && e.parameter) || {}, out;
  try {
    if (q.api === 'boot') { // web + datos en una sola respuesta (primera visita)
      var pl = loadPayload_() || 'null';
      return ContentService.createTextOutput('<script>window.__BOOT=' + pl.replace(/</g, '\\u003c') + ';</script>' + (typeof APP_HTML === 'string' ? APP_HTML : '')).setMimeType(ContentService.MimeType.TEXT);
    }
    if (q.api === 'app') return ContentService.createTextOutput(typeof APP_HTML === 'string' ? APP_HTML : '').setMimeType(ContentService.MimeType.TEXT);
    if (q.api === 'backtest') return ContentService.createTextOutput(typeof BACKTEST_CUBE === 'string' ? BACKTEST_CUBE : '{"error":"sin datos de backtest"}').setMimeType(ContentService.MimeType.JSON);
    if (q.api === 'data') { out = loadPayload_() || JSON.stringify({ error: 'todavía no hay datos: falta la primera actualización' }); }
    else if (q.api === 'cargar') { out = JSON.stringify(cargarCuota_(q)); }
    else if (q.api === 'usuarios') { out = JSON.stringify(cuotasUsuarios_()); }
    else if (q.api === 'ficha') {
      var forms = readTeams_(), lg = q.lg || '', h = q.home || '', a = q.away || '';
      out = JSON.stringify({ home: forms[lg + '|' + h] ? JSON.parse(forms[lg + '|' + h]) : null, away: forms[lg + '|' + a] ? JSON.parse(forms[lg + '|' + a]) : null, at: (getEstado_('resultados') || {}).at || null });
    }
    else if (q.api === 'estado') {
      var sh = sheet_(SHEETS.log), last = sh.getLastRow(), rows = last > 1 ? sh.getRange(Math.max(2, last - 29), 1, Math.min(30, last - 1), 7).getValues() : [];
      out = JSON.stringify({ fuentes: getEstado_('fuentes'), resultados: getEstado_('resultados'), log: rows.reverse().map(function (r) { return { at: r[0], tarea: r[1], paso: r[2], estado: r[3], filas: r[4], ms: r[5], detalle: r[6] }; }) });
    }
    else if (q.api === 'predicciones') {
      var ps = sheet_(SHEETS.predicciones), ev = sheet_(SHEETS.evaluacion), lp = ps.getLastRow(), le = ev.getLastRow();
      var P = lp > 1 ? ps.getRange(2, 1, lp - 1, HEADERS.predicciones.length).getValues() : [], E = {};
      if (le > 1) ev.getRange(2, 1, le - 1, 5).getValues().forEach(function (r) { E[r[0]] = { res: r[1], hg: r[2], ag: r[3] }; });
      var an = sheet_(SHEETS.anulaciones), la = an.getLastRow(), A = {}; if (la > 1) an.getRange(2, 1, la - 1, 3).getValues().forEach(function (r) { A[r[0]] = { motivo: r[1], fecha: r[2] instanceof Date ? r[2].toISOString() : r[2] }; });
      var CL = cierres_();
      out = JSON.stringify(P.map(function (r) { var o = {}; HEADERS.predicciones.forEach(function (h, i) { o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; }); o.evaluacion = E[r[2]] || null; o.anulada = A[predId_(r)] || null; var c = CL[cierreKey_(r)]; if (c) o.cierre = c; return o; }));
    }
    else return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Apostar con criterio · servidor de datos. La web está en <a href="https://sites.google.com/view/apostar-con-criterio" target="_top">sites.google.com/view/apostar-con-criterio</a>.</p>');
  } catch (err) { out = JSON.stringify({ error: String(err && err.message || err) }); }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- instalación: una sola vez ---------- */
function instalar() {
  ss_();
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('actualizarCuotas').timeBased().everyHours(3).create();
  ScriptApp.newTrigger('actualizarResultados').timeBased().everyDays(1).atHour(6).create();
  actualizarCuotas(); actualizarResultados(); actualizarCuotas();
  return 'Instalado: planilla ' + ss_().getUrl();
}

/* ---------- prueba de fuentes con clave (no muestra las claves) ---------- */
function probarFuentes() {
  var P = PropertiesService.getScriptProperties(), out = {};
  var ok = P.getProperty('ODDS_API_KEY'), af = P.getProperty('APIFOOTBALL_KEY');
  out.claves = { oddsApi: !!ok, apiFootball: !!af };
  if (ok) {
    try {
      var r = UrlFetchApp.fetch('https://api.the-odds-api.com/v4/sports/?apiKey=' + encodeURIComponent(ok), { muteHttpExceptions: true });
      var h = r.getHeaders(), js = r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : null;
      out.oddsApi = { http: r.getResponseCode(), restantes: h['x-requests-remaining'] || h['X-Requests-Remaining'], usados: h['x-requests-used'] || h['X-Requests-Used'],
        futbol: js ? js.filter(function (s) { return s.group === 'Soccer'; }).map(function (s) { return s.key + (s.active ? '' : '(inactiva)'); }) : r.getContentText().slice(0, 200) };
    } catch (e) { out.oddsApi = { error: String(e) }; }
  }
  if (af) {
    var H = { headers: { 'x-apisports-key': af }, muteHttpExceptions: true };
    function g(path) { try { var r = UrlFetchApp.fetch('https://v3.football.api-sports.io/' + path, H); var j = JSON.parse(r.getContentText()); return { http: r.getResponseCode(), errores: j.errors, resultados: j.results, muestra: JSON.stringify(j.response).slice(0, 300) }; } catch (e) { return { error: String(e) }; } }
    out.apiFootball = { status: g('status'), argentina2026: g('fixtures?league=128&season=2026&next=3'), premier2026: g('fixtures?league=39&season=2026&next=2'), lesionesArg: g('injuries?league=128&season=2026') };
  }
  var txt = JSON.stringify(out);
  Logger.log(txt);
  for (var i = 0, k = 0; i < txt.length && k < 30; i += 480, k++) log_('prueba', 'fuentes ' + k, 'ok', 0, 0, txt.slice(i, i + 480));
  return out;
}

// Prueba de OddsPapi (gasta 2 consultas de 250). Nunca imprime la respuesta de la cuenta entera: trae la clave adentro.
function probarOddsPapi() {
  limpiarRegistroPrueba_();
  var key = (PropertiesService.getScriptProperties().getProperty('ODDSPAPI_KEY') || '').trim(), out = { clave: !!key };
  if (key) {
    var B = 'https://api.oddspapi.io/v4/';
    function g(path) { try { var r = UrlFetchApp.fetch(B + path + (path.indexOf('?') < 0 ? '?' : '&') + 'apiKey=' + encodeURIComponent(key), { muteHttpExceptions: true }); var j = null; try { j = JSON.parse(r.getContentText()); } catch (e) { } return { http: r.getResponseCode(), j: j }; } catch (e) { return { http: 0, error: String(e).replace(key, '***') }; } }
    var a = g('account'), A = a.j || {}, sub = (A.subscriptions || [])[0] || {}, bk = Object.keys(sub.bookmakers || A.bookmakers || {});
    out.cuenta = { http: a.http, limite: A.request_limit != null ? A.request_limit : sub.request_limit, usadas: A.request_count != null ? A.request_count : sub.request_count, casasTotal: bk.length };
    out.casasClave = bk.filter(function (x) { return /\.ar$|argentin|bet365|betano|codere|bplay|betsson|warrior|jugadon|sportsbet|pinnacle|1xbet|^bwin$|betfair-ex$|caliente|stake\.com$/.test(x); });
    var s = g('sports'); out.deportes = s.j && s.j.map ? s.j.map(function (x) { return x.sportId + ':' + (x.sportName || x.slug); }).join(' | ') : { http: s.http };
    var soc = s.j && s.j.filter ? s.j.filter(function (x) { return /^soccer$|^football$/i.test(String(x.slug || x.sportName)); })[0] : null;
    if (soc) { var t = g('tournaments?sportId=' + soc.sportId); out.torneosArg = t.j && t.j.filter ? t.j.filter(function (x) { return /argentin/i.test((x.categoryName || '') + ' ' + (x.categorySlug || '')); }).map(function (x) { return x.tournamentId + ':' + x.tournamentName + ':' + x.upcomingFixtures; }) : { http: t.http }; }
  }
  var txt = JSON.stringify(out); if (key) txt = txt.split(key).join('***');
  Logger.log(txt);
  for (var i = 0, k = 0; i < txt.length && k < 12; i += 480, k++) log_('prueba', 'oddspapi2 ' + k, 'ok', 0, 0, txt.slice(i, i + 480));
  return out;
}
// Borra del registro las filas de la primera prueba de OddsPapi (incluían la respuesta de la cuenta).
function limpiarRegistroPrueba_() {
  var sh = sheet_(SHEETS.log), last = sh.getLastRow(); if (last < 2) return 0;
  var v = sh.getRange(2, 3, last - 1, 1).getValues(), n = 0;
  for (var i = v.length - 1; i >= 0; i--) if (/^oddspapi \d+$/.test(String(v[i][0]))) { sh.deleteRow(i + 2); n++; }
  return n;
}
