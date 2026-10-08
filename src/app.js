/* Royalty Dashboard · MIT · runs fully in the browser, no network calls */
(function () {
  "use strict";

  /* ================================================================== helpers */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function nh(h) { return String(h == null ? "" : h).replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ").toLowerCase(); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoDate(d) { return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function str(v) { if (v == null) return ""; if (v instanceof Date) return isoDate(v); return String(v).trim(); }
  function num(v) {
    if (v == null) return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    let s = String(v).trim();
    if (s === "") return null;
    if (s === "-" || s === "–") return 0;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[\s,]/g, "").replace(/^[A-Za-z]{0,3}\$|^[$€£]|[A-Za-z]{3}$/g, "");
    if (s.charAt(0) === "-") { neg = !neg; s = s.slice(1); }
    if (!/^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
    const n = parseFloat(s);
    return neg ? -n : n;
  }
  function isrcN(v) { return str(v).toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function monthOf(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v.getUTCFullYear() + "-" + pad(v.getUTCMonth() + 1);
    const s = String(v).trim();
    let m;
    if ((m = s.match(/^(\d{4})[-\/](\d{1,2})(\b|$)/))) return m[1] + "-" + pad(+m[2]);
    if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?[\s\-]*(\d{4})$/))) {
      const i = MON.indexOf(m[1].charAt(0).toUpperCase() + m[1].slice(1, 3).toLowerCase());
      if (i >= 0) return m[2] + "-" + pad(i + 1);
    }
    return null;
  }
  function mLabel(m) { return m ? MON[+m.slice(5, 7) - 1] + " " + m.slice(0, 4) : ""; }
  function int(n) { return Math.round(n || 0).toLocaleString("en-AU"); }
  function sum(a, f) { let t = 0; for (let i = 0; i < a.length; i++) t += f(a[i]); return t; }
  function tick() { return new Promise((r) => setTimeout(r, 0)); }
  function topKey(map) { let best = null, bv = -Infinity; map.forEach((v, k) => { if (v > bv) { bv = v; best = k; } }); return best; }

  /* Titles: version tags ("(Instrumental)", "[REMIX]", "- Radio Edit") and feature credits are split off the base title. */
  const VER_RE = /\b(instrumental|inst\.?|acapella|acappella|a ?cappella|a ?capella|radio edit|edit|clean|remix(ed)?|rmx|extended|sped up|slowed|reverb|remaster(ed)?|live|karaoke|vip)\b/i;
  function splitVersion(title) {
    const t = String(title || "").trim();
    let base = t, m, guard = 0;
    const vers = [];
    while (guard++ < 6) {
      m = base.match(/\s*[\(\[]([^\(\)\[\]]*)[\)\]]\s*$/) || base.match(/\s+[-–]\s+([^-–]+)$/);
      if (!m) break;
      const inner = m[1].trim();
      if (/^(feat\.?|ft\.?|featuring|with)\s/i.test(inner)) { base = base.slice(0, m.index).trim(); continue; }
      if (VER_RE.test(inner)) { vers.unshift(inner); base = base.slice(0, m.index).trim(); continue; }
      break;
    }
    base = base.replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, "").trim();
    return { base: base || t, version: vers.join(" · ") };
  }
  function famKey(t) { return String(t || "").toUpperCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim(); }
  function titleCase(s) { return String(s).toLowerCase().replace(/(^|[\s\-\(·])([a-z])/g, (a, b, c) => b + c.toUpperCase()); }

  /* ================================================================== file state */
  let S;
  function resetFiles() {
    S = { files: [], dk: [], dkFp: new Map(), dkSpans: [], stm: [], stmKeys: new Map(), stmMeta: [], cats: [], catKeys: new Set(),
      works: new Map(), ppca: [], ppcaKeys: new Set(), demo: false };
  }
  resetFiles();

  /* ================================================================== detection */
  const SHARE_RE = /^(.+?)\s+share\s*%$/;
  const DETECT = [
    ["statement", (r) => /^(apra|amcos) distribution$/.test(r[0] || "") && r.indexOf("work id") >= 0 && r.indexOf("net royalty") >= 0],
    ["distrokid", (r) => r.indexOf("sale month") >= 0 && r.indexOf("store") >= 0 && r.indexOf("isrc") >= 0 && r.some((h) => /^earnings( \(usd\))?$/.test(h))],
    ["soundcloud", (r) => r.indexOf("reporting period") >= 0 && r.indexOf("partner") >= 0 && r.indexOf("isrc") >= 0 && r.indexOf("revenue (usd)") >= 0],
    ["stmtflat", (r) => r.indexOf("society") >= 0 && r.indexOf("period") >= 0 && r.indexOf("workid") >= 0 && r.indexOf("net") >= 0],
    ["categories", (r) => r.indexOf("distribution") >= 0 && r.indexOf("period start") >= 0 && r.indexOf("category") >= 0 && r.indexOf("amount") >= 0 && r.indexOf("currency") >= 0],
    ["works", (r) => (r.indexOf("winfkey") >= 0 || r.indexOf("work id") >= 0) && r.indexOf("title") >= 0 && r.indexOf("isrcs") >= 0 && r.some((h) => SHARE_RE.test(h))],
    ["ppca", (r) => r.indexOf("ppl recording id") >= 0 && r.indexOf("isrc") >= 0 && r.indexOf("recording title") >= 0],
  ];
  function detect(aoa) {
    const lim = Math.min(aoa.length, 40);
    for (let i = 0; i < lim; i++) {
      const row = (aoa[i] || []).map(nh);
      for (let d = 0; d < DETECT.length; d++) if (DETECT[d][1](row)) return { kind: DETECT[d][0], hi: i, H: row };
    }
    return null;
  }
  const KIND_LABEL = { distrokid: "DistroKid earnings", soundcloud: "SoundCloud earnings", statement: "APRA AMCOS statement", stmtflat: "APRA AMCOS statement lines",
    categories: "APRA AMCOS source categories", works: "APRA Works List", ppca: "PPCA repertoire" };

  /* ================================================================== parsers */
  function col(H, names) { for (let i = 0; i < names.length; i++) { const k = H.indexOf(names[i]); if (k >= 0) return k; } return -1; }
  function cell(row, i) { return i >= 0 && row ? row[i] : null; }

  /* Store rows from another file with the same ISRC + sale month + country + quantity + earnings are already counted
     (e.g. the DistroKid Instagram/Facebook TSV against the all-time CSV). They are skipped, never added twice. */
  function fpOf(r) { return r.d + "|" + r.i + "|" + r.m + "|" + r.co + "|" + r.q + "|" + (Math.round(r.e * 1e8) / 1e8); }
  function addStoreRows(rows, kind) {
    const prior = new Map(S.dkFp), mine = new Map();
    let added = 0, dup = 0, lo = null, hi = null;
    rows.forEach((r) => {
      const k = fpOf(r), p = prior.get(k) || 0;
      if (p > 0) { prior.set(k, p - 1); dup++; return; }
      mine.set(k, (mine.get(k) || 0) + 1);
      S.dk.push(r);
      added++;
      if (!lo || r.m < lo) lo = r.m;
      if (!hi || r.m > hi) hi = r.m;
    });
    mine.forEach((v, k) => S.dkFp.set(k, (S.dkFp.get(k) || 0) + v));
    const notes = [];
    let warn = false;
    if (lo) notes.push((kind === "soundcloud" ? "Reporting months " : "Sale months ") + mLabel(lo) + "–" + mLabel(hi));
    if (dup) notes.push(int(dup) + " rows already loaded from another file, skipped");
    if (added && S.dkSpans.some((s) => s[2] === kind && s[3] === "full" && lo <= s[1] && hi >= s[0]) && !dup) {
      notes.push("Months overlap another file. Check for double counting.");
      warn = true;
    }
    if (added) S.dkSpans.push([lo, hi, kind, "full"]);
    return { added, dup, notes, warn };
  }

  function parseDK(aoa, hi, H) {
    const c = { m: col(H, ["sale month"]), rd: col(H, ["reporting date"]), st: col(H, ["store"]), a: col(H, ["artist"]), t: col(H, ["title"]), i: col(H, ["isrc"]), u: col(H, ["upc"]),
      q: col(H, ["quantity"]), co: col(H, ["country of sale"]), e: H.findIndex((h) => /^earnings( \(usd\))?$/.test(h)) };
    const rows = [];
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row || row.length < 4) continue;
      const m = monthOf(cell(row, c.m));
      if (!m) continue;
      rows.push({ d: "distrokid", m, rd: str(cell(row, c.rd)).slice(0, 10), st: str(cell(row, c.st)) || "Not stated", a: str(cell(row, c.a)), t: str(cell(row, c.t)),
        i: isrcN(cell(row, c.i)), u: str(cell(row, c.u)), q: num(cell(row, c.q)) || 0, co: str(cell(row, c.co)).toUpperCase(), e: num(cell(row, c.e)) || 0 });
    }
    const res = addStoreRows(rows, "distrokid");
    return { kind: "distrokid", rows: res.added, note: res.notes.join(" · "), warn: res.warn };
  }

  /* SoundCloud lifetime earnings report: only Partner = SOUNDCLOUD rows. The other partners in that report are the
     stores DistroKid already reports, so adding them would double count. */
  function parseSC(aoa, hi, H) {
    const c = { m: col(H, ["reporting period"]), a: col(H, ["artist(s)", "artist"]), rel: col(H, ["release"]), t: col(H, ["track"]), u: col(H, ["upc"]), i: col(H, ["isrc"]),
      p: col(H, ["partner"]), co: col(H, ["country"]), q: col(H, ["units"]), e: col(H, ["revenue (usd)"]) };
    const rows = [];
    let other = 0;
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row) continue;
      const m = monthOf(cell(row, c.m));
      if (!m) continue;
      if (str(cell(row, c.p)).toUpperCase() !== "SOUNDCLOUD") { other++; continue; }
      rows.push({ d: "soundcloud", m, rd: "", st: "SOUNDCLOUD", a: str(cell(row, c.a)), t: str(cell(row, c.t)) || str(cell(row, c.rel)), i: isrcN(cell(row, c.i)), u: str(cell(row, c.u)),
        q: num(cell(row, c.q)) || 0, co: str(cell(row, c.co)).toUpperCase(), e: num(cell(row, c.e)) || 0 });
    }
    const res = addStoreRows(rows, "soundcloud");
    if (other) res.notes.push(int(other) + " other-partner rows left out (DistroKid reports those stores)");
    return { kind: "soundcloud", rows: res.added, note: res.notes.join(" · "), warn: res.warn };
  }

  function terrOf(s) { s = String(s || "").trim(); if (/zealand|^nz$/i.test(s)) return "NZ"; if (/australia|^aus?$/i.test(s)) return "AUS"; return ""; }
  function curFromTotal(s) { const m = String(s || "").match(/^\s*(AU|NZ|US)\$/i); return m ? ({ AU: "AUD", NZ: "NZD", US: "USD" })[m[1].toUpperCase()] : ""; }

  function addStatementLines(key, meta, lines, name) {
    const owner = S.stmKeys.get(key);
    if (owner && owner !== name) return false;
    S.stmKeys.set(key, name);
    for (let i = 0; i < lines.length; i++) S.stm.push(lines[i]);
    const sums = {};
    lines.forEach((l) => { sums[l.cur] = (sums[l.cur] || 0) + (l.net || 0); });
    meta.sums = sums; meta.lines = lines.length; meta.file = name;
    if (meta.headTotal != null) {
      const s = sums[meta.headCur] != null ? sums[meta.headCur] : sum(Object.keys(sums), (k) => sums[k]);
      meta.ok = Math.abs(s - meta.headTotal) < 0.011;
    }
    S.stmMeta.push(meta);
    return true;
  }

  function parseStatement(aoa, hi, H, name) {
    const meta = {};
    for (let r = 0; r < hi; r++) { const row = aoa[r] || []; const k = nh(row[0]); if (k) meta[k] = row[1]; }
    const soc = /^amcos/.test(H[0]) ? "AMCOS" : "APRA";
    const fm = name.match(/_(AUS|AU|NZ)_/i), pmF = name.match(/_([A-Za-z]{3})\s?(\d{4})\.(xlsx|xls|csv)$/i);
    const period = monthOf(meta.period) || (pmF ? monthOf(pmF[1] + " " + pmF[2]) : null);
    let terr = terrOf(meta[soc.toLowerCase() + " distribution"]) || (fm ? terrOf(fm[1]) : "");
    const headTotal = num(meta["net royalty total"]), headCur = curFromTotal(meta["net royalty total"]);
    const c = { wid: col(H, ["work id"]), t: col(H, ["title"]), w: col(H, ["writers"]), sh: col(H, ["your share %"]), cur: col(H, ["currency"]),
      g: col(H, ["gross royalty"]), cm: col(H, ["commission"]), tx: col(H, ["tax withheld"]), net: col(H, ["net royalty"]), cat: col(H, ["category"]),
      cl: col(H, ["client"]), ut: col(H, ["territory"]), rs: col(H, ["remitting foreign society"]) };
    const lines = [];
    for (let i = hi + 1; i < aoa.length; i++) {
      const row2 = aoa[i];
      if (!row2) continue;
      const wid = str(cell(row2, c.wid)), net = num(cell(row2, c.net));
      if (!wid && net == null) continue;
      const code = str(cell(row2, 0));
      if (!terr) { const cm = code.match(/^[PM]\d{4}([AN])/); if (cm) terr = cm[1] === "N" ? "NZ" : "AUS"; }
      lines.push({ soc, terr: "", pm: period, code, wid, title: str(cell(row2, c.t)), writers: str(cell(row2, c.w)), share: num(cell(row2, c.sh)),
        cur: (str(cell(row2, c.cur)) || headCur || "").toUpperCase(), net: net || 0, cat: str(cell(row2, c.cat)), client: str(cell(row2, c.cl)),
        ut: str(cell(row2, c.ut)), rs: str(cell(row2, c.rs)) });
    }
    lines.forEach((l) => { l.terr = terr; });
    if (!period) return { kind: "statement", rows: 0, bad: true, note: "Statement period not found" };
    const key = soc + "|" + terr + "|" + period, label = soc + " · " + (terr || "?") + " · " + mLabel(period);
    const m2 = { key, soc, terr, pm: period, headTotal, headCur };
    if (!addStatementLines(key, m2, lines, name)) return { kind: "statement", rows: 0, label, note: "Same statement already loaded, skipped" };
    return { kind: "statement", rows: lines.length, label, check: m2.ok === true ? "match" : m2.ok === false ? "mismatch" : "none",
      note: m2.ok === true ? "Lines match the statement total" : m2.ok === false ? "Lines do not match the statement total" : "", warn: m2.ok === false };
  }

  function parseFlat(aoa, hi, H, name) {
    const ix = (k) => H.indexOf(k);
    const c = { soc: ix("society"), terr: ix("statementterritory"), per: ix("period"), wid: ix("workid"), t: ix("title"), w: ix("writers"), sh: ix("sharepct"), cur: ix("currency"),
      net: ix("net"), cat: ix("category"), cl: ix("client"), ut: ix("useterritory"), rs: ix("remittingsociety"), code: ix("distributioncode") };
    const groups = new Map();
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row) continue;
      const soc = str(cell(row, c.soc)).toUpperCase(), pm = monthOf(cell(row, c.per));
      if (!soc || !pm) continue;
      const terr = terrOf(cell(row, c.terr)) || str(cell(row, c.terr)).toUpperCase();
      const key = soc + "|" + terr + "|" + pm;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ soc, terr, pm, code: str(cell(row, c.code)), wid: str(cell(row, c.wid)), title: str(cell(row, c.t)), writers: str(cell(row, c.w)),
        share: num(cell(row, c.sh)), cur: str(cell(row, c.cur)).toUpperCase(), net: num(cell(row, c.net)) || 0, cat: str(cell(row, c.cat)),
        client: str(cell(row, c.cl)), ut: str(cell(row, c.ut)), rs: str(cell(row, c.rs)) });
    }
    let added = 0, skipped = 0;
    groups.forEach((lines, key) => {
      const p = key.split("|");
      const meta = { key, soc: p[0], terr: p[1], pm: p[2], headTotal: null, headCur: "" };
      if (addStatementLines(key, meta, lines, name)) added += lines.length;
      else skipped++;
    });
    return { kind: "stmtflat", rows: added, note: groups.size + " statements" + (skipped ? " · " + skipped + " already loaded, skipped" : "") };
  }

  function parseCats(aoa, hi, H) {
    const ix = (k) => H.indexOf(k);
    const c = { d: ix("distribution"), lab: ix("distribution label"), ps: ix("period start"), pe: ix("period end"), cat: ix("category"), sub: ix("sub-category"), cur: ix("currency"), amt: ix("amount") };
    const rows = [];
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row) continue;
      const d = str(cell(row, c.d));
      if (!d) continue;
      rows.push({ soc: /amcos/i.test(d) ? "AMCOS" : /apra/i.test(d) ? "APRA" : d, terr: terrOf(d.replace(/^(apra|amcos)\s*/i, "")), label: str(cell(row, c.lab)),
        ps: monthOf(cell(row, c.ps)), pe: monthOf(cell(row, c.pe)), cat: str(cell(row, c.cat)), sub: str(cell(row, c.sub)), cur: str(cell(row, c.cur)).toUpperCase(), amt: num(cell(row, c.amt)) || 0 });
    }
    if (!rows.length) return { kind: "categories", rows: 0, note: "No rows" };
    const key = rows[0].soc + "|" + rows[0].terr + "|" + rows[0].label + "|" + rows[0].ps + "|" + rows[0].pe;
    const label = rows[0].soc + " · " + (rows[0].terr || "?") + " · " + mLabel(rows[0].ps) + "–" + mLabel(rows[0].pe);
    if (S.catKeys.has(key)) return { kind: "categories", rows: 0, label, note: "Already loaded, skipped" };
    S.catKeys.add(key);
    rows.forEach((x) => S.cats.push(x));
    return { kind: "categories", rows: rows.length, label, note: "Category totals only, not used in song views" };
  }

  function parseWorks(aoa, hi, H) {
    const c = { id: col(H, ["winfkey", "work id"]), t: col(H, ["title"]), w: col(H, ["writers"]), d: col(H, ["date reg"]), aw: col(H, ["awaiting reg confirmation"]), is: col(H, ["isrcs"]),
      sh: H.findIndex((h) => SHARE_RE.test(h) && !/^your /.test(h)) };
    if (c.sh < 0) c.sh = H.findIndex((h) => SHARE_RE.test(h));
    let n = 0, upd = 0;
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row) continue;
      const id = str(cell(row, c.id));
      if (!id) continue;
      const raw = str(cell(row, c.w));
      const w = { id, title: str(cell(row, c.t)), writersRaw: raw, writers: raw ? raw.split("/").map((x) => x.trim()).filter(Boolean) : [],
        share: num(cell(row, c.sh)), awaiting: str(cell(row, c.aw)).toUpperCase(), isrcs: str(cell(row, c.is)).split(/[,;\s]+/).map(isrcN).filter(Boolean) };
      if (S.works.has(id)) upd++;
      S.works.set(id, w);
      n++;
    }
    return { kind: "works", rows: n, note: (c.sh < 0 ? "Share column not found" : "") + (upd ? upd + " works replaced by this file" : "") };
  }

  function parsePPCA(aoa, hi, H, name, sheetName) {
    const c = { id: col(H, ["ppl recording id"]), t: col(H, ["recording title"]), i: col(H, ["isrc"]), v: col(H, ["valid"]) };
    let n = 0, dup = 0;
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row) continue;
      const idv = cell(row, c.id), isrc = isrcN(cell(row, c.i)), title = str(cell(row, c.t));
      if (idv == null && !isrc && !title) continue;
      const id = typeof idv === "number" ? String(Math.round(idv)) : str(idv);
      const key = id + "|" + isrc;
      if (S.ppcaKeys.has(key)) { dup++; continue; }
      S.ppcaKeys.add(key);
      S.ppca.push({ id, isrc, title, valid: str(cell(row, c.v)), sheet: sheetName || "" });
      n++;
    }
    return { kind: "ppca", rows: n, note: dup ? dup + " already loaded, skipped" : "" };
  }

  const PARSERS = { distrokid: parseDK, soundcloud: parseSC, statement: parseStatement, stmtflat: parseFlat, categories: parseCats, works: parseWorks, ppca: parsePPCA };
  const TABLE_EXT = /^(csv|tsv|txt|xlsx|xlsm|xls|xlsb|ods)$/;

  function sheetsOf(name, data) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (/^(xlsx|xlsm|xls|xlsb|ods)$/.test(ext)) {
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      return wb.SheetNames.map((sn) => ({ name: sn, aoa: XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false }) }));
    }
    const text = typeof data === "string" ? data : new TextDecoder("utf-8").decode(data);
    const res = Papa.parse(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
    return [{ name: "", aoa: res.data }];
  }

  function ingestTable(name, data) {
    const sheets = sheetsOf(name, data), parts = [];
    sheets.forEach((sh) => {
      const d = detect(sh.aoa);
      if (!d) return;
      parts.push(PARSERS[d.kind](sh.aoa, d.hi, d.H, name, sh.name));
    });
    if (!parts.length) return { name, kind: null, note: "Not recognised" };
    const out = { name, kind: parts[0].kind, rows: sum(parts, (p) => p.rows || 0), label: parts[0].label || "", check: parts[0].check || "",
      warn: parts.some((p) => p.warn), bad: parts.some((p) => p.bad), note: parts.map((p) => p.note).filter(Boolean).join(" · ") };
    if (parts.length > 1) out.note = (out.note ? out.note + " · " : "") + parts.length + " sheets";
    return out;
  }

  /* A .zip is opened in the browser (SheetJS zip reader); every CSV/TSV/XLSX inside is read. */
  function zipEntries(data, skip) {
    const z = XLSX.CFB.read(new Uint8Array(data), { type: "array" });
    const out = [];
    z.FileIndex.forEach((f, i) => {
      if (!f || f.type !== 2 || !f.content || !f.content.length) return;
      const path = z.FullPaths[i] || f.name;
      const base = path.split("/").pop();
      if (/(^|\/)(__MACOSX|\.)/.test(path) || base.charAt(0) === ".") return;
      const ext = (base.split(".").pop() || "").toLowerCase();
      if (!/^(csv|tsv|xlsx|xlsm|xls|xlsb|ods)$/.test(ext)) return;
      if (skip && skip.test(path)) return;
      const u8 = f.content instanceof Uint8Array ? f.content : Uint8Array.from(f.content);
      out.push({ name: base, path, data: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) });
    });
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }

  /* ================================================================== data model (same shape the dashboard screens read) */
  /* Store name -> platform group (row.p). platformOf() below then splits the big DSPs out by raw store. */
  function platGroup(store, dist) {
    const s = String(store || "").toLowerCase();
    if (dist === "soundcloud" || /^soundcloud/.test(s)) return "SoundCloud";
    if (/^(apple music|itunes)/.test(s)) return "Apple Music";
    if (/^(facebook|instagram|meta)/.test(s)) return "Instagram / Facebook / Meta";
    if (/^snap/.test(s)) return "Other social";
    if (/^tiktok/.test(s)) return "TikTok";
    if (/^youtube shorts/.test(s)) return "YouTube Shorts";
    if (/^youtube \(ads\)/.test(s)) return "YouTube Ads";
    if (/^youtube \(contentid\)/.test(s)) return "YouTube Content ID";
    if (/^youtube \(red\)/.test(s)) return "YouTube Red";
    if (/^youtube/.test(s)) return "YouTube";
    if (/^(pandora|iheart)/.test(s)) return "Radio/TV";
    if (/^(lyricfind|musixmatch)/.test(s) || !s || s === "not stated") return "Other / Unknown";
    return "Streaming other";
  }

  function buildData() {
    const rows = [];
    /* ---- store rows (distributor USD) */
    const rec = new Map();
    S.dk.forEach((r) => {
      rows.push({ sm: r.m, d: r.d, sr: r.st, p: platGroup(r.st, r.d), a: r.a, t: r.t, i: r.i, u: r.u, c: r.co, n: r.q, e: r.e, rd: r.rd });
      if (!r.i) return;
      let o = rec.get(r.i);
      if (!o) { o = { isrc: r.i, titles: new Map(), artists: new Map(), upcs: new Set(), usd: 0, units: 0, rows: 0 }; rec.set(r.i, o); }
      o.titles.set(r.t, (o.titles.get(r.t) || 0) + 1);
      o.artists.set(r.a, (o.artists.get(r.a) || 0) + 1);
      if (r.u) o.upcs.add(r.u);
      o.usd += r.e; o.units += r.q; o.rows++;
    });
    /* ---- statement rows (APRA / AMCOS, native AUD / NZD; never in the USD total) */
    S.stm.forEach((l) => {
      rows.push({ sm: l.pm, d: "apra_amcos", soc: l.soc, cur: l.cur || "AUD", en: l.net, wid: l.wid, cl: l.client, t: l.title, i: "", e: 0, n: 0, c: "",
        sr: [l.soc, l.cat, l.client, l.rs].filter(Boolean).join(" · "), p: l.cat, stt: l.terr, dc: l.code });
    });

    /* ---- recordings -> families. Same base title, no version tag = same master (dollars add, codes kept).
       Version-tagged codes (instrumental, acapella, remix, radio edit…) sit under the family and are not added. */
    const artistIsrcs = new Map();
    let topArtist = null;
    const artistUsd = new Map();
    rec.forEach((o) => {
      o.title = topKey(o.titles) || o.isrc;
      o.artist = topKey(o.artists) || "";
      const sv = splitVersion(o.title);
      o.base = sv.base; o.version = sv.version; o.fk = famKey(sv.base);
      /* same-master test keeps the feature credit: "Song (feat. X)" and "Song" are not assumed to be one master */
      o.mk = famKey(o.title.replace(/\s*[\(\[][^\(\)\[\]]*[\)\]]\s*$/g, (m) => (VER_RE.test(m) && !/feat|ft\.|featuring/i.test(m) ? "" : m)));
      if (!artistIsrcs.has(o.artist)) artistIsrcs.set(o.artist, new Set());
      artistIsrcs.get(o.artist).add(o.isrc);
      artistUsd.set(o.artist, (artistUsd.get(o.artist) || 0) + Math.abs(o.usd));
    });
    topArtist = topKey(artistUsd);
    /* Catalogue artists: the top earner plus any artist name on two or more recordings. A recording whose artist field
       names none of them is a guest feature: kept in the money list, marked FEATURE, left out of the owned rank. */
    const owners = [...artistIsrcs.entries()].filter(([a, set]) => a && (a === topArtist || set.size >= 2)).map(([a]) => a.toLowerCase());
    const isOwnerArtist = (a) => { const s = String(a || "").toLowerCase(); return owners.some((o) => s.includes(o)); };

    const groups = new Map();
    rec.forEach((o) => {
      if (!groups.has(o.fk)) groups.set(o.fk, []);
      groups.get(o.fk).push(o);
    });
    const families = [], features = {};
    groups.forEach((list, fk) => {
      const allMains = list.filter((o) => !o.version).sort((a, b) => b.usd - a.usd);
      const vers = list.filter((o) => o.version);
      /* Same master only when the full title (feature credit included) matches the top earner's.
         Other main-titled codes in the group stay as their own rows. */
      const mains = allMains.length ? allMains.filter((o) => o.mk === allMains[0].mk) : [];
      if (mains.length === 1 && !vers.length && !isOwnerArtist(mains[0].artist)) {
        features[mains[0].isrc] = { title: mains[0].title.toUpperCase(), artist: mains[0].artist };
        return;
      }
      if (!mains.length || (mains.length === 1 && !vers.length)) return; /* single recordings stay "solo" */
      const byLabel = new Map();
      vers.sort((a, b) => b.usd - a.usd).forEach((o) => {
        const lab = titleCase(o.version);
        if (!byLabel.has(lab)) byLabel.set(lab, []);
        byLabel.get(lab).push(o.isrc);
      });
      families.push({
        id: "fam-" + fk.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        title: fk,
        main: mains.map((o) => o.isrc),
        sameMaster: mains.length > 1,
        versions: [...byLabel.entries()].map(([label, codes]) => ({ label, codes })),
      });
    });

    /* ---- songs (lookup + titles), works, PPCA */
    const ppcaBy = new Map();
    S.ppca.forEach((p) => { if (p.isrc && !ppcaBy.has(p.isrc)) ppcaBy.set(p.isrc, p); });
    const workIsrcs = new Set();
    S.works.forEach((w) => w.isrcs.forEach((i) => workIsrcs.add(i)));
    const songs = [...rec.values()].map((o) => ({
      title: o.title, isrcs: [o.isrc], artists: o.artist ? [o.artist] : [], upcs: [...o.upcs],
      pplRecordingIds: ppcaBy.has(o.isrc) && ppcaBy.get(o.isrc).id ? [ppcaBy.get(o.isrc).id] : [],
      registrations: { apra: workIsrcs.has(o.isrc), ppca: ppcaBy.has(o.isrc) },
      earningsUsd: o.usd, units: o.units,
    }));
    const works = [...S.works.values()].map((w) => ({ workId: w.id, title: w.title, isrcs: w.isrcs.slice(), writers: w.writers, writersRaw: w.writersRaw, share: w.share, awaiting: w.awaiting }));
    const ppcaRecordings = S.ppca.map((p) => ({ pplRecordingId: p.id, isrc: p.isrc, title: p.title, valid: p.valid }));

    const monthSet = new Set();
    rows.forEach((r) => { if (r.sm) monthSet.add(r.sm); });
    const months = [...monthSet].sort();
    return {
      meta: { monthMin: months[0] || null, monthMax: months[months.length - 1] || null, artist: topArtist || "", storeRows: S.dk.length, statementRows: S.stm.length },
      months, rows, songs, works, ppcaRecordings,
      iswcIndex: { byIsrc: {}, byWorkId: {} },
      families, features,
      has: { store: S.dk.length > 0, works: S.works.size > 0, ppca: S.ppca.length > 0, statements: S.stm.length > 0 },
    };
  }

  /* ================================================================== dashboard (Money · Market · Song · Register) */
  let D = null;
  let FAMILIES = [];
  let FEATURE_BY_ISRC = {};

  /* Platform granularity. Row p = platform group, sr = raw store. Distributor data lumps
     several big DSPs into p="Streaming other"; split those out by sr here.
     Every store row maps to exactly one platform, so per-platform totals add back to the grand total. */
  const SR_PLATFORM = {
    Spotify: "Spotify",
    Tidal: "Tidal",
    "Tidal Video": "Tidal",
    "Amazon Unlimited (Streaming)": "Amazon Music",
    "Amazon Prime (Streaming)": "Amazon Music",
    Deezer: "Deezer",
  };
  const P_PLATFORM = { "Other social": "Snap" }; /* only store in that group is Snap */
  function platformOf(r) {
    if (SR_PLATFORM[r.sr]) return SR_PLATFORM[r.sr];
    if (P_PLATFORM[r.p]) return P_PLATFORM[r.p];
    return r.p || r.sr || "?";
  }
  /* SOCIAL section on Market. Meta revenue = Facebook rows. */
  const SOCIAL_PLATFORMS = new Set(["Instagram / Facebook / Meta", "TikTok", "YouTube Shorts", "Snap"]);
  /* Non-DSP buckets kept in TOP PLATFORMS but only behind "More". */
  const TAIL_PLATFORMS = new Set(["Radio/TV", "Other / Unknown"]);

  const PLAT_COLORS = {
    "Apple Music": "#fc3c44",
    Spotify: "#1db954",
    YouTube: "#ff0000",
    "YouTube Red": "#ff0000",
    "YouTube Music": "#ff0000",
    "YouTube Ads": "#cc0000",
    "YouTube Content ID": "#b31217",
    "YouTube Shorts": "#ff0033",
    Instagram: "#e1306c",
    "Instagram / Facebook / Meta": "linear-gradient(135deg,#1877f2 0%,#8a3ab9 55%,#e1306c 100%)",
    Facebook: "#1877f2",
    SoundCloud: "#ff5500",
    TikTok: "#010101",
    Snap: "#fffc00",
    "Amazon Music": "#25d1da",
    Deezer: "#a238ff",
    Tidal: "#000000",
    Pandora: "#224099",
    "Radio/TV": "#475569",
    "Streaming other": "#334155",
    "Other / Unknown": "#334155",
  };

  let months = [];
  let allMonths = [];
  let songsByIsrc = new Map();
  let worksByIsrc = new Map();
  let worksById = new Map();
  let ppcaByIsrc = new Map();
  let codeToFamily = new Map();
  let allFamilyCodes = new Set();
  let ISWC = { byIsrc: {}, byWorkId: {} };
  let INDEX = [];

  function indexData() {
    FAMILIES = D.families || [];
    FEATURE_BY_ISRC = D.features || {};
    months = D.months.slice();
    songsByIsrc = new Map();
    worksByIsrc = new Map();
    worksById = new Map();
    ppcaByIsrc = new Map();
    codeToFamily = new Map();
    allFamilyCodes = new Set();
    FAMILIES.forEach((f) => {
      f.main.forEach((c) => { codeToFamily.set(c, f); allFamilyCodes.add(c); });
      (f.versions || []).forEach((v) => v.codes.forEach((c) => { codeToFamily.set(c, f); allFamilyCodes.add(c); }));
    });
    (D.songs || []).forEach((s) => {
      (s.isrcs || []).forEach((x) => {
        const code = typeof x === "string" ? x : x.isrc;
        if (!code) return;
        if (!songsByIsrc.has(code)) songsByIsrc.set(code, []);
        songsByIsrc.get(code).push(s);
      });
    });
    (D.works || []).forEach((w) => {
      worksById.set(w.workId, w);
      (w.isrcs || []).forEach((i) => {
        if (!worksByIsrc.has(i)) worksByIsrc.set(i, []);
        worksByIsrc.get(i).push(w);
      });
    });
    (D.ppcaRecordings || []).forEach((r) => { if (r.isrc && !ppcaByIsrc.has(r.isrc)) ppcaByIsrc.set(r.isrc, r); });
    /* ISWC: shown only when a loaded file carries one. None of the supported exports has an ISWC column. */
    ISWC = D.iswcIndex || { byIsrc: {}, byWorkId: {} };
    /* Continuous month list for the From/To selects (data months have gaps). */
    allMonths = [];
    if (months.length) {
      let [y, m] = months[0].split("-").map(Number);
      const end = months[months.length - 1];
      for (let guard = 0; guard < 600; guard++) {
        const k = y + "-" + String(m).padStart(2, "0");
        allMonths.push(k);
        if (k >= end) break;
        m += 1;
        if (m > 12) { m = 1; y += 1; }
      }
    }
    INDEX = buildIndex();
  }

  const state = {
    tab: "money",
    from: null,
    to: null,
    country: "",
    selectedFamily: null,
    selectedIsrc: null,
    mktOpen: null /* country code whose card is open inline in the Market list */,
    mktPlat: null /* platform bar opened inside that card */,
    mktMore: {} /* { plat, social, songs } More expanders inside the open card */,
    mktShowAll: false,
    mktQuery: "",
    marketSong: null /* Market filtered to one family/selection id */,
    barMonth: null,
    headerMini: false,
    quarter: null /* { idx, year } when a payout-quarter chip is active */,
    songView: "months" /* "months" | "quarters" */,
    barMore: false /* inline month/quarter breakdown: show platforms beyond top 5 */,
    preset: "all",
  };

  function money(n) {
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    if (abs > 0 && abs < 0.01) return "$" + v.toFixed(4);
    return "$" + v.toFixed(2);
  }
  function inRange(sm) {
    return sm >= state.from && sm <= state.to;
  }
  function isStore(r) {
    return r.d === "distrokid" || r.d === "soundcloud";
  }
  function titleForIsrc(isrc) {
    const songs = songsByIsrc.get(isrc) || [];
    if (songs.length) {
      const prefer = songs.find((s) => !/\((feat\.|remix|instrumental|acapella)/i.test(s.title)) || songs[0];
      return prefer.title;
    }
    const row = D.rows.find((r) => r.i === isrc && r.t);
    if (row) return row.t;
    const ws = worksByIsrc.get(isrc) || [];
    if (ws[0] && ws[0].title) return ws[0].title;
    return isrc;
  }
  function artistForIsrc(isrc) {
    const songs = songsByIsrc.get(isrc) || [];
    if (songs[0] && songs[0].artists && songs[0].artists.length) return songs[0].artists.join(", ");
    const row = D.rows.find((r) => r.i === isrc && r.a);
    return row ? row.a : "";
  }

  function filteredStoreRows() {
    return D.rows.filter((r) => isStore(r) && inRange(r.sm));
  }

  function aggregateFamilies(rows) {
    const byIsrc = new Map();
    rows.forEach((r) => {
      const isrc = r.i || "";
      if (!isrc) return;
      if (!byIsrc.has(isrc)) byIsrc.set(isrc, { usd: 0, units: 0, dist: new Set() });
      const b = byIsrc.get(isrc);
      b.usd += Number(r.e) || 0;
      b.units += Number(r.n) || 0;
      b.dist.add(r.d);
    });

    const used = new Set();
    const out = [];

    FAMILIES.forEach((f) => {
      let mainUsd = 0,
        mainUnits = 0;
      const mainCodes = f.main.map((c) => {
        used.add(c);
        const b = byIsrc.get(c);
        if (b) {
          mainUsd += b.usd;
          mainUnits += b.units;
        }
        return { code: c, usd: b ? b.usd : 0, units: b ? b.units : 0 };
      });
      const versions = (f.versions || []).map((v) => {
        let usd = 0,
          units = 0;
        v.codes.forEach((c) => {
          used.add(c);
          const b = byIsrc.get(c);
          if (b) {
            usd += b.usd;
            units += b.units;
          }
        });
        return { label: v.label, codes: v.codes.slice(), usd, units };
      });
      out.push({ id: f.id, title: f.title, mainCodes, mainUsd, mainUnits, versions, sameMaster: !!f.sameMaster, feature: false, owned: true });
    });

    Object.keys(FEATURE_BY_ISRC).forEach((isrc) => {
      used.add(isrc);
      const meta = FEATURE_BY_ISRC[isrc];
      const b = byIsrc.get(isrc) || { usd: 0, units: 0 };
      out.push({ id: "feature-" + isrc, title: meta.title, mainCodes: [{ code: isrc, usd: b.usd, units: b.units }], mainUsd: b.usd, mainUnits: b.units,
        versions: [], sameMaster: false, feature: true, owned: false });
    });

    byIsrc.forEach((b, isrc) => {
      if (used.has(isrc)) return;
      if (b.usd === 0 && b.units === 0) return;
      out.push({ id: "solo-" + isrc, title: (titleForIsrc(isrc) || isrc).toUpperCase(), mainCodes: [{ code: isrc, usd: b.usd, units: b.units }], mainUsd: b.usd,
        mainUnits: b.units, versions: [], sameMaster: false, feature: false, owned: true });
    });
    return out;
  }

  function paidTotal(rows) {
    return rows.reduce((s, r) => s + (Number(r.e) || 0), 0);
  }

  function fillMonths() {
    const from = $("#month-from");
    const to = $("#month-to");
    const opts = allMonths.map((m) => `<option value="${m}">${m}</option>`).join("");
    from.innerHTML = opts;
    to.innerHTML = opts;
    if (!allMonths.includes(state.from)) state.from = D.meta.monthMin;
    if (!allMonths.includes(state.to)) state.to = D.meta.monthMax;
    from.value = state.from;
    to.value = state.to;
  }

  /* Header minifies on scroll-down only; scroll-up does not reopen it. */
  let lastY = 0;
  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY || 0;
      if (y > lastY && y > 20 && !state.headerMini) {
        state.headerMini = true;
        const h = $(".app-header");
        if (h) h.classList.add("mini");
      }
      lastY = y;
    },
    { passive: true }
  );

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".bottom-nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    document.querySelectorAll("main .panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + tab));
    /* Song/Market/Register have their own titles: header + lookup show on Money only (phone). Desktop keeps the sidebar. */
    ["money", "market", "song", "register"].forEach((t) => document.body.classList.toggle("tab-" + t, t === tab));
    render();
    window.scrollTo(0, 0);
  }

  function renderMoney() {
    const rows = filteredStoreRows();
    const total = paidTotal(rows);
    $("#paid-amt").textContent = money(total);
    const families = aggregateFamilies(rows);
    const owned = families.filter((f) => f.owned && f.mainUsd > 0).sort((a, b) => b.mainUsd - a.mainUsd);
    const features = families.filter((f) => f.feature);
    let html = "";
    let rank = 0;
    owned.forEach((f) => {
      rank += 1;
      html += famBlock(f, rank);
    });
    features.forEach((f) => {
      if (f.mainUsd <= 0 && !f.mainCodes.length) return;
      html += famBlock(f, null);
    });
    $("#money-list").innerHTML = html || `<div class="empty-hint">No paid families in this range.</div>`;
    $("#money-list").querySelectorAll("[data-fid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedFamily = btn.dataset.fid;
        state.selectedIsrc = btn.dataset.isrc || null;
        switchTab("song");
      });
    });
  }

  function famBlock(f, rank) {
    const tags = [];
    if (f.sameMaster) tags.push(`<span class="tag same">👥 SAME MASTER</span>`);
    let h = `<button type="button" class="fam-row" data-fid="${esc(f.id)}" data-isrc="${esc(f.mainCodes[0].code)}">
      <div class="fam-num">${rank != null ? rank : ""}</div>
      <div>
        <div class="fam-title">${esc(f.title)}</div>
        ${tags.length ? `<div class="fam-tags">${tags.join("")}</div>` : ""}
      </div>
      <div class="fam-earn">${money(f.mainUsd)}</div>
    </button>`;
    if (f.feature) {
      h = `<button type="button" class="fam-row" data-fid="${esc(f.id)}" data-isrc="${esc(f.mainCodes[0].code)}">
        <div class="fam-num"></div>
        <div>
          <div class="fam-title">${esc(f.title)}</div>
          <div class="fam-tags"><span class="tag feature">FEATURE</span></div>
        </div>
        <div class="fam-earn">${f.mainUsd ? money(f.mainUsd) : ""}</div>
      </button>`;
    }
    (f.versions || []).forEach((v) => {
      const show = v.usd > 0 || /remix/i.test(v.label);
      if (!show) return;
      /* "TITLE *remix*" for remixes, the version label for everything else */
      const titleHtml = /^remix$/i.test(v.label) ? `${esc(f.title)} <em>*remix*</em>` : `${esc(v.label)}`;
      h += `<div class="ver-row">
        <div class="fam-num"></div>
        <div class="ver-title">${titleHtml}</div>
        <span class="tag notadd">NOT ADDED</span>
      </div>`;
    });
    return h;
  }

  /* —— Market —— */
  function songTotalsInCountry(rows, country) {
    const scoped = rows.filter((r) => r.c === country);
    const isrcUsd = new Map();
    scoped.forEach((r) => {
      if (!r.i) return;
      isrcUsd.set(r.i, (isrcUsd.get(r.i) || 0) + (Number(r.e) || 0));
    });
    const used = new Set();
    const list = [];
    FAMILIES.forEach((f) => {
      let usd = 0;
      f.main.forEach((c) => {
        used.add(c);
        usd += isrcUsd.get(c) || 0;
      });
      (f.versions || []).forEach((v) => v.codes.forEach((c) => used.add(c)));
      if (usd > 0) list.push({ id: f.id, title: f.title, isrc: f.main[0], usd });
    });
    Object.keys(FEATURE_BY_ISRC).forEach((isrc) => {
      used.add(isrc);
      const usd = isrcUsd.get(isrc) || 0;
      if (usd > 0) list.push({ id: "feature-" + isrc, title: FEATURE_BY_ISRC[isrc].title, isrc, usd });
    });
    isrcUsd.forEach((usd, isrc) => {
      if (used.has(isrc) || usd <= 0) return;
      list.push({ id: "solo-" + isrc, title: titleForIsrc(isrc), isrc, usd });
    });
    list.sort((a, b) => b.usd - a.usd);
    return list;
  }

  /* Country names from the browser (Intl.DisplayNames, offline). OU = rows with no territory -> "Unknown".
     Codes stay visible only in the small badge. */
  const COUNTRY_FIX = { GB: "UK", UK: "UK", US: "USA", OU: "Unknown", ZZ: "Unknown region", OT: "Other (OT)", CD: "DR Congo" };
  let DN = null;
  try { DN = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { DN = null; }
  function countryName(code) {
    if (!code) return "Unknown";
    if (COUNTRY_FIX[code]) return COUNTRY_FIX[code];
    try {
      const n = DN && DN.of(code);
      return n && n !== code ? n : code;
    } catch (e) {
      return code;
    }
  }
  function countryBadge(code) {
    return code === "OU" ? "?" : code;
  }

  /* Short platform labels on narrow phones; full names on wider screens / detail headers (CSS .pl-s/.pl-f). */
  const PLAT_SHORT = {
    "Instagram / Facebook / Meta": "IG/FB/Meta",
    "YouTube Content ID": "YT Content ID",
    "YouTube Red": "YT Red",
    "YouTube Ads": "YT Ads",
    "YouTube Shorts": "YT Shorts",
    "YouTube Music": "YT Music",
    "Other / Unknown": "Other/Unknown",
  };
  function plName(p) {
    const s = PLAT_SHORT[p];
    return s && s !== p ? `<span class="pl-s">${esc(s)}</span><span class="pl-f">${esc(p)}</span>` : esc(p);
  }
  /* Solid colour for bars / dots (gradient + near-black brand colours swapped for something visible on dark). */
  const BAR_COLOR = {
    "Instagram / Facebook / Meta": "#7b5cff",
    TikTok: "#69c9d0",
    Tidal: "#e5e7eb",
    "Streaming other": "#64748b",
    "Other / Unknown": "#64748b",
    "Radio/TV": "#94a3b8",
  };
  function barColor(p) {
    return BAR_COLOR[p] || (PLAT_COLORS[p] && !/gradient/.test(PLAT_COLORS[p]) ? PLAT_COLORS[p] : "#64748b");
  }

  /* Per-country rollup for a set of store rows: usd, platforms (non-social), social, top + social leader. */
  function marketRollup(rows) {
    const m = new Map();
    rows.forEach((r) => {
      const c = r.c || "";
      if (!c) return;
      if (!m.has(c)) m.set(c, { code: c, usd: 0, plats: new Map() });
      const b = m.get(c);
      const v = Number(r.e) || 0;
      b.usd += v;
      const p = platformOf(r);
      b.plats.set(p, (b.plats.get(p) || 0) + v);
    });
    const list = [...m.values()].filter((b) => b.usd > 0);
    list.forEach((b) => {
      const all = [...b.plats.entries()].filter(([, v]) => v > 0).sort((a, c) => c[1] - a[1]);
      b.social = all.filter(([p]) => SOCIAL_PLATFORMS.has(p));
      const dsp = all.filter(([p]) => !SOCIAL_PLATFORMS.has(p) && !TAIL_PLATFORMS.has(p));
      const tail = all.filter(([p]) => TAIL_PLATFORMS.has(p));
      b.platList = dsp.concat(tail); /* streaming/DSP first; Radio/TV + Other last */
      b.top = (dsp[0] || tail[0] || [null])[0];
      b.socialLead = b.social[0] ? b.social[0][0] : null;
    });
    list.sort((a, c) => c.usd - a.usd);
    return list;
  }

  /* Selection id (family / feature- / solo-) -> main ISRCs used for song-scoped market views. */
  function mainCodesFor(fid) {
    if (!fid) return null;
    const def = FAMILIES.find((f) => f.id === fid);
    if (def) return def.main.slice();
    if (fid.startsWith("feature-")) return [fid.slice(8)];
    if (fid.startsWith("solo-")) return [fid.slice(5)];
    return null;
  }
  function titleForSel(fid) {
    const def = FAMILIES.find((f) => f.id === fid);
    if (def) return def.title;
    if (fid && fid.startsWith("feature-")) return (FEATURE_BY_ISRC[fid.slice(8)] || {}).title || fid;
    if (fid && fid.startsWith("solo-")) return titleForIsrc(fid.slice(5));
    return fid || "";
  }
  function rangeShort() {
    const aw = activeQuarterWindow();
    if (aw) return quarterLabel(aw).payout + " payout";
    return state.from === state.to ? shortYm(state.from) : shortYm(state.from) + "–" + shortYm(state.to);
  }

  function socialBadge(b) {
    if (!b.socialLead) return `<span class="sb none">no social $</span>`;
    return `<span class="sb" style="--c:${barColor(b.socialLead)}">${plName(b.socialLead)} leads social</span>`;
  }
  function barRows(list, max, opts) {
    return list
      .map(([p, v]) => {
        const w = Math.max(2, Math.round((v / (max || 1)) * 100));
        const on = opts && opts.openPlat === p;
        const row = `<button type="button" class="bar ${on ? "on" : ""}" data-bplat="${esc(p)}" aria-expanded="${on}">
          <span class="bl">${plName(p)}</span>
          <span class="bt"><i style="width:${w}%;background:${barColor(p)}"></i></span>
          <span class="bv">${money(v)}</span>
        </button>`;
        return on ? row + opts.drill(p) : row;
      })
      .join("");
  }
  function moreRow(id, n, open) {
    return `<button type="button" class="more-row" data-more="${id}" aria-expanded="${open}">${open ? "Less ‹" : `More (${n}) ›`}</button>`;
  }
  function songRowsHtml(songs) {
    return songs
      .map(
        (s, i) =>
          `<button type="button" class="song-rank-row sm" data-fid="${esc(s.id)}" data-isrc="${esc(s.isrc)}"><span class="n">${i + 1}</span><span class="t">${esc(s.title)}</span><span class="$">${money(s.usd)}</span></button>`
      )
      .join("");
  }
  /* Songs for one platform inside the open country (nested drill under the tapped bar). */
  function platSongsHtml(plat, scoped, country) {
    const rows = scoped.filter((r) => platformOf(r) === plat);
    const usd = rows.reduce((s, r) => s + (Number(r.e) || 0), 0);
    const units = rows.reduce((s, r) => s + (Number(r.n) || 0), 0);
    const songs = songTotalsInCountry(rows, country).slice(0, 5);
    return `<div class="plat-songs">
      <div class="ps-h">${esc(plat)} · ${esc(countryName(country))}</div>
      <div class="drill-total"><b>${money(usd)}</b> USD · ${fmtUnits(units)} units (not cash)</div>
      ${songRowsHtml(songs) || `<div class="none2">No songs</div>`}
    </div>`;
  }
  function marketDetailHtml(b, rows) {
    const scoped = rows.filter((r) => r.c === b.code);
    const PL = 5, SL = 3, SG = 5;
    const plats = b.platList, social = b.social;
    const pShow = state.mktMore.plat ? plats : plats.slice(0, PL);
    const sShow = state.mktMore.social ? social : social.slice(0, SL);
    const drill = (p) => platSongsHtml(p, scoped, b.code);
    const pMax = plats[0] ? plats[0][1] : 1;
    const sMax = social[0] ? social[0][1] : 1;
    let h = `<div class="det">
      <div class="dl">PLATFORMS</div>
      ${plats.length ? barRows(pShow, pMax, { openPlat: state.mktPlat, drill }) : '<div class="none2">No platform earnings</div>'}
      ${plats.length > PL ? moreRow("plat", plats.length - PL, !!state.mktMore.plat) : ""}
      <div class="dl">SOCIAL</div>
      ${social.length ? barRows(sShow, sMax, { openPlat: state.mktPlat, drill }) : '<div class="none2">No social earnings in this range</div>'}
      ${social.length > SL ? moreRow("social", social.length - SL, !!state.mktMore.social) : ""}`;
    if (!state.marketSong) {
      const songs = songTotalsInCountry(rows, b.code);
      const sgShow = state.mktMore.songs ? songs : songs.slice(0, SG);
      h += `<div class="dl">TOP SONGS IN ${esc(countryName(b.code).toUpperCase())}</div>
        ${songRowsHtml(sgShow) || '<div class="none2">No songs</div>'}
        ${songs.length > SG ? moreRow("songs", songs.length - SG, !!state.mktMore.songs) : ""}`;
    }
    return h + "</div>";
  }

  function renderMarket(opts) {
    const keepY = opts && opts.keepY ? window.scrollY : null;
    const base = filteredStoreRows();
    const codes = mainCodesFor(state.marketSong);
    const rows = codes ? base.filter((r) => codes.includes(r.i)) : base;
    const list = marketRollup(rows);
    if (state.mktOpen && !list.some((b) => b.code === state.mktOpen)) state.mktOpen = null;
    const q = (state.mktQuery || "").trim().toLowerCase();
    let shown = q
      ? list.filter((b) => countryName(b.code).toLowerCase().includes(q) || b.code.toLowerCase() === q)
      : state.mktShowAll
      ? list
      : list.slice(0, 10);
    if (!q && state.mktOpen && !shown.some((b) => b.code === state.mktOpen)) {
      const hit = list.find((b) => b.code === state.mktOpen);
      if (hit) shown = shown.concat([hit]);
    }

    /* Song picker: families paid in the range (same rollup as Money). */
    const fams = aggregateFamilies(base)
      .filter((f) => f.mainUsd > 0)
      .sort((a, c) => c.mainUsd - a.mainUsd);
    if (state.marketSong && !fams.some((f) => f.id === state.marketSong)) {
      fams.unshift({ id: state.marketSong, title: titleForSel(state.marketSong).toUpperCase(), mainUsd: 0 });
    }
    const songOpts =
      `<option value="">Pick a song ▾</option>` +
      fams.map((f) => `<option value="${esc(f.id)}" ${f.id === state.marketSong ? "selected" : ""}>${esc(f.title)} · ${money(f.mainUsd)}</option>`).join("");

    const rowsHtml = shown
      .map((b) => {
        const open = b.code === state.mktOpen;
        return `<div class="mrow ${open ? "open" : ""}" id="mrow-${esc(b.code)}">
          <button type="button" class="mtop" data-mc="${esc(b.code)}" aria-expanded="${open}">
            <span class="cc">${esc(countryBadge(b.code))}</span>
            <span class="cn">${esc(countryName(b.code))}<small>Top: ${b.top ? plName(b.top) : "—"}</small></span>
            <span class="amt">${money(b.usd)}</span>
          </button>
          <div class="sb-wrap">${socialBadge(b)}</div>
          ${open ? marketDetailHtml(b, rows) : ""}
        </div>`;
      })
      .join("");

    const songTitle = state.marketSong ? titleForSel(state.marketSong) : "";
    const secLab = q
      ? `${shown.length} MATCH${shown.length === 1 ? "" : "ES"}`
      : state.mktShowAll
      ? `ALL ${list.length} MARKETS`
      : `TOP ${Math.min(10, list.length)} MARKETS`;
    $("#panel-market").innerHTML = `
      <h1 class="page-title">Market</h1>
      <div class="mkt-sub">${esc(rangeShort())} · ${list.length} market${list.length === 1 ? "" : "s"} with earnings · USD${songTitle ? ` · <span class="mkt-song">${esc(songTitle)}</span>` : ""}</div>
      <input id="mkt-search" class="search" type="search" placeholder="Search country…" autocomplete="off" enterkeyhint="search" value="${esc(state.mktQuery || "")}" />
      <div class="mkt-filter">
        <button type="button" id="mkt-all" class="${state.marketSong ? "" : "on"}"><span>All songs</span></button>
        <label class="mkt-pick ${state.marketSong ? "on" : ""}"><span class="mkt-pick-txt">${state.marketSong ? "♪ " + esc(songTitle) + " ▾" : "Pick a song ▾"}</span><select id="mkt-song" aria-label="Pick a song">${songOpts}</select></label>
      </div>
      <div class="sec-lab sec-row">${secLab}<span>tap to open</span></div>
      <div class="mkt-markets">${rowsHtml || '<div class="empty-hint">No markets with earnings in this range.</div>'}</div>
      ${!q && list.length > 10 ? `<button type="button" class="more-wide" id="mkt-showall">${state.mktShowAll ? "Show top 10 only ‹" : `Show all ${list.length} markets ›`}</button>` : ""}
    `;

    const panel = $("#panel-market");
    const search = $("#mkt-search");
    search.addEventListener("input", () => {
      state.mktQuery = search.value;
      renderMarket({ keepY: true, refocus: true });
    });
    if (opts && opts.refocus) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
    $("#mkt-all").addEventListener("click", () => {
      state.marketSong = null;
      state.mktPlat = null;
      renderMarket({ keepY: true });
    });
    $("#mkt-song").addEventListener("change", (e) => {
      state.marketSong = e.target.value || null;
      state.mktPlat = null;
      renderMarket({ keepY: true });
    });
    const sa = $("#mkt-showall");
    if (sa)
      sa.addEventListener("click", () => {
        state.mktShowAll = !state.mktShowAll;
        renderMarket({ keepY: true });
      });
    panel.querySelectorAll(".mtop[data-mc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = btn.dataset.mc;
        state.mktOpen = state.mktOpen === c ? null : c; /* same row collapses, another swaps */
        state.mktPlat = null;
        state.mktMore = {};
        renderMarket({ scrollTo: state.mktOpen });
      });
    });
    panel.querySelectorAll(".bar[data-bplat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.dataset.bplat;
        state.mktPlat = state.mktPlat === p ? null : p;
        renderMarket({ keepY: true });
      });
    });
    panel.querySelectorAll(".more-row[data-more]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.more;
        state.mktMore = Object.assign({}, state.mktMore, { [k]: !state.mktMore[k] });
        renderMarket({ keepY: true });
      });
    });
    panel.querySelectorAll(".song-rank-row[data-fid]").forEach((b) => {
      b.addEventListener("click", () => {
        state.selectedFamily = b.dataset.fid;
        state.selectedIsrc = b.dataset.isrc;
        switchTab("song");
      });
    });
    if (keepY != null) window.scrollTo(0, keepY);
    if (opts && opts.scrollTo) {
      const el = document.getElementById("mrow-" + opts.scrollTo);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.top > window.innerHeight * 0.45) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  /* Per-song markets card (Song tab): main codes only, From/To range, distributor USD. */
  function songMarketsHtml(sel) {
    const rows = filteredStoreRows().filter((r) => sel.main.includes(r.i));
    const list = marketRollup(rows);
    if (!list.length) return "";
    const top = list.slice(0, 8);
    return `<div class="sm-head"><span class="card-h">MARKETS FOR THIS SONG</span><span class="sm-meta">${list.length} countr${list.length === 1 ? "y" : "ies"} · ${esc(rangeShort())}</span></div>
      <div class="card sm-card">${top
        .map(
          (b) => `<button type="button" class="crow" data-mc="${esc(b.code)}">
            <b>${esc(countryBadge(b.code))}</b>
            <span class="cn">${esc(countryName(b.code))}<small>Top: ${b.top ? plName(b.top) : "—"}</small></span>
            <span class="r"><span class="amt">${money(b.usd)}</span><em>${b.socialLead ? `<i class="dot" style="background:${barColor(b.socialLead)}"></i>${plName(b.socialLead)}` : "—"}</em></span>
          </button>`
        )
        .join("")}</div>
      <button type="button" class="more-wide" id="song-mkt-all">${list.length > top.length ? `Show all ${list.length} › opens Market for this song` : "Open in Market for this song ›"}</button>`;
  }

  function openIsrc(isrc) {
    const fam = codeToFamily.get(isrc);
    if (fam) {
      state.selectedFamily = fam.id;
    } else if (FEATURE_BY_ISRC[isrc]) {
      state.selectedFamily = "feature-" + isrc;
    } else {
      state.selectedFamily = "solo-" + isrc;
    }
    state.selectedIsrc = isrc;
    switchTab("song");
  }

  function getSelection() {
    const fid = state.selectedFamily;
    if (!fid) return null;
    const def = FAMILIES.find((f) => f.id === fid);
    if (def) return { def, main: def.main.slice(), versions: def.versions || [], feature: false, title: def.title };
    if (fid.startsWith("feature-")) {
      const isrc = fid.replace("feature-", "");
      return { def: null, main: [isrc], versions: [], feature: true, title: (FEATURE_BY_ISRC[isrc] || {}).title || titleForIsrc(isrc) };
    }
    if (fid.startsWith("solo-")) {
      const isrc = fid.replace("solo-", "");
      return { def: null, main: [isrc], versions: [], feature: false, title: titleForIsrc(isrc) };
    }
    return null;
  }

  function monthName(sm) {
    const [y, m] = sm.split("-");
    return MON[Number(m) - 1] + " " + y;
  }

  function aud(n, cur) {
    const v = Number(n) || 0;
    return (cur === "NZD" ? "NZ$" : "A$") + v.toFixed(2);
  }
  function fmtUnits(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-AU");
  }
  function uniq(arr) {
    return [...new Set(arr.filter(Boolean))];
  }
  /* APRA/AMCOS statement buckets kept apart: one entry per society+currency, never summed together. */
  function stmtBuckets(rows) {
    const m = new Map();
    rows.forEach((r) => {
      const k = r.soc + " " + (r.cur || "AUD");
      if (!m.has(k)) m.set(k, { soc: r.soc, cur: r.cur || "AUD", net: 0, lines: 0 });
      const b = m.get(k);
      b.net += Number(r.en) || 0;
      b.lines += 1;
    });
    const order = ["APRA AUD", "AMCOS AUD", "APRA NZD", "AMCOS NZD"];
    return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map((e) => e[1]);
  }
  function stmtText(buckets) {
    return buckets.map((b) => `${esc(b.soc)} ${aud(b.net, b.cur)}${b.cur === "NZD" ? " NZD" : ""}`).join(" · ");
  }
  /* Inline month/quarter breakdown: top 5 platforms, then a "More (n)" row that expands the rest. */
  function platBreakdownHtml(plats, title) {
    const list = [...plats.entries()].sort((a, c) => c[1] - a[1]);
    const CAP = 5;
    const show = state.barMore ? list : list.slice(0, CAP);
    const more =
      list.length > CAP
        ? `<button type="button" class="more-row bd-more" aria-expanded="${state.barMore}">${state.barMore ? "Less ‹" : `More (${list.length - CAP}) ›`}</button>`
        : "";
    return `<div class="month-plats"><h4>${esc(title)} · platforms (USD)</h4>${show
      .map(([p, v]) => `<div class="plat-line"><span>${plName(p)}</span><span>${money(v)}</span></div>`)
      .join("")}${more}</div>`;
  }

  /* —— Song —— */
  function renderSong(opts) {
    const sel = getSelection();
    const panel = $("#panel-song");
    if (!sel) {
      panel.innerHTML = `<div class="empty-hint">Pick a family from Money or Market, or search a code.</div>`;
      return;
    }
    const focus = state.selectedIsrc || sel.main[0];
    const allCodes = sel.main.concat(...(sel.versions || []).map((v) => v.codes));
    const songMeta = (songsByIsrc.get(focus) || [])[0] || (songsByIsrc.get(sel.main[0]) || [])[0];
    const works = [];
    allCodes.forEach((c) =>
      (worksByIsrc.get(c) || []).forEach((w) => {
        if (!works.find((x) => x.workId === w.workId)) works.push(w);
      })
    );
    const ppca = ppcaByIsrc.get(focus) || allCodes.map((c) => ppcaByIsrc.get(c)).find(Boolean);
    const regs = (songMeta && songMeta.registrations) || {};
    const paying = sel.main[0];
    const anchor = sel.main.length > 1 ? sel.main[1] : sel.main[0];
    /* Main work(s): the work carrying the paying ISRC; else any main code; else first family work. */
    let mainWorks = works.filter((w) => (w.isrcs || []).includes(paying));
    if (!mainWorks.length) mainWorks = works.filter((w) => (w.isrcs || []).some((i) => sel.main.includes(i)));
    if (!mainWorks.length && works[0]) mainWorks = [works[0]];
    const gwList = mainWorks.map((w) => w.workId);
    const mainWids = new Set(gwList);
    /* ISWC: by main ISRCs first, then by main GW work id. Nothing shown when absent. */
    let iswcList = uniq(sel.main.flatMap((c) => ISWC.byIsrc[c] || []));
    if (!iswcList.length) iswcList = uniq(gwList.flatMap((g) => ISWC.byWorkId[g] || []));
    /* PPL: PPCA repertoire recording ids for the main codes; fallback to the song's first PPL id. */
    const pplList = uniq(sel.main.map((c) => (ppcaByIsrc.get(c) || {}).pplRecordingId).map((x) => (x ? String(x) : "")));
    if (!pplList.length && songMeta && songMeta.pplRecordingIds && songMeta.pplRecordingIds[0])
      pplList.push(String(songMeta.pplRecordingIds[0]));
    if (!pplList.length && ppca && ppca.pplRecordingId) pplList.push(String(ppca.pplRecordingId));

    const rowsAll = D.rows.filter((r) => inRange(r.sm));
    const storeMain = rowsAll.filter((r) => isStore(r) && sel.main.includes(r.i));
    const mainUsd = storeMain.reduce((s, r) => s + (Number(r.e) || 0), 0);
    const mainUnits = storeMain.reduce((s, r) => s + (Number(r.n) || 0), 0);

    const verRows = (sel.versions || []).map((v) => {
      const usd = rowsAll
        .filter((r) => isStore(r) && v.codes.includes(r.i))
        .reduce((s, r) => s + (Number(r.e) || 0), 0);
      return { ...v, usd };
    });

    const apraOn = !!(regs.apra || works.length);
    const amcosRows = rowsAll.filter((r) => r.soc === "AMCOS" && (sel.main.includes(r.i) || (r.wid && works.some((w) => w.workId === r.wid))));
    const amcosOn = amcosRows.length > 0 || apraOn;
    const ppcaOn = !!(regs.ppca || ppca);
    const mlcOn = amcosRows.some((r) => /Mechanical Licensing Collective|MLC/i.test((r.cl || "") + (r.sr || "")));
    const mlcFamily = rowsAll.some(
      (r) =>
        r.soc === "AMCOS" &&
        /Mechanical Licensing Collective|MLC/i.test((r.cl || "") + (r.sr || "")) &&
        (works.some((w) => w.workId === r.wid) || allCodes.includes(r.i))
    );

    const chips = [
      { label: "APRA registered", ok: apraOn },
      { label: "AMCOS registered", ok: amcosOn },
      { label: "PPCA registered", ok: ppcaOn },
      { label: "Songtrust empty", ok: false, warn: true },
      { label: "MLC via AMCOS", ok: mlcOn || mlcFamily },
    ];

    /* —— Royalties over time —— distributor USD by sale month (main codes, From/To range) */
    const songStmtAll = D.rows.filter((r) => r.soc && ((r.wid && mainWids.has(r.wid)) || (r.i && sel.main.includes(r.i))));
    const stmtScoped = songStmtAll.filter(stmtInScope);

    const groups = new Map();
    storeMain.forEach((r) => {
      let key, lab, sub, win = null;
      if (state.songView === "quarters") {
        win = quarterForUsageMonth(r.sm);
        if (!win) return;
        key = "q" + win.payout;
        const ql = quarterLabel(win);
        lab = ql.payout;
        sub = ql.use + " use";
      } else {
        key = r.sm;
        lab = monthName(r.sm);
        sub = "";
      }
      if (!groups.has(key)) groups.set(key, { key, lab, sub, win, sort: win ? win.payout : r.sm, cash: 0, units: 0, plats: new Map() });
      const g = groups.get(key);
      g.cash += Number(r.e) || 0;
      g.units += Number(r.n) || 0;
      const pk = platformOf(r);
      g.plats.set(pk, (g.plats.get(pk) || 0) + (Number(r.e) || 0));
    });
    const glist = [...groups.values()].sort((a, b) => (a.sort < b.sort ? 1 : -1));
    const maxCash = Math.max(0.000001, ...glist.map((g) => g.cash));
    const maxUnits = Math.max(0.000001, ...glist.map((g) => g.units));
    const shown = glist; /* pinned panel scrolls internally — show every month/quarter, newest first */
    const qMode = state.songView === "quarters";

    const bars = shown
      .map((g) => {
        const cw = Math.max(2, Math.round((g.cash / maxCash) * 70));
        const uw = Math.max(2, Math.round((g.units / maxUnits) * 30));
        const on = state.barMonth === g.key;
        let extra = "";
        if (qMode && g.win) {
          const partial = g.win.from < state.from || g.win.to > state.to;
          const st = stmtBuckets(songStmtAll.filter((r) => r.sm === g.win.payout));
          extra =
            (partial ? `<span class="rt-sub warnish">partial — range cuts this quarter</span>` : "") +
            (st.length ? `<span class="rt-sub aud">${esc(g.lab)} statement: ${stmtText(st)}</span>` : "");
        }
        return `<button type="button" class="hbar-row ${on ? "on" : ""} ${qMode ? "q" : ""}" data-m="${esc(g.key)}" aria-expanded="${on}">
          <span class="hbar-lab">${esc(g.lab)}${g.sub ? `<small>${esc(g.sub)}</small>` : ""}</span>
          <span class="hbar-track"><span class="hbar-cash" style="width:${cw}%"></span><span class="hbar-units" style="width:${uw}%"></span></span>
          <span class="hbar-val">${money(g.cash)}<small>${fmtUnits(g.units)} u</small></span>
          ${extra ? `<span class="hbar-extra">${extra}</span>` : ""}
        </button>${on ? platBreakdownHtml(g.plats, qMode ? `${g.lab} · ${g.sub}` : g.lab) : ""}`;
      })
      .join("");

    const aw = activeQuarterWindow();
    const rangeLab = aw
      ? `${quarterLabel(aw).payout} payout · ${quarterLabel(aw).use} use`
      : state.from === state.to
      ? monthName(state.from)
      : `${shortYm(state.from)} – ${shortYm(state.to)}`;
    const stB = stmtBuckets(stmtScoped);
    const stScopeLab = aw ? `${quarterLabel(aw).payout} stmt` : "in range";

    const famMembers = [
      `<div class="fam-member main">
        <div class="fam-ico main">♪</div>
        <div class="fm-l"><div class="fm-t">Main</div><div class="fm-n">instrumental not added into main</div></div>
        <div class="fm-$">${money(mainUsd)}</div>
      </div>`,
    ];
    verRows.forEach((v) => {
      const ico = /acapella/i.test(v.label) ? "🎤" : "〰";
      famMembers.push(`<div class="fam-member">
        <div class="fam-ico ver">${ico}</div>
        <div class="fm-l"><div class="fm-t">${esc(v.label)}</div><div class="fm-n">${esc(v.codes.join(", "))}</div></div>
        <div class="fm-$">${money(v.usd)}</div>
      </div>`);
    });

    const codeRows = [
      ["isrc", [paying]],
      ["anchor", [anchor]],
      ["gw", gwList],
      ["iswc", iswcList],
      ["ppl", pplList],
    ]
      .filter(([k, v]) => v.length || k === "gw" || k === "ppl")
      .map(([k, v]) => `<div class="code-line"><span class="ck">${k}</span><span class="cv">${esc(v.length ? v.join(", ") : "—")}</span></div>`)
      .join("");

    panel.innerHTML = `
      <button type="button" id="song-back" class="back-btn">‹ Back</button>
      <h1 class="song-title">${esc(sel.title)}${sel.feature ? ' <span class="tag feature">FEATURE</span>' : ""}</h1>
      <div class="chips">${chips
        .map((c) => {
          if (c.warn || !c.ok) {
            if (c.label.includes("Songtrust"))
              return `<span class="chip warn"><span class="dot">!</span>${esc(c.label)}</span>`;
            if (!c.ok) return `<span class="chip warn"><span class="dot">!</span>${esc(c.label.replace(" registered", " empty").replace(" via AMCOS", " empty"))}</span>`;
          }
          return `<span class="chip ok"><span class="dot">✓</span>${esc(c.label)}</span>`;
        })
        .join("")}</div>

      <div class="song-grid">
      <div class="song-a">
      ${songMarketsHtml(sel, state.selectedFamily)}

      <div class="card codes-card">
        <div class="card-h">CODES</div>
        ${codeRows}
      </div>

      <div class="card">
        <div class="card-h">FAMILY</div>
        ${famMembers.join("")}
      </div>
      </div>
      <div class="song-b">
      <section class="card rt-pinned rt-inpage" id="rt-card" aria-label="Royalties over time">
        ${`<div class="rt-sticky">
        <div class="rt-head">
          <div class="rt-title"><span class="card-h">ROYALTIES OVER TIME</span></div>
          <div class="seg" role="tablist">
            <button type="button" data-view="months" class="${qMode ? "" : "on"}"><span>Months</span></button>
            <button type="button" data-view="quarters" class="${qMode ? "on" : ""}"><span>Payout quarters</span></button>
          </div>
        </div>
        <div class="rt-total"><b>${money(mainUsd)}</b> USD · ${fmtUnits(mainUnits)} units · <span>${esc(rangeLab)}</span></div>
        ${stB.length ? `<div class="rt-stmt">APRA/AMCOS ${esc(stScopeLab)} <em>(AUD, separate)</em>: ${stmtText(stB)}</div>` : ""}
        <div class="bars-legend"><span><i class="c"></i>Cash USD</span><span><i class="u"></i>Units</span><span class="tap">tap a row for platforms</span></div>
        </div>
        <div class="hbar-list">${bars || `<div class="empty-hint sm">No distributor earnings for the main codes in ${esc(rangeLab)}.</div>`}</div>`
        }
      </section>
      </div>
      </div>
    `;

    $("#song-back").addEventListener("click", () => switchTab("money"));
    panel.classList.remove("rt-is-min");
    const smAll = $("#song-mkt-all");
    const goMarket = (code) => {
      state.marketSong = state.selectedFamily;
      state.mktOpen = code || null;
      state.mktPlat = null;
      state.mktMore = {};
      state.mktQuery = "";
      switchTab("market");
      if (code) {
        const el = document.getElementById("mrow-" + code);
        if (el) el.scrollIntoView({ block: "start" });
      }
    };
    if (smAll) smAll.addEventListener("click", () => goMarket(null));
    panel.querySelectorAll(".sm-card .crow[data-mc]").forEach((b) => b.addEventListener("click", () => goMarket(b.dataset.mc)));
    const bdMore = panel.querySelector(".bd-more");
    if (bdMore)
      bdMore.addEventListener("click", () => {
        state.barMore = !state.barMore;
        const pinNow = $("#rt-card");
        renderSong({ pinScroll: pinNow ? pinNow.scrollTop : 0, reveal: !state.barMore });
        if (state.barMore) {
          /* bring the newly listed platforms into view: 5th line just under the sticky header */
          const p2 = $("#rt-card");
          const lines = p2 ? p2.querySelectorAll(".month-plats .plat-line") : [];
          const head = p2 && p2.querySelector(".rt-sticky");
          if (lines[4]) p2.scrollTo({ top: Math.max(0, lines[4].offsetTop - (head ? head.offsetHeight : 0) - 6), behavior: "smooth" });
        }
      });
    const pin = $("#rt-card");
    /* keep the pinned panel's internal scroll across re-renders, then reveal the expanded row */
    if (pin && opts && typeof opts.pinScroll === "number") pin.scrollTop = opts.pinScroll;
    if (pin && opts && opts.reveal) {
      const row = pin.querySelector(".hbar-row.on");
      if (row) {
        const head = pin.querySelector(".rt-sticky");
        const headH = head ? head.offsetHeight : 0;
        const det = row.nextElementSibling && row.nextElementSibling.classList.contains("month-plats") ? row.nextElementSibling : null;
        const top = row.offsetTop - headH - 4;
        const bottom = (det || row).offsetTop + (det || row).offsetHeight;
        const viewTop = pin.scrollTop, viewBot = pin.scrollTop + pin.clientHeight;
        let target = viewTop;
        if (bottom > viewBot) target = bottom - pin.clientHeight + 6;
        if (top < target || top < viewTop) target = Math.min(target, top);
        if (target !== viewTop) pin.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
      }
    }
    panel.querySelectorAll(".hbar-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.barMonth = btn.dataset.m === state.barMonth ? null : btn.dataset.m;
        state.barMore = false;
        const pinNow = $("#rt-card");
        renderSong({ pinScroll: pinNow ? pinNow.scrollTop : 0, reveal: !!state.barMonth });
      });
    });
    panel.querySelectorAll(".seg button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.songView = btn.dataset.view;
        state.barMonth = null;
        state.barMore = false;
        renderSong();
      });
    });
  }


  /* —— Register —— derived from the loaded files only (store rows, APRA Works List, PPCA repertoire). */
  function paidIsrcs() {
    const s = new Set();
    D.rows.forEach((r) => {
      if (isStore(r) && r.i && (Number(r.e) || 0) !== 0) s.add(r.i);
    });
    return s;
  }

  function registerLists() {
    const paid = paidIsrcs();
    const seenStore = new Set();
    D.rows.forEach((r) => { if (isStore(r) && r.i) seenStore.add(r.i); });
    const works = D.works || [];
    const hasWorks = !!(D.has && D.has.works);
    const hasPpca = !!(D.has && D.has.ppca);
    const hasStore = !!(D.has && D.has.store);
    const holes = [], reserved = [], old = [];
    const seen = new Set();
    const push = (list, code, note) => {
      const k = code + "|" + note;
      if (seen.has(k)) return;
      seen.add(k);
      list.push({ code, note });
    };
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
    const paidList = [...paid].sort((a, b) => {
      const ua = sum(D.rows.filter((r) => isStore(r) && r.i === a), (r) => r.e || 0);
      const ub = sum(D.rows.filter((r) => isStore(r) && r.i === b), (r) => r.e || 0);
      return ub - ua;
    });
    if (hasWorks && hasStore) paidList.forEach((i) => { if (!worksByIsrc.has(i)) push(holes, i, clean(titleForIsrc(i)) + " • paid, no APRA work"); });
    if (hasWorks) {
      works.forEach((w) => { if (!(w.isrcs || []).length) push(holes, w.workId, clean(w.title) + " • work has no ISRC"); });
      works.forEach((w) => {
        if ((w.writers || []).length === 1 && w.share != null && w.share > 0 && w.share < 100)
          push(holes, w.workId, clean(w.title) + " • one writer, share " + w.share + "%");
      });
      worksByIsrc.forEach((ws, i) => { if (ws.length > 1) push(holes, i, clean(ws[0].title) + " • ISRC on " + ws.length + " works"); });
    }
    if (hasPpca && hasStore) paidList.forEach((i) => { if (!ppcaByIsrc.has(i)) push(holes, i, clean(titleForIsrc(i)) + " • paid, not in PPCA"); });
    if (hasWorks) {
      works.forEach((w) => {
        const codes = w.isrcs || [];
        const anyPaid = codes.some((i) => paid.has(i));
        codes.forEach((i) => {
          if (paid.has(i)) return;
          if (anyPaid) push(old, i, clean(w.title) + " • unpaid");
          else if (!seenStore.has(i) && !ppcaByIsrc.has(i)) push(reserved, i, clean(w.title) + " • no master");
        });
      });
      old.sort((a, b) => a.code.localeCompare(b.code));
    }
    return { holes, reserved, old, hasWorks, hasPpca, hasStore };
  }

  function renderRegister() {
    const L = registerLists();
    function block(title, items, need) {
      const body = items.length
        ? items.map((it) => `<div class="reg-item"><div class="reg-isrc">${esc(it.code)}</div><div class="reg-note">${esc(it.note)}</div></div>`).join("")
        : need
        ? `<div class="reg-need">${esc(need)}</div>`
        : `<div class="reg-empty">None found</div>`;
      return `<div class="reg-sec"><div class="reg-h">${esc(title)}</div>${body}</div>`;
    }
    const needWorks = L.hasWorks ? "" : "Add the APRA Works List to check this";
    $("#panel-register").innerHTML = `
      <h1 class="page-title">Register</h1>
      <hr class="reg-rule" />
      <div class="reg-cols">
      ${block("HOLES", L.holes, L.hasWorks || L.hasPpca ? "" : "Add the APRA Works List or PPCA repertoire to check this")}
      ${block("RESERVED", L.reserved, needWorks)}
      ${block("OLD CODES", L.old, needWorks)}
      </div>
    `;
  }

  /* Lookup */
  function buildIndex() {
    const items = [];
    const seen = new Set();
    function add(label, meta, payload) {
      const k = label + "|" + (payload.isrc || "") + "|" + (payload.family || "");
      if (seen.has(k)) return;
      seen.add(k);
      items.push({ label, meta, ...payload });
    }
    FAMILIES.forEach((f) => {
      add(f.title, f.main.join(" · "), { family: f.id, isrc: f.main[0] });
      f.main.forEach((c) => add(c, f.title, { family: f.id, isrc: c }));
      (f.versions || []).forEach((v) => v.codes.forEach((c) => add(c, f.title + " · " + v.label, { family: f.id, isrc: c })));
    });
    Object.keys(FEATURE_BY_ISRC).forEach((isrc) => {
      add(FEATURE_BY_ISRC[isrc].title, isrc + " · FEATURE", { family: "feature-" + isrc, isrc });
      add(isrc, FEATURE_BY_ISRC[isrc].title, { family: "feature-" + isrc, isrc });
    });
    (D.songs || []).forEach((s) => {
      const codes = (s.isrcs || []).map((x) => x.isrc || x);
      const primary = codes[0];
      if (!primary) return;
      const inFam = codes.some((c) => allFamilyCodes.has(c) || FEATURE_BY_ISRC[c]);
      const fid = inFam ? (codeToFamily.get(primary) ? codeToFamily.get(primary).id : "feature-" + primary) : "solo-" + primary;
      if (!inFam) {
        add(s.title, codes.join(" · "), { family: fid, isrc: primary });
        codes.forEach((c) => add(c, s.title, { family: fid, isrc: c }));
      }
      (s.upcs || []).forEach((u) => add(String(u), s.title + " · UPC", { family: fid, isrc: primary }));
      (s.pplRecordingIds || []).forEach((p) => add(String(p), s.title + " · PPL", { family: fid, isrc: primary }));
    });
    (D.works || []).forEach((w) => {
      if (!w.workId) return;
      const isrc = (w.isrcs || [])[0];
      const fam = isrc && codeToFamily.get(isrc);
      add(w.workId, (w.title || "") + " · GW", { family: fam ? fam.id : isrc ? (FEATURE_BY_ISRC[isrc] ? "feature-" : "solo-") + isrc : null, isrc });
    });
    return items;
  }

  function onLookup(q) {
    const box = $("#suggest");
    if (!D || !q || q.length < 2) {
      box.classList.remove("open");
      box.innerHTML = "";
      return;
    }
    const qq = q.trim().toUpperCase();
    const hits = INDEX.filter((it) => (it.label + " " + it.meta).toUpperCase().includes(qq)).slice(0, 12);
    if (!hits.length) {
      box.classList.remove("open");
      return;
    }
    box.classList.add("open");
    box.innerHTML = hits
      .map((h, i) => `<button type="button" data-i="${i}"><div class="t">${esc(h.label)}</div><div class="m">${esc(h.meta)}</div></button>`)
      .join("");
    box.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const h = hits[Number(btn.dataset.i)];
        $("#lookup-input").value = h.label;
        box.classList.remove("open");
        if (h.family) {
          state.selectedFamily = h.family;
          state.selectedIsrc = h.isrc || null;
          switchTab("song");
        } else if (h.isrc) openIsrc(h.isrc);
      });
    });
  }

  function render() {
    if (!D) return;
    if (state.tab === "money") renderMoney();
    else if (state.tab === "market") renderMarket();
    else if (state.tab === "song") renderSong();
    else if (state.tab === "register") renderRegister();
  }

  /* —— APRA AMCOS payout quarters ——
     APRA domestic pays Feb/May/Aug/Nov; AMCOS pays at the same month-end. Each payout covers a calendar usage
     quarter ~6 months earlier. QUARTERS is the single place to reconfigure:
       payout = payout month (1–12) in the year picked in #q-year; label = chip title; sub = chip sub-line
       useStart / useEnd = usage window as month offsets from the payout month.
     A chip sets From/To to the usage window (drives distributor USD by sale month).
     APRA/AMCOS statement lines are matched on the payout month itself while a chip is active (stmtInScope).
     Never summed into USD. */
  const QUARTERS = [
    { payout: 2, label: "Feb", sub: "Jul–Sep", useStart: -7, useEnd: -5 },
    { payout: 5, label: "May", sub: "Oct–Dec", useStart: -7, useEnd: -5 },
    { payout: 8, label: "Aug", sub: "Jan–Mar", useStart: -7, useEnd: -5 },
    { payout: 11, label: "Nov", sub: "Apr–Jun", useStart: -7, useEnd: -5 },
  ];
  const QUARTER_HINT = "Paid Feb/May/Aug/Nov · covers usage ~6 mo earlier";
  const MON3 = MON;

  function ymAdd(year, month, off) {
    const idx = year * 12 + (month - 1) + off;
    return Math.floor(idx / 12) + "-" + String((idx % 12) + 1).padStart(2, "0");
  }
  function quarterWindow(q, year) {
    return { q, year, payout: ymAdd(year, q.payout, 0), from: ymAdd(year, q.payout, q.useStart), to: ymAdd(year, q.payout, q.useEnd) };
  }
  function quarterForUsageMonth(sm) {
    const y = Number(sm.slice(0, 4));
    for (let yy = y - 2; yy <= y + 2; yy++) {
      for (const q of QUARTERS) {
        const w = quarterWindow(q, yy);
        if (sm >= w.from && sm <= w.to) return w;
      }
    }
    return null;
  }
  function shortYm(ym) {
    if (!ym) return "";
    return MON3[Number(ym.slice(5, 7)) - 1] + " " + ym.slice(2, 4);
  }
  function quarterLabel(w) {
    const f = w.from, t = w.to;
    const use =
      f.slice(0, 4) === t.slice(0, 4)
        ? MON3[Number(f.slice(5, 7)) - 1] + "–" + MON3[Number(t.slice(5, 7)) - 1] + " " + t.slice(2, 4)
        : shortYm(f) + "–" + shortYm(t);
    return { payout: shortYm(w.payout), use };
  }
  function activeQuarterWindow() {
    return state.quarter ? quarterWindow(QUARTERS[state.quarter.idx], state.quarter.year) : null;
  }
  function stmtInScope(r) {
    const w = activeQuarterWindow();
    return w ? r.sm === w.payout : inRange(r.sm);
  }
  function ensureMonthOption(sel, m) {
    if (![...sel.options].some((o) => o.value === m)) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      const before = [...sel.options].find((x) => x.value > m);
      sel.insertBefore(o, before || null);
    }
  }
  function clearQuarter() {
    state.quarter = null;
    document.querySelectorAll(".q-chips button").forEach((b) => b.classList.remove("on"));
  }
  function setQuarter(idx) {
    const year = parseInt($("#q-year").value, 10);
    if (!year) return;
    const w = quarterWindow(QUARTERS[idx], year);
    state.quarter = { idx, year };
    state.preset = null;
    state.from = w.from;
    state.to = w.to;
    document.querySelectorAll(".presets button").forEach((b) => b.classList.remove("on"));
    document.querySelectorAll(".q-chips button").forEach((b) => b.classList.toggle("on", Number(b.dataset.qi) === idx));
    ensureMonthOption($("#month-from"), state.from);
    ensureMonthOption($("#month-to"), state.to);
    $("#month-from").value = state.from;
    $("#month-to").value = state.to;
    render();
  }
  function fillQuarters() {
    const sel = $("#q-year");
    const chips = document.querySelector(".q-chips");
    chips.innerHTML = QUARTERS.map(
      (q, i) => `<button type="button" data-qi="${i}" title="${esc(q.label)} payout · ${esc(q.sub)} use"><b>${esc(q.label)}</b><span>${esc(q.sub)}<i class="q-use"> use</i></span></button>`
    ).join("");
    chips.style.gridTemplateColumns = `repeat(${QUARTERS.length}, 1fr)`;
    $("#q-hint").textContent = QUARTER_HINT;
    chips.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setQuarter(Number(b.dataset.qi))));
    let html = "";
    if (months.length) {
      const first = parseInt(months[0].slice(0, 4), 10);
      /* a usage month late in the last data year is paid out the following year */
      const last = parseInt(months[months.length - 1].slice(0, 4), 10) + (Number(months[months.length - 1].slice(5, 7)) >= 7 ? 1 : 0);
      for (let y = last; y >= first; y--) html += `<option value="${y}">${y}</option>`;
    }
    sel.innerHTML = html;
    if (months.length) sel.value = String(parseInt(months[months.length - 1].slice(0, 4), 10));
  }

  function setPreset(name) {
    clearQuarter();
    state.preset = name;
    document.querySelectorAll(".presets button").forEach((b) => b.classList.toggle("on", b.dataset.preset === name));
    if (!months.length) {
      state.from = state.to = null;
    } else if (name === "all") {
      state.from = D.meta.monthMin;
      state.to = D.meta.monthMax;
    } else if (name === "12") {
      const i = allMonths.length - 1;
      state.to = allMonths[i];
      state.from = allMonths[Math.max(0, i - 11)];
    } else if (name === "year") {
      state.to = D.meta.monthMax;
      state.from = D.meta.monthMax.slice(0, 4) + "-01";
      if (state.from < D.meta.monthMin) state.from = D.meta.monthMin;
    }
    if (state.from) {
      $("#month-from").value = state.from;
      $("#month-to").value = state.to;
    }
    render();
  }

  /* ================================================================== loading files */
  const ui = {
    loader: $("#loader"),
    drop: $("#drop"),
    status: $("#status"),
    picker: $("#picker"),
    sheet: $("#files-sheet"),
    list: $("#files-list"),
    overlay: $("#drop-overlay"),
  };
  let busy = false;

  function setStatus(msg, bad) {
    ui.status.textContent = msg || "";
    ui.status.classList.toggle("bad", !!bad);
  }

  function setData() {
    D = buildData();
    indexData();
    const has = D.has;
    if (!has.store && !has.statements && !has.works && !has.ppca) {
      D = null;
      showLoader();
      setStatus("No supported file found. Check the list below.", true);
      return;
    }
    document.body.classList.remove("no-data");
    const artist = (D.meta.artist || "").toUpperCase();
    $("#brand-artist").textContent = artist;
    $("#brand-artist").hidden = !artist;
    $("#brand-dot").hidden = !artist;
    $("#demo-tag").hidden = !S.demo;
    fitBrand();
    if (D.meta.monthMax) $("#preset-year").textContent = D.meta.monthMax.slice(0, 4);
    state.selectedFamily = null;
    state.selectedIsrc = null;
    state.marketSong = null;
    state.mktOpen = null;
    state.mktPlat = null;
    state.mktMore = {};
    state.mktQuery = "";
    state.barMonth = null;
    $("#lookup-input").value = "";
    fillMonths();
    fillQuarters();
    state.tab = "money";
    setPreset("all");
    switchTab("money");
    renderFiles();
  }

  /* One-line header like the reference: a long artist name steps the title down a size before it wraps. */
  function fitBrand() {
    const t = $(".brand-title");
    t.classList.remove("fit");
    const lh = parseFloat(getComputedStyle(t).lineHeight) || 20;
    if (t.offsetHeight > lh * 1.5) t.classList.add("fit");
  }
  window.addEventListener("resize", () => { if (D) fitBrand(); });

  function showLoader() {
    document.body.classList.add("no-data");
    $("#brand-artist").hidden = true;
    $("#brand-dot").hidden = true;
    $("#demo-tag").hidden = true;
  }

  function fileLine(f) {
    const kind = f.kind ? KIND_LABEL[f.kind] || f.kind : "Not recognised";
    const bits = [];
    if (f.rows != null && f.kind) bits.push(int(f.rows) + (f.rows === 1 ? " row" : " rows"));
    if (f.label) bits.push(f.label);
    if (f.check) bits.push(f.check);
    if (f.note) bits.push(f.note);
    const cls = !f.kind || f.bad ? "f bad" : f.warn ? "f warn" : "f";
    return `<div class="${cls}"><b>${esc(f.name)}</b><span>${esc(kind)}${bits.length ? " · " + esc(bits.join(" · ")) : ""}</span></div>`;
  }
  function renderFiles() {
    ui.list.innerHTML = S.files.length ? S.files.map(fileLine).join("") : `<div class="f"><span>No files loaded.</span></div>`;
  }

  async function readEntry(name, data, out) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "zip") {
      let entries;
      try {
        entries = zipEntries(data);
      } catch (e) {
        out.push({ name, kind: null, note: "Could not open zip" });
        return;
      }
      if (!entries.length) out.push({ name, kind: null, note: "No CSV, TSV or spreadsheet inside" });
      for (const en of entries) {
        await tick();
        try {
          const r = ingestTable(en.name, en.data);
          r.name = name + " › " + en.path.replace(/^Root Entry\//, "");
          out.push(r);
        } catch (e) {
          out.push({ name: name + " › " + en.path, kind: null, note: "Could not read" });
        }
      }
      return;
    }
    if (!TABLE_EXT.test(ext)) {
      out.push({ name, kind: null, note: "Not a CSV, TSV, spreadsheet or zip" });
      return;
    }
    try {
      out.push(ingestTable(name, data));
    } catch (e) {
      out.push({ name, kind: null, note: "Could not read" });
    }
  }

  async function addFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length || busy) return;
    busy = true;
    if (S.demo) resetFiles(); /* your own files replace the demo */
    setStatus("Reading " + files.length + " file" + (files.length === 1 ? "" : "s") + "…");
    await tick();
    const out = [];
    for (const f of files) {
      const buf = await f.arrayBuffer();
      await readEntry(f.name, buf, out);
    }
    out.forEach((r) => S.files.push(r));
    const ok = out.filter((r) => r.kind).length;
    setStatus(ok ? "" : "No supported file found in " + files.map((f) => f.name).join(", "), !ok);
    busy = false;
    renderFiles();
    if (S.files.some((r) => r.kind)) setData();
  }

  function demoBytes() {
    const b64 = window.RD_DEMO_ZIP || "";
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  async function loadDemo() {
    if (busy) return;
    busy = true;
    resetFiles();
    setStatus("Loading demo data…");
    await tick();
    const u8 = demoBytes();
    const entries = zipEntries(u8.buffer, /\/csv\//);
    for (const en of entries) {
      await tick();
      const r = ingestTable(en.name, en.data);
      r.name = en.path.replace(/^Root Entry\//, "").replace(/^[^/]+\//, "");
      S.files.push(r);
    }
    S.demo = true;
    busy = false;
    setStatus("");
    renderFiles();
    setData();
  }

  function downloadDemoZip(e) {
    e.preventDefault();
    const blob = new Blob([demoBytes()], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jeremy-legal-demo-pack.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function openSheet() { renderFiles(); ui.sheet.hidden = false; }
  function closeSheet() { ui.sheet.hidden = true; }

  /* ================================================================== events */
  $("#month-from").addEventListener("change", (e) => {
    state.from = e.target.value;
    if (state.from > state.to) {
      state.to = state.from;
      $("#month-to").value = state.to;
    }
    document.querySelectorAll(".presets button").forEach((b) => b.classList.remove("on"));
    clearQuarter();
    render();
  });
  $("#month-to").addEventListener("change", (e) => {
    state.to = e.target.value;
    if (state.to < state.from) {
      state.from = state.to;
      $("#month-from").value = state.from;
    }
    document.querySelectorAll(".presets button").forEach((b) => b.classList.remove("on"));
    clearQuarter();
    render();
  });
  $("#q-year").addEventListener("change", () => {
    if (state.quarter) setQuarter(state.quarter.idx);
  });
  document.querySelectorAll(".presets button").forEach((b) => b.addEventListener("click", () => setPreset(b.dataset.preset)));
  document.querySelectorAll(".bottom-nav button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("#lookup-input").addEventListener("input", (e) => onLookup(e.target.value));

  $("#pick-btn").addEventListener("click", (e) => { e.stopPropagation(); ui.picker.click(); });
  $("#add-btn").addEventListener("click", () => ui.picker.click());
  ui.drop.addEventListener("click", (e) => { if (e.target === ui.drop || !e.target.closest("button")) ui.picker.click(); });
  ui.drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ui.picker.click(); } });
  ui.picker.addEventListener("change", () => {
    const fl = ui.picker.files;
    closeSheet();
    addFiles(fl).finally(() => { ui.picker.value = ""; });
  });
  $("#demo-btn").addEventListener("click", (e) => { e.stopPropagation(); loadDemo(); });
  $("#demo-zip").addEventListener("click", downloadDemoZip);
  $("#files-btn").addEventListener("click", openSheet);
  $("#files-close").addEventListener("click", closeSheet);
  ui.sheet.addEventListener("click", (e) => { if (e.target === ui.sheet) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !ui.sheet.hidden) closeSheet(); });
  $("#clear-btn").addEventListener("click", () => {
    resetFiles();
    D = null;
    closeSheet();
    showLoader();
    setStatus("");
    renderFiles();
    window.scrollTo(0, 0);
  });

  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; ui.overlay.hidden = false; });
  window.addEventListener("dragover", (e) => { if (!hasFiles(e)) return; e.preventDefault(); });
  window.addEventListener("dragleave", (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) ui.overlay.hidden = true; });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    ui.overlay.hidden = true;
    addFiles(e.dataTransfer.files);
  });

  renderFiles();
  if (/[?&]demo=1\b/.test(location.search) || /[#&]demo=1\b/.test(location.hash)) loadDemo();

  window.__DASH = {
    get D() { return D; },
    get S() { return S; },
    state,
    platformOf,
    SOCIAL_PLATFORMS,
    QUARTERS,
    quarterWindow,
    setQuarter,
    setPreset,
    stmtInScope,
    aggregateFamilies,
    filteredStoreRows,
    paidTotal,
    get FAMILIES() { return FAMILIES; },
    get FEATURE_BY_ISRC() { return FEATURE_BY_ISRC; },
    money,
    songTotalsInCountry,
    marketRollup,
    countryName,
    renderSong,
    renderMarket,
    switchTab,
    registerLists,
    loadDemo,
    addFiles,
  };
})();
