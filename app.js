/* Royalty Dashboard · MIT */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nh(h) { return String(h == null ? '' : h).replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function str(v) { if (v == null) return ''; if (v instanceof Date) return isoDate(v); return String(v).trim(); }
  function num(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim();
    if (s === '') return null;
    if (s === '-' || s === '–') return 0;
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[\s,]/g, '').replace(/^[A-Za-z]{0,3}\$|^[$€£]|[A-Za-z]{3}$/g, '');
    if (s.charAt(0) === '-') { neg = !neg; s = s.slice(1); }
    if (!/^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
    var n = parseFloat(s);
    return neg ? -n : n;
  }
  function isrcN(v) { return str(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthOf(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return v.getUTCFullYear() + '-' + pad(v.getUTCMonth() + 1);
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})[-\/](\d{1,2})(\b|$)/))) return m[1] + '-' + pad(+m[2]);
    if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?[\s\-]*(\d{4})$/))) {
      var i = MON.indexOf(m[1].charAt(0).toUpperCase() + m[1].slice(1, 3).toLowerCase());
      if (i >= 0) return m[2] + '-' + pad(i + 1);
    }
    return null;
  }
  function mLabel(m) { return m ? MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) : ''; }
  function mShort(m) { return m ? MON[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4) : ''; }
  function addMonths(m, k) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + k; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + '-' + pad(mo + 1); }
  function monthSeq(a, b) { var out = []; if (!a || !b) return out; for (var m = a; m <= b && out.length < 600; m = addMonths(m, 1)) out.push(m); return out; }
  var SYM = { USD: 'US$', AUD: 'A$', NZD: 'NZ$' };
  function money(n, cur) {
    var s = Math.abs(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '−' : '') + (SYM[cur] || ((cur || '?') + ' ')) + s;
  }
  function int(n) { return Math.round(n || 0).toLocaleString('en-AU'); }
  function pct(n) { return (n * 100 >= 10 ? Math.round(n * 100) : (Math.round(n * 1000) / 10)) + '%'; }
  function sum(a, f) { var t = 0; for (var i = 0; i < a.length; i++) t += f(a[i]); return t; }
  var DN = null; try { DN = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { DN = null; }
  function cname(c) {
    if (!c) return 'Not stated';
    if (c === 'OU' || c === 'ZZ' || c === 'XX') return 'Other / unknown';
    try { var n = DN && DN.of(c); return n && n !== c ? n : c; } catch (e) { return c; }
  }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function topKey(map) { var best = null, bv = -Infinity; map.forEach(function (v, k) { if (v > bv) { bv = v; best = k; } }); return best; }
  function blank(v, gap) { return (v == null || v === '') ? '<span class="' + (gap ? 'gapv' : 'blank') + '">' + (gap ? 'none' : '—') + '</span>' : esc(v); }

  /* titles: version tags and song keys */
  var VER_RE = /\b(instrumental|inst\.?|acapella|acappella|a ?cappella|a ?capella|radio edit|edit|clean|remix(ed)?|rmx|extended|sped up|slowed|reverb|remaster(ed)?|live|karaoke|vip)\b/i;
  function splitVersion(title) {
    var t = String(title || '').trim(), base = t, vers = [], m, guard = 0;
    while (guard++ < 6) {
      m = base.match(/\s*[\(\[]([^\(\)\[\]]*)[\)\]]\s*$/) || base.match(/\s+[-–]\s+([^-–]+)$/);
      if (!m) break;
      var inner = m[1].trim();
      if (/^(feat\.?|ft\.?|featuring|with)\s/i.test(inner)) { base = base.slice(0, m.index).trim(); continue; }
      if (VER_RE.test(inner)) { vers.unshift(inner); base = base.slice(0, m.index).trim(); continue; }
      break;
    }
    base = base.replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, '').trim();
    return { base: base || t, version: vers.join(' · ') };
  }
  function famKey(t) { return String(t || '').toUpperCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim(); }

  /* ---------- state ---------- */
  var S, M = null;
  function reset() {
    S = { files: [], dk: [], dkKeys: new Map(), dkSpans: [], stm: [], stmKeys: new Map(), stmMeta: [], cats: [], catKeys: new Set(),
      works: new Map(), ppca: [], ppcaKeys: new Set(), demo: false, tab: 'money', from: null, to: null, preset: 'all', song: null, mkSong: '', more: {} };
    M = null;
  }
  reset();

  /* ---------- detection ---------- */
  var SHARE_RE = /^(.+?)\s+share\s*%$/;
  var DETECT = [
    ['statement', function (r) { return /^(apra|amcos) distribution$/.test(r[0] || '') && r.indexOf('work id') >= 0 && r.indexOf('net royalty') >= 0; }],
    ['distrokid', function (r) { return r.indexOf('sale month') >= 0 && r.indexOf('store') >= 0 && r.indexOf('isrc') >= 0 && r.some(function (h) { return /^earnings( \(usd\))?$/.test(h); }); }],
    ['stmtflat', function (r) { return r.indexOf('society') >= 0 && r.indexOf('period') >= 0 && r.indexOf('workid') >= 0 && r.indexOf('net') >= 0; }],
    ['categories', function (r) { return r.indexOf('distribution') >= 0 && r.indexOf('period start') >= 0 && r.indexOf('category') >= 0 && r.indexOf('amount') >= 0 && r.indexOf('currency') >= 0; }],
    ['works', function (r) { return (r.indexOf('winfkey') >= 0 || r.indexOf('work id') >= 0) && r.indexOf('title') >= 0 && r.indexOf('isrcs') >= 0 && r.some(function (h) { return SHARE_RE.test(h); }); }],
    ['ppca', function (r) { return r.indexOf('ppl recording id') >= 0 && r.indexOf('isrc') >= 0 && r.indexOf('recording title') >= 0; }]
  ];
  function detect(aoa) {
    var lim = Math.min(aoa.length, 40);
    for (var i = 0; i < lim; i++) {
      var row = (aoa[i] || []).map(nh);
      for (var d = 0; d < DETECT.length; d++) if (DETECT[d][1](row)) return { kind: DETECT[d][0], hi: i, H: row };
    }
    return null;
  }
  var KIND_LABEL = { distrokid: 'DistroKid earnings', statement: 'APRA AMCOS statement', stmtflat: 'APRA AMCOS statement lines', categories: 'APRA AMCOS source categories', works: 'APRA Works List', ppca: 'PPCA repertoire' };

  /* ---------- parsers ---------- */
  function col(H, names) { for (var i = 0; i < names.length; i++) { var k = H.indexOf(names[i]); if (k >= 0) return k; } return -1; }
  function cell(row, i) { return i >= 0 && row ? row[i] : null; }

  function parseDK(aoa, hi, H) {
    var c = { m: col(H, ['sale month']), st: col(H, ['store']), a: col(H, ['artist']), t: col(H, ['title']), i: col(H, ['isrc']), u: col(H, ['upc']),
      q: col(H, ['quantity']), co: col(H, ['country of sale']), e: H.findIndex(function (h) { return /^earnings( \(usd\))?$/.test(h); }) };
    var prior = new Map(S.dkKeys), mine = new Map(), added = 0, dup = 0, lo = null, hiM = null;
    for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r]; if (!row || row.length < 4) continue;
      var m = monthOf(cell(row, c.m)); if (!m) continue;
      var key = row.join('\u0001'), p = prior.get(key) || 0;
      if (p > 0) { prior.set(key, p - 1); dup++; continue; }
      mine.set(key, (mine.get(key) || 0) + 1);
      S.dk.push({ m: m, st: str(cell(row, c.st)) || 'Not stated', a: str(cell(row, c.a)), t: str(cell(row, c.t)), i: isrcN(cell(row, c.i)), u: str(cell(row, c.u)),
        q: num(cell(row, c.q)) || 0, co: str(cell(row, c.co)).toUpperCase(), e: num(cell(row, c.e)) || 0 });
      added++;
      if (!lo || m < lo) lo = m;
      if (!hiM || m > hiM) hiM = m;
    }
    mine.forEach(function (v, k) { S.dkKeys.set(k, (S.dkKeys.get(k) || 0) + v); });
    var notes = [], warn = false;
    if (lo) notes.push('Sale months ' + mLabel(lo) + '–' + mLabel(hiM));
    if (dup) notes.push(int(dup) + ' rows already loaded, skipped');
    if (added && S.dkSpans.some(function (s) { return lo <= s[1] && hiM >= s[0]; })) { notes.push('Months overlap another DistroKid file. Check for double counting.'); warn = true; }
    if (added) S.dkSpans.push([lo, hiM]);
    return { kind: 'distrokid', rows: added, note: notes.join(' · '), warn: warn };
  }

  function terrOf(s) { s = String(s || '').trim(); if (/zealand|^nz$/i.test(s)) return 'NZ'; if (/australia|^aus?$/i.test(s)) return 'AUS'; return ''; }
  function curFromTotal(s) { var m = String(s || '').match(/^\s*(AU|NZ|US)\$/i); return m ? ({ AU: 'AUD', NZ: 'NZD', US: 'USD' })[m[1].toUpperCase()] : ''; }

  function addStatementLines(key, meta, lines, name) {
    var owner = S.stmKeys.get(key);
    if (owner && owner !== name) return false;
    S.stmKeys.set(key, name);
    for (var i = 0; i < lines.length; i++) S.stm.push(lines[i]);
    var sums = {};
    lines.forEach(function (l) { sums[l.cur] = (sums[l.cur] || 0) + (l.net || 0); });
    meta.sums = sums; meta.lines = lines.length; meta.file = name;
    if (meta.headTotal != null) {
      var s = sums[meta.headCur] != null ? sums[meta.headCur] : sum(Object.keys(sums), function (k) { return sums[k]; });
      meta.ok = Math.abs(s - meta.headTotal) < 0.011;
    }
    S.stmMeta.push(meta);
    return true;
  }
  function codesOf(lines) { return Array.from(new Set(lines.map(function (l) { return l.code.split(' ')[0]; }).filter(Boolean))); }

  function parseStatement(aoa, hi, H, name) {
    var meta = {};
    for (var r = 0; r < hi; r++) { var row = aoa[r] || []; var k = nh(row[0]); if (k) meta[k] = row[1]; }
    var soc = /^amcos/.test(H[0]) ? 'AMCOS' : 'APRA';
    var fm = name.match(/_(AUS|AU|NZ)_/i), pmF = name.match(/_([A-Za-z]{3})\s?(\d{4})\.(xlsx|xls|csv)$/i);
    var period = monthOf(meta.period) || (pmF ? monthOf(pmF[1] + ' ' + pmF[2]) : null);
    var terr = terrOf(meta[soc.toLowerCase() + ' distribution']) || (fm ? terrOf(fm[1]) : '');
    var headTotal = num(meta['net royalty total']), headCur = curFromTotal(meta['net royalty total']);
    var c = { wid: col(H, ['work id']), t: col(H, ['title']), w: col(H, ['writers']), sh: col(H, ['your share %']), cur: col(H, ['currency']),
      g: col(H, ['gross royalty']), cm: col(H, ['commission']), tx: col(H, ['tax withheld']), net: col(H, ['net royalty']), cat: col(H, ['category']),
      cl: col(H, ['client']), ut: col(H, ['territory']), rs: col(H, ['remitting foreign society']) };
    var lines = [];
    for (var i = hi + 1; i < aoa.length; i++) {
      var row2 = aoa[i]; if (!row2) continue;
      var wid = str(cell(row2, c.wid)), net = num(cell(row2, c.net));
      if (!wid && net == null) continue;
      var code = str(cell(row2, 0));
      if (!terr) { var cm = code.match(/^[PM]\d{4}([AN])/); if (cm) terr = cm[1] === 'N' ? 'NZ' : 'AUS'; }
      lines.push({ soc: soc, terr: '', pm: period, code: code, wid: wid, title: str(cell(row2, c.t)), writers: str(cell(row2, c.w)), share: num(cell(row2, c.sh)),
        cur: (str(cell(row2, c.cur)) || headCur || '').toUpperCase(), gross: num(cell(row2, c.g)), comm: num(cell(row2, c.cm)), tax: num(cell(row2, c.tx)), net: net || 0,
        cat: str(cell(row2, c.cat)), client: str(cell(row2, c.cl)), ut: str(cell(row2, c.ut)), rs: str(cell(row2, c.rs)) });
    }
    lines.forEach(function (l) { l.terr = terr; });
    if (!period) return { kind: 'statement', rows: 0, bad: true, note: 'Statement period not found' };
    var key = soc + '|' + terr + '|' + period, label = soc + ' · ' + (terr || '?') + ' · ' + mLabel(period);
    var m2 = { key: key, soc: soc, terr: terr, pm: period, headTotal: headTotal, headCur: headCur, codes: codesOf(lines) };
    if (!addStatementLines(key, m2, lines, name)) return { kind: 'statement', rows: 0, label: label, note: 'Same statement already loaded, skipped' };
    return { kind: 'statement', rows: lines.length, label: label, check: m2.ok === true ? 'match' : (m2.ok === false ? 'mismatch' : 'none'),
      note: m2.ok === true ? 'Lines match the statement total' : (m2.ok === false ? 'Lines do not match the statement total' : ''), warn: m2.ok === false };
  }

  function parseFlat(aoa, hi, H, name) {
    var ix = function (k) { return H.indexOf(k); };
    var c = { soc: ix('society'), terr: ix('statementterritory'), per: ix('period'), wid: ix('workid'), t: ix('title'), w: ix('writers'), sh: ix('sharepct'), cur: ix('currency'),
      g: ix('gross'), cm: ix('commission'), tx: ix('taxwithheld'), net: ix('net'), cat: ix('category'), cl: ix('client'), ut: ix('useterritory'), rs: ix('remittingsociety'), code: ix('distributioncode') };
    var groups = new Map();
    for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r]; if (!row) continue;
      var soc = str(cell(row, c.soc)).toUpperCase(), pm = monthOf(cell(row, c.per));
      if (!soc || !pm) continue;
      var terr = terrOf(cell(row, c.terr)) || str(cell(row, c.terr)).toUpperCase();
      var key = soc + '|' + terr + '|' + pm;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ soc: soc, terr: terr, pm: pm, code: str(cell(row, c.code)), wid: str(cell(row, c.wid)), title: str(cell(row, c.t)), writers: str(cell(row, c.w)),
        share: num(cell(row, c.sh)), cur: str(cell(row, c.cur)).toUpperCase(), gross: num(cell(row, c.g)), comm: num(cell(row, c.cm)), tax: num(cell(row, c.tx)),
        net: num(cell(row, c.net)) || 0, cat: str(cell(row, c.cat)), client: str(cell(row, c.cl)), ut: str(cell(row, c.ut)), rs: str(cell(row, c.rs)) });
    }
    var added = 0, skipped = 0;
    groups.forEach(function (lines, key) {
      var p = key.split('|');
      var meta = { key: key, soc: p[0], terr: p[1], pm: p[2], headTotal: null, headCur: '', codes: codesOf(lines) };
      if (addStatementLines(key, meta, lines, name)) added += lines.length; else skipped++;
    });
    return { kind: 'stmtflat', rows: added, note: groups.size + ' statements' + (skipped ? ' · ' + skipped + ' already loaded, skipped' : '') };
  }

  function parseCats(aoa, hi, H) {
    var ix = function (k) { return H.indexOf(k); };
    var c = { d: ix('distribution'), lab: ix('distribution label'), ps: ix('period start'), pe: ix('period end'), cat: ix('category'), sub: ix('sub-category'), crd: ix('crd category'), cur: ix('currency'), amt: ix('amount') };
    var rows = [];
    for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r]; if (!row) continue;
      var d = str(cell(row, c.d)); if (!d) continue;
      rows.push({ soc: /amcos/i.test(d) ? 'AMCOS' : (/apra/i.test(d) ? 'APRA' : d), terr: terrOf(d.replace(/^(apra|amcos)\s*/i, '')), label: str(cell(row, c.lab)),
        ps: monthOf(cell(row, c.ps)), pe: monthOf(cell(row, c.pe)), cat: str(cell(row, c.cat)), sub: str(cell(row, c.sub)), crd: str(cell(row, c.crd)),
        cur: str(cell(row, c.cur)).toUpperCase(), amt: num(cell(row, c.amt)) || 0 });
    }
    if (!rows.length) return { kind: 'categories', rows: 0, note: 'No rows' };
    var key = rows[0].soc + '|' + rows[0].terr + '|' + rows[0].label + '|' + rows[0].ps + '|' + rows[0].pe;
    var label = rows[0].soc + ' · ' + (rows[0].terr || '?') + ' · ' + mLabel(rows[0].ps) + '–' + mLabel(rows[0].pe);
    if (S.catKeys.has(key)) return { kind: 'categories', rows: 0, label: label, note: 'Already loaded, skipped' };
    S.catKeys.add(key);
    rows.forEach(function (x) { S.cats.push(x); });
    return { kind: 'categories', rows: rows.length, label: label };
  }

  function parseWorks(aoa, hi, H) {
    var c = { id: col(H, ['winfkey', 'work id']), t: col(H, ['title']), w: col(H, ['writers']), d: col(H, ['date reg']), aw: col(H, ['awaiting reg confirmation']), is: col(H, ['isrcs']),
      sh: H.findIndex(function (h) { return SHARE_RE.test(h) && !/^your /.test(h); }) };
    if (c.sh < 0) c.sh = H.findIndex(function (h) { return SHARE_RE.test(h); });
    var n = 0, upd = 0;
    for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r]; if (!row) continue;
      var id = str(cell(row, c.id)); if (!id) continue;
      var raw = str(cell(row, c.w));
      var w = { id: id, title: str(cell(row, c.t)), writersRaw: raw, writers: raw ? raw.split('/').map(function (x) { return x.trim(); }).filter(Boolean) : [],
        date: str(cell(row, c.d)).slice(0, 10), share: num(cell(row, c.sh)), awaiting: str(cell(row, c.aw)).toUpperCase(),
        isrcs: str(cell(row, c.is)).split(/[,;\s]+/).map(isrcN).filter(Boolean) };
      if (S.works.has(id)) upd++;
      S.works.set(id, w); n++;
    }
    return { kind: 'works', rows: n, shareCol: c.sh >= 0, note: (c.sh < 0 ? 'Share column not found' : '') + (upd ? upd + ' works replaced by this file' : '') };
  }

  function parsePPCA(aoa, hi, H, name, sheetName) {
    var c = { sheet: col(H, ['sheet']), id: col(H, ['ppl recording id']), a: col(H, ['band/ artist name', 'band/artist name', 'artist']), t: col(H, ['recording title']), i: col(H, ['isrc']),
      pd: col(H, ['(p)date']), v: col(H, ['valid']), my: col(H, ['my repertoire']), ru: col(H, ['reported use']) };
    var n = 0, dup = 0;
    for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r]; if (!row) continue;
      var idv = cell(row, c.id), isrc = isrcN(cell(row, c.i)), title = str(cell(row, c.t));
      if (idv == null && !isrc && !title) continue;
      var id = typeof idv === 'number' ? String(Math.round(idv)) : str(idv);
      var key = id + '|' + isrc;
      if (S.ppcaKeys.has(key)) { dup++; continue; }
      S.ppcaKeys.add(key);
      var pd = cell(row, c.pd);
      S.ppca.push({ id: id, isrc: isrc, title: title, artist: str(cell(row, c.a)), pdate: typeof pd === 'number' ? String(Math.round(pd)) : str(pd).slice(0, 10),
        valid: str(cell(row, c.v)), my: str(cell(row, c.my)), ru: str(cell(row, c.ru)), sheet: str(cell(row, c.sheet)) || sheetName || '' });
      n++;
    }
    return { kind: 'ppca', rows: n, note: dup ? dup + ' already loaded, skipped' : '' };
  }

  var PARSERS = { distrokid: parseDK, statement: parseStatement, stmtflat: parseFlat, categories: parseCats, works: parseWorks, ppca: parsePPCA };

  function sheetsOf(name, data) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    if (/^(xlsx|xlsm|xls|xlsb|ods)$/.test(ext)) {
      var wb = XLSX.read(data, { type: 'array', cellDates: true });
      return wb.SheetNames.map(function (sn) { return { name: sn, aoa: XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false }) }; });
    }
    var text = typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data);
    var res = Papa.parse(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
    return [{ name: '', aoa: res.data }];
  }

  function ingestOne(name, data) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'zip') return { name: name, kind: null, note: 'Unzip first, then add the files inside' };
    if (!/^(csv|tsv|txt|xlsx|xlsm|xls|xlsb|ods)$/.test(ext)) return { name: name, kind: null, note: 'Not a CSV or Excel file' };
    var sheets = sheetsOf(name, data), parts = [];
    sheets.forEach(function (sh) {
      var d = detect(sh.aoa);
      if (!d) return;
      parts.push(PARSERS[d.kind](sh.aoa, d.hi, d.H, name, sh.name));
    });
    if (!parts.length) return { name: name, kind: null, note: 'Not recognised' };
    var out = { name: name, kind: parts[0].kind, rows: sum(parts, function (p) { return p.rows || 0; }), label: parts[0].label || '', check: parts[0].check || '',
      warn: parts.some(function (p) { return p.warn; }), bad: parts.some(function (p) { return p.bad; }),
      note: parts.map(function (p) { return p.note; }).filter(Boolean).join(' · ') };
    if (parts.length > 1) out.note = (out.note ? out.note + ' · ' : '') + parts.length + ' sheets';
    return out;
  }

  /* ---------- derived model ---------- */
  function hasData() { return !!(S.dk.length || S.stm.length || S.works.size || S.ppca.length || S.cats.length); }

  function derive() {
    var rec = new Map(), artists = new Map();
    S.dk.forEach(function (r) {
      var k = r.i || ('?' + famKey(r.t));
      var o = rec.get(k);
      if (!o) { o = { k: k, isrc: r.i, titles: new Map(), artists: new Map(), upcs: new Set(), usd: 0, q: 0 }; rec.set(k, o); }
      o.titles.set(r.t, (o.titles.get(r.t) || 0) + 1);
      o.artists.set(r.a, (o.artists.get(r.a) || 0) + Math.abs(r.e));
      if (r.u) o.upcs.add(r.u);
      o.usd += r.e; o.q += r.q; r.k = k;
      artists.set(r.a, (artists.get(r.a) || 0) + Math.abs(r.e));
    });
    var fams = new Map();
    rec.forEach(function (o) {
      o.title = topKey(o.titles); o.artist = topKey(o.artists);
      var sv = splitVersion(o.title); o.version = sv.version; o.fam = famKey(sv.base); o.base = sv.base;
      var f = fams.get(o.fam);
      if (!f) { f = { key: o.fam, mains: [], versions: [], usd: 0, title: sv.base, artist: o.artist, best: -Infinity }; fams.set(o.fam, f); }
      (o.version ? f.versions : f.mains).push(o);
      f.usd += o.usd;
      var score = (o.version ? -1e12 : 0) + o.usd;
      if (score > f.best) { f.best = score; f.title = o.version ? sv.base : o.title; f.artist = o.artist; }
    });
    S.dk.forEach(function (r) { r.f = rec.get(r.k).fam; });
    var isrc2works = new Map(), work2fams = new Map(), famWorks = new Map();
    S.works.forEach(function (w) { w.isrcs.forEach(function (i) { if (!isrc2works.has(i)) isrc2works.set(i, []); isrc2works.get(i).push(w.id); }); });
    fams.forEach(function (f) {
      var set = new Set();
      f.mains.concat(f.versions).forEach(function (o) {
        (isrc2works.get(o.isrc) || []).forEach(function (id) { set.add(id); if (!work2fams.has(id)) work2fams.set(id, new Set()); work2fams.get(id).add(f.key); });
      });
      famWorks.set(f.key, set);
    });
    var ppcaByIsrc = new Map();
    S.ppca.forEach(function (p) { if (!p.isrc) return; if (!ppcaByIsrc.has(p.isrc)) ppcaByIsrc.set(p.isrc, []); ppcaByIsrc.get(p.isrc).push(p); });
    var lo = null, hi = null;
    function seen(m) { if (!m) return; if (!lo || m < lo) lo = m; if (!hi || m > hi) hi = m; }
    S.dk.forEach(function (r) { seen(r.m); });
    S.stm.forEach(function (l) { seen(l.pm); });
    var famList = Array.from(fams.values()).sort(function (a, b) { return b.usd - a.usd || a.title.localeCompare(b.title); });
    M = { rec: rec, fams: fams, famList: famList, isrc2works: isrc2works, work2fams: work2fams, famWorks: famWorks, ppcaByIsrc: ppcaByIsrc, lo: lo, hi: hi, months: monthSeq(lo, hi), topArtist: topKey(artists) };
    if (!S.from || !S.to || S.from < lo || S.to > hi || S.preset === 'all') { S.from = lo; S.to = hi; S.preset = 'all'; }
    if (S.song && !fams.has(S.song)) S.song = null;
    if (S.mkSong && !fams.has(S.mkSong)) S.mkSong = '';
  }

  function inR(m) { return !!m && m >= S.from && m <= S.to; }
  function rangeLabel() { return S.from === S.to ? mLabel(S.from) : mShort(S.from) + '–' + mShort(S.to); }

  /* ---------- range ---------- */
  function presets() {
    var out = [];
    if (!M || !M.lo) return out;
    out.push({ id: 'all', label: 'All time', from: M.lo, to: M.hi });
    var l12 = addMonths(M.hi, -11); if (l12 < M.lo) l12 = M.lo;
    if (l12 !== M.lo) out.push({ id: 'l12', label: 'Last 12 mo', from: l12, to: M.hi });
    var y0 = +M.lo.slice(0, 4), y1 = +M.hi.slice(0, 4);
    if (y1 > y0) for (var y = y0; y <= y1; y++) {
      var a = y + '-01', b = y + '-12';
      out.push({ id: 'y' + y, label: String(y), from: a < M.lo ? M.lo : a, to: b > M.hi ? M.hi : b });
    }
    return out;
  }
  function renderRange() {
    var el = $('#range');
    if (S.tab === 'register') { el.innerHTML = '<span class="note">All loaded data · not filtered by date</span>'; return; }
    if (!M.lo) { el.innerHTML = ''; return; }
    var opts = function (sel) { return M.months.map(function (m) { return '<option value="' + m + '"' + (m === sel ? ' selected' : '') + '>' + mLabel(m) + '</option>'; }).join(''); };
    var ps = presets().map(function (p) {
      return '<button type="button" class="chip' + (S.preset === p.id ? ' on' : '') + '" data-preset="' + p.id + '">' + esc(p.label) +
        (p.id === 'all' || p.id === 'l12' ? ' <span class="dim">' + mShort(p.from) + '–' + mShort(p.to) + '</span>' : '') + '</button>';
    }).join('');
    el.innerHTML = '<div class="chips">' + ps + '</div>' +
      '<label class="mono small">From <select id="fromSel" aria-label="From month">' + opts(S.from) + '</select></label>' +
      '<label class="mono small">To <select id="toSel" aria-label="To month">' + opts(S.to) + '</select></label>' +
      '<span class="note">DistroKid by sale month · APRA AMCOS by payout month</span>';
  }

  /* ---------- aggregation ---------- */
  var ORDER = ['APRA|AUD', 'APRA|NZD', 'AMCOS|AUD', 'AMCOS|NZD'];
  function bucketsOf(lines) {
    var b = new Map();
    lines.forEach(function (l) {
      var k = l.soc + '|' + (l.cur || '?');
      if (!b.has(k)) b.set(k, { key: k, soc: l.soc, cur: l.cur || '?', net: 0, lines: [] });
      var o = b.get(k); o.net += l.net; o.lines.push(l);
    });
    return b;
  }
  function bucketKeys() {
    var ks = ORDER.slice();
    S.stm.forEach(function (l) { var k = l.soc + '|' + (l.cur || '?'); if (ks.indexOf(k) < 0) ks.push(k); });
    return ks;
  }
  function groupBy(rows, kf, vf) { var m = new Map(); rows.forEach(function (r) { var k = kf(r); m.set(k, (m.get(k) || 0) + vf(r)); }); return m; }

  function highlights(rows) {
    var months = monthSeq(S.from, S.to), out = { spikes: [], markets: [] };
    if (months.length < 6 || !rows.length) return out;
    var total = sum(rows, function (r) { return r.e; });
    var fm = groupBy(rows, function (r) { return r.f + '\u0001' + r.m; }, function (r) { return r.e; });
    var famTot = groupBy(rows, function (r) { return r.f; }, function (r) { return r.e; });
    famTot.forEach(function (t, f) {
      if (t < total * 0.02) return;
      var vals = months.map(function (m) { return fm.get(f + '\u0001' + m) || 0; });
      var first = vals.findIndex(function (v) { return v > 0; }); if (first < 0) return;
      var act = vals.slice(first); if (act.length < 6) return;
      var srt = act.slice().sort(function (a, b) { return a - b; }), med = srt[Math.floor(srt.length / 2)];
      var mx = Math.max.apply(null, act), at = months[first + act.indexOf(mx)];
      if (med > 0 && mx / med >= 3) out.spikes.push({ f: f, m: at, v: mx, x: mx / med });
    });
    out.spikes.sort(function (a, b) { return (b.v - b.v / b.x) - (a.v - a.v / a.x); }); out.spikes = out.spikes.slice(0, 2);
    var cat = groupBy(rows, function (r) { return r.co; }, function (r) { return r.e; });
    var fc = groupBy(rows, function (r) { return r.f + '\u0001' + r.co; }, function (r) { return r.e; });
    var best = new Map();
    fc.forEach(function (v, k) {
      var p = k.split('\u0001'), f = p[0], c = p[1], ft = famTot.get(f);
      if (!c || c === 'OU' || ft < total * 0.02 || v < ft * 0.1) return;
      var idx = (v / ft) / ((cat.get(c) || 0) / total);
      if (idx >= 2 && (!best.has(f) || best.get(f).idx < idx)) best.set(f, { f: f, c: c, share: v / ft, idx: idx, v: v });
    });
    out.markets = Array.from(best.values()).sort(function (a, b) { return b.idx * b.v - a.idx * a.v; }).slice(0, 2);
    return out;
  }

  /* ---------- chart ---------- */
  function chart(months, vals, cur, peak) {
    var host = $('#view'), W = Math.max(300, Math.min(1180, (host && host.clientWidth) || 700)), H = W < 500 ? 150 : 190, pb = 18, pt = 16, n = months.length || 1;
    var max = Math.max.apply(null, vals.concat([0])) || 1, bw = W / n, out = [];
    out.push('<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Monthly amounts">');
    out.push('<line class="gl" x1="0" x2="' + W + '" y1="' + pt + '" y2="' + pt + '"/><line class="gl" x1="0" x2="' + W + '" y1="' + (H - pb) + '" y2="' + (H - pb) + '"/>');
    out.push('<text class="ax" x="0" y="11">' + esc(money(max, cur)) + '</text>');
    var step = n > 36 ? 12 : (n > 14 ? 3 : 1);
    months.forEach(function (m, i) {
      var h = Math.max(vals[i] > 0 ? 1 : 0, (Math.max(0, vals[i]) / max) * (H - pb - pt));
      out.push('<rect class="b' + (i === peak ? ' pk' : '') + '" data-i="' + i + '" x="' + (i * bw + bw * 0.14).toFixed(1) + '" width="' + Math.max(1, bw * 0.72).toFixed(1) + '" y="' + (H - pb - h).toFixed(1) + '" height="' + h.toFixed(1) + '"><title>' + esc(mLabel(m) + ' · ' + money(vals[i], cur)) + '</title></rect>');
      var showLbl = step === 1 || (step === 12 ? m.slice(5) === '01' : (+m.slice(5) - 1) % 3 === 0);
      if (showLbl) out.push('<text class="ax" x="' + (i * bw + bw / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(step === 1 ? MON[+m.slice(5) - 1] : mShort(m)) + '</text>');
    });
    out.push('</svg>');
    return out.join('');
  }

  /* ---------- views ---------- */
  function more(key, list, n, fn) {
    var all = S.more[key], shown = all ? list : list.slice(0, n), h = shown.map(fn).join('');
    if (list.length > n) h += '<button type="button" class="more mono small" data-more="' + esc(key) + '">' + (all ? 'Show less' : 'Show all ' + list.length) + '</button>';
    return h;
  }
  function artistNote(a) { return a && M.topArtist && a !== M.topArtist ? ' <span class="s">' + esc(a) + '</span>' : ''; }
  function card(cls, attrs, lbl, amt, meta) {
    return '<div class="card bucket ' + cls + '"' + attrs + '><div class="lbl mono">' + lbl + '</div><div class="amt' + (cls.indexOf('off') >= 0 ? '' : ' num') + '">' + amt + '</div>' + (meta ? '<div class="meta">' + meta + '</div>' : '') + '</div>';
  }

  function viewMoney() {
    var rows = S.dk.filter(function (r) { return inR(r.m); });
    var lines = S.stm.filter(function (l) { return inR(l.pm); });
    var usd = sum(rows, function (r) { return r.e; }), units = sum(rows, function (r) { return r.q; });
    var bk = bucketsOf(lines), allB = bucketsOf(S.stm), h = [];
    h.push('<h2>Money</h2><p class="lead">' + esc(rangeLabel()) + '</p><div class="grid">');
    h.push(S.dk.length
      ? card('dk', ' data-bucket="DistroKid|USD"', 'DistroKid <span class="dim">USD</span>', money(usd, 'USD'), int(units) + ' units · ' + rows.length.toLocaleString('en-AU') + ' rows')
      : card('dk off', '', 'DistroKid <span class="dim">USD</span>', 'No file', ''));
    bucketKeys().forEach(function (k) {
      var p = k.split('|'), b = bk.get(k), lbl = esc(p[0]) + ' <span class="dim">' + esc(p[1]) + '</span>';
      if (!allB.get(k)) { h.push(card('off', '', lbl, 'No statements', '')); return; }
      var nst = b ? new Set(b.lines.map(function (l) { return l.terr + l.pm; })).size : 0;
      h.push(card('', ' data-bucket="' + esc(k) + '"', lbl, money(b ? b.net : 0, p[1]), nst ? nst + ' payout' + (nst > 1 ? 's' : '') + ' · ' + b.lines.length + ' lines' : 'No payouts in range'));
    });
    h.push(S.ppca.length
      ? card('pp', ' data-bucket="PPCA"', 'PPCA', S.ppca.length + ' <span class="cur">recordings</span>', 'No amounts in repertoire file')
      : card('pp off', '', 'PPCA', 'No file', ''));
    h.push('</div><p class="sep">Each currency stays separate. Never added together.</p>');

    var hl = highlights(rows);
    if (hl.spikes.length || hl.markets.length) {
      h.push('<h3>Standouts</h3><div class="hl">');
      hl.spikes.forEach(function (s) { var f = M.fams.get(s.f); h.push('<div class="card" data-song="' + esc(s.f) + '"><div class="k mono">Spike</div><div class="t">' + esc(f.title) + '</div><div class="s">' + mLabel(s.m) + ' · ' + money(s.v, 'USD') + ' · ' + s.x.toFixed(1) + '× its median month</div></div>'); });
      hl.markets.forEach(function (s) { var f = M.fams.get(s.f); h.push('<div class="card" data-mk="' + esc(s.f) + '"><div class="k mono">Strong market</div><div class="t">' + esc(f.title) + '</div><div class="s">' + esc(cname(s.c)) + ' · ' + pct(s.share) + ' of this song · ' + s.idx.toFixed(1) + '× the catalogue share</div></div>'); });
      h.push('</div>');
    }

    if (S.dk.length) {
      var months = monthSeq(S.from, S.to), bym = groupBy(rows, function (r) { return r.m; }, function (r) { return r.e; });
      var vals = months.map(function (m) { return bym.get(m) || 0; }), mx = Math.max.apply(null, vals.concat([0])), pk = mx > 0 ? vals.indexOf(mx) : -1;
      h.push('<h3>DistroKid by sale month <span class="dim">USD</span></h3>' + chart(months, vals, 'USD', pk) + (pk >= 0 ? '<p class="cap" data-cap>Peak ' + mLabel(months[pk]) + ' · ' + money(vals[pk], 'USD') + '</p>' : ''));

      var recUsd = groupBy(rows, function (r) { return r.k; }, function (r) { return r.e; });
      var list = M.famList.map(function (f) {
        var main = sum(f.mains, function (o) { return recUsd.get(o.k) || 0; });
        var vers = f.versions.filter(function (o) { return recUsd.has(o.k); }).map(function (o) { return { o: o, v: recUsd.get(o.k) }; });
        return { f: f, main: main, vers: vers, hasMain: f.mains.some(function (o) { return recUsd.has(o.k); }) };
      }).filter(function (x) { return x.hasMain || x.vers.length; }).sort(function (a, b) { return b.main - a.main; });
      var top = Math.max.apply(null, list.map(function (x) { return x.main; }).concat([0])) || 1, rank = 0;
      h.push('<h3>Song rank <span class="dim">USD</span></h3><div class="list">');
      h.push(more('rank', list, 15, function (x) {
        rank++;
        var codes = x.f.mains.length > 1 ? '<span class="pill amb">' + x.f.mains.length + ' codes</span>' : '';
        var s = '<div class="row link" data-song="' + esc(x.f.key) + '"><span class="rk">' + rank + '</span><span class="t">' + esc(x.f.title) + codes + artistNote(x.f.artist) + '</span><span class="v num">' +
          (x.hasMain ? money(x.main, 'USD') : '<span class="blank">—</span>') + '</span><span class="bar"><i data-w="' + (Math.max(0, x.main) / top * 100).toFixed(1) + '"></i></span></div>';
        x.vers.forEach(function (v) { s += '<div class="row sub"><span></span><span class="t">' + esc(v.o.version) + '<span class="pill">not added</span></span><span class="v num small mute">' + money(v.v, 'USD') + '</span></div>'; });
        return s;
      }));
      h.push('</div><p class="sep">Versions show under their song and are not added to its rank. Every code is in the DistroKid total.</p>');
    }

    if (S.stm.length) {
      var meta = new Map(S.stmMeta.map(function (m) { return [m.key, m]; }));
      h.push('<h3>APRA AMCOS payouts</h3><div class="two">');
      bucketKeys().forEach(function (k) {
        var b = bk.get(k); if (!b) return;
        var p = k.split('|'), per = new Map();
        b.lines.forEach(function (l) {
          var kk = l.terr + '|' + l.pm;
          if (!per.has(kk)) per.set(kk, { pm: l.pm, terr: l.terr, net: 0, n: 0, codes: new Set() });
          var o = per.get(kk); o.net += l.net; o.n++; if (l.code) o.codes.add(l.code.split(' ')[0]);
        });
        var tr = Array.from(per.values()).sort(function (a, c) { return c.pm.localeCompare(a.pm); }).map(function (o) {
          var mt = meta.get(p[0] + '|' + o.terr + '|' + o.pm);
          var chk = mt && mt.ok === true ? '<span class="pill ok">✓ total</span>' : (mt && mt.ok === false ? '<span class="pill gap">total differs</span>' : '');
          return '<tr><td>' + mLabel(o.pm) + '</td><td class="code hide-s">' + esc(Array.from(o.codes).join(', ')) + '</td><td class="r">' + o.n + '</td><td class="r num">' + money(o.net, p[1]) + chk + '</td></tr>';
        }).join('');
        h.push('<div><p class="mono small">' + esc(p[0]) + ' · ' + esc(p[1]) + ' · <span class="num">' + money(b.net, p[1]) + '</span></p><div class="tw"><table><thead><tr><th>Payout</th><th class="hide-s">Code</th><th class="r">Lines</th><th class="r">Net</th></tr></thead><tbody>' + tr + '</tbody></table></div></div>');
      });
      h.push('</div><h3>APRA AMCOS by work</h3><div class="two">');
      bucketKeys().forEach(function (k) {
        var b = bk.get(k); if (!b) return;
        var p = k.split('|'), bw = new Map();
        b.lines.forEach(function (l) { var id = l.wid || '(no work ID)'; if (!bw.has(id)) bw.set(id, { id: id, title: l.title, net: 0 }); bw.get(id).net += l.net; });
        var wl = Array.from(bw.values()).sort(function (a, c) { return c.net - a.net; });
        h.push('<div><p class="mono small">' + esc(p[0]) + ' · ' + esc(p[1]) + '</p><div class="list">' + more('w' + k, wl, 8, function (w) {
          var fs = M.work2fams.get(w.id), f = fs && fs.size ? Array.from(fs)[0] : null;
          var tag = f ? '' : (S.works.size ? '<span class="pill gap">no ISRC link</span>' : '');
          return '<div class="row' + (f ? ' link" data-song="' + esc(f) : '') + '"><span class="rk"></span><span class="t">' + esc(w.title || w.id) + tag + ' <span class="s code">' + esc(w.id) + '</span></span><span class="v num">' + money(w.net, p[1]) + '</span></div>';
        }) + '</div></div>');
      });
      h.push('</div>');
    }
    if (S.cats.length) {
      var cb = new Map();
      S.cats.forEach(function (c) { var k = c.soc + '|' + c.terr + '|' + c.cur + '|' + c.ps + '|' + c.pe; if (!cb.has(k)) cb.set(k, []); cb.get(k).push(c); });
      h.push('<h3>Source categories <span class="dim">as listed, own periods</span></h3><div class="two">');
      cb.forEach(function (rs, k) {
        var p = k.split('|');
        h.push('<div><p class="mono small">' + esc(p[0]) + ' · ' + esc(p[1] || '?') + ' · ' + esc(p[2]) + ' · ' + mShort(rs[0].ps) + '–' + mShort(rs[0].pe) + '</p><div class="tw"><table><tbody>' +
          rs.slice().sort(function (a, c) { return c.amt - a.amt; }).map(function (c) { return '<tr><td>' + esc(c.cat) + '<div class="small mute">' + esc(c.crd || c.sub) + '</div></td><td class="r num">' + money(c.amt, c.cur) + '</td></tr>'; }).join('') +
          '<tr><td class="mute">Total</td><td class="r num">' + money(sum(rs, function (c) { return c.amt; }), p[2]) + '</td></tr></tbody></table></div></div>');
      });
      h.push('</div>');
    }
    return h.join('');
  }

  function famOptions(sel, allLabel) {
    return (allLabel ? '<option value="">' + esc(allLabel) + '</option>' : '') + M.famList.map(function (f) { return '<option value="' + esc(f.key) + '"' + (f.key === sel ? ' selected' : '') + '>' + esc(f.title) + '</option>'; }).join('');
  }

  function marketRows(rows, catRows, key, n, withIdx) {
    var t = sum(rows, function (r) { return r.e; }), ct = sum(catRows, function (r) { return r.e; });
    var by = new Map();
    rows.forEach(function (r) { var k = r.co; if (!by.has(k)) by.set(k, { c: k, v: 0, st: new Map() }); var o = by.get(k); o.v += r.e; o.st.set(r.st, (o.st.get(r.st) || 0) + r.e); });
    var cat = withIdx ? groupBy(catRows, function (r) { return r.co; }, function (r) { return r.e; }) : null;
    var list = Array.from(by.values()).sort(function (a, b) { return b.v - a.v; }), top = list.length ? Math.max(list[0].v, 0) || 1 : 1;
    return { count: list.length, html: more(key, list, n, function (o) {
      var idx = '';
      if (cat && t > 0 && ct > 0 && o.c && o.c !== 'OU' && cat.get(o.c) > 0) { var x = (o.v / t) / (cat.get(o.c) / ct); if (x >= 1.5 && o.v / t >= 0.03) idx = '<span class="pill amb">' + x.toFixed(1) + '× catalogue</span>'; }
      return '<div class="row" data-country="' + esc(o.c) + '"><span class="rk code">' + esc(o.c || '—') + '</span><span class="t">' + esc(cname(o.c)) + idx + ' <span class="s">Top: ' + esc(topKey(o.st)) + '</span></span><span class="v num">' + money(o.v, 'USD') + ' <span class="s">' + (t ? pct(o.v / t) : '') + '</span></span><span class="bar"><i data-w="' + (Math.max(0, o.v) / top * 100).toFixed(1) + '"></i></span></div>';
    }) };
  }
  function storeRows(rows, key, n) {
    var t = sum(rows, function (r) { return r.e; }), by = groupBy(rows, function (r) { return r.st; }, function (r) { return r.e; }), u = groupBy(rows, function (r) { return r.st; }, function (r) { return r.q; });
    var list = Array.from(by.entries()).sort(function (a, b) { return b[1] - a[1]; }), top = list.length ? Math.max(list[0][1], 0) || 1 : 1, i = 0;
    return more(key, list, n, function (e) {
      i++;
      return '<div class="row"><span class="rk">' + i + '</span><span class="t">' + esc(e[0]) + ' <span class="s">' + int(u.get(e[0])) + ' units</span></span><span class="v num">' + money(e[1], 'USD') + ' <span class="s">' + (t ? pct(e[1] / t) : '') + '</span></span><span class="bar"><i data-w="' + (Math.max(0, e[1]) / top * 100).toFixed(1) + '"></i></span></div>';
    });
  }

  function viewMarket() {
    var h = ['<h2>Market</h2>'];
    if (!S.dk.length) return h.concat(['<p class="lead">Add a DistroKid export to see countries and stores.</p>']).join('');
    var all = S.dk.filter(function (r) { return inR(r.m); });
    var rows = S.mkSong ? all.filter(function (r) { return r.f === S.mkSong; }) : all;
    var mr = marketRows(rows, all, 'mk' + S.mkSong, 12, !!S.mkSong);
    h.push('<p class="lead">' + esc(rangeLabel()) + ' · ' + mr.count + ' markets · ' + money(sum(rows, function (r) { return r.e; }), 'USD') + '</p>');
    h.push('<div class="songhead"><select id="mkSel" aria-label="Song">' + famOptions(S.mkSong, 'All songs') + '</select></div>');
    h.push('<div class="two"><div><h3>Countries <span class="dim">USD</span></h3><div class="list">' + mr.html + '</div></div>');
    h.push('<div><h3>Stores <span class="dim">USD</span></h3><div class="list">' + storeRows(rows, 'st' + S.mkSong, 12) + '</div></div></div>');
    var lines = S.stm.filter(function (l) { return inR(l.pm); });
    if (S.mkSong) { var ws = M.famWorks.get(S.mkSong) || new Set(); lines = lines.filter(function (l) { return ws.has(l.wid); }); }
    if (lines.length) {
      h.push('<h3>APRA AMCOS by territory of use</h3><div class="two">');
      var bk = bucketsOf(lines);
      bucketKeys().forEach(function (k) {
        var b = bk.get(k); if (!b) return; var p = k.split('|');
        var by = Array.from(groupBy(b.lines, function (l) { return l.ut || 'Not stated'; }, function (l) { return l.net; }).entries()).sort(function (a, c) { return c[1] - a[1]; });
        h.push('<div><p class="mono small">' + esc(p[0]) + ' · ' + esc(p[1]) + '</p><div class="tw"><table><tbody>' + by.map(function (e) { return '<tr><td>' + esc(e[0]) + '</td><td class="r num">' + money(e[1], p[1]) + '</td></tr>'; }).join('') + '</tbody></table></div></div>');
      });
      h.push('</div>');
    }
    return h.join('');
  }

  function viewSong() {
    var h = ['<h2>Song</h2>'];
    if (!M.famList.length) return h.concat(['<p class="lead">Add a DistroKid export to see songs.</p>']).join('');
    var f = M.fams.get(S.song) || M.famList[0]; S.song = f.key;
    var recs = f.mains.concat(f.versions);
    var rows = S.dk.filter(function (r) { return r.f === f.key && inR(r.m); });
    var mainKeys = new Set(f.mains.map(function (o) { return o.k; })), mainRows = rows.filter(function (r) { return mainKeys.has(r.k); });
    var works = Array.from(M.famWorks.get(f.key) || []).map(function (id) { return S.works.get(id); });
    var mainWorks = new Set(); f.mains.forEach(function (o) { (M.isrc2works.get(o.isrc) || []).forEach(function (id) { mainWorks.add(id); }); });
    var mainPPCA = f.mains.some(function (o) { return M.ppcaByIsrc.has(o.isrc); });
    h.push('<div class="songhead"><select id="songSel" aria-label="Song">' + famOptions(f.key) + '</select></div>');
    h.push('<h2 class="serif" data-title>' + esc(f.title) + '</h2>' + (f.artist ? '<p class="lead">' + esc(f.artist) + '</p>' : ''));
    var b = [];
    if (!S.works.size) b.push('<span class="pill">Works List not loaded</span>');
    else b.push(mainWorks.size ? '<span class="pill ok">APRA work ' + esc(Array.from(mainWorks).join(', ')) + '</span>' : '<span class="pill gap">No APRA work</span>');
    if (!S.ppca.length) b.push('<span class="pill">PPCA not loaded</span>');
    else b.push(mainPPCA ? '<span class="pill ok">In PPCA repertoire</span>' : '<span class="pill gap">Not in PPCA</span>');
    if (f.mains.length > 1) b.push('<span class="pill amb">' + f.mains.length + ' codes added</span>');
    if (f.versions.length) b.push('<span class="pill">' + f.versions.length + ' version' + (f.versions.length > 1 ? 's' : '') + ' not added</span>');
    h.push('<div class="badges">' + b.join('') + '</div>');
    var months = monthSeq(S.from, S.to), bym = groupBy(mainRows, function (r) { return r.m; }, function (r) { return r.e; });
    var vals = months.map(function (m) { return bym.get(m) || 0; }), mx = Math.max.apply(null, vals.concat([0])), pk = mx > 0 ? vals.indexOf(mx) : -1;
    var usd = sum(mainRows, function (r) { return r.e; });
    h.push('<div class="stats"><div><b class="num" data-song-usd>' + money(usd, 'USD') + '</b><span>DistroKid · ' + esc(rangeLabel()) + '</span></div><div><b class="num">' + int(sum(mainRows, function (r) { return r.q; })) + '</b><span>units</span></div>' +
      (pk >= 0 ? '<div><b data-peak="' + months[pk] + '">' + mShort(months[pk]) + '</b><span>peak month</span></div>' : '') + '</div>');
    h.push('<h3>By sale month <span class="dim">USD</span></h3>' + chart(months, vals, 'USD', pk));
    if (pk >= 0) {
      var pst = Array.from(groupBy(mainRows.filter(function (r) { return r.m === months[pk]; }), function (r) { return r.st; }, function (r) { return r.e; }).entries()).sort(function (a, c) { return c[1] - a[1]; }).slice(0, 4);
      h.push('<p class="cap" data-cap>Peak ' + mLabel(months[pk]) + ' · ' + money(mx, 'USD') + ' · ' + pst.map(function (e) { return esc(e[0]) + ' ' + money(e[1], 'USD'); }).join(' · ') + '</p>');
    }
    var all = S.dk.filter(function (r) { return inR(r.m); });
    var mr = marketRows(mainRows, all, 'sm' + f.key, 8, true);
    h.push('<div class="two"><div><h3>Markets</h3><div class="list">' + (mr.count ? mr.html : '<p class="lead">No earnings in range.</p>') + '</div></div><div><h3>Stores</h3><div class="list">' + storeRows(mainRows, 'ss' + f.key, 8) + '</div></div></div>');
    var recUsd = groupBy(rows, function (r) { return r.k; }, function (r) { return r.e; });
    h.push('<h3>Codes</h3><div class="tw"><table><thead><tr><th>ISRC</th><th>Title as delivered</th><th class="r">USD</th><th>UPC</th><th>APRA work</th><th>PPCA</th></tr></thead><tbody>');
    recs.forEach(function (o) {
      var ws = M.isrc2works.get(o.isrc) || [], pp = M.ppcaByIsrc.get(o.isrc) || [];
      var also = o.titles.size > 1 ? '<div class="small mute">Also: ' + esc(Array.from(o.titles.keys()).filter(function (t) { return t !== o.title; }).join(' / ')) + '</div>' : '';
      h.push('<tr><td class="code">' + blank(o.isrc, true) + '</td><td>' + esc(o.title) + (o.version ? '<span class="pill">not added</span>' : '') + also + '</td><td class="r num">' + money(recUsd.get(o.k) || 0, 'USD') +
        '</td><td class="code">' + blank(Array.from(o.upcs).join(', ')) + '</td><td class="code">' + (S.works.size ? blank(ws.join(', '), true) : blank('')) + '</td><td class="code">' + (S.ppca.length ? blank(pp.map(function (p) { return p.id; }).join(', '), true) : blank('')) + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    if (works.length) {
      h.push('<h3>APRA works</h3><div class="tw"><table><thead><tr><th>Work ID</th><th>Title</th><th>Writers</th><th class="r">Share %</th><th>Registered</th><th>Awaiting</th></tr></thead><tbody>');
      works.forEach(function (w) { h.push('<tr><td class="code">' + esc(w.id) + '</td><td>' + esc(w.title) + '</td><td>' + blank(w.writersRaw) + '</td><td class="r num">' + (w.share == null ? blank('', true) : esc(w.share)) + '</td><td>' + blank(w.date) + '</td><td>' + blank(w.awaiting) + '</td></tr>'); });
      h.push('</tbody></table></div>');
      var ids = new Set(works.map(function (w) { return w.id; }));
      var lines = S.stm.filter(function (l) { return ids.has(l.wid) && inR(l.pm); });
      h.push('<h3>APRA AMCOS for this song</h3>');
      if (!S.stm.length) h.push('<p class="lead">No statements loaded.</p>');
      else if (!lines.length) h.push('<p class="lead">No statement lines in range.</p>');
      else {
        var bk = bucketsOf(lines);
        h.push('<div class="grid">');
        bucketKeys().forEach(function (k) { var bb = bk.get(k); if (!bb) return; var p = k.split('|'); h.push(card('', '', esc(p[0]) + ' <span class="dim">' + esc(p[1]) + '</span>', money(bb.net, p[1]), bb.lines.length + ' lines')); });
        h.push('</div><div class="tw"><table><thead><tr><th>Payout</th><th>Society</th><th>Work</th><th class="hide-s">Category</th><th class="hide-s">Territory</th><th class="r">Net</th></tr></thead><tbody>');
        lines.slice().sort(function (a, c) { return c.pm.localeCompare(a.pm) || a.soc.localeCompare(c.soc); }).forEach(function (l) {
          h.push('<tr><td>' + mShort(l.pm) + '</td><td>' + esc(l.soc) + ' ' + esc(l.terr) + '</td><td class="code">' + esc(l.wid) + '</td><td class="hide-s">' + blank(l.cat) + '</td><td class="hide-s">' + blank(l.ut) + '</td><td class="r num">' + money(l.net, l.cur) + '</td></tr>');
        });
        h.push('</tbody></table></div>');
      }
    }
    return h.join('');
  }

  function viewRegister() {
    var h = ['<h2>Register</h2><p class="lead">Gaps between your files. Nothing here is filled in or guessed.</p>'];
    var W = S.works.size > 0, P = S.ppca.length > 0, D = S.dk.length > 0, sections = [];
    function sec(id, title, need, items, fn) { sections.push({ id: id, title: title, need: need, items: items, fn: fn }); }
    var paid = Array.from(M.rec.values()).filter(function (o) { return o.usd > 0; }).sort(function (a, b) { return b.usd - a.usd; });
    var worksArr = Array.from(S.works.values());
    var worksByTitle = new Map();
    worksArr.forEach(function (w) { var k = famKey(splitVersion(w.title).base); if (!worksByTitle.has(k)) worksByTitle.set(k, []); worksByTitle.get(k).push(w); });
    sec('no-work', 'Paid, no APRA work', !D ? 'DistroKid export' : (!W ? 'Works List' : ''), paid.filter(function (o) { return !o.isrc || !M.isrc2works.has(o.isrc); }), function (o) {
      var same = (worksByTitle.get(famKey(o.base)) || []).filter(function (w) { return !w.isrcs.length; });
      return '<b>' + blank(o.isrc, true) + '</b><div>' + esc(o.title) + ' · paid ' + money(o.usd, 'USD') + ' all time' + (same.length ? ' · Works List has ' + esc(same.map(function (w) { return w.id; }).join(', ')) + ' with this title and no ISRC' : '') + '</div>';
    });
    var wMoney = new Map();
    S.stm.forEach(function (l) { var k = l.wid + '\u0001' + l.soc + '\u0001' + l.cur; wMoney.set(k, (wMoney.get(k) || 0) + l.net); });
    function moneyFor(id) { var out = []; wMoney.forEach(function (v, k) { var p = k.split('\u0001'); if (p[0] === id) out.push(p[1] + ' ' + money(v, p[2])); }); return out.join(' · '); }
    sec('no-isrc', 'APRA work with no ISRC', !W ? 'Works List' : '', worksArr.filter(function (w) { return !w.isrcs.length; }), function (w) {
      var mm = moneyFor(w.id); return '<b>' + esc(w.id) + '</b><div>' + esc(w.title) + (mm ? ' · statements ' + mm : '') + '</div>';
    });
    sec('share', 'Share check', !W ? 'Works List' : '', worksArr.filter(function (w) { return w.share == null || (w.writers.length <= 1 && w.share < 100); }), function (w) {
      return '<b>' + esc(w.id) + '</b><div>' + esc(w.title) + ' · ' + (w.share == null ? 'share blank' : 'sole writer, share ' + esc(w.share) + '%, split does not add to 100%') + '</div>';
    });
    sec('awaiting', 'Awaiting registration confirmation', !W ? 'Works List' : '', worksArr.filter(function (w) { return w.awaiting === 'Y' || w.awaiting === 'YES'; }), function (w) { return '<b>' + esc(w.id) + '</b><div>' + esc(w.title) + '</div>'; });
    var codesNoEarn = [];
    worksArr.forEach(function (w) { w.isrcs.forEach(function (i) { var o = M.rec.get(i); if (!o || o.usd === 0) codesNoEarn.push({ i: i, w: w }); }); });
    sec('no-earn', 'ISRC on a work, no DistroKid earnings', !W ? 'Works List' : (!D ? 'DistroKid export' : ''), codesNoEarn, function (x) { return '<b>' + esc(x.i) + '</b><div>' + esc(x.w.title) + ' · ' + esc(x.w.id) + (M.ppcaByIsrc.has(x.i) ? ' · in PPCA' : '') + '</div>'; });
    var multi = [];
    M.isrc2works.forEach(function (ids, i) { var u = Array.from(new Set(ids)); if (u.length > 1) multi.push({ i: i, ids: u }); });
    sec('multi', 'One ISRC on more than one work', !W ? 'Works List' : '', multi, function (x) { return '<b>' + esc(x.i) + '</b><div>' + esc(x.ids.map(function (id) { var w = S.works.get(id); return id + ' ' + (w ? w.title : ''); }).join(' · ')) + '</div>'; });
    sec('no-ppca', 'Paid, not in PPCA repertoire', !D ? 'DistroKid export' : (!P ? 'PPCA repertoire' : ''), paid.filter(function (o) { return !o.isrc || !M.ppcaByIsrc.has(o.isrc); }), function (o) { return '<b>' + blank(o.isrc, true) + '</b><div>' + esc(o.title) + ' · paid ' + money(o.usd, 'USD') + ' all time</div>'; });
    sec('ppca-valid', 'PPCA recording not marked valid', !P ? 'PPCA repertoire' : '', S.ppca.filter(function (p) { return p.valid && !/^valid$/i.test(p.valid); }), function (p) { return '<b>' + blank(p.isrc, true) + '</b><div>' + esc(p.title) + ' · ' + esc(p.valid) + '</div>'; });
    var stmUnknown = new Map();
    S.stm.forEach(function (l) {
      if (l.wid && S.works.has(l.wid)) return;
      var k = l.wid || '(blank)';
      if (!stmUnknown.has(k)) stmUnknown.set(k, { id: k, title: l.title, m: new Map() });
      var o = stmUnknown.get(k), mk = l.soc + '\u0001' + l.cur; o.m.set(mk, (o.m.get(mk) || 0) + l.net);
    });
    sec('stm-unknown', 'Statement work not on the Works List', !S.stm.length ? 'APRA AMCOS statements' : (!W ? 'Works List' : ''), Array.from(stmUnknown.values()), function (o) {
      return '<b>' + esc(o.id) + '</b><div>' + esc(o.title) + ' · ' + Array.from(o.m.entries()).map(function (e) { var p = e[0].split('\u0001'); return p[0] + ' ' + money(e[1], p[1]); }).join(' · ') + '</div>';
    });
    sec('prints', 'Same ISRC, title written more than one way', !D ? 'DistroKid export' : '', Array.from(M.rec.values()).filter(function (o) { return o.titles.size > 1; }), function (o) { return '<b>' + blank(o.isrc, true) + '</b><div>' + esc(Array.from(o.titles.keys()).join(' / ')) + '</div>'; });

    h.push('<div class="counts">' + sections.map(function (s) { return s.need ? '' : '<span class="pill' + (s.items.length ? ' gap' : ' ok') + '">' + esc(s.title) + ' · ' + s.items.length + '</span>'; }).join('') + '</div>');
    sections.forEach(function (s) {
      h.push('<h3>' + esc(s.title) + (s.need ? '' : ' <span class="dim">' + s.items.length + '</span>') + '</h3><div class="reg" data-reg="' + s.id + '" data-count="' + (s.need ? -1 : s.items.length) + '">');
      if (s.need) h.push('<div class="none">Add the ' + esc(s.need) + ' to check.</div>');
      else if (!s.items.length) h.push('<div class="none">None found.</div>');
      else h.push(more('reg' + s.id, s.items, 12, function (x) { return '<div class="item">' + s.fn(x) + '</div>'; }));
      h.push('</div>');
    });
    return h.join('');
  }

  /* ---------- render ---------- */
  function render() {
    var dash = hasData();
    $('#empty').hidden = dash; $('#dash').hidden = !dash;
    $('#filesBtn').hidden = !S.files.length;
    $('#filesBtn').textContent = 'Files · ' + S.files.length;
    $('#demoTag').hidden = !S.demo;
    renderFiles();
    if (!dash) return;
    $$('.tab').forEach(function (t) { var on = t.dataset.tab === S.tab; t.classList.toggle('on', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    renderRange();
    var v = $('#view');
    v.innerHTML = S.tab === 'market' ? viewMarket() : S.tab === 'song' ? viewSong() : S.tab === 'register' ? viewRegister() : viewMoney();
    $$('[data-w]', v).forEach(function (e) { e.style.width = e.getAttribute('data-w') + '%'; });
  }
  function renderFiles() {
    $('#filesList').innerHTML = '<div class="fl">' + S.files.map(function (f) {
      var ok = !!f.kind && !f.bad;
      return '<div class="f' + (ok && !f.warn ? '' : ' bad') + '" data-kind="' + esc(f.kind || 'none') + '" data-rows="' + (f.rows || 0) + '" data-check="' + esc(f.check || '') + '" data-warn="' + (f.warn ? 1 : 0) + '"><b>' + esc(f.name) + '</b><span>' +
        (f.kind ? esc(KIND_LABEL[f.kind] + (f.label ? ' · ' + f.label : '') + ' · ' + int(f.rows) + (f.rows === 1 ? ' row' : ' rows')) : '') + (f.note ? (f.kind ? ' · ' : '') + esc(f.note) : '') + '</span></div>';
    }).join('') + '</div>';
  }
  function status(msg, err) { var s = $('#status'); s.textContent = msg || ''; s.classList.toggle('err', !!err); }

  /* ---------- loading ---------- */
  var busy = false;
  function lock(on) { busy = on; $$('#pickBtn,#demoBtn,#addBtn').forEach(function (b) { b.disabled = on; }); }
  async function ingest(items, demo) {
    if (busy) return;
    lock(true);
    try {
      if (S.demo && !demo) reset();
      status('Reading ' + items.length + ' file' + (items.length > 1 ? 's' : '') + '…');
      await tick();
      for (var i = 0; i < items.length; i++) {
        var it = items[i], res;
        try { res = ingestOne(it.name, await it.get()); res.name = it.name; }
        catch (e) { res = { name: it.name, kind: null, note: 'Could not read this file' }; }
        S.files.push(res);
        if (i % 4 === 3) await tick();
      }
      if (demo) S.demo = true;
      if (hasData()) { derive(); status(''); }
      else status('No supported files found.', true);
      render();
    } finally { lock(false); }
  }
  function fromFileList(fl) { return Array.prototype.map.call(fl, function (f) { return { name: f.name, get: function () { return f.arrayBuffer(); } }; }); }
  function b64ToBuf(b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  function loadDemo() {
    if (busy) return;
    var go = function () {
      var d = window.RD_DEMO;
      if (!d || !d.files) { status('Demo data could not be loaded.', true); return; }
      reset();
      ingest(d.files.map(function (f) { return { name: f.name, get: function () { return Promise.resolve(f.b64 ? b64ToBuf(f.b64) : f.text); } }; }), true);
    };
    if (window.RD_DEMO) { go(); return; }
    status('Loading demo data…');
    var s = document.createElement('script');
    s.src = 'demo/demo-pack.js';
    s.onload = go;
    s.onerror = function () { status('Demo data could not be loaded.', true); };
    document.body.appendChild(s);
  }

  /* ---------- events ---------- */
  var picker = $('#picker'), drop = $('#drop'), depth = 0;
  $('#pickBtn').addEventListener('click', function (e) { e.stopPropagation(); picker.click(); });
  $('#demoBtn').addEventListener('click', function (e) { e.stopPropagation(); loadDemo(); });
  $('#addBtn').addEventListener('click', function () { picker.click(); });
  picker.addEventListener('change', function () { if (picker.files.length) { $('#filesPanel').hidden = true; ingest(fromFileList(picker.files)); } picker.value = ''; });
  drop.addEventListener('click', function () { picker.click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); } });
  function isFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
  document.addEventListener('dragenter', function (e) { if (!isFiles(e)) return; e.preventDefault(); depth++; if (hasData()) $('#dropOverlay').hidden = false; else drop.classList.add('over'); });
  document.addEventListener('dragover', function (e) { if (isFiles(e)) e.preventDefault(); });
  document.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) { $('#dropOverlay').hidden = true; drop.classList.remove('over'); } });
  document.addEventListener('drop', function (e) {
    if (!isFiles(e)) return;
    e.preventDefault(); depth = 0; $('#dropOverlay').hidden = true; drop.classList.remove('over');
    if (e.dataTransfer.files.length) ingest(fromFileList(e.dataTransfer.files));
  });
  $('#filesBtn').addEventListener('click', function () { $('#filesPanel').hidden = false; });
  $('#closeFiles').addEventListener('click', function () { $('#filesPanel').hidden = true; });
  $('#filesPanel').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('#filesPanel').hidden = true; });
  $('#clearBtn').addEventListener('click', function () { reset(); $('#filesPanel').hidden = true; status(''); render(); window.scrollTo(0, 0); });
  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { S.tab = t.dataset.tab; render(); window.scrollTo(0, 0); }); });
  $('#range').addEventListener('click', function (e) {
    var b = e.target.closest('[data-preset]'); if (!b) return;
    var p = presets().filter(function (x) { return x.id === b.dataset.preset; })[0]; if (!p) return;
    S.preset = p.id; S.from = p.from; S.to = p.to; S.more = {}; render();
  });
  $('#range').addEventListener('change', function (e) {
    if (e.target.id === 'fromSel') S.from = e.target.value;
    if (e.target.id === 'toSel') S.to = e.target.value;
    if (S.from > S.to) { var t = S.from; S.from = S.to; S.to = t; }
    var match = presets().filter(function (x) { return x.from === S.from && x.to === S.to; })[0];
    S.preset = match ? match.id : 'custom'; render();
  });
  $('#view').addEventListener('click', function (e) {
    var m = e.target.closest('[data-more]'); if (m) { S.more[m.dataset.more] = !S.more[m.dataset.more]; render(); return; }
    var s = e.target.closest('[data-song]'); if (s) { S.song = s.dataset.song; S.tab = 'song'; render(); window.scrollTo(0, 0); return; }
    var k = e.target.closest('[data-mk]'); if (k) { S.mkSong = k.dataset.mk; S.tab = 'market'; render(); window.scrollTo(0, 0); return; }
    var r = e.target.closest('rect[data-i]');
    if (r) { var cap = $('[data-cap]', $('#view')), t = r.querySelector('title'); if (cap && t) cap.textContent = t.textContent; }
  });
  $('#view').addEventListener('change', function (e) {
    if (e.target.id === 'songSel') { S.song = e.target.value; render(); }
    if (e.target.id === 'mkSel') { S.mkSong = e.target.value; render(); }
  });
  var rt = null, lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    if (Math.abs(window.innerWidth - lastW) < 40) return;
    clearTimeout(rt); rt = setTimeout(function () { lastW = window.innerWidth; if (hasData()) render(); }, 200);
  });
  render();
  if (/[?&]demo=1(&|$)/.test(location.search)) loadDemo();
})();
