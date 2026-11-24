(function () {
  const M = window.__MASTER || { sheets: {}, engine: { dash: [], wm: [], meta: {} }, pmHistory: { months: {} }, spendDaily: {}, index: [] };
  const COL = dash.colors;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fin = (v) => v != null && v !== '' && Number.isFinite(+v);
  const IN = (v, d) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: d }).format(v);
  const F = {
    int: (v) => IN(Math.round(v), 0), d1: (v) => IN(v, 1), d2: (v) => IN(v, 2), p0: d3.format('.0%'), p1: d3.format('.1%'), p2: d3.format('.2%'), x2: d3.format('.2f'),
    big: (v) => (Math.abs(v) >= 1e7 ? IN(v / 1e7, 2) + ' Cr' : Math.abs(v) >= 1e5 ? IN(v / 1e5, 2) + ' L' : Math.abs(v) >= 1e3 ? IN(v / 1e3, 1) + 'K' : IN(v, 0)),
    inr: (v) => '₹' + (Math.abs(v) >= 1e7 ? IN(v / 1e7, 2) + ' Cr' : Math.abs(v) >= 1e5 ? IN(v / 1e5, 2) + ' L' : IN(v, 0)),
    inr1: (v) => '₹' + IN(v, 1), inr0: (v) => '₹' + IN(v, 0),
  };
  const fmt = (v, f) => (fin(v) ? (typeof f === 'function' ? f(+v) : F[f](+v)) : '—');
  const pn = (s) => {
    if (s == null) return null; if (typeof s === 'number') return s;
    const t = String(s).replace(/[₹,\s ]|Rs\.?/g, '').replace(/x$/i, '');
    if (t === '' || t === '—' || t === '-' || /^na$/i.test(t)) return null;
    if (/%$/.test(t)) { const v = parseFloat(t); return Number.isFinite(v) ? v / 100 : null; }
    const v = parseFloat(t); return Number.isFinite(v) && /^-?[\d.]+(e[-+]?\d+)?$/i.test(t) ? v : null;
  };
  const rowsOf = (id) => (dash.data(id).status === 'ok' ? dash.data(id).data : []);
  const n = (v) => (v === '' || v == null ? 0 : +v || 0);
  const has = (v) => v !== '' && v != null && Number.isFinite(+v);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mlabel = (m) => MON[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4);
  const mfull = (m) => MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
  const monthKey = (lbl) => { const [a, y] = String(lbl).trim().split(/\s+/); const i = MON.indexOf((a || '').slice(0, 3)); return i < 0 || !y ? null : `${y}-${String(i + 1).padStart(2, '0')}`; };
  const median = (a) => { const s = a.filter(fin).map(Number).sort((x, y) => x - y); if (!s.length) return null; const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/y$/, '');
  const addD = (d, k) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);
  const dd = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
  const dLbl = (d) => { const x = new Date(d); return x.getUTCDate() + ' ' + MON[x.getUTCMonth()]; };
  const dLblY = (d) => dLbl(d) + ' ' + d.slice(0, 4);
  const parseDate = (s) => { const m = /(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/.exec(s || ''); if (!m) return null; const i = MON.indexOf(m[2]); return i < 0 ? null : `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
  const yday = () => new Date(Date.now() + 19800000 - 864e5).toISOString().slice(0, 10);

  // ====================================================================== day-level model
  let MODEL = null;
  function model() {
    if (MODEL) return MODEL;
    const daily = rowsOf('daily'); if (!daily.length) return null;
    const idx = new Map(); const get = (d) => { if (!idx.has(d)) idx.set(d, { d }); return idx.get(d); };
    daily.forEach((r) => Object.assign(get(r.day), { inst: n(r.installs), uninst: n(r.uninstalls), reinst: n(r.reinstalls), react: n(r.reattributions), dau: n(r.daus), sess: n(r.sessions), adj: 1 }));
    rowsOf('cohorts').forEach((r) => Object.assign(get(r.day), { cInst: n(r.installs), r1: has(r.retention_rate_d1) ? +r.retention_rate_d1 : null, r7: has(r.retention_rate_d7) ? +r.retention_rate_d7 : null, r30: has(r.retention_rate_d30) ? +r.retention_rate_d30 : null, u0: n(r.uninstalls_total_d0), u7: n(r.uninstalls_total_d7) }));
    rowsOf('admin_daily').forEach((r) => {
      const o = get(r.day); o.adm = 1;
      if (has(r.eng_total_viewers) && has(r.eng_avg_watch_time) && n(r.eng_avg_watch_time) <= 300) { o.viewers = n(r.eng_total_viewers); o.wmin = n(r.eng_total_viewers) * n(r.eng_avg_watch_time); o.vids = n(r.eng_total_viewers) * n(r.eng_avg_videos); }
      if (has(r.total_episode_views)) { o.eps = n(r.total_episode_views); o.aDau = n(r.dau_dau_users); }
      o.payers = n(r.rev_total_payers); o.subRev = n(r.rev_total_revenue); o.admob = n(r.total_admob_revenue); o.admobImp = n(r.total_admob_impressions);
    });
    rowsOf('series_daily').forEach((r) => { const o = get(r.day); o.hours = (o.hours || 0) + n(r.hours); });
    Object.entries(M.spendDaily || {}).forEach(([d, v]) => Object.assign(get(d), { meta: v.meta, google: v.google, sc: v.sc, est: v.est, sp: 1 }));
    const days = [...idx.keys()].sort();
    const ch = rowsOf('channels'); const paid = {};
    const mInst = d3.rollup(daily, (v) => d3.sum(v, (r) => n(r.installs)), (r) => r.day.slice(0, 7));
    const months = [...mInst.keys()].sort();
    months.forEach((m) => {
      const DR = (M.engine.dash || []).filter((r) => monthKey(r.Month) === m);
      if (DR.length) { const a = dashAgg(DR); paid[m] = { inst: a.ainst, d1: a.d1, d7: a.d7, d30: a.d30 }; }
      else { const P = ch.filter((r) => r.month === m && /^(Facebook|Google Ads|ShareChat)$/.test(r.channel)); const i = d3.sum(P, (r) => n(r.installs)); paid[m] = { inst: i, d1: i ? d3.sum(P, (r) => n(r.retention_rate_d1) * n(r.installs)) / i : null, d7: i ? d3.sum(P, (r) => n(r.retention_rate_d7) * n(r.installs)) / i : null, d30: null }; }
    });
    days.forEach((d) => {
      const o = idx.get(d), m = d.slice(0, 7), t = T3[m] || {}, dim = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
      o.paidInst = o.inst && paid[m] && mInst.get(m) ? (paid[m].inst * o.inst) / mInst.get(m) : 0;
      o.infl = t.infl && fin(t.infl.spend) ? t.infl.spend / dim : 0; o.inflInst = t.infl && fin(t.infl.installs) ? t.infl.installs / dim : 0;
      o.casting = t.casting && fin(t.casting.spend) ? t.casting.spend / dim : 0; o.oem = t.oem && fin(t.oem.spend) ? t.oem.spend / dim : 0; o.oemInst = t.oem && fin(t.oem.installs) ? t.oem.installs / dim : 0;
    });
    const lastC = rowsOf('cohorts').reduce((x, r) => (r.day > x ? r.day : x), '');
    const mau = new Map(rowsOf('mau').map((r) => [r.month, n(r.maus)]));
    const last = daily.reduce((x, r) => (r.day > x ? r.day : x), '');
    const first = daily.reduce((x, r) => (r.day < x ? r.day : x), '9999');
    const lastAdm = rowsOf('admin_daily').reduce((x, r) => (r.day > x ? r.day : x), '');
    MODEL = { idx, days, paid, lastC, mau, last, first, lastAdm, months };
    return MODEL;
  }
  const SC = new Map();
  function stats(s, e) {
    const k = s + '|' + e; if (SC.has(k)) return SC.get(k);
    const Mo = model(); if (!Mo) return {};
    const L = []; for (let d = s; d <= e; d = addD(d, 1)) { const o = Mo.idx.get(d); if (o) L.push(o); }
    const S = (f, arr = L) => d3.sum(arr, (o) => +o[f] || 0);
    const A = L.filter((o) => o.adj), V = L.filter((o) => o.wmin != null), E = L.filter((o) => o.eps != null), AD = L.filter((o) => o.adm);
    const age = (d) => (Date.parse(Mo.lastC) - Date.parse(d)) / 864e5;
    const coh = (f, a) => { const c = L.filter((o) => o[f] != null && o.cInst && age(o.d) >= a); const i = S('cInst', c); return i ? d3.sum(c, (o) => o[f] * o.cInst) / i : null; };
    const r = { s, e, days: L.length, adjDays: A.length, admDays: AD.length, serDays: L.filter((o) => o.hours).length, epsDays: E.length };
    r.installs = S('inst', A); r.uninst = S('uninst', A); r.reinst = S('reinst', A); r.react = S('react', A); r.sess = S('sess', A);
    r.dau = A.length ? S('dau', A) / A.length : null;
    const cI = S('cInst', L.filter((o) => o.cInst));
    r.d1 = coh('r1', 1); r.d7 = coh('r7', 7); r.d30 = coh('r30', 30); r.u0 = cI ? S('u0') / cI : null;
    r.uRate = r.installs ? r.uninst / r.installs : null;
    let mw = 0, mv = 0; L.forEach((o) => { const v = Mo.mau.get(o.d.slice(0, 7)); if (v) { mw++; mv += v; } }); r.mau = mw ? mv / mw : null;
    r.viewers = S('viewers', V); r.wmin = S('wmin', V);
    r.minViewer = r.viewers ? r.wmin / r.viewers : null; r.vidsViewer = r.viewers ? S('vids', V) / r.viewers : null;
    const sessV = S('sess', V.filter((o) => o.adj)); r.minSess = sessV ? r.wmin / sessV : null;
    r.eps = E.length ? S('eps', E) : null; const aD = S('aDau', E); r.epsDau = r.eps != null && aD && r.eps / aD < 200 ? r.eps / aD : null;
    r.sessDau = S('dau', A) ? r.sess / S('dau', A) : null;
    r.hours = S('hours'); r.hoursUser = r.mau ? r.hours / r.mau : null;
    r.payers = AD.length ? S('payers', AD) : null; r.payersDay = AD.length ? r.payers / AD.length : null; r.subRev = AD.length ? S('subRev', AD) : null; r.admob = AD.length ? S('admob', AD) : null; r.admobImp = AD.length ? S('admobImp', AD) : null;
    r.revenue = AD.length ? r.subRev + r.admob : null; r.ecpm = r.admobImp ? (r.admob / r.admobImp) * 1000 : null;
    const dauAd = S('dau', AD.filter((o) => o.adj)); r.arpdau = dauAd && r.revenue != null ? r.revenue / dauAd : null; r.impDau = dauAd ? r.admobImp / dauAd : null; r.payerShare = dauAd ? r.payers / dauAd : null;
    const SP = L.filter((o) => o.sp); r.meta = S('meta', SP); r.google = S('google', SP); r.sc = S('sc', SP); r.pm = r.meta + r.google + r.sc; r.est = SP.some((o) => o.est);
    r.infl = S('infl'); r.inflInst = S('inflInst'); r.casting = S('casting'); r.oem = S('oem'); r.oemInst = S('oemInst');
    r.total = r.pm + r.infl + r.casting + r.oem;
    r.paidInst = S('paidInst'); r.cpi = r.paidInst ? r.pm / r.paidInst : null;
    r.inflCpi = r.inflInst ? r.infl / r.inflInst : null; r.oemCpi = r.oemInst ? r.oem / r.oemInst : null; r.blended = r.installs && r.total ? r.total / r.installs : null;
    const pw = d3.rollup(L, (v) => d3.sum(v, (o) => o.paidInst || 0), (o) => o.d.slice(0, 7)); let W = 0, a1 = 0, a7 = 0, a30 = 0, w30 = 0;
    pw.forEach((w, m) => { const p = Mo.paid[m]; if (!p || !w) return; if (fin(p.d1)) a1 += p.d1 * w; if (fin(p.d7)) a7 += p.d7 * w; if (fin(p.d30)) { a30 += p.d30 * w; w30 += w; } W += w; });
    r.paidD1 = W ? a1 / W : null; r.paidD7 = W ? a7 / W : null; r.paidD30 = w30 ? a30 / w30 : null;
    r.idx = retIndex(r.paidD1, r.paidD7, r.paidD30, W, W, w30); r.retcpi = r.cpi != null && r.idx ? r.cpi / r.idx : null;
    SC.set(k, r); return r;
  }
  const rng = () => { const p = dash.params(); const Mo = model(); const last = Mo ? Mo.last : yday(); let e = p.end || last; if (e > last) e = last; const s = p.start || '2025-10-06'; return { s, e }; };
  const prevRng = () => { const { s, e } = rng(); const L = dd(s, e); return { s: addD(s, -L), e: addD(s, -1) }; };
  const cur = () => { const { s, e } = rng(); return stats(s, e); };
  const prev = () => { const { s, e } = prevRng(); return stats(s, e); };
  function buckets(s, e, force) {
    const L = dd(s, e); const g = force || (L <= 75 ? 'day' : L <= 400 ? 'week' : 'month'); const out = [];
    if (g === 'day') for (let d = s; d <= e; d = addD(d, 1)) out.push({ s: d, e: d, l: dLbl(d) });
    else if (g === 'week') { let d = s; while (d <= e) { const t = addD(d, 6) > e ? e : addD(d, 6); out.push({ s: d, e: t, l: dLbl(d) }); d = addD(t, 1); } }
    else { let d = s; while (d <= e) { const m = d.slice(0, 7); const me = monthEnd(m); const t = me > e ? e : me; out.push({ s: d, e: t, l: mlabel(m) }); d = addD(t, 1); } }
    out.g = g; out.forEach((b) => { b.st = stats(b.s, b.e); }); return out;
  }

  // ====================================================================== sheets
  const sheetBlock = (sid, col) => { const s = M.sheets[sid]; if (!s) return null; return col ? s.tables.find((t) => t.cols[0] === col) : s.tables[0]; };
  const NUMRE = /^[-–]?[₹$]?-?[\d,]*\.?\d+(%|x|×| L| Cr|[KMk])?$/;
  function headerMap(rows) { const nc = Math.max(1, ...rows.map((r) => r.length)); let h = -1; for (let i = 0; i < Math.min(rows.length, 12); i++) { const f = rows[i].filter(Boolean); if (f.length >= Math.max(3, nc * 0.6) && f.filter((c) => NUMRE.test(c)).length <= f.length * 0.2) { h = i; break; } } const m = {}; if (h >= 0) rows[h].forEach((c, i) => { if (c && !(c in m)) m[c] = i; }); return { h, m }; }
  function buildSheet(el, t) {
    const rows = t.rows, nc = Math.max(1, ...rows.map((r) => r.length));
    const kind = rows.map((r) => { const f = r.filter(Boolean); if (!f.length) return 'blank'; if (f.length === 1 && r[0] && (nc > 2 || r[0].length > 40)) return 'ttl'; if (f.length >= Math.max(3, nc * 0.6) && f.filter((c) => NUMRE.test(c)).length <= f.length * 0.2) return 'hd'; return 'row'; });
    const fh = kind.indexOf('hd'); const pre = fh >= 0 ? rows.slice(0, fh + 1).map((r, i) => i) : [];
    let body = rows.map((r, i) => i).filter((i) => i > fh);
    let dcol = -1, mode = null; const sample = body.filter((i) => kind[i] === 'row').slice(0, 60);
    for (let j = 0; j < Math.min(nc, 4) && dcol < 0; j++) {
      const v = sample.map((i) => (rows[i][j] || '').replace(/^ +/, ''));
      if (sample.length && v.filter((x) => /^\d{1,2} [A-Z][a-z]{2} \d{4}/.test(x)).length >= sample.length * 0.5) { dcol = j; mode = 'day'; }
      else if (sample.length >= 2 && v.filter((x) => /^[A-Z][a-z]{2} \d{4}/.test(x)).length >= sample.length * 0.5) { dcol = j; mode = 'month'; }
    }
    let hidden = 0;
    if (dcol >= 0) {
      const { s, e } = rng();
      body = body.filter((i) => { const c = (rows[i][dcol] || '').replace(/^ +/, ''); if (mode === 'day') { const d = parseDate(c); if (!d) return true; const ok = d >= s && d <= e; if (!ok) hidden++; return ok; } const mk = monthKey(c.split(' (')[0]); if (!mk) return true; const ok = mk >= s.slice(0, 7) && mk <= e.slice(0, 7); if (!ok) hidden++; return ok; });
    }
    const wrap = document.createElement('div'); const PAGE = 100; let page = 0, q = '';
    const big = body.length > 12;
    wrap.innerHTML = (big || hidden ? `<div class="sheetbar">${big ? '<input type="search" placeholder="Search these rows">' : ''}<span class="cnt"></span>${hidden ? `<span class="tag">${F.int(hidden)} rows outside the date range hidden</span>` : ''}<span class="pg"></span></div>` : '') + '<div class="sheetwrap"><table></table></div>';
    el.appendChild(wrap);
    const tbl = wrap.querySelector('table');
    const cell = (c) => { const txt = c.replace(/^ +/, ''); const cls = [NUMRE.test(txt) ? 'num' : '', txt.length > 48 ? 'long' : ''].filter(Boolean).join(' '); return `<td${cls ? ` class="${cls}"` : ''}>${esc(txt).replace(/\n/g, '<br>')}</td>`; };
    const tr = (i) => { const r = rows[i], k = kind[i]; if (k === 'blank') return `<tr><td colspan="${nc}" style="border:0;height:8px"></td></tr>`; if (k === 'ttl') return `<tr class="ttl"><td colspan="${nc}">${esc(r[0])}</td></tr>`; const lvl = (/^ +/.exec(r[0] || '') || [''])[0].length / 2; const cells = []; for (let j = 0; j < nc; j++) cells.push(cell(r[j] || '')); return `<tr class="${k === 'hd' ? 'hd' : ''}${lvl ? ' lvl' + Math.min(2, lvl) : ''}">${cells.join('')}</tr>`; };
    const draw = () => {
      const ql = q.toLowerCase(); const hit = ql ? body.filter((i) => kind[i] !== 'blank' && rows[i].some((c) => c.toLowerCase().includes(ql))) : body;
      const pages = Math.max(1, Math.ceil(hit.length / PAGE)); page = Math.min(page, pages - 1);
      tbl.innerHTML = pre.map(tr).join('') + hit.slice(page * PAGE, page * PAGE + PAGE).map(tr).join('');
      const c = wrap.querySelector('.cnt'); if (c) c.textContent = `${F.int(hit.filter((i) => kind[i] === 'row').length)} rows${ql ? ' match' : ''}`;
      const pg = wrap.querySelector('.pg'); if (pg) pg.innerHTML = pages > 1 ? `<button class="mbtn" data-d="-1"${page ? '' : ' disabled'}>‹ Prev</button><span>Page ${page + 1} of ${pages}</span><button class="mbtn" data-d="1"${page < pages - 1 ? '' : ' disabled'}>Next ›</button>` : '';
    };
    const inp = wrap.querySelector('input'); if (inp) { let t0; inp.addEventListener('input', (e) => { clearTimeout(t0); t0 = setTimeout(() => { q = e.target.value.trim(); page = 0; draw(); }, 200); }); }
    const pgEl = wrap.querySelector('.pg'); if (pgEl) pgEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-d]'); if (!b) return; page += +b.dataset.d; draw(); wrap.querySelector('.sheetwrap').scrollTop = 0; });
    draw();
  }
  function renderSheets(root) {
    const { s, e } = rng(); const rk = s + e;
    root.querySelectorAll('[data-sheetpick]').forEach((sel) => {
      const host = sel.closest('.card').querySelector('[data-sheethost]');
      if (!sel._b) { sel._b = 1; sel.addEventListener('change', () => { host.innerHTML = `<div data-sheet="${sel.value}"></div>`; renderSheets(host); }); }
      if (!host.firstChild) host.innerHTML = `<div data-sheet="${sel.value}"></div>`;
    });
    root.querySelectorAll('[data-sheet]').forEach((el) => {
      if (el._rk === rk) return; if (el.closest('details:not([open])')) return; el._rk = rk; el.innerHTML = '';
      const s0 = M.sheets[el.dataset.sheet]; if (!s0) { el.innerHTML = '<p class="muted">This sheet is not in this snapshot.</p>'; return; }
      const ts = el.dataset.table ? s0.tables.filter((t) => t.cols[0] === el.dataset.table) : s0.tables;
      if (!ts.length) { el.innerHTML = '<p class="muted">Table not found in this snapshot.</p>'; return; }
      ts.forEach((t, i) => { if (i) el.appendChild(Object.assign(document.createElement('div'), { style: 'height:16px' })); buildSheet(el, t); });
    });
  }

  // ====================================================================== charts
  function chart(el, o) {
    el.innerHTML = '';
    const W = Math.max(260, el.clientWidth || el.getBoundingClientRect().width || 600), H = o.h || 240;
    const cats = o.cats || []; if (!cats.length) { el.innerHTML = '<div class="empty">No data for this range</div>'; return; }
    const m = { t: o.labels ? 22 : 10, r: o.y2 && o.y2.length ? 50 : 12, b: 28, l: 56 };
    const x = d3.scaleBand().domain(d3.range(cats.length)).range([m.l, W - m.r]).padding(cats.length > 60 ? 0.1 : 0.22);
    const bars = o.bars || [], lines = o.lines || [], y2s = o.y2 || [];
    let ymax = 0, ymin = 0;
    if (o.stacked) cats.forEach((_, i) => { ymax = Math.max(ymax, d3.sum(bars, (b) => Math.max(0, +b.values[i] || 0))); });
    else bars.forEach((b) => b.values.forEach((v) => { if (fin(v)) { ymax = Math.max(ymax, +v); ymin = Math.min(ymin, +v); } }));
    lines.forEach((l) => l.values.forEach((v) => { if (fin(v)) ymax = Math.max(ymax, +v); }));
    const y = d3.scaleLinear().domain([ymin, ymax || 1]).nice().range([H - m.b, m.t]);
    let y2; if (y2s.length) { const mx = d3.max(y2s.flatMap((l) => l.values.filter(fin).map(Number))) || 1; y2 = d3.scaleLinear().domain([0, mx]).nice().range([H - m.b, m.t]); }
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).style('display', 'block').style('overflow', 'visible');
    (o.bands || []).forEach((b) => { const i0 = o.keys.findIndex((k) => k >= b.s); let i1 = -1; o.keys.forEach((k, i) => { if (k <= b.e) i1 = i; }); if (i0 < 0 || i1 < i0) return; svg.append('rect').attr('x', x(i0)).attr('width', x(i1) + x.bandwidth() - x(i0)).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', b.c).attr('opacity', 0.12); svg.append('text').attr('x', x(i0) + 4).attr('y', m.t + 12).attr('fill', 'var(--color-fg-muted)').style('font-size', '11px').text(b.l); });
    const fy = o.fy || ((v) => F.big(v));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(fy)).call((g) => { g.select('.domain').remove(); g.selectAll('line').attr('stroke', 'var(--cds-chart-grid)'); g.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', '11px'); });
    if (y2) svg.append('g').attr('transform', `translate(${W - m.r},0)`).call(d3.axisRight(y2).ticks(5).tickFormat(o.fy2 || fy)).call((g) => { g.select('.domain').remove(); g.selectAll('line').remove(); g.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', '11px'); });
    const every = Math.max(1, Math.ceil(cats.length / Math.max(1, Math.floor((W - m.l - m.r) / 52))));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat((i) => (i % every ? '' : cats[i])).tickSizeOuter(0)).call((g) => { g.select('.domain').attr('stroke', 'var(--cds-chart-reference)'); g.selectAll('line').remove(); g.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', '11px'); });
    const dim = (i) => (o.sel && o.sel.size && !o.sel.has(i) ? 0.32 : 1);
    if (o.stacked) cats.forEach((_, i) => { let acc = 0; bars.forEach((b) => { const v = Math.max(0, +b.values[i] || 0); if (v > 0) svg.append('rect').attr('x', x(i)).attr('width', x.bandwidth()).attr('y', y(acc + v)).attr('height', Math.max(0, y(acc) - y(acc + v))).attr('fill', b.color).attr('opacity', dim(i)); acc += v; }); });
    else if (bars.length) { const xi = d3.scaleBand().domain(d3.range(bars.length)).range([0, x.bandwidth()]).padding(0.08); bars.forEach((b, j) => b.values.forEach((v, i) => { if (!fin(v)) return; const y0 = y(0), y1 = y(+v); svg.append('rect').attr('x', x(i) + xi(j)).attr('width', xi.bandwidth()).attr('y', Math.min(y0, y1)).attr('height', Math.abs(y0 - y1)).attr('rx', 3).attr('fill', b.color).attr('opacity', dim(i)); })); }
    if (o.labels) o.labels.forEach((t, i) => { if (!t) return; const top = o.stacked ? d3.sum(bars, (b) => Math.max(0, +b.values[i] || 0)) : d3.max(bars, (b) => +b.values[i] || 0); svg.append('text').attr('x', x(i) + x.bandwidth() / 2).attr('y', y(top || 0) - 5).attr('text-anchor', 'middle').style('font-size', '11px').style('font-weight', 600).attr('fill', t.c || 'var(--color-fg-muted)').text(t.t); });
    const line = (l, sc) => { const pts = l.values.map((v, i) => [i, v]).filter(([, v]) => fin(v)); svg.append('path').attr('fill', 'none').attr('stroke', l.color).attr('stroke-width', 2).attr('stroke-dasharray', l.dash ? '5 4' : null).attr('d', d3.line().x(([i]) => x(i) + x.bandwidth() / 2).y(([, v]) => sc(+v))(pts)); svg.selectAll(null).data(pts).join('circle').attr('cx', ([i]) => x(i) + x.bandwidth() / 2).attr('cy', ([, v]) => sc(+v)).attr('r', pts.length > 40 ? 0 : 3).attr('fill', l.color); };
    lines.forEach((l) => line(l, y)); y2s.forEach((l) => line(l, y2));
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    const all = [...bars.map((b) => [b, fy]), ...lines.map((l) => [l, fy]), ...y2s.map((l) => [l, o.fy2 || fy])];
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (ev) => { const [px] = d3.pointer(ev); const i = Math.max(0, Math.min(cats.length - 1, Math.floor((px - m.l) / x.step()))); tip.style('display', null).html(`<div class="d">${esc(o.tipCats ? o.tipCats[i] : cats[i])}</div>` + all.map(([s, f]) => `<div><span class="sw" style="background:${s.color}"></span>${esc(s.name)}: <b>${fin(s.values[i]) ? f(+s.values[i]) : '—'}</b></div>`).join('')); tip.style('left', Math.max(0, Math.min(x(i) + x.bandwidth() + 8, W - 210)) + 'px').style('top', '4px'); })
      .on('mouseleave', () => tip.style('display', 'none'));
  }
  function hbar(el, items, o = {}) {
    el.innerHTML = ''; if (!items.length) { el.innerHTML = '<div class="empty">No data for this range</div>'; return; }
    const W = Math.max(260, el.clientWidth || 600), rowH = 24, lw = Math.min(180, W * 0.38), H = items.length * rowH + 8;
    const mn = Math.min(0, d3.min(items, (d) => d.v)), mx = Math.max(0, d3.max(items, (d) => d.v)) || 1;
    const x = d3.scaleLinear().domain([mn, mx]).range([0, Math.max(40, W - lw - 130)]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).style('display', 'block');
    items.forEach((d, i) => { const g = svg.append('g').attr('transform', `translate(0,${i * rowH + 4})`); g.append('text').attr('x', lw - 6).attr('y', 15).attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').style('font-size', '12px').text(d.k.length > 26 ? d.k.slice(0, 25) + '…' : d.k).append('title').text(d.k); g.append('rect').attr('x', lw + x(Math.min(0, d.v))).attr('y', 3).attr('height', rowH - 8).attr('width', Math.max(1, Math.abs(x(d.v) - x(0)))).attr('rx', 3).attr('fill', d.c || COL[0]); g.append('text').attr('x', lw + x(Math.max(0, d.v)) + 5).attr('y', 15).attr('fill', 'var(--color-fg-muted)').style('font-size', '11px').text((o.f || F.big)(d.v) + (d.note ? ' · ' + d.note : '')); });
  }
  function scatter(el, pts, o = {}) {
    el.innerHTML = ''; if (!pts.length) { el.innerHTML = '<div class="empty">No data for this range</div>'; return; }
    const W = Math.max(260, el.clientWidth || 600), H = 260, m = { t: 10, r: 14, b: 32, l: 48 };
    const x = d3.scaleLog().domain(d3.extent(pts, (p) => Math.max(1, p.x))).nice().range([m.l, W - m.r]); const y = d3.scaleLinear().domain([0, d3.max(pts, (p) => p.y) || 1]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5, '~s')).call((g) => g.selectAll('text').attr('fill', 'var(--color-fg-muted)'));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5)).call((g) => g.selectAll('text').attr('fill', 'var(--color-fg-muted)'));
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    svg.selectAll(null).data(pts).join('circle').attr('cx', (p) => x(Math.max(1, p.x))).attr('cy', (p) => y(p.y)).attr('r', (p) => 3 + Math.min(9, Math.sqrt(p.r || 1) / 8)).attr('fill', (p) => p.c || COL[0]).attr('opacity', 0.7)
      .on('mouseenter', (ev, p) => { tip.style('display', null).html(`<div class="d">${esc(p.k)}</div>${o.tip ? o.tip(p) : ''}`).style('left', Math.min(x(Math.max(1, p.x)) + 10, W - 200) + 'px').style('top', Math.max(0, y(p.y) - 20) + 'px'); }).on('mouseleave', () => tip.style('display', 'none'));
    svg.selectAll(null).data(pts.slice().sort((a, b) => b.x * b.y - a.x * a.y).slice(0, 6)).join('text').attr('x', (p) => x(Math.max(1, p.x)) + 6).attr('y', (p) => y(p.y) - 6).style('font-size', '10.5px').attr('fill', 'var(--color-fg-muted)').text((p) => (p.k.length > 18 ? p.k.slice(0, 17) + '…' : p.k));
  }
  function spark(vals, c) {
    const v = vals.map((x) => (fin(x) ? +x : null)); const ok = v.filter((x) => x != null); if (ok.length < 2) return '';
    const W = 180, H = 34, mn = Math.min(...ok), mx = Math.max(...ok), sx = (i) => (i / (v.length - 1)) * W, sy = (x) => H - 3 - ((x - mn) / (mx - mn || 1)) * (H - 6);
    let d = ''; let x0 = null, xl = 0; v.forEach((x, i) => { if (x == null) return; if (x0 == null) x0 = sx(i); xl = sx(i); d += (d ? 'L' : 'M') + sx(i).toFixed(1) + ',' + sy(x).toFixed(1); }); const a = d + `L${xl},${H}L${x0},${H}Z`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none"><path d="${a}" fill="${c}" opacity=".12"/><path d="${d}" fill="none" stroke="${c}" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function table(el, cols, data, o = {}) {
    const st = el._st || (el._st = { k: o.sort || null, d: -1 });
    const rows = st.k ? data.slice().sort((a, b) => { const x = a[st.k], y = b[st.k]; if (x == null || x === '') return 1; if (y == null || y === '') return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.d; }) : data;
    const fm = (c, v) => (typeof c.f === 'function' ? c.f(v) : c.f ? fmt(v, c.f) : esc(v ?? '—'));
    el.innerHTML = `<table class="mtbl"><thead><tr>${cols.map((c) => `<th data-k="${c.k}" class="${c.l ? 'l' : ''}">${esc(c.label)}${st.k === c.k ? (st.d < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, o.max || 5000).map((r) => `<tr${o.rowKey ? ` data-key="${esc(r[o.rowKey])}"` : ''}${o.selKey && r[o.rowKey] === o.selKey ? ' class="sel"' : ''}>${cols.map((c) => `<td class="${c.l ? 'l' : ''}"${c.l ? ` title="${esc(r[c.k])}"` : ''}>${fm(c, r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('th[data-k]').forEach((th) => th.addEventListener('click', () => { const k = th.dataset.k; st.d = st.k === k ? -st.d : -1; st.k = k; table(el, cols, data, o); collapseTables(el); }));
    if (o.onRow) el.querySelectorAll('tr[data-key]').forEach((tr) => tr.addEventListener('click', () => o.onRow(tr.dataset.key)));
  }
  function collapseTables(root) {
    if (!root) return;
    root.querySelectorAll('table').forEach((t) => {
      if (t._c || t.closest('.sheetwrap') || t.hasAttribute('data-nocollapse')) return; t._c = 1;
      const rows = [...t.querySelectorAll(':scope > tbody > tr')]; const KEEP = 10; if (rows.length <= KEEP + 2) return;
      rows.slice(KEEP).forEach((r) => r.classList.add('mcoll'));
      const host = t.parentElement && t.parentElement.children.length === 1 ? t.parentElement : t;
      let nx = host.nextElementSibling; while (nx && nx.classList.contains('morebtn')) { const z = nx.nextElementSibling; nx.remove(); nx = z; }
      const b = document.createElement('button'); b.className = 'mbtn morebtn'; b.textContent = `Show all ${rows.length} rows ▾`;
      b.addEventListener('click', () => { const open = b.dataset.open !== '1'; rows.slice(KEEP).forEach((r) => r.classList.toggle('mcoll', !open)); b.dataset.open = open ? '1' : ''; b.textContent = open ? 'Show fewer ▴' : `Show all ${rows.length} rows ▾`; });
      host.insertAdjacentElement('afterend', b);
    });
  }

  // ====================================================================== shared calcs
  const retIndex = (d1, d7, d30, n1, n7, n30) => { let s = 0, w = 0; if (fin(d1) && n1 >= 50) { s += 0.5 * d1 / 0.14; w += 0.5; } if (fin(d7) && n7 >= 100) { s += 0.3 * d7 / 0.03; w += 0.3; } if (fin(d30) && n30 >= 300) { s += 0.2 * d30 / 0.007; w += 0.2; } return w ? s / w : null; };
  function dashAgg(rows) {
    const S = (k) => d3.sum(rows, (r) => +r[k] || 0);
    const a = { spend: S('spend'), budget: S('budget'), minst: S('minst'), mpur: S('mpur'), ainst: S('ainst'), n1: S('n1'), d1n: S('d1n'), n7: S('n7'), d7n: S('d7n'), n30: S('n30'), d30n: S('d30n'), clicks: S('clicks'), impr: S('impr'), apur: S('apur'), v1: S('v1'), v3: S('v3'), v5: S('v5'), v7: S('v7'), mspend: S('mspend') };
    a.d1 = a.n1 ? a.d1n / a.n1 : null; a.d7 = a.n7 ? a.d7n / a.n7 : null; a.d30 = a.n30 && a.d30n ? a.d30n / a.n30 : null;
    a.cpi = a.ainst ? a.spend / a.ainst : null; a.mcpi = a.minst ? a.mspend / a.minst : null;
    a.idx = retIndex(a.d1, a.d7, a.d30, a.n1, a.n7, a.n30); a.retcpi = a.cpi != null && a.idx ? a.cpi / a.idx : null;
    a.ctr = a.impr ? a.clicks / a.impr : null; a.cpp = a.apur ? a.spend / a.apur : null; return a;
  }
  const T3 = (() => {
    const t = sheetBlock('biz_00', 'O'); const out = {}; if (!t) return out; let mk = null;
    t.rows.forEach((r) => { const a = (r[0] || '').trim(); const mm = /^User Acquisition - (\w+)/.exec(a); if (mm) { const mo = MON.indexOf(mm[1].slice(0, 3)); mk = mo >= 0 ? `2026-${String(mo + 1).padStart(2, '0')}` : null; return; } if (!mk || !a) return;
      const key = /^Performance/i.test(a) ? 'pm' : /^OEM/i.test(a) ? 'oem' : /^Influencer/i.test(a) ? 'infl' : /^Social Media Organic/i.test(a) ? 'social' : /^Organic Non/i.test(a) ? 'organic' : /^Casting/i.test(a) ? 'casting' : /^Total/i.test(a) ? 'total' : null;
      if (key) (out[mk] ||= {})[key] = { installs: pn(r[1]), d1: pn(r[2]), d7: pn(r[3]), spend: pn(r[5]), cpi: pn(r[6]), subs: pn(r[9]) }; });
    return out;
  })();
  const monthsIn = (s, e) => { const out = []; let m = s.slice(0, 7); while (m <= e.slice(0, 7)) { out.push(m); const y = +m.slice(0, 4), mo = +m.slice(5, 7); m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; } return out; };
  function monthEnd(m) { return new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10); }
  const mStats = (m) => { const Mo = model(); let e = monthEnd(m); if (Mo && e > Mo.last) e = Mo.last; return stats(m + '-01', e); };

  // ====================================================================== KPI cards
  const K = {
    installs: ['Installs', 'big', 1, 'a-users'], dau: ['Daily active users', 'big', 1, 'a-users'], mau: ['Monthly active users', 'big', 1, 'a-users'], d1: ['Day-1 retention', 'p1', 1, 'a-ret'], d7: ['Day-7 retention', 'p1', 1, 'a-ret'], d30: ['Day-30 retention', 'p2', 1, 'a-ret'],
    reinst: ['Reinstalls', 'big', 1, 'a-users'], react: ['Reactivations', 'big', 1, 'a-users'], uninst: ['Uninstalls', 'big', -1, 'a-ret'], uRate: ['Uninstalls ÷ installs', 'p0', -1, 'a-ret'], u0: ['Uninstall on install day', 'p1', -1, 'a-ret'],
    eps: ['Episodes watched', 'big', 1, 'a-view'], epsDau: ['Episodes per active user a day', 'd1', 1, 'a-view'], vidsViewer: ['Episodes per viewer a day', 'd1', 1, 'a-view'], minViewer: ['Watch minutes per viewer a day', 'd1', 1, 'a-view'], minSess: ['Watch minutes per session', 'd1', 1, 'a-view'], sessDau: ['Sessions per active user a day', 'd2', 1, 'a-view'], hours: ['Watch hours', 'big', 1, 'a-view'], hoursUser: ['Watch hours per monthly user', 'd2', 1, 'a-view'],
    payers: ['Subscription payments', 'int', 1, 'a-rev'], payersDay: ['Paying users a day', 'd1', 1, 'a-rev'], subRev: ['Subscription revenue', 'inr', 1, 'a-rev'], admob: ['AdMob revenue', 'inr', 1, 'a-rev'], revenue: ['Total app revenue', 'inr', 1, 'a-rev'], arpdau: ['Revenue per active user a day', 'inr1', 1, 'a-rev'], ecpm: ['AdMob eCPM', 'inr1', 1, 'a-rev'], impDau: ['Ad impressions per active user', 'd1', 0, 'a-rev'], payerShare: ['Payers ÷ active users', 'p2', 1, 'a-rev'],
    pm: ['Performance marketing spend', 'inr', 0, 'a-mkt'], meta: ['Meta spend', 'inr', 0, 'a-mkt'], google: ['Google spend', 'inr', 0, 'a-mkt'], sc: ['ShareChat spend', 'inr', 0, 'a-mkt'], paidInst: ['Paid installs (est.)', 'big', 1, 'a-mkt'], cpi: ['Paid CPI', 'inr1', -1, 'a-mkt'], retcpi: ['Ret CPI', 'inr1', -1, 'a-mkt'], idx: ['Retention index (paid)', 'x2', 1, 'a-mkt'], infl: ['Influencer spend', 'inr', 0, 'a-mkt'], inflInst: ['Influencer installs', 'int', 1, 'a-mkt'], inflCpi: ['Influencer CPI', 'inr1', -1, 'a-mkt'], oem: ['OEM spend', 'inr', 0, 'a-mkt'], oemInst: ['OEM installs', 'int', 1, 'a-mkt'], oemCpi: ['OEM CPI', 'inr1', -1, 'a-mkt'], casting: ['Casting & promotions', 'inr', 0, 'a-mkt'], total: ['Total marketing spend', 'inr', 0, 'a-mkt'], blended: ['Blended CPI', 'inr1', -1, 'a-mkt'], sess: ['Sessions', 'big', 1, 'a-view'],
  };
  const GROUPS = {
    users: ['installs', 'dau', 'mau', 'd1', 'd7', 'reinst', 'react', 'eps', 'minViewer', 'vidsViewer', 'epsDau', 'hours'],
    money: ['payers', 'subRev', 'admob', 'arpdau', 'pm', 'cpi', 'retcpi', 'infl', 'inflCpi', 'oem', 'total', 'blended'],
    growth: ['installs', 'uninst', 'uRate', 'u0', 'reinst', 'react', 'dau', 'mau'],
    ret: ['d1', 'd7', 'd30', 'u0', 'uRate', 'react'], view: ['eps', 'epsDau', 'vidsViewer', 'minViewer', 'hours', 'hoursUser'], sess: ['sessDau', 'minSess', 'minViewer', 'vidsViewer'],
    rev: ['payers', 'payersDay', 'payerShare', 'subRev', 'revenue', 'arpdau'], admob: ['admob', 'ecpm', 'impDau', 'arpdau'], infl: ['infl', 'inflCpi', 'casting', 'oem', 'total', 'blended'],
  };
  const ACC = { 'a-users': '#2f6fd1', 'a-view': '#7c4ddb', 'a-rev': '#12a150', 'a-mkt': '#f08c2e', 'a-ret': '#d6407f' };
  const SUBS = { eps: (c, p) => `before: ${fmt(p.eps, 'big')} · ${c.epsDays} vs ${p.epsDays} days of data`, subRev: (c, p) => `before: ${fmt(p.subRev, 'inr')} · ${c.admDays} vs ${p.admDays} days`, admob: (c, p) => `before: ${fmt(p.admob, 'inr')} · ${c.admDays} vs ${p.admDays} days`, payers: (c, p) => `before: ${fmt(p.payers, 'int')} · ${c.admDays} vs ${p.admDays} days`, hours: (c, p) => `before: ${fmt(p.hours, 'big')} · ${c.serDays} vs ${p.serDays} days`, pm: (c) => `Meta ${fmt(c.meta, 'inr')} · Google ${fmt(c.google, 'inr')} · ShareChat ${fmt(c.sc, 'inr')}`, retcpi: (c) => `retention index ${fmt(c.idx, 'x2')}`, cpi: (c) => `${fmt(c.paidInst, 'big')} paid installs`, inflCpi: (c) => `${fmt(c.inflInst, 'big')} influencer installs`, oem: (c) => `${fmt(c.oemInst, 'int')} OEM installs`, blended: () => 'all spend ÷ all installs', mau: () => 'average of the months', u0: () => 'share of new users', d1: () => 'install cohorts in range', d7: () => 'install cohorts in range', ecpm: (c) => `${fmt(c.admobImp, 'big')} impressions` };
  const PERDAY = { installs: 'adjDays', uninst: 'adjDays', reinst: 'adjDays', react: 'adjDays', sess: 'adjDays', eps: 'epsDays', hours: 'serDays', payers: 'admDays', subRev: 'admDays', admob: 'admDays', revenue: 'admDays', pm: 'days', meta: 'days', google: 'days', sc: 'days', paidInst: 'adjDays', infl: 'days', casting: 'days', oem: 'days', total: 'days', inflInst: 'days', oemInst: 'days' };
  const nv = (st, k) => (PERDAY[k] && st && st[k] != null ? (st[PERDAY[k]] ? st[k] / st[PERDAY[k]] : null) : st ? st[k] : null);
  const dk = (c, p, k, g) => delta(nv(c, k), nv(p, k), g);
  function delta(a, b, good) { if (!fin(a) || !fin(b) || !+b) return '<span class="dl flat">—</span>'; const ch = a / b - 1; const cls = Math.abs(ch) < 0.005 || !good ? 'flat' : (ch > 0) === (good > 0) ? 'up' : 'down'; return `<span class="dl ${cls}">${ch > 0 ? '▲' : ch < 0 ? '▼' : ''} ${F.p0(Math.abs(ch))}</span>`; }
  dash.draw('mKpis', (el) => {
    const c = cur(), p = prev(); if (!c.days) { el.innerHTML = '<div class="empty">No data for this range</div>'; return; }
    const { s, e } = rng(); const B = buckets(s, e, dd(s, e) > 120 ? 'week' : 'day');
    el.innerHTML = GROUPS[el.dataset.group].map((k) => { const [l, f, g, acc] = K[k]; return `<div class="kpi ${acc}"><div class="l"><span>${l}</span>${dk(c, p, k, g)}</div><div class="v">${fmt(c[k], f)}</div><div class="s">${SUBS[k] ? SUBS[k](c, p) : 'before: ' + fmt(p[k], f)}</div>${spark(B.map((b) => b.st[k]), ACC[acc])}</div>`; }).join('');
  });
  dash.draw('mVsNote', (el) => { const { s, e } = prevRng(); el.textContent = `▲▼ compare with ${dLblY(s)} – ${dLblY(e)} · totals are compared per day of data, so a shorter admin-panel feed doesn't look like a drop`; });
  dash.draw('mHeroChips', (el) => {
    const Mo = model(); const { s, e } = rng(); const c = cur();
    const X = SRC(); el.innerHTML = `<span>${esc(`Range ${dLblY(s)} – ${dLblY(e)} (${c.days || 0} days)`)}</span>` + ['adjust', 'ads', 'admin', 'ga', 'ig', 'yt'].filter((k) => X[k]).map((k) => `<span${X[k] < YDAY ? ' class="stale"' : ''}>${esc(SRCN[k])} to ${esc(dLbl(X[k]))}</span>`).join('');
    const pane = document.querySelector('.m-page-pane:not([hidden]) > .m-tabpane:not([hidden])'); if (pane) { renderSheets(pane); setTimeout(() => collapseTables(pane), 80); }
  });
  dash.draw('mEstNote', (el) => { el.textContent = cur().est ? 'Some days in this range use the month’s spend spread evenly — no daily figure exists for Google and ShareChat, or for Meta in May–Aug 2026.' : 'Exact daily spend.'; });
  dash.draw('mDayChart', (el) => {
    const { s, e } = rng(); const B = buckets(s, e); const cats = B.map((b) => b.l), col = (k) => B.map((b) => b.st[k]); const k = el.dataset.k;
    if (k === 'users') chart(el, { cats, bars: [{ name: 'Installs', values: col('installs'), color: COL[0] }], lines: [{ name: 'DAU', values: col('dau'), color: COL[1] }, { name: 'Uninstalls', values: col('uninst'), color: COL[2], dash: 1 }] });
    if (k === 'spend') chart(el, { cats, stacked: true, bars: [{ name: 'Meta', values: col('meta'), color: COL[0] }, { name: 'Google', values: col('google'), color: COL[1] }, { name: 'ShareChat', values: col('sc'), color: COL[2] }], y2: [{ name: 'CPI', values: col('cpi'), color: 'var(--color-fg)' }], fy: F.inr, fy2: F.inr0 });
    if (k === 'rev') chart(el, { cats, stacked: true, bars: [{ name: 'Subscriptions', values: col('subRev'), color: COL[0] }, { name: 'AdMob', values: col('admob'), color: COL[1] }], fy: F.inr });
    if (k === 'depth') chart(el, { cats, bars: [{ name: 'Episodes per active user', values: col('epsDau'), color: COL[0] }], y2: [{ name: 'Watch minutes per viewer', values: col('minViewer'), color: COL[1] }], fy: F.d1, fy2: F.d1 });
    if (k === 'ret') chart(el, { cats, lines: [{ name: 'Day 1', values: col('d1'), color: COL[0] }, { name: 'Day 7', values: col('d7'), color: COL[1] }], fy: F.p0 });
  });
  const wBuckets = () => { const { s, e } = rng(); return buckets(s, e, dd(s, e) <= 21 ? 'day' : dd(s, e) <= 200 ? 'week' : 'month'); };
  dash.draw('mWeekChart', (el) => {
    const B = wBuckets(); const cats = B.map((b) => b.l), col = (k) => B.map((b) => b.st[k]); const k = el.dataset.k;
    if (k === 'uninst') chart(el, { cats, bars: [{ name: 'Installs', values: col('installs'), color: COL[0] }, { name: 'Uninstalls', values: col('uninst'), color: COL[1] }], y2: [{ name: 'Uninstalls ÷ installs', values: col('uRate'), color: 'var(--color-fg)' }], fy2: F.p0 });
    if (k === 'subs') chart(el, { cats, bars: [{ name: 'Revenue', values: col('subRev'), color: COL[0] }], y2: [{ name: 'Payments', values: col('payers'), color: COL[1] }], fy: F.inr, fy2: F.int });
    if (k === 'arpdau') chart(el, { cats, bars: [{ name: 'Revenue per active user a day', values: col('arpdau'), color: COL[2] }], fy: F.inr1 });
    if (k === 'sess') chart(el, { cats, bars: [{ name: 'Sessions per active user a day', values: col('sessDau'), color: COL[0] }], y2: [{ name: 'Watch minutes per session', values: col('minSess'), color: COL[1] }], fy: F.d2, fy2: F.d1 });
    if (k === 'admob') chart(el, { cats, bars: [{ name: 'AdMob revenue', values: col('admob'), color: COL[0] }], y2: [{ name: 'eCPM', values: col('ecpm'), color: COL[1] }], fy: F.inr, fy2: F.inr0 });
  });

  // ====================================================================== month by month (chips)
  let CHIPS = null, CHIPRK = '';
  const MET = [['Users'], ['installs'], ['dau'], ['mau'], ['d1'], ['d7'], ['uninst'], ['uRate'], ['reinst'], ['react'], ['Viewing'], ['sess'], ['sessDau'], ['minSess'], ['minViewer'], ['eps'], ['epsDau'], ['vidsViewer'], ['hours'], ['hoursUser'], ['Revenue'], ['payers'], ['subRev'], ['admob'], ['ecpm'], ['arpdau'], ['Marketing'], ['pm'], ['meta'], ['google'], ['sc'], ['paidInst'], ['cpi'], ['retcpi'], ['idx'], ['infl'], ['inflInst'], ['inflCpi'], ['casting'], ['oem'], ['oemInst'], ['oemCpi'], ['total'], ['blended']];
  function chips() {
    const { s, e } = rng(); const Mo = model(); if (!Mo) return []; const rk = s + e;
    if (rk !== CHIPRK || !CHIPS) { CHIPRK = rk; CHIPS = monthsIn(s, e).filter((m) => Mo.months.includes(m)); }
    const box = document.getElementById('m-months');
    if (box) {
      const avail = Mo.months.filter((m) => m >= '2025-10' && !CHIPS.includes(m));
      box.innerHTML = CHIPS.map((m) => `<span class="mchip">${mfull(m)}<button data-rm="${m}" title="Remove">×</button></span>`).join('') + `<select class="msel" data-add><option value="">+ Add a month</option>${avail.map((m) => `<option value="${m}">${mfull(m)}</option>`).join('')}</select><button class="mbtn" data-reset>Reset to date range</button>`;
      box.onclick = (ev) => { const b = ev.target.closest('[data-rm]'); if (b) { CHIPS = CHIPS.filter((m) => m !== b.dataset.rm); redrawPane(box); } if (ev.target.closest('[data-reset]')) { CHIPS = null; CHIPRK = ''; redrawPane(box); } };
      box.querySelector('[data-add]').onchange = (ev) => { if (ev.target.value) { CHIPS = [...CHIPS, ev.target.value].sort(); redrawPane(box); } };
    }
    return CHIPS;
  }
  const redrawPane = (el) => { const p = el.closest('.m-tabpane'); if (p) { dash.redraw(p); setTimeout(() => collapseTables(p), 60); } };
  dash.draw('mMonthTbl', (el) => {
    const ms = chips(); if (!ms.length) { el.innerHTML = '<p class="muted">Add at least one month above.</p>'; return; }
    const st = ms.map(mStats); const Mo = model();
    el.innerHTML = `<table data-nocollapse><thead><tr><th>Metric</th>${ms.map((m) => `<th>${mlabel(m)}${monthEnd(m) > Mo.last ? '*' : ''}</th>`).join('')}${ms.length > 1 ? '<th>First → last</th>' : ''}</tr></thead><tbody>${MET.map(([k]) => (K[k] ? `<tr><td>${K[k][0]}</td>${st.map((r) => `<td>${fmt(r[k], K[k][1])}</td>`).join('')}${ms.length > 1 ? `<td>${dk(st[st.length - 1], st[0], k, K[k][2])}</td>` : ''}</tr>` : `<tr><td colspan="${ms.length + 2}" style="padding-top:14px"><b>${k}</b></td></tr>`)).join('')}</tbody></table><p class="muted" style="margin-top:8px">* month still running. Influencer, casting and OEM spend exist only for Sep–Nov 2026.</p>`;
  });
  const SPEND = [['Meta', 'meta', COL[0]], ['Google', 'google', COL[1]], ['ShareChat', 'sc', COL[2]], ['Influencer', 'infl', COL[3]], ['Casting', 'casting', COL[4]], ['OEM', 'oem', COL[5]]];
  dash.draw('mSpendLegend', (el) => { el.innerHTML = SPEND.map(([l, , c]) => `<span><i style="background:${c}"></i>${l}</span>`).join(''); });
  dash.draw('mMonthChart', (el) => {
    const Mo = model(); if (!Mo) return; const ms = Mo.months.filter((m) => m >= '2025-10'); const sel0 = el.closest('[data-tab="months"]') ? chips() : monthsIn(rng().s, rng().e);
    const sel = new Set(ms.map((m, i) => (sel0.includes(m) ? i : -1)).filter((i) => i >= 0)); const st = ms.map(mStats); const cats = ms.map(mlabel), col = (k) => st.map((r) => r[k]); const k = el.dataset.k;
    if (k === 'users') chart(el, { cats, sel, bars: [{ name: 'Installs', values: col('installs'), color: COL[0] }], y2: [{ name: 'DAU', values: col('dau'), color: COL[1] }, { name: 'MAU', values: col('mau'), color: COL[2] }] });
    if (k === 'spend') chart(el, { cats, sel, stacked: true, bars: SPEND.map(([l, kk, c]) => ({ name: l, values: col(kk), color: c })), fy: F.inr });
    if (k === 'cpi') chart(el, { cats, sel, lines: [{ name: 'CPI', values: col('cpi'), color: COL[0] }, { name: 'Ret CPI', values: col('retcpi'), color: COL[1] }, { name: 'Influencer CPI', values: col('inflCpi'), color: COL[2], dash: 1 }], fy: F.inr0 });
    if (k === 'ret') chart(el, { cats, sel, lines: [{ name: 'Day 1', values: col('d1'), color: COL[0] }, { name: 'Day 7', values: col('d7'), color: COL[1] }], fy: F.p0 });
    if (k === 'depth') chart(el, { cats, sel, bars: [{ name: 'Episodes per active user a day', values: col('epsDau'), color: COL[0] }], y2: [{ name: 'Watch minutes per session', values: col('minSess'), color: COL[1] }], fy: F.d1, fy2: F.d1 });
    if (k === 'rev') chart(el, { cats, sel, stacked: true, bars: [{ name: 'Subscriptions', values: col('subRev'), color: COL[0] }, { name: 'AdMob', values: col('admob'), color: COL[1] }], fy: F.inr });
    const i0 = Math.max(0, ms.indexOf('2026-08')); const sl = (kk) => col(kk).slice(i0); const sel2 = new Set([...sel].map((i) => i - i0).filter((i) => i >= 0));
    if (k === 'infl') chart(el, { cats: cats.slice(i0), sel: sel2, stacked: true, bars: [{ name: 'Influencer', values: sl('infl'), color: COL[0] }, { name: 'Casting', values: sl('casting'), color: COL[1] }, { name: 'OEM', values: sl('oem'), color: COL[2] }], fy: F.inr });
    if (k === 'inflcpi') chart(el, { cats: cats.slice(i0), sel: sel2, bars: [{ name: 'Influencer CPI', values: sl('inflCpi'), color: COL[0] }, { name: 'Paid CPI', values: sl('cpi'), color: COL[1] }], fy: F.inr0 });
  });
  const OEMS = [['OPPO', /oppo/i], ['Vivo', /vivo/i], ['Xiaomi', /xiaomi/i], ['Transsion', /transsion/i], ['MOLOCO', /moloco/i], ['Mobinet Media', /mobinet/i]];
  dash.draw('mOemTbl', (el) => {
    const ch = rowsOf('channels'); const { s, e } = rng(); const ms = monthsIn(s, e); const data = [];
    OEMS.forEach(([name, re]) => ms.forEach((m) => { const r = ch.filter((x) => x.month === m && re.test(x.channel)); const i = d3.sum(r, (x) => n(x.installs)); if (i > 0) data.push({ src: name, m: mlabel(m), installs: i, d1: d3.sum(r, (x) => n(x.retention_rate_d1) * n(x.installs)) / i, d7: d3.sum(r, (x) => n(x.retention_rate_d7) * n(x.installs)) / i }); }));
    if (ms.includes('2026-11') && T3['2026-11'] && T3['2026-11'].oem) { const t = T3['2026-11'].oem; data.push({ src: 'OEM (tracker)', m: 'Nov 26', installs: t.installs, d1: t.d1, d7: t.d7, spend: t.spend, cpi: t.cpi }); }
    if (!data.length) { el.innerHTML = '<p class="muted">No OEM or other-network installs in this range.</p>'; return; }
    table(el, [{ k: 'src', label: 'Source', l: 1 }, { k: 'm', label: 'Month', l: 1 }, { k: 'installs', label: 'Installs', f: 'int' }, { k: 'd1', label: 'D1', f: 'p1' }, { k: 'd7', label: 'D7', f: 'p1' }, { k: 'spend', label: 'Spend', f: 'inr' }, { k: 'cpi', label: 'CPI', f: 'inr1' }], data);
  });

  // ====================================================================== compare periods
  const CMP = { gran: 'month', year: null, month: null, a: 'installs', b: 'cpi' };
  const CMPMET = ['installs', 'dau', 'mau', 'd1', 'd7', 'uRate', 'reinst', 'react', 'eps', 'epsDau', 'minViewer', 'minSess', 'hours', 'payers', 'subRev', 'admob', 'revenue', 'arpdau', 'ecpm', 'pm', 'paidInst', 'cpi', 'retcpi', 'infl', 'total', 'blended'];
  function cmpPeriods() {
    const Mo = model(); if (!Mo || !CMP.year) return []; const y = CMP.year; const out = [];
    if (CMP.gran === 'month') for (let i = 1; i <= 12; i++) { const m = `${y}-${String(i).padStart(2, '0')}`; if (Mo.months.includes(m)) out.push({ s: m + '-01', e: monthEnd(m), l: MON[i - 1] }); }
    if (CMP.gran === 'quarter') for (let q = 0; q < 4; q++) { const s = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`, e = monthEnd(`${y}-${String(q * 3 + 3).padStart(2, '0')}`); if (e >= Mo.first && s <= Mo.last) out.push({ s, e, l: 'Q' + (q + 1) }); }
    if (CMP.gran === 'week') { const m = CMP.month; let d = m + '-01'; const dow = (new Date(d).getUTCDay() + 6) % 7; d = addD(d, -dow); while (d <= monthEnd(m)) { const e = addD(d, 6); if (e >= Mo.first && d <= Mo.last) out.push({ s: d, e, l: dLbl(d) }); d = addD(d, 7); } }
    out.forEach((p) => { p.part = p.s < Mo.first || p.e > Mo.last; const s = p.s < Mo.first ? Mo.first : p.s, e = p.e > Mo.last ? Mo.last : p.e; p.st = stats(s, e); });
    return out;
  }
  function cmpInit() {
    const Mo = model(); const ys = document.querySelector('[data-cmp="year"]'); if (!ys || ys._b || !Mo) return; ys._b = 1;
    const years = [...new Set(Mo.months.map((m) => m.slice(0, 4)))]; const { e } = rng(); CMP.year = e.slice(0, 4); CMP.month = e.slice(0, 7);
    ys.innerHTML = years.map((y) => `<option${y === CMP.year ? ' selected' : ''}>${y}</option>`).join('');
    const msel = document.querySelector('[data-cmp="month"]'); const fillM = () => { msel.innerHTML = Mo.months.filter((m) => m.startsWith(CMP.year)).map((m) => `<option value="${m}"${m === CMP.month ? ' selected' : ''}>${MON[+m.slice(5) - 1]}</option>`).join(''); if (!CMP.month.startsWith(CMP.year)) CMP.month = msel.value; }; fillM();
    ['a', 'b'].forEach((k) => { const s = document.querySelector(`[data-cmp="${k}"]`); s.innerHTML = (k === 'b' ? '<option value="">None</option>' : '') + CMPMET.map((x) => `<option value="${x}"${x === CMP[k] ? ' selected' : ''}>${K[x][0]}</option>`).join(''); s.onchange = () => { CMP[k] = s.value; redrawPane(s); }; });
    ys.onchange = () => { CMP.year = ys.value; fillM(); redrawPane(ys); }; msel.onchange = () => { CMP.month = msel.value; redrawPane(msel); };
    document.querySelectorAll('[data-cmp="gran"] button').forEach((b) => { b.onclick = () => { CMP.gran = b.dataset.v; redrawPane(b); }; });
  }
  dash.draw('mCmpTitle', (el) => { cmpInit(); document.querySelectorAll('[data-cmp="gran"] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === CMP.gran)); const w = document.querySelector('[data-cmp-monthwrap]'); if (w) w.style.display = CMP.gran === 'week' ? '' : 'none'; if (!CMP.year) return; el.textContent = `${K[CMP.a][0]}${CMP.b ? ' and ' + K[CMP.b][0] : ''} — ${CMP.gran === 'week' ? 'week on week, ' + mfull(CMP.month) : CMP.gran === 'month' ? 'month on month, ' + CMP.year : 'quarter on quarter, ' + CMP.year}`; });
  dash.draw('mCmpLegend', (el) => { el.innerHTML = `<span><i class="k0"></i>${K[CMP.a][0]}</span>` + (CMP.b ? `<span><i class="k1"></i>${K[CMP.b][0]}</span>` : ''); });
  const chgLabel = (v, p, g) => { if (!fin(v) || !fin(p) || !+p) return null; const c = v / p - 1; return { t: (c > 0 ? '+' : '') + F.p0(c), c: !g ? 'var(--color-fg-muted)' : (c > 0) === (g > 0) ? '#12a150' : '#d92d20' }; };
  dash.draw('mCmpChart', (el) => {
    cmpInit(); const P = cmpPeriods(); const [, fa, ga] = K[CMP.a]; const va = P.map((p) => p.st[CMP.a]);
    chart(el, { h: 300, cats: P.map((p) => p.l + (p.part ? '*' : '')), tipCats: P.map((p) => `${dLblY(p.s)} – ${dLblY(p.e)}`), bars: [{ name: K[CMP.a][0], values: va, color: COL[0] }], labels: P.map((p, i) => (i ? chgLabel(nv(p.st, CMP.a), nv(P[i - 1].st, CMP.a), ga) : null)), y2: CMP.b ? [{ name: K[CMP.b][0], values: P.map((p) => p.st[CMP.b]), color: COL[1] }] : [], fy: (v) => fmt(v, fa), fy2: CMP.b ? (v) => fmt(v, K[CMP.b][1]) : null });
  });
  dash.draw('mCmpSmall', (el) => {
    cmpInit(); const P = cmpPeriods(); const pick = ['installs', 'dau', 'd1', 'epsDau', 'subRev', 'admob', 'pm', 'cpi'].filter((k) => k !== CMP.a && k !== CMP.b).slice(0, 6);
    el.innerHTML = pick.map((k) => `<div class="card"><h3>${K[k][0]}</h3><div class="chart short" data-cmpk="${k}"></div></div>`).join('');
    el.querySelectorAll('[data-cmpk]').forEach((c, i) => { const k = c.dataset.cmpk; const v = P.map((p) => p.st[k]); chart(c, { h: 170, cats: P.map((p) => p.l), bars: [{ name: K[k][0], values: v, color: COL[(i + 2) % COL.length] }], labels: P.map((p, j) => (j ? chgLabel(nv(p.st, k), nv(P[j - 1].st, k), K[k][2]) : null)), fy: (x) => fmt(x, K[k][1]) }); });
  });
  dash.draw('mCmpTbl', (el) => {
    cmpInit(); const P = cmpPeriods();
    el.innerHTML = `<table data-nocollapse><thead><tr><th>Metric</th>${P.map((p) => `<th>${esc(p.l)}${p.part ? '*' : ''}</th>`).join('')}</tr></thead><tbody>${CMPMET.map((k) => `<tr><td>${K[k][0]}</td>${P.map((p, i) => `<td>${fmt(p.st[k], K[k][1])}${i ? ' ' + dk(p.st, P[i - 1].st, k, K[k][2]) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  });

  // ====================================================================== relaunch
  const ERA = { before: ['2026-01-01', '2026-06-16'], after: ['2026-09-07', null] };
  const ERAMET = [['dau', 'Daily active users'], ['installs', 'Installs a day', 'adjDays'], ['d1', 'Day-1 retention'], ['d7', 'Day-7 retention'], ['u0', 'Uninstall on install day'], ['epsDau', 'Episodes per active user'], ['vidsViewer', 'Episodes per viewer'], ['minViewer', 'Watch min per viewer'], ['minSess', 'Watch min per session'], ['payersDay', 'Paying users a day'], ['subRev', 'Subscription revenue a day', 'admDays'], ['admob', 'AdMob revenue a day', 'admDays'], ['ecpm', 'AdMob eCPM'], ['arpdau', 'Revenue per active user'], ['pm', 'Paid spend a day', 'days'], ['cpi', 'Paid CPI'], ['retcpi', 'Ret CPI']];
  dash.draw('mEras', (el) => {
    const Mo = model(); if (!Mo) return; const { s, e } = rng();
    const S3 = [['Before', stats(ERA.before[0], ERA.before[1]), '#8a8f98'], ['After', stats(ERA.after[0], Mo.last), '#7c4ddb'], ['Your range', stats(s, e), '#f08c2e']];
    el.innerHTML = ERAMET.map(([k, l, per]) => { const vals = S3.map(([, st]) => (per ? (fin(st[k]) && st[per] ? st[k] / st[per] : null) : st[k])); const mx = Math.max(...vals.filter(fin).map(Number), 0) || 1; const f = K[k][1];
      return `<div class="era"><h4>${l}</h4>${S3.map(([nm, , c], i) => `<div class="row"><span>${nm}</span><div class="bar"><i style="width:${fin(vals[i]) ? Math.max(2, (vals[i] / mx) * 100) : 0}%;background:${c}"></i></div><b>${fmt(vals[i], f)}</b></div>`).join('')}<div class="row" style="grid-template-columns:1fr"><span class="muted">After vs before ${delta(vals[1], vals[0], K[k][2])}</span></div></div>`; }).join('');
  });
  dash.draw('mEraChart', (el) => {
    const Mo = model(); if (!Mo) return; const B = buckets('2026-01-01', Mo.last, 'week'); const keys = B.map((b) => b.s); const cats = B.map((b) => b.l), col = (k) => B.map((b) => b.st[k]);
    const bands = [{ s: ERA.before[0], e: ERA.before[1], c: '#8a8f98', l: 'Before' }, { s: ERA.after[0], e: Mo.last, c: '#7c4ddb', l: 'After' }];
    if (el.dataset.k === 'users') chart(el, { cats, keys, bands, bars: [{ name: 'Installs a week', values: col('installs'), color: COL[0] }], y2: [{ name: 'DAU', values: col('dau'), color: COL[1] }] });
    else chart(el, { cats, keys, bands, bars: [{ name: 'Episodes per active user', values: col('epsDau'), color: COL[2] }], y2: [{ name: 'Paid CPI', values: col('cpi'), color: COL[3] }], fy: F.d1, fy2: F.inr0 });
  });

  // ====================================================================== revenue & brand deals
  const DEALS = (() => {
    const t = sheetBlock('biz_00', 'A'); if (!t) return []; const { h, m } = headerMap(t.rows); const out = [];
    t.rows.slice(h + 1).forEach((r) => { const brand = r[0]; const st = (r[m.Status] || '').trim(); if (!brand || !/^(Closed|Hot|Warm|Cold)$/i.test(st)) return; const cm = (r[m['Closure Month']] || '').trim(); const mi = MON.findIndex((x) => cm.toLowerCase().includes(x.toLowerCase())); out.push({ brand, rep: r[m['Sales Rep']] || '—', det: r[m['Brand Details']] || '', stage: st[0].toUpperCase() + st.slice(1).toLowerCase(), type: (r[m['Campaign Type']] || '').replace(/\s+/g, ' ').trim(), v: pn(r[m['Expected Rev Pipeline']]) || 0, terms: r[m.Terms] || '', month: mi >= 0 ? `2026-${String(mi + 1).padStart(2, '0')}` : null, cmRaw: cm }); });
    return out;
  })();
  const STAGES = ['Closed', 'Hot', 'Warm', 'Cold']; const STC = { Closed: '#12a150', Hot: '#e5532b', Warm: '#e0a321', Cold: '#3a7bd5' };
  const dealsInRange = () => { const box = document.querySelector('[data-deal-range]'); const rep = (document.querySelector('[data-deal-rep]') || {}).value || ''; const { s, e } = rng(); const ms = monthsIn(s, e); return DEALS.filter((d) => (!rep || d.rep === rep) && (!box || !box.checked || !d.month || ms.includes(d.month))); };
  function dealInit() { const r = document.querySelector('[data-deal-rep]'); if (!r || r._b) return; r._b = 1; r.innerHTML = '<option value="">All</option>' + [...new Set(DEALS.map((d) => d.rep))].map((x) => `<option>${esc(x)}</option>`).join(''); [r, document.querySelector('[data-deal-range]')].forEach((c) => c.addEventListener('change', () => redrawPane(c))); }
  dash.draw('mDealNote', (el) => { dealInit(); const D = dealsInRange(); el.textContent = `${D.length} of ${DEALS.length} brands · Business Performance Tracker, Table 1 · brands with no closure month are always shown`; });
  dash.draw('mDealStages', (el) => { dealInit(); const D = dealsInRange(); el.innerHTML = STAGES.map((s) => { const x = D.filter((d) => d.stage === s); const xv = x.filter((d) => d.v); return `<div class="stage st-${s}"><span class="l">${s}</span><span class="v">${F.inr(d3.sum(x, (d) => d.v))}</span><span>${x.length} brand${x.length === 1 ? '' : 's'}${xv.length ? ' · avg ' + F.inr(d3.mean(xv, (d) => d.v)) : ''}</span></div>`; }).join(''); });
  dash.draw('mDealLegend', (el) => { el.innerHTML = STAGES.map((s) => `<span><i style="background:${STC[s]}"></i>${s}</span>`).join(''); });
  dash.draw('mDealChart', (el) => {
    dealInit(); const D = dealsInRange(); const k = el.dataset.k;
    if (k === 'month') { const ms = [...new Set(D.map((d) => d.month).filter(Boolean))].sort(); const cats = [...ms.map(mlabel), 'No month']; const key = [...ms, null]; chart(el, { cats, stacked: true, bars: STAGES.map((s) => ({ name: s, values: key.map((m) => d3.sum(D.filter((d) => d.stage === s && d.month === m), (d) => d.v)), color: STC[s] })), fy: F.inr }); }
    if (k === 'rep') { const reps = [...new Set(D.map((d) => d.rep))]; chart(el, { cats: reps, stacked: true, bars: STAGES.map((s) => ({ name: s, values: reps.map((r) => d3.sum(D.filter((d) => d.stage === s && d.rep === r), (d) => d.v)), color: STC[s] })), fy: F.inr }); }
    if (k === 'type') { const g = d3.rollups(D.filter((d) => (d.stage === 'Closed' || d.stage === 'Hot') && d.type), (v) => d3.sum(v, (d) => d.v), (d) => d.type.replace(/ ?\+ ?/g, ' + ')).sort((a, b) => b[1] - a[1]); hbar(el, g.map(([t, v], i) => ({ k: t, v, c: COL[i % COL.length] })), { f: F.inr }); }
  });
  dash.draw('mDealRepTbl', (el) => { dealInit(); const D = dealsInRange(); const reps = [...new Set(D.map((d) => d.rep))]; table(el, [{ k: 'rep', label: 'Rep', l: 1 }, ...STAGES.map((s) => ({ k: s, label: s, f: 'int' })), { k: 'val', label: 'Closed + hot value', f: 'inr' }], reps.map((r) => { const o = { rep: r, val: d3.sum(D.filter((d) => d.rep === r && (d.stage === 'Closed' || d.stage === 'Hot')), (d) => d.v) }; STAGES.forEach((s) => { o[s] = D.filter((d) => d.rep === r && d.stage === s).length; }); return o; }), { sort: 'val' }); });
  const DOPEN = { Closed: true, Hot: true };
  dash.draw('mDealLists', (el) => {
    dealInit(); const D = dealsInRange();
    el.innerHTML = STAGES.map((s) => { const x = D.filter((d) => d.stage === s).sort((a, b) => b.v - a.v); return `<details class="mdet" data-st="${s}"${DOPEN[s] ? ' open' : ''} style="margin-bottom:10px"><summary><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${STC[s]};margin-right:8px"></i>${s} — ${x.length} brands · ${F.inr(d3.sum(x, (d) => d.v))}</span></summary><div class="body"><div class="deals">${x.map((d) => `<div class="deal"><div class="n"><span>${esc(d.brand)}</span>${d.v ? `<span>${F.inr(d.v)}</span>` : ''}</div><div class="m">${esc(d.rep)}${d.det ? ' · ' + esc(d.det) : ''}</div><div>${d.type ? `<span class="tag">${esc(d.type)}</span> ` : ''}${d.cmRaw ? `<span class="tag">${esc(d.cmRaw)}</span>` : ''}</div>${d.terms ? `<div class="m">${esc(d.terms)}</div>` : ''}</div>`).join('') || '<p class="muted">None in this range.</p>'}</div></div></details>`; }).join('');
    el.querySelectorAll('details[data-st]').forEach((d) => d.addEventListener('toggle', () => { DOPEN[d.dataset.st] = d.open; }));
  });
  const T2 = (() => { const t = sheetBlock('biz_00', 'J'); const out = []; if (!t) return out; t.rows.forEach((r) => { if (r[2] && /^[A-Z][a-z]{2}$/.test(r[2]) && r[0] !== 'Revenue Source') out.push({ src: r[0], v: pn(r[1]), m: r[2], target: pn(r[3]) }); }); return out; })();
  const REVC = ['Subscriptions', 'Admob revenue', 'Content Syndication', 'Brand Deals'];
  dash.draw('mRevLegend', (el) => { el.innerHTML = REVC.map((s, i) => `<span><i style="background:${COL[i]}"></i>${s}</span>`).join('') + '<span><i style="background:var(--color-fg)"></i>Target</span>'; });
  dash.draw('mRevChart', (el) => { const { s, e } = rng(); const rm = monthsIn(s, e).map((m) => MON[+m.slice(5) - 1]); const ms = [...new Set(T2.map((r) => r.m))]; const sel = new Set(ms.map((m, i) => (rm.includes(m) ? i : -1)).filter((i) => i >= 0)); chart(el, { cats: ms, sel, stacked: true, bars: REVC.map((x, i) => ({ name: x, values: ms.map((m) => (T2.find((r) => r.m === m && r.src === x) || {}).v), color: COL[i] })), lines: [{ name: 'Target', values: ms.map((m) => d3.sum(T2.filter((r) => r.m === m), (r) => r.target || 0)), color: 'var(--color-fg)', dash: 1 }], fy: F.inr }); });
  dash.draw('mRevWeek', (el) => { const B = wBuckets(); chart(el, { cats: B.map((b) => b.l), stacked: true, bars: [{ name: 'Subscriptions', values: B.map((b) => b.st.subRev), color: COL[0] }, { name: 'AdMob', values: B.map((b) => b.st.admob), color: COL[1] }], fy: F.inr }); });

  // ====================================================================== app extras
  dash.draw('mUninstNote', (el) => { const c = cur(); el.textContent = fin(c.u0) ? `In this range ${F.p1(c.u0)} of new users uninstalled on install day, and uninstalls were ${fmt(c.uRate, 'p0')} of installs.` : ''; });
  dash.draw('mSessTbl', (el) => { const { s, e } = rng(); table(el, [{ k: 'l', label: 'Month', l: 1 }, { k: 'sess', label: 'Sessions', f: 'big' }, { k: 'sessDau', label: 'Sessions / user a day', f: 'd2' }, { k: 'minSess', label: 'Watch min / session', f: 'd1' }, { k: 'minViewer', label: 'Watch min / viewer a day', f: 'd1' }, { k: 'vidsViewer', label: 'Episodes / viewer a day', f: 'd1' }], monthsIn(s, e).map((m) => ({ ...mStats(m), l: mlabel(m) })).reverse()); });
  dash.draw('mAdmobTbl', (el) => { const { s, e } = rng(); table(el, [{ k: 'l', label: 'Month', l: 1 }, { k: 'admob', label: 'AdMob revenue', f: 'inr' }, { k: 'admobImp', label: 'Impressions', f: 'big' }, { k: 'ecpm', label: 'eCPM (₹)', f: 'd1' }, { k: 'subRev', label: 'Subscriptions', f: 'inr' }, { k: 'share', label: 'AdMob share', f: 'p0' }], monthsIn(s, e).map((m) => { const st = mStats(m); return { ...st, l: mlabel(m), share: st.revenue ? st.admob / st.revenue : null }; }).reverse()); });

  // ====================================================================== series
  const SERC = new Map();
  function serAgg(s0, e0) {
    const r0 = rng(); const s = s0 || r0.s, e = e0 || r0.e; const k = s + e; if (SERC.has(k)) return SERC.get(k);
    const ser = rowsOf('series_daily').filter((r) => r.day >= s && r.day <= e); let out = { rows: [], days: [], totH: 0, totViews: 0 };
    if (ser.length) {
      const days = [...new Set(ser.map((r) => r.day))].sort(); const lastD = days[days.length - 1]; const d7 = addD(lastD, -6), d14 = addD(lastD, -13);
      const by = d3.group(ser, (r) => r.series); const totH = d3.sum(ser, (r) => n(r.hours));
      const rows = [...by].map(([name, v]) => { v.sort((a, b) => a.day.localeCompare(b.day)); const vd = d3.sum(v, (r) => n(r.viewers)), views = d3.sum(v, (r) => n(r.views)), hours = d3.sum(v, (r) => n(r.hours)); const h7 = d3.sum(v.filter((r) => r.day >= d7), (r) => n(r.hours)), hp = d3.sum(v.filter((r) => r.day >= d14 && r.day < d7), (r) => n(r.hours)); const map = new Map(v.map((r) => [r.day, n(r.viewers)])); const di = days.filter((d) => d >= v[0].day); const roll = di.map((d, i) => d3.sum(di.slice(Math.max(0, i - 6), i + 1), (x) => map.get(x) || 0)); const best = d3.max(roll) || 0, latest = roll.length ? roll[roll.length - 1] : 0; return { name, cat: v[0].category, vd, views, hours, share: totH ? hours / totH : null, vpv: vd ? views / vd : null, mpv: vd ? (hours * 60) / vd : null, days: v.filter((r) => n(r.viewers) > 0).length, first: v[0].day, trend: hp ? h7 / hp - 1 : null, h7, hp, latest, drop: best ? latest / best - 1 : null }; });
      out = { rows, days, totH, totViews: d3.sum(ser, (r) => n(r.views)) };
    }
    SERC.set(k, out); return out;
  }
  let SER_PICK = null, SER_Q = '';
  dash.draw('mSerTiles', (el) => {
    const A = serAgg(), { s, e } = prevRng(), P = serAgg(s, e); const r = A.rows; if (!r.length) { el.innerHTML = '<div class="empty">No series data in this range</div>'; return; }
    const top = r.slice().sort((a, b) => b.hours - a.hours)[0]; const deep = r.filter((x) => x.vd >= 500).sort((a, b) => b.mpv - a.mpv)[0]; const t10 = (R, T) => d3.sum(R.slice().sort((a, b) => b.hours - a.hours).slice(0, 10), (x) => x.hours) / (T || 1);
    const live = r.filter((x) => x.hours > 0).length, liveP = P.rows.filter((x) => x.hours > 0).length;
    el.innerHTML = [['Series watched', F.int(live), delta(live, liveP, 1), `${A.days.length} days of data`, 'a-view'], ['Episodes watched', F.big(A.totViews), delta(A.totViews, P.totViews, 1), 'all series', 'a-view'], ['Watch hours', F.big(A.totH), delta(A.totH, P.totH, 1), 'all series', 'a-view'], ['Most watched', esc(top.name), '', `${F.big(top.hours)} h · ${F.p0(top.share)} of hours`, 'a-users'], ['Deepest viewing', deep ? esc(deep.name) : '—', '', deep ? `${F.d1(deep.mpv)} min per viewer-day` : 'needs 500+ viewer-days', 'a-rev'], ['Top 10 share of hours', F.p0(t10(r, A.totH)), delta(t10(r, A.totH), t10(P.rows, P.totH), 0), 'how concentrated viewing is', 'a-mkt']]
      .map(([l, v, d, s2, a]) => `<div class="kpi ${a}"><div class="l"><span>${l}</span>${d}</div><div class="v" style="${v.length > 12 ? 'font-size:19px' : ''}">${v}</div><div class="s">${s2}</div></div>`).join('');
  });
  dash.draw('mSerTop', (el) => { const N = +(el.dataset.n || 15); const r = serAgg().rows.slice().sort((a, b) => b.hours - a.hours).slice(0, N); hbar(el, r.map((x, i) => ({ k: x.name, v: x.hours, c: COL[i % COL.length], note: F.big(x.views) + ' eps' }))); });
  dash.draw('mSerGenreChart', (el) => { const A = serAgg(); const g = d3.rollups(A.rows, (v) => d3.sum(v, (x) => x.hours), (x) => x.cat || '—').sort((a, b) => b[1] - a[1]); hbar(el, g.map(([k, v], i) => ({ k, v, c: COL[i % COL.length], note: F.p0(v / (A.totH || 1)) }))); });
  dash.draw('mSerGenre', (el) => { const A = serAgg(); const g = d3.rollups(A.rows, (v) => ({ n: v.length, hours: d3.sum(v, (x) => x.hours), vd: d3.sum(v, (x) => x.vd), views: d3.sum(v, (x) => x.views) }), (x) => x.cat || '—'); table(el, [{ k: 'cat', label: 'Genre', l: 1 }, { k: 'n', label: 'Series', f: 'int' }, { k: 'hours', label: 'Watch hours', f: 'big' }, { k: 'mpv', label: 'Min / viewer-day', f: 'd1' }, { k: 'vpv', label: 'Episodes / viewer-day', f: 'd1' }], g.map(([cat, a]) => ({ cat, ...a, mpv: a.vd ? (a.hours * 60) / a.vd : null, vpv: a.vd ? a.views / a.vd : null })), { sort: 'hours' }); });
  dash.draw('mSerMovers', (el) => { const r = serAgg().rows.filter((x) => x.hp >= 20 && fin(x.trend)).sort((a, b) => b.trend - a.trend); const pick = [...r.slice(0, 6), ...r.slice(-6).reverse()].filter((x, i, a) => a.indexOf(x) === i); hbar(el, pick.map((x) => ({ k: x.name, v: x.trend, c: x.trend >= 0 ? '#12a150' : '#d92d20', note: F.big(x.h7) + ' h last 7 days' })), { f: (v) => (v > 0 ? '+' : '') + F.p0(v) }); });
  dash.draw('mSerScatter', (el) => { const r = serAgg().rows.filter((x) => x.vd >= 50); const gs = [...new Set(r.map((x) => x.cat))]; scatter(el, r.map((x) => ({ k: x.name, x: x.vd, y: x.mpv, r: x.hours, c: COL[gs.indexOf(x.cat) % COL.length] })), { tip: (p) => `${F.big(p.x)} viewer-days · ${F.d1(p.y)} min per viewer-day · ${F.big(p.r)} h` }); });
  dash.draw('mSerCount', (el) => { el.textContent = `${F.int(serAgg().rows.length)} series`; });
  dash.draw('mSerTbl', (el) => {
    const inp = el.closest('.card').querySelector('[data-ser-search]'); if (inp && !inp._b) { inp._b = 1; inp.addEventListener('input', () => { SER_Q = inp.value.trim().toLowerCase(); dash.draw('mSerTbl'); collapseTables(el); }); }
    const all = serAgg().rows; const r = SER_Q ? all.filter((x) => x.name.toLowerCase().includes(SER_Q)) : all; const pct = (v) => (fin(v) ? `<span style="color:${v >= 0 ? '#12a150' : '#d92d20'}">${v > 0 ? '+' : ''}${F.p0(v)}</span>` : '—');
    table(el, [{ k: 'name', label: 'Series', l: 1 }, { k: 'cat', label: 'Genre', l: 1 }, { k: 'hours', label: 'Watch hours', f: 'big' }, { k: 'share', label: 'Share', f: 'p1' }, { k: 'views', label: 'Episodes', f: 'big' }, { k: 'vd', label: 'Viewer-days', f: 'big' }, { k: 'vpv', label: 'Eps / viewer-day', f: 'd1' }, { k: 'mpv', label: 'Min / viewer-day', f: 'd1' }, { k: 'days', label: 'Days watched', f: 'int' }, { k: 'trend', label: 'Trend 7d', f: pct }, { k: 'drop', label: 'Drop from best week', f: pct }], r, { sort: 'hours', rowKey: 'name', selKey: SER_PICK, onRow: (k) => { SER_PICK = k; dash.draw('mSerTbl'); dash.draw('mSerDaily'); dash.draw('mSerPickTitle'); collapseTables(el); } });
  });
  const pickName = () => SER_PICK || (serAgg().rows.slice().sort((a, b) => b.hours - a.hours)[0] || {}).name;
  dash.draw('mSerPickTitle', (el) => { el.textContent = 'Daily viewers — ' + (pickName() || '—'); });
  dash.draw('mSerDaily', (el) => { const nm = pickName(); const { s, e } = rng(); const v = rowsOf('series_daily').filter((r) => r.series === nm && r.day >= s && r.day <= e).sort((a, b) => a.day.localeCompare(b.day)); chart(el, { cats: v.map((r) => dLbl(r.day)), bars: [{ name: 'Viewers', values: v.map((r) => n(r.viewers)), color: COL[0] }], y2: [{ name: 'Watch hours', values: v.map((r) => n(r.hours)), color: COL[1] }], fy2: F.d1 }); });

  // Day-wise sheet (Meta, from 1 Sep)
  let DW = null;
  function dwRows() {
    if (DW) return DW; const t = sheetBlock('ads_10'); DW = []; if (!t) return DW; const { h, m } = headerMap(t.rows);
    const ci = (re) => m[Object.keys(m).find((k) => re.test(k))]; const cSp = ci(/^Spend/), cIm = ci(/^Impressions/), cCl = ci(/^Link clicks/), cIn = ci(/^Installs/), cAc = ci(/^Adjust CPI/), cRes = ci(/^Results/);
    t.rows.slice(h + 1).forEach((r) => { const d = parseDate((r[0] || '').replace(/^ +/, '')); if (!d) return; const sp = pn(r[cSp]) || 0, ac = pn(r[cAc]); DW.push({ d, lvl: r[1], camp: r[2], adset: r[3], ad: r[4], spend: sp, impr: pn(r[cIm]) || 0, clicks: pn(r[cCl]) || 0, inst: pn(r[cIn]) || 0, res: pn(r[cRes]) || 0, ainst: ac ? sp / ac : 0 }); });
    return DW;
  }
  const dwAgg = (v) => { const a = { spend: d3.sum(v, (x) => x.spend), impr: d3.sum(v, (x) => x.impr), clicks: d3.sum(v, (x) => x.clicks), inst: d3.sum(v, (x) => x.inst), ainst: d3.sum(v, (x) => x.ainst), res: d3.sum(v, (x) => x.res) }; a.cpi = a.ainst ? a.spend / a.ainst : null; a.mcpi = a.inst ? a.spend / a.inst : null; a.ctr = a.impr ? a.clicks / a.impr : null; a.cpr = a.res ? a.spend / a.res : null; return a; };
  const dwIn = (lvl, s, e) => dwRows().filter((x) => x.lvl === lvl && x.d >= s && x.d <= e);

  let PROMOC = { k: null, v: null };
  function promo() {
    const { s, e } = rng(); if (PROMOC.k === s + e) return PROMOC.v; const A = serAgg(); const series = A.rows.map((x) => ({ ...x, key: norm(x.name) })).filter((x) => x.key.length >= 3).sort((a, b) => b.key.length - a.key.length);
    const find = (name) => { const k = norm(name); if (!k || k.length < 3) return null; return series.find((x) => k.startsWith(x.key) || x.key.startsWith(k)) || null; };
    const out = new Map(series.map((x) => [x.name, { name: x.name, hours: x.hours, views: x.views, adSpend: 0, adInst: 0, ig: 0, igReach: 0, yt: 0, ytViews: 0, ytSubs: 0 }]));
    dwIn('Ad set', s, e).forEach((r) => { const x = find(r.adset); if (x) { const o = out.get(x.name); o.adSpend += r.spend; o.adInst += r.ainst; } });
    const L = logRows('ig'); L.rows.forEach((r) => { const x = find(r[L.m.Show]); if (x) { const o = out.get(x.name); o.ig++; o.igReach += pn(r[L.m.Reach]) || 0; } });
    const Y = logRows('yt'); Y.rows.forEach((r) => { const x = find(r[Y.m.Show]); if (x) { const o = out.get(x.name); o.yt++; o.ytViews += pn(r[Y.m.Views]) || 0; o.ytSubs += pn(r[Y.m['Subscribers gained']]) || 0; } });
    const rows = [...out.values()]; rows.sort((a, b) => b.hours - a.hours).forEach((r, i) => { r.rank = i + 1; r.adCpi = r.adInst ? r.adSpend / r.adInst : null; r.social = r.igReach + r.ytViews; });
    PROMOC = { k: s + e, v: rows }; return rows;
  }
  dash.draw('mPromoChart', (el) => { const P = promo(); const soc = el.dataset.k === 'social'; const pts = P.filter((p) => (soc ? p.social : p.adSpend) > 0 && p.hours > 0); scatter(el, pts.map((p) => ({ k: p.name, x: soc ? p.social : p.adSpend, y: p.hours, r: p.views / 10, c: soc ? COL[2] : COL[0] })), { tip: (p) => `${soc ? F.big(p.x) + ' reach + views' : F.inr(p.x) + ' ad spend'} · ${F.big(p.y)} watch hours` }); });
  let PROMO_Q = '';
  dash.draw('mPromoTbl', (el) => { const inp = el.closest('.card').querySelector('[data-promo-search]'); if (inp && !inp._b) { inp._b = 1; inp.addEventListener('input', () => { PROMO_Q = inp.value.trim().toLowerCase(); dash.draw('mPromoTbl'); collapseTables(el); }); } const r = promo().filter((x) => (x.adSpend || x.ig || x.yt || x.hours) && (!PROMO_Q || x.name.toLowerCase().includes(PROMO_Q))); table(el, [{ k: 'name', label: 'Series', l: 1 }, { k: 'hours', label: 'Watch hours', f: 'big' }, { k: 'rank', label: 'Rank', f: 'int' }, { k: 'views', label: 'Episodes', f: 'big' }, { k: 'adSpend', label: 'Meta ad spend', f: 'inr' }, { k: 'adInst', label: 'Ad installs', f: 'int' }, { k: 'adCpi', label: 'Ad CPI', f: 'inr1' }, { k: 'ig', label: 'IG posts', f: 'int' }, { k: 'igReach', label: 'IG reach', f: 'big' }, { k: 'yt', label: 'YT videos', f: 'int' }, { k: 'ytViews', label: 'YT views', f: 'big' }, { k: 'ytSubs', label: 'YT subs', f: 'int' }], r, { sort: 'hours' }); });

  // ====================================================================== social
  const LOGC = new Map();
  function logRows(src, s0, e0) {
    const r0 = rng(); const s = s0 || r0.s, e = e0 || r0.e; const ck = src + s + e; if (LOGC.has(ck)) return LOGC.get(ck);
    const t = sheetBlock(src === 'ig' ? 'ig_01' : 'ig_04'); if (!t) return { rows: [], all: [], m: {} }; const { h, m } = headerMap(t.rows); const dc = m['Posted (IST)'] ?? m['Published (IST)'];
    const all = t.rows.slice(h + 1).filter((r) => r[0] && /^\d+$/.test(r[0])).map((r) => ({ r, d: parseDate(r[dc]), h: (/(\d{1,2}):\d\d/.exec(r[dc] || '') || [])[1] })).filter((x) => x.d && x.d >= s && x.d <= e).map((x) => Object.assign(x.r.slice(), { _d: x.d, _h: x.h }));
    const rows = src === 'ig' ? all.filter((r) => r[m['Creative type']] !== 'Story') : all;
    const out = { rows, all, m, metric: src === 'ig' ? 'Reach' : 'Views', dc }; LOGC.set(ck, out); return out;
  }
  const lenBucket = (s) => { const v = pn(s); if (!fin(v)) return null; return v < 30 ? 'under 30 s' : v < 60 ? '30–59 s' : v < 120 ? '1–2 min' : v < 300 ? '2–5 min' : '5 min+'; };
  const SDIM = { ig: ['Creative type', 'Content category', 'Hook type', 'Cliffhanger type', 'CTA type', 'Length', 'Show'], yt: ['Format', 'Content category', 'Hook type', 'Cliffhanger type', 'CTA type', 'Length', 'Show'] };
  function groups(src) { const { rows, m, metric } = logRows(src); if (!rows.length) return []; const all = median(rows.map((r) => pn(r[m[metric]]))); const out = []; SDIM[src].forEach((d) => { const key = (r) => (d === 'Length' ? lenBucket(r[m['Length (s)']]) : r[m[d]]); d3.groups(rows, key).forEach(([k, v]) => { if (!k || k === '—' || v.length < (d === 'Show' ? 3 : 5)) return; const md = median(v.map((r) => pn(r[m[metric]]))); out.push({ dim: d, k, n: v.length, med: md, idx: all ? md / all : null }); }); }); return out; }
  function socStats(src, s, e) { const L = logRows(src, s, e); const v = L.rows.map((r) => pn(r[L.m[L.metric]])).filter(fin); const er = L.rows.map((r) => pn(r[L.m['Engagement rate']])).filter(fin); return { n: L.rows.length, nAll: L.all.length, tot: d3.sum(v), med: median(v), er: median(er), subs: src === 'yt' ? d3.sum(L.rows, (r) => pn(r[L.m['Subscribers gained']]) || 0) : null, inter: d3.sum(L.rows, (r) => pn(r[L.m['Total interactions']]) || 0) }; }
  dash.draw('mSocKpis', (el) => {
    const src = el.dataset.src, { s, e } = rng(), p = prevRng(); const c = socStats(src, s, e), q = socStats(src, p.s, p.e);
    const T = src === 'ig' ? [['Posts incl. stories', 'nAll', 'int', 0], ['Posts excl. stories', 'n', 'int', 0], ['Total reach', 'tot', 'big', 1], ['Median reach per post', 'med', 'big', 1], ['Median engagement rate', 'er', 'p1', 1], ['Interactions', 'inter', 'big', 1]] : [['Videos', 'n', 'int', 0], ['Total views', 'tot', 'big', 1], ['Median views per video', 'med', 'big', 1], ['Median engagement rate', 'er', 'p1', 1], ['Subscribers gained', 'subs', 'int', 1], ['Interactions', 'inter', 'big', 1]];
    el.innerHTML = T.map(([l, k, f, g]) => `<div class="kpi ${src === 'ig' ? 'a-ret' : 'a-mkt'}"><div class="l"><span>${l}</span>${delta(c[k], q[k], g)}</div><div class="v">${fmt(c[k], f)}</div><div class="s">before: ${fmt(q[k], f)}</div></div>`).join('');
  });
  dash.draw('mSocWeek', (el) => {
    const src = el.dataset.src, { s, e } = rng(); const L = logRows(src); const B = buckets(s, e, dd(s, e) <= 31 ? 'day' : dd(s, e) <= 250 ? 'week' : 'month'); const tcol = L.m[src === 'ig' ? 'Creative type' : 'Format'];
    const types = src === 'ig' ? ['Reel', 'Static post', 'Carousel', 'Story'] : ['Video', 'Short']; const inB = (r, b) => r._d >= b.s && r._d <= b.e;
    chart(el, { cats: B.map((b) => b.l), stacked: true, bars: types.map((t, i) => ({ name: t, values: B.map((b) => L.all.filter((r) => inB(r, b) && r[tcol] === t).length), color: COL[i] })), y2: [{ name: 'Median ' + L.metric.toLowerCase(), values: B.map((b) => median(L.rows.filter((r) => inB(r, b)).map((r) => pn(r[L.m[L.metric]])))), color: 'var(--color-fg)' }], fy: F.int });
  });
  dash.draw('mSocDim', (el) => { const src = el.dataset.src; const sel = el.closest('.card').querySelector(`[data-socdim="${src}"]`); if (sel && !sel._b) { sel._b = 1; sel.innerHTML = SDIM[src].map((d) => `<option>${d}</option>`).join(''); sel.onchange = () => dash.draw('mSocDim'); } const d = sel ? sel.value : SDIM[src][0]; const g = groups(src).filter((x) => x.dim === d).sort((a, b) => b.med - a.med).slice(0, 14); hbar(el, g.map((x) => ({ k: x.k, v: x.med, c: x.idx >= 1 ? '#12a150' : '#e0a321', note: `${x.n} · ${F.d2(x.idx)}×` }))); });
  dash.draw('mSocTop', (el) => { const src = el.dataset.src; const L = logRows(src); const top = L.rows.slice().sort((a, b) => (pn(b[L.m[L.metric]]) || 0) - (pn(a[L.m[L.metric]]) || 0)).slice(0, 6); const tcol = L.m[src === 'ig' ? 'Hook / opening line' : 'Title / hook'], typ = L.m[src === 'ig' ? 'Creative type' : 'Format'], ob = L.m["Observation — what worked / didn't / improve"]; el.innerHTML = top.map((r, i) => `<div class="post"><span class="rk">${i + 1}</span><div><div><b>${esc(r[L.m.Show] || '')}</b> <span class="tag">${esc(r[typ] || '')}</span> <span class="tag">${esc(r[L.dc] || '')}</span></div><div style="margin:4px 0">${esc((r[tcol] || '').slice(0, 120))}</div><div class="muted">${L.metric} <b>${esc(r[L.m[L.metric]])}</b> · engagement ${esc(r[L.m['Engagement rate']] || '—')}</div>${ob != null && r[ob] ? `<div class="muted" style="margin-top:4px;font-size:12px">${esc(r[ob].slice(0, 180))}</div>` : ''}</div></div>`).join('') || '<div class="empty">No posts in this range</div>'; });
  dash.draw('mSocHour', (el) => { const { rows, m, metric } = logRows(el.dataset.src); const by = d3.rollup(rows, (v) => ({ med: median(v.map((r) => pn(r[m[metric]]))), n: v.length }), (r) => (r._h != null ? +r._h : null)); const hrs = d3.range(24); chart(el, { h: 190, cats: hrs.map((h) => (h < 10 ? '0' : '') + h), bars: [{ name: 'Median ' + metric.toLowerCase(), values: hrs.map((h) => (by.get(h) && by.get(h).n >= 2 ? by.get(h).med : null)), color: COL[0] }] }); });
  dash.draw('mSocGroups', (el) => { const g = groups(el.dataset.src); table(el, [{ k: 'dim', label: el.dataset.src === 'ig' ? 'Instagram' : 'YouTube', l: 1 }, { k: 'k', label: 'Group', l: 1 }, { k: 'n', label: 'Posts', f: 'int' }, { k: 'med', label: 'Median', f: 'big' }, { k: 'idx', label: 'vs all', f: (v) => (fin(v) ? `<span style="color:${v >= 1 ? '#12a150' : '#d92d20'}">${F.d2(v)}×</span>` : '—') }], g, { sort: 'idx' }); });
  function initXCharts() { document.querySelectorAll('[data-xcharts]').forEach((g) => { const s = M.sheets[g.dataset.xcharts]; if (!s) return; g.innerHTML = s.charts.map((c, i) => `<div class="card"><h3>${esc(c.title)}</h3><div class="legend">${c.series.map((x, j) => `<span><i style="background:${COL[j % COL.length]}"></i>${esc(x.name)}</span>`).join('')}</div><div class="chart" data-draw="mXChart" data-sid="${s.id}" data-i="${i}"></div></div>`).join(''); }); }
  dash.draw('mXChart', (el) => { const c = M.sheets[el.dataset.sid].charts[+el.dataset.i]; const { s, e } = rng(); const ms = monthsIn(s, e); const sel = new Set(c.cats.map((x, i) => (ms.includes(monthKey(String(x).split(' (')[0])) ? i : -1)).filter((i) => i >= 0)); const ser = c.series.map((x, j) => ({ name: x.name, values: x.values, color: COL[j % COL.length] })); if (c.type === 'line') chart(el, { cats: c.cats, lines: ser, sel }); else chart(el, { cats: c.cats, bars: ser, sel, stacked: c.grouping === 'stacked' || c.grouping === 'percentStacked' }); });

  // ====================================================================== performance marketing
  const PM = { plat: 'All' };
  const pmMonths = () => [...new Set((M.engine.dash || []).map((r) => r.Month))].sort((a, b) => monthKey(a).localeCompare(monthKey(b)));
  const pmRows = (months, plat) => (M.engine.dash || []).filter((r) => months.includes(monthKey(r.Month)) && (plat === 'All' || r.Platform === plat));
  const rangeMonths = () => { const { s, e } = rng(); return monthsIn(s, e); };
  function pmInit() { document.querySelectorAll('[data-pm="plat"] button').forEach((b) => { b.setAttribute('aria-pressed', b.dataset.v === PM.plat); if (!b._b) { b._b = 1; b.onclick = () => { PM.plat = b.dataset.v; redrawPane(b); }; } }); }
  dash.draw('mPmAsOf', (el) => { pmInit(); const ms = rangeMonths().filter((m) => pmMonths().map(monthKey).includes(m)); el.textContent = ms.length ? `CPI, retention, CTR and purchases are for ${ms.map(mlabel).join(', ')} (the report is monthly); spend is for your exact dates.` : 'The Daily Ads report starts in July 2026 — before that only spend (Meta API, Adjust cost) is available.'; });
  dash.draw('mPmTiles', (el) => {
    pmInit(); const ms = rangeMonths(); const a = dashAgg(pmRows(ms, PM.plat)); const c = cur(), p = prev(); const pk = { All: 'pm', Meta: 'meta', Google: 'google', ShareChat: 'sc' }[PM.plat];
    const T = [['Spend', c[pk], p[pk], 'inr', 0, `before: ${fmt(p[pk], 'inr')}`], ['Adjust installs', a.ainst, null, 'big', 1, `Meta-reported ${fmt(a.minst, 'big')}`], ['Adjust CPI', a.cpi, null, 'inr1', -1, `Meta CPI ${fmt(a.mcpi, 'inr1')}`], ['Ret CPI', a.retcpi, null, 'inr1', -1, `retention index ${fmt(a.idx, 'x2')}`], ['Day-1 retention', a.d1, null, 'p1', 1, 'target 14%'], ['Day-7 retention', a.d7, null, 'p2', 1, 'target 3%'], ['CTR', a.ctr, null, 'p2', 1, `${fmt(a.clicks, 'big')} clicks`], ['Purchases', a.apur, null, 'int', 1, `cost per purchase ${fmt(a.cpp, 'inr0')}`]];
    el.innerHTML = T.map(([l, v, pv, f, g, s2]) => `<div class="kpi a-mkt"><div class="l"><span>${l}</span>${pv != null ? delta(v, pv, g) : ''}</div><div class="v">${fmt(v, f)}</div><div class="s">${s2}</div></div>`).join('');
  });
  dash.draw('mPmSpend', (el) => { pmInit(); const { s, e } = rng(); const B = buckets(s, e); const col = (k) => B.map((b) => b.st[k]); const show = (p) => PM.plat === 'All' || PM.plat === p; chart(el, { cats: B.map((b) => b.l), stacked: true, bars: [['Meta', 'meta', COL[0]], ['Google', 'google', COL[1]], ['ShareChat', 'sc', COL[2]]].filter(([p]) => show(p)).map(([p, k, c]) => ({ name: p, values: col(k), color: c })), fy: F.inr }); });
  const pmSel = () => { const ms = pmMonths(); const r = rangeMonths(); return new Set(ms.map((m, i) => (r.includes(monthKey(m)) ? i : -1)).filter((i) => i >= 0)); };
  dash.draw('mPmCpi', (el) => { pmInit(); const ms = pmMonths(); const A = ms.map((m) => dashAgg(pmRows([monthKey(m)], PM.plat))); chart(el, { cats: ms, sel: pmSel(), bars: [{ name: 'Adjust CPI', values: A.map((a) => a.cpi), color: COL[0] }, { name: 'Ret CPI', values: A.map((a) => a.retcpi), color: COL[1] }], lines: [{ name: 'Meta CPI', values: A.map((a) => a.mcpi), color: COL[2], dash: 1 }], fy: F.inr0 }); });
  dash.draw('mPmRet', (el) => { pmInit(); const ms = pmMonths(); const A = ms.map((m) => dashAgg(pmRows([monthKey(m)], PM.plat))); chart(el, { cats: ms, sel: pmSel(), bars: [{ name: 'D1', values: A.map((a) => a.d1), color: COL[0] }, { name: 'D7', values: A.map((a) => a.d7), color: COL[1] }, { name: 'D30', values: A.map((a) => a.d30), color: COL[2] }], fy: F.p1 }); });
  dash.draw('mPmFunnel', (el) => { pmInit(); const a = dashAgg(pmRows(rangeMonths(), PM.plat)); if (!a.ainst) { el.innerHTML = '<div class="empty">No Daily Ads report months in this range</div>'; return; } hbar(el, [['Adjust installs', a.ainst], ['First video view', a.v1], ['3rd video complete', a.v3], ['5th video complete', a.v5], ['7th video complete', a.v7], ['Purchases', a.apur]].map(([k, v], i) => ({ k, v: v || 0, c: COL[i % COL.length], note: a.ainst && i ? F.p0((v || 0) / a.ainst) : '' }))); });
  const PMCOLS = [{ k: 'spend', label: 'Spent', f: 'inr' }, { k: 'budget', label: 'Budget', f: 'inr' }, { k: 'minst', label: 'Meta installs', f: 'int' }, { k: 'ainst', label: 'Adjust installs', f: 'int' }, { k: 'mcpi', label: 'Meta CPI', f: 'inr1' }, { k: 'cpi', label: 'Adjust CPI', f: 'inr1' }, { k: 'retcpi', label: 'Ret CPI', f: 'inr1' }, { k: 'd1', label: 'D1', f: 'p1' }, { k: 'd7', label: 'D7', f: 'p2' }, { k: 'd30', label: 'D30', f: 'p2' }, { k: 'ctr', label: 'CTR', f: 'p2' }, { k: 'apur', label: 'Purchases', f: 'int' }, { k: 'cpp', label: 'Cost / purchase', f: 'inr0' }, { k: 'v1', label: '1st video', f: 'int' }, { k: 'v7', label: '7th video', f: 'int' }];
  dash.draw('mPmCamp', (el) => { pmInit(); const g = d3.groups(pmRows(rangeMonths(), PM.plat), (r) => r.Platform + '|' + r.Campaign); table(el, [{ k: 'plat', label: 'Platform', l: 1 }, { k: 'camp', label: 'Campaign', l: 1 }, ...PMCOLS], g.map(([k, v]) => ({ plat: k.split('|')[0], camp: k.split('|').slice(1).join('|'), ...dashAgg(v) })).filter((r) => r.spend > 0 || r.ainst > 0), { sort: 'spend' }); });
  dash.draw('mPmMonths', (el) => { pmInit(); const data = []; pmMonths().forEach((m) => ['All', 'Meta', 'Google', 'ShareChat'].forEach((p) => { if (PM.plat !== 'All' && p !== PM.plat) return; const R = pmRows([monthKey(m)], p); if (R.length) data.push({ m, plat: p, ...dashAgg(R) }); })); table(el, [{ k: 'm', label: 'Month', l: 1 }, { k: 'plat', label: 'Platform', l: 1 }, ...PMCOLS], data.reverse()); });
  const DWS = { level: 'Campaign', q: '' };
  dash.draw('mDwKpis', (el) => { const { s, e } = rng(), p = prevRng(); const a = dwAgg(dwIn('Campaign', s, e)), b = dwAgg(dwIn('Campaign', p.s, p.e)); if (!a.spend) { el.innerHTML = '<div class="empty">The Day-wise sheet starts on 1 Sep 2026 — pick a range after that.</div>'; return; } el.innerHTML = [['Meta spend', 'spend', 'inr', 0], ['Meta installs', 'inst', 'big', 1], ['Adjust installs', 'ainst', 'big', 1], ['Meta CPI', 'mcpi', 'inr1', -1], ['Adjust CPI', 'cpi', 'inr1', -1], ['CTR', 'ctr', 'p2', 1], ['Results', 'res', 'big', 1], ['Cost per result', 'cpr', 'inr1', -1]].map(([l, k, f, g]) => `<div class="kpi a-mkt"><div class="l"><span>${l}</span>${delta(a[k], b[k], g)}</div><div class="v">${fmt(a[k], f)}</div><div class="s">before: ${fmt(b[k], f)}</div></div>`).join(''); });
  dash.draw('mDwChart', (el) => { const { s, e } = rng(); const by = d3.rollups(dwIn('Campaign', s, e), dwAgg, (x) => x.d).sort((a, b) => a[0].localeCompare(b[0])); const cats = by.map(([d]) => dLbl(d)); if (el.dataset.k === 'cpi') chart(el, { cats, bars: [{ name: 'Spend', values: by.map(([, a]) => a.spend), color: COL[0] }], y2: [{ name: 'Adjust CPI', values: by.map(([, a]) => a.cpi), color: COL[1] }], fy: F.inr, fy2: F.inr0 }); else chart(el, { cats, bars: [{ name: 'Meta installs', values: by.map(([, a]) => a.inst), color: COL[2] }], y2: [{ name: 'CTR', values: by.map(([, a]) => a.ctr), color: COL[3] }], fy2: F.p2 }); });
  dash.draw('mDwShare', (el) => { const { s, e } = rng(); const g = d3.rollups(dwIn('Campaign', s, e), dwAgg, (x) => x.camp).sort((a, b) => b[1].spend - a[1].spend); hbar(el, g.map(([k, a], i) => ({ k, v: a.spend, c: COL[i % COL.length], note: 'CPI ' + fmt(a.cpi, 'inr1') })), { f: F.inr }); });
  dash.draw('mDwBest', (el) => { const { s, e } = rng(); const g = d3.rollups(dwIn('Ad set', s, e), dwAgg, (x) => x.camp + ' › ' + x.adset).filter(([, a]) => a.spend >= 5000 && a.cpi).sort((a, b) => a[1].cpi - b[1].cpi); const pick = [...g.slice(0, 6), ...g.slice(-6)].filter((x, i, a) => a.indexOf(x) === i); const med = median(g.map(([, a]) => a.cpi)); hbar(el, pick.map(([k, a]) => ({ k: k.split(' › ')[1], v: a.cpi, c: a.cpi <= med ? '#12a150' : '#d92d20', note: F.inr(a.spend) })), { f: F.inr1 }); });
  dash.draw('mDwTbl', (el) => {
    const card = el.closest('.card'); card.querySelectorAll('[data-dw="level"] button').forEach((b) => { b.setAttribute('aria-pressed', b.dataset.v === DWS.level); if (!b._b) { b._b = 1; b.onclick = () => { DWS.level = b.dataset.v; el._st = null; dash.draw('mDwTbl'); collapseTables(el); }; } });
    const q = card.querySelector('[data-dw="q"]'); if (q && !q._b) { q._b = 1; q.oninput = () => { DWS.q = q.value.toLowerCase(); dash.draw('mDwTbl'); collapseTables(el); }; }
    const { s, e } = rng(); const key = (x) => [x.camp, DWS.level !== 'Campaign' ? x.adset : '', DWS.level === 'Ad' ? x.ad : ''].join('|'); const g = d3.rollups(dwIn(DWS.level, s, e), (v) => ({ ...dwAgg(v), days: new Set(v.map((x) => x.d)).size }), key).map(([k, a]) => { const [camp, adset, ad] = k.split('|'); return { camp, adset, ad, ...a }; }).filter((r) => !DWS.q || (r.camp + r.adset + r.ad).toLowerCase().includes(DWS.q));
    table(el, [{ k: 'camp', label: 'Campaign', l: 1 }, ...(DWS.level !== 'Campaign' ? [{ k: 'adset', label: 'Ad set', l: 1 }] : []), ...(DWS.level === 'Ad' ? [{ k: 'ad', label: 'Ad', l: 1 }] : []), { k: 'days', label: 'Days', f: 'int' }, { k: 'spend', label: 'Spend', f: 'inr' }, { k: 'impr', label: 'Impressions', f: 'big' }, { k: 'ctr', label: 'CTR', f: 'p2' }, { k: 'inst', label: 'Meta installs', f: 'int' }, { k: 'ainst', label: 'Adjust installs', f: 'int' }, { k: 'mcpi', label: 'Meta CPI', f: 'inr1' }, { k: 'cpi', label: 'Adjust CPI', f: 'inr1' }, { k: 'cpr', label: 'Cost / result', f: 'inr1' }], g, { sort: 'spend' });
  });
  const WM = { metric: 'Spend', month: null, level: 'camp', q: '' }; const WMMET = ['Spend', 'Adjust installs', 'Adjust CPI', 'Results', 'Cost per result', 'Purchases', 'Cost per purchase', 'CTR'];
  function wmInit() { const s = document.querySelector('[data-wm="metric"]'); if (!s || s._b) return; s._b = 1; const ms = [...new Set((M.engine.wm || []).map((r) => r.month))].sort(); const e = rng().e.slice(0, 7); WM.month = ms.includes(e) ? e : ms[ms.length - 1]; s.innerHTML = WMMET.map((x) => `<option>${x}</option>`).join(''); const sm = document.querySelector('[data-wm="month"]'); sm.innerHTML = ms.map((m) => `<option value="${m}"${m === WM.month ? ' selected' : ''}>${mfull(m)}</option>`).join(''); document.querySelectorAll('[data-wm]').forEach((c) => c.addEventListener(c.tagName === 'INPUT' ? 'input' : 'change', () => { WM[c.dataset.wm] = c.value.trim ? c.value.trim() : c.value; redrawPane(c); })); }
  const wmFmt = (v) => (v == null || v === '' ? '' : WM.metric === 'CTR' ? F.p2(v) : /CPI|Cost/.test(WM.metric) ? F.inr1(v) : WM.metric === 'Spend' ? F.inr0(v) : F.int(v));
  dash.draw('mWmTitle', (el) => { wmInit(); el.textContent = `${WM.metric} by week — ${mfull(WM.month)}, top campaigns`; });
  dash.draw('mWmChart', (el) => { wmInit(); const R = (M.engine.wm || []).filter((r) => r.month === WM.month && r.level === 'camp' && r.week); const weeks = [1, 2, 3, 4, 5].filter((w) => R.some((r) => r.week === w)); const camps = d3.rollups(R, (v) => d3.sum(v, (r) => +r.Spend || 0), (r) => r.camp).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c); chart(el, { cats: weeks.map((w) => 'W' + w), bars: camps.map((c, i) => ({ name: c, values: weeks.map((w) => (R.find((r) => r.camp === c && r.week === w) || {})[WM.metric]), color: COL[i % COL.length] })), fy: (v) => wmFmt(v) }); });
  dash.draw('mWm', (el) => {
    wmInit(); const lv = { total: 0, camp: 1, adset: 2, ad: 3 }; const max = lv[WM.level]; const R = (M.engine.wm || []).filter((r) => r.month === WM.month && lv[r.level] <= max);
    const ents = new Map(); R.forEach((r) => { const k = [r.level, r.camp, r.adset, r.ad, r.id].join('|'); if (!ents.has(k)) ents.set(k, { r, w: {} }); ents.get(k).w[r.week] = r[WM.metric]; });
    let list = [...ents.values()]; const q = (WM.q || '').toLowerCase(); if (q) list = list.filter((x) => [x.r.camp, x.r.adset, x.r.ad].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => (a.r.level === 'total' ? -1 : b.r.level === 'total' ? 1 : 0) || (a.r.camp || '').localeCompare(b.r.camp || '') || lv[a.r.level] - lv[b.r.level] || (a.r.adset || '').localeCompare(b.r.adset || '') || (a.r.ad || '').localeCompare(b.r.ad || ''));
    const weeks = [1, 2, 3, 4, 5].filter((w) => R.some((r) => r.week === w)); const d = (a, b) => (fin(a) && fin(b) && +b ? a / b - 1 : null);
    el.innerHTML = `<table><thead><tr><th class="l">Level</th><th class="l">Campaign</th><th class="l">Ad set</th><th class="l">Ad</th>${weeks.map((w) => `<th>W${w}</th><th>Δ</th>`).join('')}<th>Month</th></tr></thead><tbody>${list.map((x) => `<tr><td class="l">${{ total: 'Total', camp: 'Campaign', adset: 'Ad set', ad: 'Ad' }[x.r.level]}</td><td class="l">${esc(x.r.camp)}</td><td class="l">${esc(x.r.adset)}</td><td class="l" title="${esc(x.r.ad)}">${esc(x.r.ad)}</td>${weeks.map((w, i) => { const v = i ? d(x.w[w], x.w[weeks[i - 1]]) : null; return `<td>${wmFmt(x.w[w])}</td><td class="muted">${v == null ? '' : (v > 0 ? '+' : '') + F.p0(v)}</td>`; }).join('')}<td><b>${wmFmt(x.w[0])}</b></td></tr>`).join('')}</tbody></table>`;
  });

  // ====================================================================== observations & suggestions (all follow the date range)
  const chg = (a, b) => (fin(a) && fin(b) && +b ? a / b - 1 : null);
  const pc = (v) => (v > 0 ? '+' : '') + F.p0(v);
  function moveItems(c, p, list) {
    const out = [];
    list.forEach(([k, why, tipUp, tipDown, th = 0.05]) => { const ch = chg(nv(c, k), nv(p, k)); if (ch == null || Math.abs(ch) < th) return; const g = K[k][2]; const good = g ? (ch > 0) === (g > 0) : null; out.push({ w: Math.abs(ch), kind: good == null ? 'info' : good ? 'good' : 'bad', t: `<b>${K[k][0]}</b> ${PERDAY[k] ? (ch > 0 ? 'rose' : 'fell') + ' ' + pc(ch) + ' a day' : (ch > 0 ? 'rose' : 'fell') + ' ' + pc(ch)} to ${fmt(c[k], K[k][1])} (from ${fmt(p[k], K[k][1])}${PERDAY[k] && c[PERDAY[k]] !== p[PERDAY[k]] ? `; ${c[PERDAY[k]]} vs ${p[PERDAY[k]]} days of data` : ''}).${why ? ' ' + why(c, p) : ''}`, tip: ch > 0 ? tipUp : tipDown }); });
    return out.sort((a, b) => b.w - a.w);
  }
  function obsDash() {
    const c = cur(), p = prev(); if (!c.days) return [];
    const L = moveItems(c, p, [
      ['installs', (c, p) => `Paid spend moved ${pc(chg(c.pm, p.pm) || 0)}.`, `Check the new users hold up — day-1 retention is ${fmt(c.d1, 'p1')}. If it fell, the extra volume is lower quality.`, 'If spend held but installs fell, CPI rose — refresh creatives on the ad sets with the highest Adjust CPI (Performance marketing → Day by day).'],
      ['dau', null, 'Keep the momentum: release new episodes of the top series on a fixed schedule and push them to lapsed users.', 'Run a win-back push to users inactive 3–7 days with the newest episode of their last series, and check uninstalls in App insights.'],
      ['d1', null, 'Find which campaigns drove the better cohorts (Performance marketing → Day by day) and give them more budget.', 'New users leave after day 0: start them on the strongest series and cut campaigns whose day-1 retention is under 14%.'],
      ['d7', null, 'Day-7 is improving — keep the episode cadence and the reminders on days 2–7.', 'Add a day-2 and day-5 push with the next episode of the series each user started.'],
      ['epsDau', null, 'Viewing depth is up — a good moment to test an earlier paywall on the top series.', 'Fewer episodes per user: check the 2nd–5th episode drop in App insights → Viewing and the paywall point.'],
      ['minViewer', null, '', 'Shorter viewing: see which series lost hours in Series → Gainers & losers.'],
      ['subRev', null, 'Lean in: remind weekly-pack buyers on day 6 and offer a pack when a user finishes a series.', 'Remind weekly-pack buyers on day 6, and test a pack offer at the end of each series.'],
      ['admob', (c) => `eCPM ${fmt(c.ecpm, 'inr1')}, ${fmt(c.impDau, 'd1')} impressions per active user.`, '', 'Check eCPM against ad load; add mediation networks if the price per 1,000 fell.'],
      ['pm', null, 'Make sure the extra spend went to campaigns with Ret CPI under target.', ''],
      ['cpi', null, 'Move budget from the ad sets with the highest Adjust CPI to the best ones (Performance marketing → Day by day).', 'Cheaper installs — scale the best ad sets in steps while day-1 retention holds.'],
      ['retcpi', null, 'Quality-adjusted cost rose — retention is falling faster than cost. Pause ad sets with D1 under 10%.', ''],
      ['uRate', null, 'More uninstalls per install — see when users leave in App insights → Retention.', ''],
      ['blended', null, 'All-in cost per install rose — check whether influencer and casting spend brought trackable installs.', ''],
    ]);
    const S = serAgg(); const top = S.rows.slice().sort((a, b) => b.hours - a.hours).slice(0, 3); if (top.length) L.push({ w: 0, kind: 'info', t: `<b>Most watched in the range:</b> ${top.map((x) => `${esc(x.name)} (${F.big(x.hours)} h)`).join(', ')}.`, tip: 'Use these series in the next ad creatives and Instagram reels.' });
    return L;
  }
  function obsApp() {
    const c = cur(), p = prev(); if (!c.days) return [];
    const L = moveItems(c, p, [['uRate', null, 'Check the install-day uninstall share and the first session (App insights → Retention).', ''], ['u0', null, 'More users uninstall on the day they install — autoplay a top series and keep the paywall out of the first session.', ''], ['d1', null, '', 'Day-1 retention fell — compare channels in Channel quality and cut the weakest.'], ['d7', null, '', 'Add day-2 / day-5 reminders with the next episode.'], ['sessDau', null, '', 'Users open the app less often — push new-episode alerts at their usual watching hour (Demographics → Timings).'], ['minSess', null, '', `Sessions are shorter — check whether ad load rose (${fmt(c.impDau, 'd1')} impressions per user).`], ['vidsViewer', null, '', 'Fewer episodes per viewer — look at the drop points in Viewing.'], ['payersDay', null, '', 'Fewer paying users a day — remind buyers before their pack expires.'], ['ecpm', null, '', 'Ad price fell — add networks or cap frequency on low-value placements.'], ['impDau', null, 'More ads per user — watch episodes per viewer and minutes per session, which fall when ad load rises.', ''], ['react', null, '', 'Fewer users coming back — run win-back campaigns to lapsed users.'], ['reinst', null, '', '']]);
    if (fin(c.u0) && c.u0 > 0.25) L.push({ kind: 'bad', t: `<b>${F.p0(c.u0)} of new users uninstall on install day.</b>`, tip: 'Start new users on a proven series, and keep the paywall and ads out of the first session.' });
    return L;
  }
  function obsDemo() {
    const L = []; const { s, e } = rng(), p = prevRng(); const G = rowsOf('ga_daily'); const agg = (a, b) => { const r = G.filter((x) => x.day >= a && x.day <= b && +x.active_users > 2000); return r.length ? { n: r.length, au: d3.mean(r, (x) => +x.active_users), nu: d3.sum(r, (x) => +x.new_users), em: d3.sum(r, (x) => +x.engagement_minutes) / d3.sum(r, (x) => +x.active_users) } : null; };
    const gc = agg(s, e), gp = agg(p.s, p.e);
    if (gc) L.push({ kind: 'info', t: `<b>Google Analytics in the range:</b> ${F.big(gc.au)} active users a day, ${F.big(gc.nu)} new users, ${F.d1(gc.em)} engaged minutes per active user a day (${gc.n} days of daily GA data).`, tip: gp ? `Previous period: ${F.big(gp.au)} active users a day, ${F.d1(gp.em)} engaged minutes.` : 'Daily GA data starts on 18 Nov 2026; earlier ranges use the monthly GA tables below.' });
    const GM = rowsOf('ga_monthly').filter((r) => monthsIn(s, e).includes(r.month)); if (GM.length) L.push({ kind: 'info', t: `<b>GA by month, ${GM.map((r) => mlabel(r.month)).join(', ')}:</b> ${F.big(d3.mean(GM, (r) => r.active_users))} monthly active users on average, ${F.int(d3.mean(GM, (r) => r.avg_engagement_sec))} s average engagement, engagement rate ${F.p0(d3.mean(GM, (r) => r.engagement_rate))}.`, tip: '' });
    const D = rowsOf('ga_dims'); if (D.length) {
      const tot = (D.find((r) => r.dim === 'total') || {}).users || 1; const reg = D.filter((r) => r.dim === 'region').sort((a, b) => b.users - a.users);
      if (reg.length) L.push({ kind: 'info', t: `<b>Where users are:</b> ${reg.slice(0, 3).map((r) => `${esc(r.value)} ${F.p0(r.users / tot)}`).join(', ')} — the top 3 states hold ${F.p0(d3.sum(reg.slice(0, 3), (r) => r.users) / tot)} of users.`, tip: `Most engaged large states: ${reg.filter((r) => r.users > 800).sort((a, b) => b.minutes_per_user - a.minutes_per_user).slice(0, 3).map((r) => `${esc(r.value)} (${F.d1(r.minutes_per_user)} min)`).join(', ')} — weight regional targeting and Hindi creatives there.` });
      const old = D.filter((r) => r.dim === 'app_version' && r.minutes_per_user < 1); const oldU = d3.sum(old, (r) => r.users);
      if (oldU) L.push({ kind: 'bad', t: `<b>${F.big(oldU)} users (${F.p0(oldU / tot)}) are on old app versions</b> where they watch under a minute (${old.slice(0, 4).map((r) => esc(r.value)).join(', ')}…).`, tip: 'Force or nudge an update to the latest build — those users barely watch.' });
      const lang = D.filter((r) => r.dim === 'language'); const ind = lang.filter((r) => /^(hi|mr|gu|bn|pa|ta|te)/.test(r.value)); if (lang.length) L.push({ kind: 'info', t: `<b>Phone language:</b> ${F.p0(d3.sum(lang.filter((r) => /^en/.test(r.value)), (r) => r.users) / tot)} use English, ${F.p0(d3.sum(ind, (r) => r.users) / tot)} an Indian language.`, tip: 'Most users keep English phone settings even when they watch Hindi drama — keep app copy bilingual.' });
      L.push({ kind: 'info', t: 'The state, city, language and app-version split is a GA snapshot from 17 Nov 2026 to the last refresh; it does not move with the date range.', tip: '' });
    }
    return L;
  }
  function obsSeries() {
    const A = serAgg(); const r = A.rows; if (!r.length) return []; const L = []; const byH = r.slice().sort((a, b) => b.hours - a.hours);
    L.push({ kind: 'info', t: `<b>Most watched:</b> ${byH.slice(0, 3).map((x) => `${esc(x.name)} (${F.big(x.hours)} h, ${F.p0(x.share)})`).join(', ')}. The top 10 hold ${F.p0(d3.sum(byH.slice(0, 10), (x) => x.hours) / (A.totH || 1))} of watch hours.`, tip: 'Above ~60% a few shows carry the app — schedule a new launch every week.' });
    const deep = r.filter((x) => x.vd >= 300).sort((a, b) => b.mpv - a.mpv); if (deep.length > 3) { L.push({ kind: 'good', t: `<b>Deepest binge:</b> ${deep.slice(0, 3).map((x) => `${esc(x.name)} (${F.d1(x.mpv)} min per viewer-day)`).join(', ')}.`, tip: 'Build the next ad creatives and reels around these — they turn an open into minutes watched.' }); L.push({ kind: 'bad', t: `<b>Shallowest</b> (300+ viewer-days): ${deep.slice(-3).reverse().map((x) => `${esc(x.name)} (${F.d1(x.mpv)} min)`).join(', ')} — people open these and leave.`, tip: 'Move the first cliffhanger into episode 1–2, or drop them from home rails.' }); }
    const up = r.filter((x) => x.hp >= 20 && fin(x.trend)).sort((a, b) => b.trend - a.trend); if (up.length > 3) { L.push({ kind: 'good', t: `<b>Rising:</b> ${up.slice(0, 3).map((x) => `${esc(x.name)} (${pc(x.trend)} week on week)`).join(', ')}.`, tip: 'Rotate the home banner to rising series every week.' }); L.push({ kind: 'bad', t: `<b>Falling:</b> ${up.slice(-3).reverse().map((x) => `${esc(x.name)} (${pc(x.trend)})`).join(', ')}.`, tip: 'Retire banners for falling series and push their final episodes to viewers who stopped midway.' }); }
    const drop = r.filter((x) => x.vd >= 1000 && x.latest >= 100 && fin(x.drop)).sort((a, b) => a.drop - b.drop); if (drop.length) L.push({ kind: 'bad', t: `<b>Biggest drops from their best week:</b> ${drop.slice(0, 3).map((x) => `${esc(x.name)} (${pc(x.drop)})`).join(', ')}.`, tip: 'Normal for finished series; for running ones, check whether new episodes stopped.' });
    const P = promo(); const pushedLow = P.filter((x) => x.adSpend >= 20000).sort((a, b) => b.rank - a.rank).slice(0, 3); const unp = P.filter((x) => !x.adSpend && x.rank <= 15).slice(0, 4);
    if (pushedLow.length) L.push({ kind: 'bad', t: `<b>Pushed on Meta, watched less:</b> ${pushedLow.map((x) => `${esc(x.name)} (${F.inr(x.adSpend)}, rank ${x.rank})`).join(', ')}.`, tip: 'Check whether these ads bring viewers who stay; move budget to series that rank higher.' });
    if (unp.length) L.push({ kind: 'good', t: `<b>Watched without paid push:</b> ${unp.map((x) => `${esc(x.name)} (rank ${x.rank})`).join(', ')}.`, tip: 'Candidates for new ad creatives.' });
    return L;
  }
  function obsSocial() {
    const L = []; const { s, e } = rng(), p = prevRng();
    ['ig', 'yt'].forEach((src) => { const nm = src === 'ig' ? 'Instagram' : 'YouTube'; const c = socStats(src, s, e), q = socStats(src, p.s, p.e); if (!c.n) { L.push({ kind: 'info', t: `<b>${nm}:</b> no posts in this range (the logs start on 1 Jul 2026).`, tip: '' }); return; }
      const ch = chg(c.med, q.med); L.push({ kind: ch == null ? 'info' : ch >= 0 ? 'good' : 'bad', t: `<b>${nm}:</b> ${c.n} ${src === 'ig' ? 'posts (excl. stories)' : 'videos'}, median ${src === 'ig' ? 'reach' : 'views'} ${fmt(c.med, 'big')}${ch != null ? ` (${pc(ch)} vs before)` : ''}, median engagement ${fmt(c.er, 'p1')}.`, tip: src === 'yt' ? `${fmt(c.subs, 'int')} subscribers gained.` : '' });
      d3.groups(groups(src), (x) => x.dim).forEach(([d, v]) => { if (v.length < 2 || d === 'Show') return; v.sort((a, b) => b.idx - a.idx); const b = v[0], w = v[v.length - 1]; if (b.idx > 1.15) L.push({ kind: 'good', t: `<b>${nm} · ${esc(d)}:</b> “${esc(b.k)}” gets ${F.d2(b.idx)}× the typical ${src === 'ig' ? 'reach' : 'views'} (${b.n}); “${esc(w.k)}” only ${F.d2(w.idx)}×.`, tip: `Do more “${esc(b.k)}”, less “${esc(w.k)}”.` }); });
      const L2 = logRows(src); const by = d3.rollups(L2.rows, (v) => ({ med: median(v.map((r) => pn(r[L2.m[L2.metric]]))), n: v.length }), (r) => (r._h != null ? +r._h : null)).filter(([h, a]) => h != null && a.n >= 4).sort((a, b) => b[1].med - a[1].med);
      if (by.length > 2) L.push({ kind: 'info', t: `<b>${nm} timing:</b> ${by.slice(0, 2).map(([h]) => `${h}:00`).join(' and ')} IST got the highest median ${L2.metric.toLowerCase()}; ${by[by.length - 1][0]}:00 the lowest.`, tip: 'Schedule the strongest posts in the best slots.' });
    });
    L.push({ kind: 'info', t: 'Installs from social land in “Organic non-trackable”.', tip: 'Put a per-series deep link on every post and video so installs and series opens from social can be counted.' });
    return L;
  }
  function obsPm() {
    const L = []; const { s, e } = rng(); const c = cur(), q = prev();
    L.push(...moveItems(c, q, [['pm', (c) => `Meta ${fmt(c.meta, 'inr')}, Google ${fmt(c.google, 'inr')}, ShareChat ${fmt(c.sc, 'inr')}.`, '', ''], ['cpi', null, 'Move budget from the worst ad sets (Day by day) to the best.', 'Scale the best ad sets while day-1 retention holds.'], ['retcpi', null, 'Retention is falling faster than cost — pause ad sets with D1 under 10%.', ''], ['paidInst', null, '', '']]));
    const g = d3.rollups(dwIn('Ad set', s, e), dwAgg, (x) => x.adset).filter(([, a]) => a.spend >= 5000 && a.cpi).sort((a, b) => a[1].cpi - b[1].cpi);
    if (g.length >= 4) { L.push({ kind: 'good', t: `<b>Cheapest ad sets (Adjust CPI):</b> ${g.slice(0, 3).map(([k, a]) => `${esc(k)} ${F.inr1(a.cpi)}`).join(', ')}.`, tip: 'Raise their budgets 15–20% at a time and watch day-1 retention.' }); L.push({ kind: 'bad', t: `<b>Most expensive ad sets:</b> ${g.slice(-3).reverse().map(([k, a]) => `${esc(k)} ${F.inr1(a.cpi)} on ${F.inr(a.spend)}`).join(', ')}.`, tip: 'Cut them or refresh their creatives.' }); }
    const a = dashAgg(pmRows(rangeMonths(), 'All')); if (a.spend) { const ml = rangeMonths().filter((m) => pmMonths().map(monthKey).includes(m)).map(mlabel).join(', '); if (fin(a.d1) && a.d1 < 0.14) L.push({ kind: 'bad', t: `<b>Paid day-1 retention ${F.p1(a.d1)}</b> is under the 14% benchmark (${ml}).`, tip: 'Tighten audiences and lead creatives with the deepest-binge series.' }); if (fin(a.ctr)) L.push({ kind: 'info', t: `<b>Funnel (${ml}):</b> CTR ${F.p2(a.ctr)}, ${fmt(a.ainst ? a.v1 / a.ainst : null, 'p0')} of paid installs watch a first video and ${fmt(a.ainst ? a.v7 / a.ainst : null, 'p0')} reach the 7th.`, tip: 'Optimise campaigns for the 3rd or 5th video event rather than the install.' }); ['Meta', 'Google', 'ShareChat'].forEach((pl) => { const b = dashAgg(pmRows(rangeMonths(), pl)); if (b.spend > 1000 && b.retcpi) L.push({ kind: b.retcpi <= a.retcpi ? 'good' : 'bad', t: `<b>${pl}:</b> ${F.inr(b.spend)} at Adjust CPI ${fmt(b.cpi, 'inr1')}, Ret CPI ${fmt(b.retcpi, 'inr1')} (all platforms ${fmt(a.retcpi, 'inr1')}).`, tip: b.retcpi <= a.retcpi ? `${pl} beats the blend on quality-adjusted cost — test more budget.` : `${pl} costs more per retained user than the blend.` }); }); }
    return L;
  }
  // ====================================================================== data freshness
  // A metric whose source stops before yesterday (IST) gets a small "last updated <day>" tag; up-to-date ones get nothing.
  const YDAY = (() => { const n = new Date(Date.now() + 5.5 * 3600e3); n.setUTCDate(n.getUTCDate() - 1); return n.toISOString().slice(0, 10); })();
  const SRCN = { adjust: 'Adjust', admin: 'Admin panel', ads: 'Daily Ads report', ga: 'Google Analytics', oem: 'Adjust (OEM)', ig: 'Instagram', yt: 'YouTube' };
  const SRC = () => { const Mo = model(); const x = Object.assign({}, M.sources || {}); if (Mo) { x.adjust = x.adjust || Mo.last; x.admin = x.admin || Mo.lastAdm; } x.ads = x.ads || (M.engine.meta || {}).end_date; return x; };
  const staleOf = (k) => { const d = SRC()[k]; return d && d < YDAY ? d : null; };
  const KSRC = [[/^mSerTiles$/, null, 'admin'], [/^mSocKpis$/, null, (h) => h.dataset.src], [/^m(PmTiles|DwKpis|Dw\w*)$/, null, 'ads'], [/^mOemKpis$/, /spend/i, ''], [/^mOemKpis$/, null, 'oem'],
    [/^mInflKpis$/, /installs|retention/i, 'adjust'], [/^mKpis$/, /influencer|casting|oem/i, ''], [/^mKpis$/, /episode|watch|subscri|admob|payer|payment|revenue|ecpm/i, 'admin'],
    [/^mKpis$/, /spend|cpi|cost/i, 'ads'], [/^mKpis$/, /install|active|retention|reinstall|reactivation|uninstall|session|mau/i, 'adjust']];
  const PAGESRC = { dash: ['adjust', 'admin', 'ads'], app: ['adjust', 'admin'], demo: ['ga'], series: ['admin'], social: ['ig', 'yt'], pm: ['ads', 'adjust'], infl: ['adjust'], oem: ['oem'] };
  function markStale(pane) {
    if (!pane) return;
    const page = (pane.closest('.m-page-pane') || {}).dataset; const ks = ((page && PAGESRC[page.page]) || []).filter(staleOf);
    if (ks.length && !pane.querySelector(':scope > .stalebar')) pane.insertAdjacentHTML('afterbegin', `<div class="stalebar">Not updated to ${dLblY(YDAY)}: ${ks.map((k) => `<b>${SRCN[k]}</b> — last updated ${dLblY(staleOf(k))}`).join(' · ')}</div>`);
    pane.querySelectorAll('.kpi').forEach((card) => {
      if (card.querySelector('.stale')) return; const host = card.closest('[data-draw]'); if (!host) return; const label = (card.querySelector('.l span') || {}).textContent || '';
      let src = ''; for (const [d, re, sv] of KSRC) { if (d.test(host.dataset.draw) && (!re || re.test(label))) { src = typeof sv === 'function' ? sv(host) : sv; break; } }
      const d = src && staleOf(src); if (d) (card.querySelector('.s') || card).insertAdjacentHTML('beforeend', ` <span class="stale" title="${SRCN[src]} has data up to this day only">last updated ${dLbl(d)}</span>`);
    });
  }
  const OBS = { dash: obsDash, app: obsApp, demo: obsDemo, series: obsSeries, social: obsSocial, pm: obsPm };
  dash.draw('mObs', (el) => { let L = []; try { L = OBS[el.dataset.sec](); } catch (err) { console.error(err); } if (el.dataset.n) L = L.slice(0, +el.dataset.n); el.innerHTML = L.length ? L.map((o) => `<div class="ob ${o.kind}"><span class="ic">${{ good: '↑', bad: '!', info: 'i' }[o.kind]}</span><div><div class="t">${o.t}</div>${o.tip ? `<div class="obtip">${o.tip}</div>` : ''}</div></div>`).join('') : '<div class="empty">Nothing moved much in this range compared with the period before.</div>'; });

  // ====================================================================== channel quality (performance marketing)
  dash.draw('mChq', (el) => {
    const ch = rowsOf('channels'); const ms = rangeMonths(); const R = ch.filter((r) => ms.includes(r.month));
    const g = d3.rollups(R, (v) => { const i = d3.sum(v, (r) => n(r.installs)); return { inst: i, d1: i ? d3.sum(v, (r) => n(r.retention_rate_d1) * n(r.installs)) / i : null }; }, (r) => r.channel).filter(([, a]) => a.inst >= 100).sort((a, b) => b[1].inst - a[1].inst).slice(0, 14);
    if (el.dataset.k === 'inst') hbar(el, g.map(([k, a], i) => ({ k, v: a.inst, c: COL[i % COL.length], note: 'D1 ' + fmt(a.d1, 'p1') })));
    else hbar(el, g.filter(([, a]) => fin(a.d1)).sort((a, b) => b[1].d1 - a[1].d1).map(([k, a]) => ({ k, v: a.d1, c: a.d1 >= 0.14 ? '#12a150' : '#e0a321', note: F.big(a.inst) + ' installs' })), { f: F.p1 });
  });

  // ====================================================================== influencers
  const parseINR = (s) => { if (s == null) return null; const t = String(s).toLowerCase().replace(/,/g, ''); const m = /([\d.]+)\s*(cr|crore|l\b|lakh|lakhs|lac|k\b)?/.exec(t); if (!m) return null; let v = parseFloat(m[1]); if (!Number.isFinite(v)) return null; const u = m[2] || ''; if (/^cr/.test(u)) v *= 1e7; else if (/^l/.test(u)) v *= 1e5; else if (u === 'k') v *= 1e3; return v >= 1000 ? v : null; };
  const MONIDX = (s) => MON.findIndex((x) => String(s || '').toLowerCase().startsWith(x.toLowerCase()));
  const ROSTER = (() => {
    // Monthly casting sheets (Sep 2026 on) are the source of truth: "Casted" = Cast, "Not casted" = approved but not cast (Available).
    // Before September only the Casting sheet exists: confirmed rows count as Cast. The Casting sheet also fills in character, tier, coordinator and trackable downloads.
    const out = []; const mIdx = (m) => { const [y, mm] = m.split('-').map(Number); return y * 12 + mm; };
    const tok = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/[^a-z]/g, '').replace(/[aeiouhy]/g, ''));
    const raw = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, ''); const same = (a, b) => { const x = tok(a), y = tok(b); if (!x.length || !y.length || x[0] !== y[0] || x[0].length < 2 || raw(a)[0] !== raw(b)[0]) return false; return x.length < 2 || y.length < 2 || x[1] === y[1]; };
    const CS = []; const cast = sheetBlock('infl_03');
    if (cast) { const { h, m } = headerMap(cast.rows); cast.rows.slice(h + 1).forEach((r) => { const name = (r[m['Influencer Name']] || '').trim(); if (!name) return; const mi = MONIDX(r[m['Exp Delivery Month']]); const conf = r[m['Confirmation Date']] || ''; const acq = r[m['Social Assets Acquired']] || ''; const ok = !/drop|denied/i.test(conf) && (parseDate(conf) || /closed|shoot done/i.test(conf) || (acq && !/pending|^\.?$/i.test(acq))); const ser = r[m['Series Name']] || ''; CS.push({ name, month: mi >= 0 ? `2026-${String(mi + 1).padStart(2, '0')}` : null, ok, coord: (r[m.Coordinator] || '').trim(), tier: r[m['Casting Tier']] || '', statusTxt: conf, costTxt: r[m['2 Day Shoot Cost']] || '', cost: parseINR(r[m['2 Day Shoot Cost']]), series: /not finalised/i.test(ser) ? '' : ser.trim(), character: /not finalised/i.test(r[m['Character Name']] || '') ? '' : (r[m['Character Name']] || '').trim(), assets: r[m['Social Assets Closed']] || '', acquired: acq, mode: r[m['Face / Physical']] || '', reach: r[m['Cumulative Reach']] || '', dl: pn(r[m['Trackable Downloads']]) }); }); }
    CS.filter((c) => c.month && c.month < '2026-09' && c.ok).forEach((c) => out.push({ ...c, status: 'Cast', src: 'Casting sheet' }));
    [['infl_04', '2026-09'], ['infl_05', '2026-10'], ['infl_06', '2026-11'], ['infl_07', '2026-12'], ['infl_08', '2027-01']].forEach(([sid, mo]) => {
      const t = sheetBlock(sid); if (!t) return; const { h, m } = headerMap(t.rows); const col = (re) => m[Object.keys(m).find((k) => re.test(k.trim()))]; let tier = 'Big Star';
      t.rows.slice(h + 1).forEach((r) => { const f = r.filter(Boolean); if (f.length === 1 && /smaller influencer/i.test(f[0])) { tier = 'Influencer'; return; } const name = (r[col(/^Name/)] || '').trim(); if (!name || f.length < 2) return;
        const cst = r[col(/^Casting status/i)] || ''; const status = /^cast/i.test(cst.trim()) ? 'Cast' : 'Available'; const ser = (r[col(/^Tentative Series/)] || '').trim();
        const rec = { name, month: mo, coord: '', tier, status, castTxt: cst, statusTxt: r[col(/^Status/)] || '', costTxt: r[col(/^Entire Series/)] || '', cost: parseINR(r[col(/^Entire Series/)]), series: /^(tbd|tbc)?$/i.test(ser) ? '' : ser, character: '', assets: r[col(/^Deliverables/)] || '', acquired: '', mode: '', reach: r[col(/^Avg Views/)] ? 'avg views ' + r[col(/^Avg Views/)] : '', dl: null, dates: (r[col(/^Available Dates/)] || '').trim(), src: 'Monthly casting sheet' };
        const c = CS.find((x) => x.month && Math.abs(mIdx(x.month) - mIdx(mo)) <= 2 && same(x.name, name));
        if (c) { rec.coord = c.coord; if (c.tier) rec.tier = c.tier; rec.character = c.character; rec.mode = c.mode; if (rec.status === 'Cast') { rec.acquired = c.acquired; rec.dl = c.dl; if (c.reach) rec.reach = c.reach; if (!rec.series) rec.series = c.series; } }
        out.push(rec); });
    });
    return out;
  })();
  const rosterIn = (st) => { const ms = rangeMonths(); return ROSTER.filter((r) => r.month && ms.includes(r.month) && (!st || r.status === st)); };
  const chMonth = (name, m) => { const r = rowsOf('channels').filter((x) => x.month === m && x.channel === name); const i = d3.sum(r, (x) => n(x.installs)); return { inst: i, d1: i ? d3.sum(r, (x) => n(x.retention_rate_d1) * n(x.installs)) / i : null, d7: i ? d3.sum(r, (x) => n(x.retention_rate_d7) * n(x.installs)) / i : null, dau: d3.sum(r, (x) => n(x.daus)), fvv: d3.sum(r, (x) => n(x.first_video_view_d0_conversions_cohort)) }; };
  dash.draw('mInflKpis', (el) => {
    const c = cur(), p = prev(); const ms = rangeMonths(); const C = rosterIn('Cast'); const av = rosterIn('Available').length; const ins = d3.sum(ms, (m) => chMonth('Influencer', m).inst);
    const d1 = (() => { let w = 0, s = 0; ms.forEach((m) => { const a = chMonth('Influencer', m); if (a.inst && fin(a.d1)) { w += a.inst; s += a.d1 * a.inst; } }); return w ? s / w : null; })();
    const T = [['Influencers cast', F.int(C.length), '', `${av} more approved, not cast`, 'a-view'], ['Cost of cast talent', fmt(d3.sum(C, (r) => r.cost || 0), 'inr'), '', `${C.filter((r) => !r.cost).length} cast with no cost in sheet`, 'a-mkt'], ['Series covered', F.int(new Set(C.filter((r) => r.series).map((r) => norm(r.series).replace(/[aeiouh]/g, ''))).size), '', `${C.filter((r) => !r.series).length} cast without a series`, 'a-view'], ['Influencer spend', fmt(c.infl, 'inr'), dk(c, p, 'infl', 0), 'Table 3, spread by day', 'a-rev'], ['Influencer installs (Adjust)', fmt(ins, 'big'), '', `CPI ${fmt(c.inflCpi, 'inr1')} vs paid ${fmt(c.cpi, 'inr1')}`, 'a-rev'], ['Day-1 retention', fmt(d1, 'p1'), '', `paid ${fmt(c.paidD1, 'p1')}`, 'a-ret']];
    el.innerHTML = T.map(([l, v, d, s2, a]) => `<div class="kpi ${a}"><div class="l"><span>${l}</span>${d}</div><div class="v">${v}</div><div class="s">${esc(s2)}</div></div>`).join('');
  });
  dash.draw('mInflChart', (el) => {
    const Mo = model(); if (!Mo) return; const k = el.dataset.k; const ms = Mo.months.filter((m) => m >= '2026-05'); const sel = new Set(ms.map((m, i) => (rangeMonths().includes(m) ? i : -1)).filter((i) => i >= 0));
    if (k === 'spend') chart(el, { cats: ms.map(mlabel), sel, bars: [{ name: 'Spend', values: ms.map((m) => (T3[m] && T3[m].infl ? T3[m].infl.spend : null)), color: COL[0] }], y2: [{ name: 'Installs', values: ms.map((m) => chMonth('Influencer', m).inst || null), color: COL[1] }], fy: F.inr, fy2: F.big });
    if (k === 'ret') chart(el, { cats: ms.map(mlabel), sel, bars: [{ name: 'Influencer D1', values: ms.map((m) => chMonth('Influencer', m).d1), color: COL[0] }, { name: 'Paid D1', values: ms.map((m) => (Mo.paid[m] || {}).d1), color: COL[1] }], lines: [{ name: 'Influencer D7', values: ms.map((m) => chMonth('Influencer', m).d7), color: COL[2] }], fy: F.p0 });
    if (k === 'cast' || k === 'split') { const mm = [...new Set(ROSTER.map((r) => r.month).filter(Boolean))].sort(); const s2 = new Set(mm.map((m, i) => (rangeMonths().includes(m) ? i : -1)).filter((i) => i >= 0)); const cn = (m, st) => ROSTER.filter((r) => r.month === m && r.status === st).length;
      if (k === 'cast') chart(el, { cats: mm.map(mlabel), sel: s2, bars: [{ name: 'Cast', values: mm.map((m) => cn(m, 'Cast')), color: '#12a150' }], y2: [{ name: 'Cost of cast talent', values: mm.map((m) => d3.sum(ROSTER.filter((r) => r.month === m && r.status === 'Cast'), (r) => r.cost || 0) || null), color: COL[1] }], fy: F.int, fy2: F.inr });
      else chart(el, { cats: mm.map(mlabel), sel: s2, stacked: true, bars: [{ name: 'Cast', values: mm.map((m) => cn(m, 'Cast')), color: '#12a150' }, { name: 'Approved, not cast', values: mm.map((m) => cn(m, 'Available')), color: '#c9ccd3' }], fy: F.int }); }
    if (k === 'series') { const g = d3.rollups(rosterIn('Cast').filter((r) => r.series), (v) => ({ c: d3.sum(v, (r) => r.cost || 0), n: v.map((r) => r.name.trim()) }), (r) => norm(r.series).replace(/[aeiouh]/g, '')).sort((a, b) => b[1].c - a[1].c); hbar(el, g.map(([s0, a], i) => ({ k: rosterIn('Cast').find((r) => r.series && norm(r.series).replace(/[aeiouh]/g, '') === s0).series.trim(), v: a.c, c: COL[i % COL.length], note: a.n.join(', ') })), { f: F.inr }); }
  });
  dash.draw('mInflSeriesTbl', (el) => { const R = rosterIn('Cast'); table(el, [{ k: 'mon', label: 'Month', l: 1 }, { k: 'name', label: 'Influencer', l: 1 }, { k: 'series', label: 'Series', l: 1 }, { k: 'character', label: 'Character', l: 1 }, { k: 'tier', label: 'Tier', l: 1 }, { k: 'cost', label: 'Cost', f: 'inr' }, { k: 'reach', label: 'Reach', l: 1 }, { k: 'dl', label: 'Trackable downloads', f: 'int' }], R.map((r) => ({ ...r, mon: mfull(r.month), series: r.series || 'not decided' })), { sort: 'mon' }); });
  const IC = { scope: { Cast: 'range', Available: 'range' }, q: { Cast: '', Available: '' } };
  dash.draw('mInflMonths', (el) => {
    const st = el.dataset.st; const card = el.closest('.m-tabpane');
    card.querySelectorAll('[data-ic="scope"] button').forEach((b) => { b.setAttribute('aria-pressed', b.dataset.v === IC.scope[st]); if (!b._b) { b._b = 1; b.onclick = () => { IC.scope[st] = b.dataset.v; dash.draw('mInflMonths'); }; } });
    const q = card.querySelector('[data-ic="q"]'); if (q && !q._b) { q._b = 1; q.oninput = () => { IC.q[st] = q.value.toLowerCase(); dash.draw('mInflMonths'); }; }
    const base = IC.scope[st] === 'all' ? ROSTER.filter((r) => r.month && r.status === st) : rosterIn(st); const R = base.filter((r) => !IC.q[st] || (r.name + ' ' + r.series).toLowerCase().includes(IC.q[st]));
    const ms = [...new Set(R.map((r) => r.month))].sort().reverse(); const clr = st === 'Cast' ? '#12a150' : '#a7abb4';
    if (!ms.length) { el.innerHTML = `<div class="empty">${st === 'Cast' ? 'Nobody cast' : 'Nobody approved-but-not-cast'} in the months of this range. Switch to “All months” — the casting sheets cover May 2026 – Jan 2027.</div>`; return; }
    el.innerHTML = ms.map((m, i) => { const x = R.filter((r) => r.month === m).sort((a, b) => (b.cost || 0) - (a.cost || 0));
      const head = st === 'Cast' ? `${mfull(m)} — ${x.length} cast · ${F.inr(d3.sum(x, (r) => r.cost || 0))} on cast talent` : `${mfull(m)} — ${x.length} approved, not cast · ${d3.sum(x, (r) => r.cost || 0) ? `quoted ${F.inr(d3.sum(x, (r) => r.cost || 0))} (not counted)` : 'no quotes yet'}`;
      return `<details class="mdet"${i < 3 ? ' open' : ''} style="margin-bottom:10px"><summary><span>${head}</span></summary><div class="body"><div class="deals">${x.map((r) => `<div class="deal" style="border-left:4px solid ${clr}"><div class="n"><span>${esc(r.name)}</span>${r.cost ? `<span${st === 'Cast' ? '' : ' class="muted"'}>${F.inr(r.cost)}</span>` : r.costTxt ? `<span class="muted" style="font-weight:400">${esc(r.costTxt)}</span>` : ''}</div><div><b>${esc(r.series || 'Series not decided')}</b>${r.character ? ` · as ${esc(r.character)}` : ''}</div><div>${[r.tier, r.coord && r.coord !== 'Direct' ? 'via ' + r.coord : r.coord, r.mode].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</div>${r.statusTxt ? `<div class="m">${esc(r.statusTxt)}</div>` : ''}${r.assets ? `<div class="m">Deliverables: ${esc(r.assets)}${r.acquired ? ' · got: ' + esc(r.acquired) : ''}</div>` : ''}${r.reach || r.dl ? `<div class="m">${r.reach ? 'Reach ' + esc(r.reach) : ''}${r.dl ? ` · ${F.int(r.dl)} trackable downloads` : ''}</div>` : ''}${r.dates ? `<div class="m">Dates: ${esc(r.dates)}</div>` : ''}</div>`).join('')}</div></div></details>`; }).join('');
  });
  dash.draw('mInflMonthTbl', (el) => { const rm = rangeMonths(); const mm = [...new Set(ROSTER.map((r) => r.month).filter(Boolean))].sort().reverse();
    table(el, [{ k: 'mon', label: 'Month', l: 1 }, { k: 'inr', label: 'In range', l: 1 }, { k: 'cast', label: 'Cast', f: 'int' }, { k: 'cost', label: 'Cost of cast talent', f: 'inr' }, { k: 'avg', label: 'Avg per cast', f: 'inr' }, { k: 'bs', label: 'Big stars cast', f: 'int' }, { k: 'ser', label: 'Series', l: 1 }, { k: 'dl', label: 'Trackable downloads', f: 'int' }, { k: 'av', label: 'Approved, not cast', f: 'int' }],
      mm.map((m) => { const C = ROSTER.filter((r) => r.month === m && r.status === 'Cast'); const A = ROSTER.filter((r) => r.month === m && r.status === 'Available'); const cost = d3.sum(C, (r) => r.cost || 0); const wc = C.filter((r) => r.cost).length;
        return { m, mon: mfull(m), inr: rm.includes(m) ? '●' : '', cast: C.length, cost: cost || null, avg: wc ? cost / wc : null, bs: C.filter((r) => /big/i.test(r.tier)).length, ser: [...d3.group(C.filter((r) => r.series), (r) => norm(r.series).replace(/[aeiouh]/g, '')).values()].map((v) => v[0].series).join(', ') || '—', dl: d3.sum(C, (r) => r.dl || 0) || null, av: A.length }; }), { sort: 'm' }); });

  // ====================================================================== OEM
  const OEMN = ['Oppo Affinity', 'Xiaomi', 'Vivo Affinity', 'Transsion Holdings']; const OEMC = { 'Oppo Affinity': '#1f8f4e', Xiaomi: '#f08c2e', 'Vivo Affinity': '#2f6fd1', 'Transsion Holdings': '#7c4ddb' };
  const OEMROWS = (() => { const o = M.oem || {}; const rows = (o.monthly || []).map((r) => ({ ...r, month: r.month })); const d = o.daily || []; d3.groups(d, (r) => r.network + '|' + r.campaign_network + '|' + r.day.slice(0, 7)).forEach(([k, v]) => { const [network, campaign_network, month] = k.split('|'); const i = d3.sum(v, (r) => n(r.installs)); rows.push({ network, campaign_network, month, installs: i, reattributions: d3.sum(v, (r) => n(r.reattributions)), sessions: d3.sum(v, (r) => n(r.sessions)), daus: d3.sum(v, (r) => n(r.daus)) / dd(month + '-01', v.reduce((x, r) => (r.day > x ? r.day : x), '')), uninstalls: d3.sum(v, (r) => n(r.uninstalls)), retention_rate_d1: i ? d3.sum(v, (r) => n(r.retention_rate_d1) * n(r.installs)) / i : 0, retention_rate_d7: null, time_spent_per_user_d0: null, first_reinstalls: null }); }); return rows; })();
  const oemAgg = (v) => { const i = d3.sum(v, (r) => n(r.installs)); const di = d3.sum(v.filter((r) => n(r.retention_rate_d1) > 0), (r) => n(r.installs)); return { inst: i, react: d3.sum(v, (r) => n(r.reattributions)), sess: d3.sum(v, (r) => n(r.sessions)), dau: d3.sum(v, (r) => n(r.daus)), uninst: d3.sum(v, (r) => n(r.uninstalls)), d1: di ? d3.sum(v, (r) => n(r.retention_rate_d1) * n(r.installs)) / di : null, d7: (() => { const w = v.filter((r) => n(r.retention_rate_d7) > 0); const x = d3.sum(w, (r) => n(r.installs)); return x ? d3.sum(w, (r) => n(r.retention_rate_d7) * n(r.installs)) / x : null; })() }; };
  const oemMonths = () => [...new Set(OEMROWS.map((r) => r.month))].sort();
  dash.draw('mOemLegend', (el) => { el.innerHTML = OEMN.map((x) => `<span><i style="background:${OEMC[x]}"></i>${x}</span>`).join(''); });
  dash.draw('mOemKpis', (el) => {
    const ms = rangeMonths(); const a = oemAgg(OEMROWS.filter((r) => ms.includes(r.month))); const c = cur();
    const T = [['OEM installs', fmt(a.inst, 'big'), ms.map(mlabel).join(', ')], ['Reattributions', fmt(a.react, 'big'), 'returning users credited to OEMs'], ['Day-1 retention', fmt(a.d1, 'p1'), `all installs ${fmt(c.d1, 'p1')}`], ['Day-7 retention', fmt(a.d7, 'p1'), 'where Adjust reports it'], ['Uninstalls', fmt(a.uninst, 'big'), `${fmt(a.inst ? a.uninst / a.inst : null, 'p0')} of OEM installs`], ['OEM spend', fmt(c.oem, 'inr'), c.oem ? `CPI ${fmt(c.oemCpi, 'inr1')} (tracker)` : 'only Nov 2026 is recorded']];
    el.innerHTML = T.map(([l, v, s2]) => `<div class="kpi a-users"><div class="l"><span>${l}</span></div><div class="v">${v}</div><div class="s">${esc(s2)}</div></div>`).join('');
  });
  dash.draw('mOemChart', (el) => {
    const k = el.dataset.k; const ms = oemMonths(); const sel = new Set(ms.map((m, i) => (rangeMonths().includes(m) ? i : -1)).filter((i) => i >= 0));
    if (k === 'inst') chart(el, { cats: ms.map(mlabel), sel, stacked: true, bars: OEMN.map((nw) => ({ name: nw, values: ms.map((m) => oemAgg(OEMROWS.filter((r) => r.network === nw && r.month === m)).inst), color: OEMC[nw] })), fy: F.big });
    if (k === 'dau') chart(el, { cats: ms.map(mlabel), sel, stacked: true, bars: OEMN.map((nw) => ({ name: nw, values: ms.map((m) => oemAgg(OEMROWS.filter((r) => r.network === nw && r.month === m)).dau), color: OEMC[nw] })), fy: F.big });
    if (k === 'd1') chart(el, { cats: ms.map(mlabel), sel, lines: OEMN.map((nw) => ({ name: nw, values: ms.map((m) => { const a = oemAgg(OEMROWS.filter((r) => r.network === nw && r.month === m)); return a.inst >= 50 ? a.d1 : null; }), color: OEMC[nw] })), fy: F.p1 });
    if (k === 'daily') { const D = (M.oem && M.oem.daily) || []; const days = [...new Set(D.map((r) => r.day))].sort(); chart(el, { cats: days.map(dLbl), stacked: true, bars: OEMN.map((nw) => ({ name: nw, values: days.map((d) => d3.sum(D.filter((r) => r.day === d && r.network === nw), (r) => n(r.installs))), color: OEMC[nw] })), fy: F.int }); }
  });
  dash.draw('mOemTbl2', (el) => { const ms = rangeMonths(); table(el, [{ k: 'nw', label: 'Network', l: 1 }, { k: 'inst', label: 'Installs', f: 'int' }, { k: 'react', label: 'Reattributions', f: 'int' }, { k: 'sess', label: 'Sessions', f: 'big' }, { k: 'dau', label: 'DAU (sum of months)', f: 'd1' }, { k: 'uninst', label: 'Uninstalls', f: 'int' }, { k: 'd1', label: 'D1', f: 'p1' }, { k: 'd7', label: 'D7', f: 'p1' }], OEMN.map((nw) => ({ nw, ...oemAgg(OEMROWS.filter((r) => r.network === nw && ms.includes(r.month))) })), { sort: 'inst' }); });
  dash.draw('mOemDetail', (el) => { const ms = rangeMonths(); table(el, [{ k: 'network', label: 'Network', l: 1 }, { k: 'campaign_network', label: 'Campaign', l: 1 }, { k: 'mon', label: 'Month', l: 1 }, { k: 'installs', label: 'Installs', f: 'int' }, { k: 'reattributions', label: 'Reattributions', f: 'int' }, { k: 'sessions', label: 'Sessions', f: 'int' }, { k: 'daus', label: 'DAU', f: 'd1' }, { k: 'uninstalls', label: 'Uninstalls', f: 'int' }, { k: 'retention_rate_d1', label: 'D1', f: 'p1' }, { k: 'retention_rate_d7', label: 'D7', f: 'p1' }, { k: 'time_spent_per_user_d0', label: 'Seconds on install day', f: 'int' }], OEMROWS.filter((r) => ms.includes(r.month)).map((r) => ({ ...r, mon: mlabel(r.month), installs: n(r.installs), reattributions: n(r.reattributions), sessions: n(r.sessions), daus: n(r.daus), uninstalls: n(r.uninstalls), retention_rate_d1: has(r.retention_rate_d1) && +r.retention_rate_d1 ? +r.retention_rate_d1 : null, retention_rate_d7: has(r.retention_rate_d7) && +r.retention_rate_d7 ? +r.retention_rate_d7 : null, time_spent_per_user_d0: has(r.time_spent_per_user_d0) ? +r.time_spent_per_user_d0 : null })), { sort: 'installs' }); });
  dash.draw('mOemOther', (el) => { const ms = rangeMonths(); const R = rowsOf('channels').filter((r) => ms.includes(r.month) && !/^(Facebook|Google Ads|Organic)$/.test(r.channel)); table(el, [{ k: 'channel', label: 'Channel', l: 1 }, { k: 'mon', label: 'Month', l: 1 }, { k: 'installs', label: 'Installs', f: 'int' }, { k: 'reattributions', label: 'Reattributions', f: 'int' }, { k: 'daus', label: 'DAU', f: 'd1' }, { k: 'd1', label: 'D1', f: 'p1' }, { k: 'd7', label: 'D7', f: 'p1' }, { k: 'tsd0', label: 'Seconds on install day', f: 'int' }, { k: 'fvv', label: 'Watched 1st video (d0)', f: 'int' }, { k: 'f5', label: 'Finished 5th video (d0)', f: 'int' }], R.map((r) => ({ channel: r.channel, mon: mlabel(r.month), installs: n(r.installs), reattributions: n(r.reattributions), daus: n(r.daus), d1: n(r.installs) ? n(r.retention_rate_d1) : null, d7: n(r.installs) ? n(r.retention_rate_d7) : null, tsd0: n(r.time_spent_per_user_d0) || null, fvv: n(r.first_video_view_d0_conversions_cohort), f5: n(r.fifth_video_view_complete_d0_conversions_cohort) })), { sort: 'installs' }); });
  function obsInfl() {
    const L = []; const c = cur(); const ms = rangeMonths(); const cast = rosterIn('Cast'); const av = rosterIn('Available');
    if (cast.length) L.push({ kind: 'info', t: `<b>${cast.length} influencers cast</b> in ${ms.map(mlabel).join(', ')} for ${F.inr(d3.sum(cast, (r) => r.cost || 0))}: ${cast.slice(0, 6).map((r) => `${esc(r.name.trim())}${r.series ? ' (' + esc(r.series.trim()) + ')' : ''}`).join(', ')}${cast.length > 6 ? '…' : ''}.`, tip: 'See the Cast tab for each person, their series and deliverables.' });
    if (av.length) { const cheap = av.filter((r) => r.cost).sort((a, b) => a.cost - b.cost).slice(0, 4); L.push({ kind: 'info', t: `<b>${av.length} approved but not cast</b> in these months${cheap.length ? ` — lowest quotes: ${cheap.map((r) => `${esc(r.name.trim())} ${F.inr(r.cost)}`).join(', ')}` : ''}.`, tip: 'They are already approved, so they are the quickest names to fill an upcoming series slot. Not counted in any total.' }); }
    const noS = cast.filter((r) => !r.series); if (noS.length) L.push({ kind: 'bad', t: `<b>${noS.length} cast influencers have no series assigned yet:</b> ${noS.map((r) => esc(r.name.trim())).join(', ')}.`, tip: 'Lock the series before the shoot so collab posts can carry the series name and a deep link.' });
    ms.forEach((m) => { const a = chMonth('Influencer', m); const p = (model().paid[m] || {}); if (a.inst && fin(a.d1) && fin(p.d1)) L.push({ kind: a.d1 >= p.d1 ? 'good' : 'bad', t: `<b>${mfull(m)}:</b> ${F.big(a.inst)} influencer installs with day-1 retention ${F.p1(a.d1)} vs ${F.p1(p.d1)} for paid.`, tip: a.d1 >= p.d1 ? 'Influencer users stay at least as well as paid ones.' : 'Influencer users stay less well than paid ones — favour influencers whose audience matches the drama audience.' }); });
    const dl = cast.filter((r) => r.dl); if (dl.length) L.push({ kind: 'info', t: `<b>Trackable downloads from cast talent:</b> ${dl.sort((a, b) => b.dl - a.dl).slice(0, 5).map((r) => `${esc(r.name.trim())} ${F.int(r.dl)}`).join(', ')}.`, tip: 'Most cast talent brings very few tracked downloads — give each a personal deep link and ask for a link sticker in every story.' });
    if (fin(c.inflCpi)) L.push({ kind: c.inflCpi <= (c.cpi || 1e9) ? 'good' : 'bad', t: `<b>Influencer CPI ${F.inr1(c.inflCpi)}</b> against paid CPI ${fmt(c.cpi, 'inr1')} in the range.`, tip: '' });
    return L;
  }
  function obsOem() {
    const L = []; const ms = rangeMonths(); OEMN.forEach((nw) => { const a = oemAgg(OEMROWS.filter((r) => r.network === nw && ms.includes(r.month))); if (a.inst > 50) L.push({ kind: fin(a.d1) && a.d1 >= 0.1 ? 'good' : 'bad', t: `<b>${nw}:</b> ${F.int(a.inst)} installs, day-1 retention ${fmt(a.d1, 'p1')}, ${F.int(a.uninst)} uninstalls.`, tip: fin(a.d1) && a.d1 < 0.05 ? 'Pre-install / push-install users rarely open the app — pay only per opened install or per first video.' : 'Ask the OEM for placement-level reporting and pay on day-1 opens.' }); else if (a.react || a.dau) L.push({ kind: 'info', t: `<b>${nw}:</b> no new installs in the range, but ${F.int(a.react)} reattributions and about ${F.d1(a.dau)} daily users still credited.`, tip: 'These are users from earlier OEM deals coming back.' }); });
    const all = oemAgg(OEMROWS.filter((r) => r.month >= '2026-01' && r.month <= '2026-05')); L.push({ kind: 'info', t: `<b>History:</b> OEMs brought ${F.big(all.inst)} installs in Jan–May 2026 at day-1 retention around ${fmt(all.d1, 'p1')} — far below the 14% target.`, tip: 'Judge the Vivo pilot on day-1 and day-7 retention, not install volume.' });
    return L;
  }
  OBS.infl = obsInfl; OBS.oem = obsOem;

  // ====================================================================== navigation
  function show(pid, tid) {
    const pages = [...document.querySelectorAll('#dash-root .m-page-pane')]; if (!pages.length) return;
    const page = pages.find((p) => p.dataset.page === pid) || pages[0]; pages.forEach((p) => { p.hidden = p !== page; });
    document.querySelectorAll('#dash-root .m-nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.page === page.dataset.page));
    const panes = [...page.querySelectorAll(':scope > .m-tabpane')]; const pane = panes.find((p) => p.dataset.tab === tid) || panes[0];
    panes.forEach((p) => { p.hidden = p !== pane; }); page.querySelectorAll('.m-tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === pane.dataset.tab));
    renderSheets(pane); requestAnimationFrame(() => { dash.redraw(pane); setTimeout(() => collapseTables(pane), 60); });
    const h = `#${page.dataset.page}/${pane.dataset.tab}`; if (location.hash !== h) history.replaceState(null, '', h); try { localStorage.setItem('mt-last', h); } catch (e) {}
  }
  function init() {
    document.querySelectorAll('details.fixedref').forEach((d) => { const body = d.querySelector('.body'); let n2 = d.nextElementSibling; while (n2 && !n2.hasAttribute('data-ref-end')) { const nx = n2.nextElementSibling; body.appendChild(n2); n2 = nx; } if (n2) n2.remove(); });
    initXCharts();
    const Mo0 = model(); const p0 = dash.params(); if (Mo0 && !p0.start && !p0.end) dash.setParams({ start: addD(Mo0.last, -29), end: Mo0.last });
    document.querySelectorAll('#dash-root details.mdet').forEach((d) => d.addEventListener('toggle', () => { if (d.open) { renderSheets(d); dash.redraw(d); setTimeout(() => collapseTables(d), 60); } }));
    document.querySelectorAll('#dash-root .m-nav button').forEach((b) => b.addEventListener('click', () => { show(b.dataset.page); window.scrollTo({ top: 0 }); }));
    document.querySelectorAll('#dash-root .m-tabs button').forEach((b) => b.addEventListener('click', () => show(b.closest('.m-page-pane').dataset.page, b.dataset.tab)));
    let h = location.hash.slice(1); if (!h) { try { h = (localStorage.getItem('mt-last') || '').slice(1); } catch (e) {} }
    const [p, t] = h.split('/'); show(p || 'dash', t);
    document.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#"]'); if (!a) return; const id = a.getAttribute('href').slice(1); if (id.includes('/')) return; const el = document.getElementById(id) || document.getElementById('b-' + id); if (!el) return; const pane = el.closest('.m-tabpane'); if (!pane) return; e.preventDefault(); show(pane.closest('.m-page-pane').dataset.page, pane.dataset.tab); setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 60); });
    addEventListener('hashchange', () => { const [p2, t2] = location.hash.slice(1).split('/'); show(p2, t2); });
    let tm; new MutationObserver(() => { clearTimeout(tm); tm = setTimeout(() => { const pane = document.querySelector('.m-page-pane:not([hidden]) > .m-tabpane:not([hidden])'); if (pane) { collapseTables(pane); markStale(pane); } }, 150); }).observe(document.getElementById('dash-root'), { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
