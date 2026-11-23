(function () {
  const M = window.__MASTER || { sheets: {}, engine: { dash: [], wm: [], meta: {} }, pmHistory: { months: {} }, index: [] };
  const COL = dash.colors;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fin = (v) => v != null && Number.isFinite(+v);
  const F = {
    int: d3.format(','), p0: d3.format('.0%'), p1: d3.format('.1%'), p2: d3.format('.2%'), d1: d3.format(',.1f'), d2: d3.format(',.2f'),
    big: (v) => (Math.abs(v) >= 1e5 ? new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : d3.format(',.0f')(v)),
    inr: (v) => '₹' + (Math.abs(v) >= 1e5 ? (Math.abs(v) >= 1e7 ? d3.format(',.2f')(v / 1e7) + ' Cr' : d3.format(',.2f')(v / 1e5) + ' L') : d3.format(',.0f')(v)),
    inr1: (v) => '₹' + d3.format(',.1f')(v), inr0: (v) => '₹' + d3.format(',.0f')(v), x2: (v) => d3.format('.2f')(v),
  };
  const fmt = (v, f) => (fin(v) ? F[f](+v) : '—');
  // "₹1,234.5" / "12.3%" / "1.2x" -> number (percent as a fraction)
  const pn = (s) => {
    if (s == null) return null; if (typeof s === 'number') return s;
    const t = String(s).replace(/[₹,\s]|Rs\.?/g, '').replace(/x$/i, '');
    if (t === '' || t === '—' || t === '-' || /^na$/i.test(t)) return null;
    if (/%$/.test(t)) { const v = parseFloat(t); return Number.isFinite(v) ? v / 100 : null; }
    const v = parseFloat(t); return Number.isFinite(v) && /^-?[\d.]+(e[-+]?\d+)?$/i.test(t) ? v : null;
  };
  const rowsOf = (id) => (dash.data(id).status === 'ok' ? dash.data(id).data : []);
  const n = (v) => (v === '' || v == null ? 0 : +v || 0);
  const has = (v) => v !== '' && v != null && Number.isFinite(+v);
  const IST = () => new Date(Date.now() + 19800000);
  const yday = () => new Date(Date.now() + 19800000 - 864e5).toISOString().slice(0, 10);
  const rng = () => { const p = dash.params(); return { s: p.start || '2025-10-06', e: p.end || yday() }; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mlabel = (m) => MON[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4);
  const mfull = (m) => MON[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
  const monthKey = (lbl) => { const [a, y] = String(lbl).trim().split(/\s+/); const i = MON.indexOf(a.slice(0, 3)); return i < 0 ? null : `${y}-${String(i + 1).padStart(2, '0')}`; };
  const median = (a) => { const s = a.filter(fin).map(Number).sort((x, y) => x - y); if (!s.length) return null; const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/y$/, '');

  // ====================================================================== sheets
  const sheetBlock = (sid, col) => { const s = M.sheets[sid]; if (!s) return null; return col ? s.tables.find((t) => t.cols[0] === col) : s.tables[0]; };
  const NUMRE = /^[-–]?[₹$]?-?[\d,]*\.?\d+(%|x|×| L| Cr|[KMk])?$/;
  function headerIndex(rows) {
    const nc = Math.max(1, ...rows.map((r) => r.length));
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const r = rows[i], f = r.filter(Boolean);
      if (f.length >= Math.max(3, nc * 0.6) && f.filter((c) => NUMRE.test(c)).length <= f.length * 0.2) return i;
    }
    return -1;
  }
  function headerMap(rows) { const h = headerIndex(rows); const m = {}; if (h >= 0) rows[h].forEach((c, i) => { if (c && !(c in m)) m[c] = i; }); return { h, m }; }
  function buildSheet(el, t) {
    const rows = t.rows, nc = Math.max(1, ...rows.map((r) => r.length));
    const kind = rows.map((r) => {
      const f = r.filter(Boolean);
      if (!f.length) return 'blank';
      if (f.length === 1 && r[0] && (nc > 2 || r[0].length > 40)) return 'ttl';
      if (f.length >= Math.max(3, nc * 0.6) && f.filter((c) => NUMRE.test(c)).length <= f.length * 0.2) return 'hd';
      return 'row';
    });
    const fh = kind.indexOf('hd');
    const pre = fh >= 0 ? rows.slice(0, fh + 1).map((r, i) => i) : [];
    const body = rows.map((r, i) => i).filter((i) => i > fh);
    const wrap = document.createElement('div');
    const PAGE = 200; let page = 0, q = '';
    const big = body.length > 15;
    wrap.innerHTML = (big ? '<div class="sheetbar"><input type="search" placeholder="Search these rows"><span class="cnt"></span><span class="pg"></span></div>' : '') + '<div class="sheetwrap"><table></table></div>';
    el.appendChild(wrap);
    const tbl = wrap.querySelector('table');
    const cell = (c, k) => {
      const lvl = /^ +/.exec(c); const txt = c.replace(/^ +/, '');
      const cls = [NUMRE.test(txt) ? 'num' : '', txt.length > 48 ? 'long' : ''].filter(Boolean).join(' ');
      return `<td${cls ? ` class="${cls}"` : ''}>${esc(txt).replace(/\n/g, '<br>')}</td>`;
    };
    const tr = (i) => {
      const r = rows[i], k = kind[i];
      if (k === 'blank') return `<tr><td colspan="${nc}" style="border:0;height:8px"></td></tr>`;
      if (k === 'ttl') return `<tr class="ttl"><td colspan="${nc}">${esc(r[0])}</td></tr>`;
      const lvl = (/^ +/.exec(r[0] || '') || [''])[0].length / 2;
      const cells = []; for (let j = 0; j < nc; j++) cells.push(cell(r[j] || '', k));
      return `<tr class="${k === 'hd' ? 'hd' : ''}${lvl ? ' lvl' + Math.min(2, lvl) : ''}">${cells.join('')}</tr>`;
    };
    const draw = () => {
      const ql = q.toLowerCase();
      const hit = ql ? body.filter((i) => kind[i] !== 'blank' && rows[i].some((c) => c.toLowerCase().includes(ql))) : body;
      const pages = Math.max(1, Math.ceil(hit.length / PAGE)); page = Math.min(page, pages - 1);
      const slice = hit.slice(page * PAGE, page * PAGE + PAGE);
      tbl.innerHTML = pre.map(tr).join('') + slice.map(tr).join('');
      if (big) {
        wrap.querySelector('.cnt').textContent = `${F.int(hit.filter((i) => kind[i] === 'row').length)} rows${ql ? ' match' : ''}`;
        const pg = wrap.querySelector('.pg');
        pg.innerHTML = pages > 1 ? `<button class="mbtn" data-d="-1"${page ? '' : ' disabled'}>‹ Prev</button><span>Page ${page + 1} of ${pages}</span><button class="mbtn" data-d="1"${page < pages - 1 ? '' : ' disabled'}>Next ›</button>` : '';
      }
    };
    if (big) {
      let t0; wrap.querySelector('input').addEventListener('input', (e) => { clearTimeout(t0); t0 = setTimeout(() => { q = e.target.value.trim(); page = 0; draw(); }, 200); });
      wrap.querySelector('.pg').addEventListener('click', (e) => { const b = e.target.closest('button[data-d]'); if (!b) return; page += +b.dataset.d; draw(); wrap.querySelector('.sheetwrap').scrollTop = 0; });
    }
    draw();
  }
  function renderSheets(root) {
    root.querySelectorAll('[data-sheet]').forEach((el) => {
      if (el._done) return; el._done = 1;
      const s = M.sheets[el.dataset.sheet];
      if (!s) { el.innerHTML = '<p class="muted">This sheet is not in this snapshot.</p>'; return; }
      const ts = el.dataset.table ? s.tables.filter((t) => t.cols[0] === el.dataset.table) : s.tables;
      if (!ts.length) { el.innerHTML = '<p class="muted">Table not found in this snapshot.</p>'; return; }
      ts.forEach((t, i) => { if (i) el.appendChild(Object.assign(document.createElement('div'), { style: 'height:16px' })); buildSheet(el, t); });
    });
  }

  // ====================================================================== generic chart
  // o: {cats, bars:[{name,values,color}], stacked, lines:[{name,values,color,dash}], y2:[same as lines], fy, fy2, sel:Set(index), h}
  function chart(el, o) {
    el.innerHTML = '';
    const W = Math.max(280, el.clientWidth || el.getBoundingClientRect().width || 600), H = o.h || 240;
    const cats = o.cats || [];
    if (!cats.length) { el.innerHTML = '<div class="empty">No data for this selection</div>'; return; }
    const m = { t: 10, r: o.y2 ? 48 : 12, b: 28, l: 52 };
    const x = d3.scaleBand().domain(d3.range(cats.length)).range([m.l, W - m.r]).padding(0.22);
    const bars = o.bars || [], lines = o.lines || [], y2s = o.y2 || [];
    let ymax = 0;
    if (o.stacked) cats.forEach((_, i) => { ymax = Math.max(ymax, d3.sum(bars, (b) => +b.values[i] || 0)); });
    else bars.forEach((b) => b.values.forEach((v) => { if (fin(v)) ymax = Math.max(ymax, +v); }));
    lines.forEach((l) => l.values.forEach((v) => { if (fin(v)) ymax = Math.max(ymax, +v); }));
    const y = d3.scaleLinear().domain([0, ymax || 1]).nice().range([H - m.b, m.t]);
    let y2;
    if (y2s.length) { const mx = d3.max(y2s.flatMap((l) => l.values.filter(fin).map(Number))) || 1; y2 = d3.scaleLinear().domain([0, mx]).nice().range([H - m.b, m.t]); }
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).style('display', 'block').style('overflow', 'visible');
    const fy = o.fy || ((v) => F.big(v));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(fy))
      .call((g) => { g.select('.domain').remove(); g.selectAll('line').attr('stroke', 'var(--cds-chart-grid)'); g.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', '11px'); });
    if (y2) svg.append('g').attr('transform', `translate(${W - m.r},0)`).call(d3.axisRight(y2).ticks(5).tickFormat(o.fy2 || fy))
      .call((g) => { g.select('.domain').remove(); g.selectAll('line').remove(); g.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', '11px'); });
    const every = Math.max(1, Math.ceil(cats.length / Math.floor((W - m.l - m.r) / 46)));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat((i) => (i % every ? '' : cats[i])).tickSizeOuter(0))
      .call((g) => { g.select('.domain').attr('stroke', 'var(--cds-chart-reference)'); g.selectAll('line').remove(); g.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', '11px'); });
    const dim = (i) => (o.sel && o.sel.size && !o.sel.has(i) ? 0.35 : 1);
    if (o.stacked) {
      cats.forEach((_, i) => { let acc = 0; bars.forEach((b) => { const v = +b.values[i] || 0; if (v > 0) svg.append('rect').attr('x', x(i)).attr('width', x.bandwidth()).attr('y', y(acc + v)).attr('height', Math.max(0, y(acc) - y(acc + v))).attr('fill', b.color).attr('opacity', dim(i)); acc += v; }); });
    } else if (bars.length) {
      const xi = d3.scaleBand().domain(d3.range(bars.length)).range([0, x.bandwidth()]).padding(0.08);
      bars.forEach((b, j) => b.values.forEach((v, i) => { if (fin(v)) svg.append('rect').attr('x', x(i) + xi(j)).attr('width', xi.bandwidth()).attr('y', y(Math.max(0, +v))).attr('height', Math.max(0, y(0) - y(Math.max(0, +v)))).attr('rx', 2).attr('fill', b.color).attr('opacity', dim(i)); }));
    }
    const line = (l, sc) => {
      const pts = l.values.map((v, i) => [i, v]).filter(([, v]) => fin(v));
      svg.append('path').attr('fill', 'none').attr('stroke', l.color).attr('stroke-width', 2).attr('stroke-dasharray', l.dash ? '5 4' : null)
        .attr('d', d3.line().x(([i]) => x(i) + x.bandwidth() / 2).y(([, v]) => sc(+v))(pts));
      svg.selectAll(null).data(pts).join('circle').attr('cx', ([i]) => x(i) + x.bandwidth() / 2).attr('cy', ([, v]) => sc(+v)).attr('r', pts.length > 40 ? 0 : 3).attr('fill', l.color);
    };
    lines.forEach((l) => line(l, y)); y2s.forEach((l) => line(l, y2));
    // tooltip
    const tip = d3.select(el).append('div').attr('class', 'tip').style('display', 'none');
    const all = [...bars.map((b) => [b, fy]), ...lines.map((l) => [l, fy]), ...y2s.map((l) => [l, o.fy2 || fy])];
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [px] = d3.pointer(ev); const i = Math.max(0, Math.min(cats.length - 1, Math.floor((px - m.l) / x.step())));
        tip.style('display', null).html(`<div class="d">${esc(cats[i])}</div>` + all.map(([s, f]) => `<div><span class="sw" style="background:${s.color}"></span>${esc(s.name)}: <b>${fin(s.values[i]) ? f(+s.values[i]) : '—'}</b></div>`).join(''));
        const left = Math.min(x(i) + x.bandwidth() + 8, W - 200); tip.style('left', Math.max(0, left) + 'px').style('top', '4px');
      }).on('mouseleave', () => tip.style('display', 'none'));
  }
  function hbar(el, items, o = {}) {
    el.innerHTML = '';
    if (!items.length) { el.innerHTML = '<div class="empty">No data for this selection</div>'; return; }
    const W = Math.max(280, el.clientWidth || 600), rowH = 22, lw = Math.min(170, W * 0.38), H = items.length * rowH + 8;
    const mx = d3.max(items, (d) => d.v) || 1;
    const x = d3.scaleLinear().domain([0, mx]).range([0, W - lw - 120]);
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).style('display', 'block');
    items.forEach((d, i) => {
      const g = svg.append('g').attr('transform', `translate(0,${i * rowH + 4})`);
      g.append('text').attr('x', lw - 6).attr('y', 14).attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').style('font-size', '12px').text(d.k.length > 26 ? d.k.slice(0, 25) + '…' : d.k).append('title').text(d.k);
      g.append('rect').attr('x', lw).attr('y', 3).attr('height', rowH - 8).attr('width', Math.max(1, x(d.v))).attr('rx', 2).attr('fill', d.c || COL[0]);
      g.append('text').attr('x', lw + x(d.v) + 5).attr('y', 14).attr('fill', 'var(--color-fg-muted)').style('font-size', '11px').text((o.f || F.big)(d.v) + (d.note ? ' · ' + d.note : ''));
    });
  }
  // sortable table. cols: [{k, label, f (format key or fn), l (left)}]
  function table(el, cols, data, o = {}) {
    const st = el._st || (el._st = { k: o.sort || null, d: -1 });
    const rows = st.k ? data.slice().sort((a, b) => { const x = a[st.k], y = b[st.k]; if (x == null || x === '') return 1; if (y == null || y === '') return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.d; }) : data;
    const fm = (c, v) => (typeof c.f === 'function' ? c.f(v) : c.f ? fmt(v, c.f) : esc(v ?? '—'));
    el.innerHTML = `<table class="mtbl"><thead><tr>${cols.map((c) => `<th data-k="${c.k}" class="${c.l ? 'l' : ''}">${esc(c.label)}${st.k === c.k ? (st.d < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, o.max || 5000).map((r) => `<tr${o.rowKey ? ` data-key="${esc(r[o.rowKey])}"` : ''}${o.selKey && r[o.rowKey] === o.selKey ? ' class="sel"' : ''}>${cols.map((c) => `<td class="${c.l ? 'l' : ''}${c.cls ? ' ' + c.cls(r) : ''}"${c.l ? ` title="${esc(r[c.k])}"` : ''}>${fm(c, r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('th[data-k]').forEach((th) => th.addEventListener('click', () => { const k = th.dataset.k; st.d = st.k === k ? -st.d : -1; st.k = k; table(el, cols, data, o); }));
    if (o.onRow) el.querySelectorAll('tr[data-key]').forEach((tr) => tr.addEventListener('click', () => o.onRow(tr.dataset.key)));
  }

  // ====================================================================== monthly model
  const retIndex = (d1, d7, d30, n1, n7, n30) => {
    let s = 0, w = 0;
    if (fin(d1) && n1 >= 50) { s += 0.5 * d1 / 0.14; w += 0.5; }
    if (fin(d7) && n7 >= 100) { s += 0.3 * d7 / 0.03; w += 0.3; }
    if (fin(d30) && n30 >= 300) { s += 0.2 * d30 / 0.007; w += 0.2; }
    return w ? s / w : null;
  };
  const dashAgg = (rows) => {
    const S = (k) => d3.sum(rows, (r) => +r[k] || 0);
    const a = { spend: S('spend'), budget: S('budget'), minst: S('minst'), mpur: S('mpur'), ainst: S('ainst'), n1: S('n1'), d1n: S('d1n'), n7: S('n7'), d7n: S('d7n'), n30: S('n30'), d30n: S('d30n'), clicks: S('clicks'), impr: S('impr'), apur: S('apur'), v1: S('v1'), v3: S('v3'), v5: S('v5'), v7: S('v7'), mspend: S('mspend') };
    a.d1 = a.n1 ? a.d1n / a.n1 : null; a.d7 = a.n7 ? a.d7n / a.n7 : null; a.d30 = a.n30 && a.d30n ? a.d30n / a.n30 : null;
    a.cpi = a.ainst ? a.spend / a.ainst : null; a.mcpi = a.minst ? a.mspend / a.minst : null;
    a.idx = retIndex(a.d1, a.d7, a.d30, a.n1, a.n7, a.n30); a.retcpi = a.cpi != null && a.idx ? a.cpi / a.idx : null;
    a.ctr = a.impr ? a.clicks / a.impr : null; a.cpp = a.apur ? a.spend / a.apur : null;
    return a;
  };
  // Business Performance Tracker table 3 -> {month: {source: {installs, d1, d7, spend, cpi, subs}}}
  const T3 = (() => {
    const t = sheetBlock('biz_00', 'O'); const out = {}; if (!t) return out; let mk = null;
    t.rows.forEach((r) => {
      const a = (r[0] || '').trim();
      const mm = /^User Acquisition - (\w+)/.exec(a);
      if (mm) { const mo = MON.indexOf(mm[1].slice(0, 3)); mk = mo >= 0 ? `2026-${String(mo + 1).padStart(2, '0')}` : null; return; }
      if (!mk || !a) return;
      const key = /^Performance/i.test(a) ? 'pm' : /^OEM/i.test(a) ? 'oem' : /^Influencer/i.test(a) ? 'infl' : /^Social Media Organic/i.test(a) ? 'social' : /^Organic Non/i.test(a) ? 'organic' : /^Casting/i.test(a) ? 'casting' : /^Total/i.test(a) ? 'total' : /Targets$/i.test(a) ? 'target' : null;
      if (!key) return;
      (out[mk] ||= {})[key] = { installs: pn(r[1]), d1: pn(r[2]), d7: pn(r[3]), spend: pn(r[5]), cpi: pn(r[6]), subs: pn(r[9]), cps: pn(r[10]) };
    });
    return out;
  })();
  const OEMS = [['OPPO', /oppo/i], ['Vivo', /vivo/i], ['Xiaomi', /xiaomi/i], ['Transsion', /transsion/i]];
  let MONTHLY = null;
  function monthly() {
    if (MONTHLY) return MONTHLY;
    const daily = rowsOf('daily'), coh = rowsOf('cohorts'), mau = rowsOf('mau'), adm = rowsOf('admin_daily'), ser = rowsOf('series_daily'), ch = rowsOf('channels');
    if (!daily.length) return [];
    const last = daily.reduce((m, r) => (r.day > m ? r.day : m), '');
    const lastC = coh.reduce((m, r) => (r.day > m ? r.day : m), '');
    const age = (d) => (Date.parse(lastC) - Date.parse(d)) / 864e5;
    const months = [...new Set(daily.map((r) => r.day.slice(0, 7)))].filter((m) => m >= '2025-10').sort();
    const engDash = M.engine.dash || [];
    const hist = (M.pmHistory && M.pmHistory.months) || {};
    const serH = d3.rollup(ser, (v) => d3.sum(v, (r) => n(r.hours)), (r) => r.day.slice(0, 7));
    MONTHLY = months.map((m) => {
      const D = daily.filter((r) => r.day.slice(0, 7) === m), C = coh.filter((r) => r.day.slice(0, 7) === m);
      const A = adm.filter((r) => r.day.slice(0, 7) === m);
      const inst = d3.sum(D, (r) => n(r.installs)), sess = d3.sum(D, (r) => n(r.sessions)), dauSum = d3.sum(D, (r) => n(r.daus));
      const w = (k, d) => { const c = C.filter((r) => age(r.day) >= d); const i = d3.sum(c, (r) => n(r.installs)); return i ? d3.sum(c, (r) => n(r[k]) * n(r.installs)) / i : null; };
      // admin watch data (drop impossible watch-time days, as the behaviour page does)
      const AV = A.filter((r) => has(r.eng_total_viewers) && has(r.eng_avg_watch_time) && n(r.eng_avg_watch_time) <= 300);
      const watchMin = d3.sum(AV, (r) => n(r.eng_total_viewers) * n(r.eng_avg_watch_time));
      const viewers = d3.sum(AV, (r) => n(r.eng_total_viewers));
      const sessAV = d3.sum(D.filter((r) => AV.some((a) => a.day === r.day)), (r) => n(r.sessions));
      const E = A.filter((r) => has(r.total_episode_views));
      const eps = E.length ? d3.sum(E, (r) => n(r.total_episode_views)) : null;
      const admDau = d3.sum(E, (r) => n(r.dau_dau_users));
      const epsViewer = viewers ? d3.sum(AV, (r) => n(r.eng_total_viewers) * n(r.eng_avg_videos)) / viewers : null;
      const mauRow = mau.find((r) => r.month === m);
      const hours = serH.get(m) || (watchMin ? watchMin / 60 : null);
      // spend
      const lbl = mfull(m);
      const DR = engDash.filter((r) => r.Month === lbl);
      let meta = null, google = null, sc = null, pm = null, paidInst = null, pa = null;
      if (DR.length) {
        meta = d3.sum(DR.filter((r) => r.Platform === 'Meta'), (r) => +r.spend || 0); google = d3.sum(DR.filter((r) => r.Platform === 'Google'), (r) => +r.spend || 0); sc = d3.sum(DR.filter((r) => r.Platform === 'ShareChat'), (r) => +r.spend || 0);
        pa = dashAgg(DR); pm = pa.spend; paidInst = pa.ainst;
      } else if (hist[m]) {
        meta = hist[m].meta; google = hist[m].google; sc = hist[m].sharechat; pm = meta + google + sc;
        const P = ch.filter((r) => r.month === m && /^(Facebook|Google Ads|ShareChat)$/.test(r.channel));
        paidInst = d3.sum(P, (r) => n(r.installs));
        const d1 = paidInst ? d3.sum(P, (r) => n(r.retention_rate_d1) * n(r.installs)) / paidInst : null, d7 = paidInst ? d3.sum(P, (r) => n(r.retention_rate_d7) * n(r.installs)) / paidInst : null;
        const idx = retIndex(d1, d7, null, paidInst, paidInst, 0);
        pa = { cpi: paidInst ? pm / paidInst : null, d1, d7, idx }; pa.retcpi = pa.cpi != null && idx ? pa.cpi / idx : null;
      }
      const t3 = T3[m] || {};
      const infl = t3.infl ? t3.infl.spend : null, inflInst = t3.infl ? t3.infl.installs : null, casting = t3.casting ? t3.casting.spend : null, oem = t3.oem ? t3.oem.spend : null, oemInst = t3.oem ? t3.oem.installs : null;
      const total = [pm, infl, casting, oem].some(fin) ? d3.sum([pm, infl, casting, oem], (v) => +v || 0) : null;
      const days = D.length, full = m < last.slice(0, 7) || last.slice(8) >= '28';
      return {
        m, label: mlabel(m), days, partial: !(m < last.slice(0, 7)), lastDay: m === last.slice(0, 7) ? last : null,
        installs: inst, dau: days ? dauSum / days : null, mau: mauRow ? n(mauRow.maus) : null,
        d1: w('retention_rate_d1', 1), d7: w('retention_rate_d7', 7), d30: w('retention_rate_d30', 30),
        sessDau: dauSum ? sess / dauSum : null, sessions: sess,
        minSess: sessAV ? watchMin / sessAV : null, minViewer: viewers ? watchMin / viewers : null,
        eps, epsDau: eps != null && admDau && eps / admDau < 200 ? eps / admDau : null, epsViewer,
        hours, hoursUser: hours != null && mauRow && n(mauRow.maus) ? hours / n(mauRow.maus) : null,
        uninst: d3.sum(D, (r) => n(r.uninstalls)), reinst: d3.sum(D, (r) => n(r.reinstalls)), react: d3.sum(D, (r) => n(r.reattributions)),
        meta, google, sc, pm, paidInst, cpi: pa ? pa.cpi : null, retcpi: pa ? pa.retcpi : null, idx: pa ? pa.idx : null, paidD1: pa ? pa.d1 : null, paidD7: pa ? pa.d7 : null,
        infl, inflInst, inflCpi: infl != null && inflInst ? infl / inflInst : null, casting, oem, oemInst, oemCpi: oem != null && oemInst ? oem / oemInst : null,
        total, blended: total != null && inst ? total / inst : null,
        subs: d3.sum(A, (r) => n(r.rev_total_payers)), subRev: d3.sum(A, (r) => n(r.rev_total_revenue)), admob: d3.sum(A, (r) => n(r.total_admob_revenue)), admobImp: d3.sum(A, (r) => n(r.total_admob_impressions)), admDays: A.length,
        src: DR.length ? 'report' : hist[m] ? 'history' : 'none',
      };
    });
    return MONTHLY;
  }
  const METRICS = [
    ['Users', null],
    ['Installs', 'installs', 'int', 'sum', 'Adjust'], ['Daily active users (avg)', 'dau', 'big', 'avg', 'Adjust'], ['Monthly active users', 'mau', 'big', 'avg', 'Adjust'],
    ['Day-1 retention', 'd1', 'p1', 'wavg:installs', 'Adjust, install cohorts'], ['Day-7 retention', 'd7', 'p1', 'wavg:installs', 'Adjust, install cohorts'],
    ['Uninstalls', 'uninst', 'int', 'sum', 'Adjust'], ['Reinstalls', 'reinst', 'int', 'sum', 'Adjust'], ['Reactivations', 'react', 'int', 'sum', 'Adjust'],
    ['Viewing', null],
    ['Sessions per active user a day', 'sessDau', 'd2', 'avg', 'Adjust'], ['Watch minutes per session', 'minSess', 'd1', 'avg', 'admin watch time ÷ Adjust sessions'], ['Watch minutes per viewer a day', 'minViewer', 'd1', 'avg', 'admin panel'],
    ['Total episodes watched', 'eps', 'big', 'sum', 'admin panel'], ['Episodes per active user a day', 'epsDau', 'd1', 'avg', 'admin panel'], ['Episodes per viewer a day', 'epsViewer', 'd1', 'avg', 'admin panel'],
    ['Total watch hours', 'hours', 'big', 'sum', 'admin panel'], ['Watch hours per user (MAU)', 'hoursUser', 'd2', 'avg', 'admin panel ÷ Adjust MAU'],
    ['Revenue', null],
    ['Subscription payments', 'subs', 'int', 'sum', 'admin panel'], ['Subscription revenue', 'subRev', 'inr', 'sum', 'admin panel'], ['AdMob revenue', 'admob', 'inr', 'sum', 'admin panel'],
    ['Marketing', null],
    ['Performance marketing spend', 'pm', 'inr', 'sum', 'Meta + Google + ShareChat'], ['· Meta', 'meta', 'inr', 'sum', ''], ['· Google', 'google', 'inr', 'sum', ''], ['· ShareChat', 'sc', 'inr', 'sum', ''],
    ['Paid installs (Adjust)', 'paidInst', 'int', 'sum', 'Meta + Google + ShareChat'], ['CPI (paid)', 'cpi', 'inr1', 'ratio:pm/paidInst', 'spend ÷ Adjust installs'], ['Ret CPI (paid)', 'retcpi', 'inr1', 'ratio:retcpi', 'CPI ÷ retention index'], ['Retention index (paid)', 'idx', 'x2', 'wavg:paidInst', 'D1/14%, D7/3%, D30/0.7%'],
    ['Influencer spend', 'infl', 'inr', 'sum', 'Business Performance Tracker'], ['Influencer installs', 'inflInst', 'int', 'sum', 'trackable links'], ['Influencer CPI', 'inflCpi', 'inr1', 'ratio:infl/inflInst', ''],
    ['Casting & promotions spend', 'casting', 'inr', 'sum', 'Business Performance Tracker'], ['OEM spend', 'oem', 'inr', 'sum', 'Business Performance Tracker'], ['OEM installs', 'oemInst', 'int', 'sum', ''], ['OEM CPI', 'oemCpi', 'inr1', 'ratio:oem/oemInst', ''],
    ['Total marketing spend', 'total', 'inr', 'sum', 'all of the above'], ['Blended CPI', 'blended', 'inr1', 'ratio:total/installs', 'all spend ÷ all installs'],
  ];
  function aggregate(sel) {
    const rows = monthly().filter((r) => sel.has(r.m)); const out = {};
    METRICS.forEach(([, k, , how]) => {
      if (!k) return; const v = rows.filter((r) => fin(r[k]));
      if (!v.length) { out[k] = null; return; }
      if (how === 'sum') out[k] = d3.sum(v, (r) => r[k]);
      else if (how === 'avg') out[k] = d3.mean(v, (r) => r[k]);
      else if (how.startsWith('wavg:')) { const wk = how.slice(5); const W = d3.sum(v, (r) => +r[wk] || 0); out[k] = W ? d3.sum(v, (r) => r[k] * (+r[wk] || 0)) / W : null; }
    });
    METRICS.forEach(([, k, , how]) => {
      if (!k || !how.startsWith('ratio:')) return; const e = how.slice(6);
      if (e === 'retcpi') { out[k] = out.cpi != null && out.idx ? out.cpi / out.idx : null; return; }
      const [a, b] = e.split('/'); const ok = rows.filter((r) => fin(r[a]) && fin(r[b]) && r[b]);
      out[k] = ok.length ? d3.sum(ok, (r) => r[a]) / d3.sum(ok, (r) => r[b]) : null;
    });
    out.cpi = (() => { const ok = rows.filter((r) => fin(r.pm) && r.paidInst); return ok.length ? d3.sum(ok, (r) => r.pm) / d3.sum(ok, (r) => r.paidInst) : null; })();
    out.retcpi = out.cpi != null && out.idx ? out.cpi / out.idx : null;
    return out;
  }
  // month picker state
  let SEL = null;
  const defaultSel = () => { const ms = monthly().map((r) => r.m); return new Set(ms.slice(-3)); };
  function buildMonths() {
    const box = document.getElementById('m-months'); if (!box || box._done) return; const ms = monthly(); if (!ms.length) return; box._done = 1;
    SEL = SEL || defaultSel();
    box.innerHTML = ms.map((r) => `<label><input type="checkbox" value="${r.m}"${SEL.has(r.m) ? ' checked' : ''}>${r.label}${r.partial ? '*' : ''}</label>`).join('') +
      '<span class="sep"></span><button class="mbtn" data-q="last3">Last 3</button><button class="mbtn" data-q="relaunch">Since relaunch</button><button class="mbtn" data-q="fy">Since Jan 2026</button><button class="mbtn" data-q="all">All</button><button class="mbtn" data-q="none">Clear</button>';
    box.addEventListener('change', () => { SEL = new Set([...box.querySelectorAll('input:checked')].map((i) => i.value)); redrawPane(box); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-q]'); if (!b) return; const all = ms.map((r) => r.m);
      const q = b.dataset.q; SEL = new Set(q === 'all' ? all : q === 'none' ? [] : q === 'relaunch' ? all.filter((m) => m >= '2026-09') : q === 'fy' ? all.filter((m) => m >= '2026-01') : all.slice(-3));
      box.querySelectorAll('input').forEach((i) => { i.checked = SEL.has(i.value); }); redrawPane(box);
    });
  }
  const redrawPane = (el) => { const p = el.closest('.m-tabpane'); if (p) dash.redraw(p); };
  const TILE_KEYS = [['Installs', 'installs', 'big'], ['DAU (avg)', 'dau', 'big'], ['MAU (avg)', 'mau', 'big'], ['Day-1 retention', 'd1', 'p1'], ['Day-7 retention', 'd7', 'p1'],
    ['Watch minutes per session', 'minSess', 'd1'], ['Total episodes watched', 'eps', 'big'], ['Episodes per active user a day', 'epsDau', 'd1'], ['Watch hours per user', 'hoursUser', 'd2'],
    ['CPI (paid)', 'cpi', 'inr1'], ['Ret CPI (paid)', 'retcpi', 'inr1'], ['Performance marketing spend', 'pm', 'inr'], ['Influencer spend', 'infl', 'inr'], ['Influencer CPI', 'inflCpi', 'inr1'], ['OEM spend', 'oem', 'inr'], ['Casting & promotions', 'casting', 'inr'], ['Total marketing spend', 'total', 'inr'], ['Blended CPI', 'blended', 'inr1']];
  dash.draw('mTiles', (el) => {
    buildMonths(); if (!SEL) return;
    const a = aggregate(SEL); const ms = monthly().filter((r) => SEL.has(r.m)).map((r) => r.label);
    const sub = { installs: 'sum of ticked months', dau: 'average of months', mau: 'average of months', d1: 'install-weighted', d7: 'install-weighted', minSess: 'admin watch time ÷ sessions', eps: 'admin panel', epsDau: 'admin panel', hoursUser: 'hours ÷ MAU, monthly avg',
      cpi: 'Meta + Google + ShareChat', retcpi: 'CPI ÷ retention index ' + fmt(a.idx, 'x2'), pm: `Meta ${fmt(a.meta, 'inr')} · Google ${fmt(a.google, 'inr')} · ShareChat ${fmt(a.sc, 'inr')}`, infl: 'trackable influencers', inflCpi: fmt(a.inflInst, 'int') + ' influencer installs', oem: fmt(a.oemInst, 'int') + ' OEM installs · CPI ' + fmt(a.oemCpi, 'inr1'), casting: 'cost only, no tracked installs', total: 'PM + influencer + casting + OEM', blended: 'all spend ÷ all installs' };
    el.innerHTML = ms.length ? TILE_KEYS.map(([l, k, f]) => `<div class="tile"><div class="lbl">${l}</div><div class="num">${fmt(a[k], f)}</div><div class="muted">${sub[k] || ''}</div></div>`).join('') : '<div class="card"><p class="muted">Tick at least one month above.</p></div>';
  });
  dash.draw('mMonthTbl', (el) => {
    const ms = monthly().filter((r) => SEL && SEL.has(r.m)); if (!ms.length) { el.innerHTML = '<p class="muted">Tick at least one month above.</p>'; return; }
    const a = aggregate(SEL);
    el.innerHTML = `<table><thead><tr><th>Metric</th>${ms.map((r) => `<th>${r.label}${r.partial ? '*' : ''}</th>`).join('')}${ms.length > 1 ? '<th>Ticked months</th>' : ''}<th class="l">Source</th></tr></thead><tbody>${METRICS.map(([l, k, f, , src]) => (k ? `<tr><td>${l}</td>${ms.map((r) => `<td>${fmt(r[k], f)}</td>`).join('')}${ms.length > 1 ? `<td><b>${fmt(a[k], f)}</b></td>` : ''}<td class="l muted">${src || ''}</td></tr>` : `<tr><td colspan="${ms.length + 3}" style="padding-top:14px"><b>${l}</b></td></tr>`)).join('')}</tbody></table>` +
      `<p class="muted" style="margin-top:8px">* month still running${ms.find((r) => r.lastDay) ? ' — Adjust data to ' + ms.find((r) => r.lastDay).lastDay : ''}. Admin panel data can end a few days before Adjust. Before July 2026 CPI uses Meta + Google spend over Facebook + Google Ads installs, and the retention index uses day 1 and day 7 only. MOLOCO and OEM installs before November had spend no report records.</p>`;
  });
  const SPEND = [['Meta', 'meta', COL[0]], ['Google', 'google', COL[1]], ['ShareChat', 'sc', COL[2]], ['Influencer', 'infl', COL[3]], ['Casting', 'casting', COL[4]], ['OEM', 'oem', COL[5]]];
  dash.draw('mSpendLegend', (el) => { el.innerHTML = SPEND.map(([l, , c]) => `<span><i style="background:${c}"></i>${l}</span>`).join(''); });
  dash.draw('mMonthChart', (el) => {
    const ms = monthly(); const cats = ms.map((r) => r.label); const sel = new Set(ms.map((r, i) => (SEL && SEL.has(r.m) ? i : -1)).filter((i) => i >= 0));
    const col = (k) => ms.map((r) => r[k]);
    const k = el.dataset.k;
    if (k === 'users') chart(el, { cats, sel, bars: [{ name: 'Installs', values: col('installs'), color: COL[0] }], y2: [{ name: 'DAU', values: col('dau'), color: COL[1] }, { name: 'MAU', values: col('mau'), color: COL[2] }] });
    if (k === 'spend') chart(el, { cats, sel, stacked: true, bars: SPEND.map(([l, kk, c]) => ({ name: l, values: col(kk), color: c })), fy: F.inr });
    if (k === 'cpi') chart(el, { cats, sel, lines: [{ name: 'CPI', values: col('cpi'), color: COL[0] }, { name: 'Ret CPI', values: col('retcpi'), color: COL[1] }, { name: 'Influencer CPI', values: col('inflCpi'), color: COL[2], dash: 1 }], fy: F.inr0 });
    if (k === 'ret') chart(el, { cats, sel, lines: [{ name: 'Day 1', values: col('d1'), color: COL[0] }, { name: 'Day 7', values: col('d7'), color: COL[1] }], fy: F.p0 });
    if (k === 'depth') chart(el, { cats, sel, bars: [{ name: 'Episodes per active user a day', values: col('epsDau'), color: COL[0] }], y2: [{ name: 'Watch minutes per session', values: col('minSess'), color: COL[1] }], fy: F.d1, fy2: F.d1 });
    if (k === 'hours') chart(el, { cats, sel, bars: [{ name: 'Watch hours per user', values: col('hoursUser'), color: COL[0] }], fy: F.d2 });
  });
  dash.draw('mOemTbl', (el) => {
    const ch = rowsOf('channels'); if (!ch.length) { el.innerHTML = '<p class="muted">No channel data in this snapshot.</p>'; return; }
    const ms = [...new Set(ch.map((r) => r.month))].sort();
    const srcs = [...OEMS, ['MOLOCO', /moloco/i], ['Mobinet Media', /mobinet/i]];
    const data = []; srcs.forEach(([name, re]) => ms.forEach((m) => { const r = ch.filter((x) => x.month === m && re.test(x.channel)); const i = d3.sum(r, (x) => n(x.installs)); if (i > 0) data.push({ src: name, m: mlabel(m), mk: m, installs: i, d1: d3.sum(r, (x) => n(x.retention_rate_d1) * n(x.installs)) / i, d7: d3.sum(r, (x) => n(x.retention_rate_d7) * n(x.installs)) / i }); }));
    const t3 = T3['2026-11'] && T3['2026-11'].oem; if (t3) data.push({ src: 'OEM (tracker)', m: 'Nov 26', mk: '2026-11', installs: t3.installs, d1: t3.d1, d7: t3.d7, spend: t3.spend, cpi: t3.cpi });
    table(el, [{ k: 'src', label: 'Source', l: 1 }, { k: 'm', label: 'Month', l: 1 }, { k: 'installs', label: 'Installs', f: 'int' }, { k: 'd1', label: 'D1', f: 'p1' }, { k: 'd7', label: 'D7', f: 'p1' }, { k: 'spend', label: 'Spend', f: 'inr' }, { k: 'cpi', label: 'CPI', f: 'inr1' }], data.sort((a, b) => a.src.localeCompare(b.src) || a.mk.localeCompare(b.mk)));
  });

  // ---- business
  const T2 = (() => {
    const t = sheetBlock('biz_00', 'J'); const out = []; if (!t) return out;
    t.rows.forEach((r) => { if (r[2] && /^[A-Z][a-z]{2}$/.test(r[2]) && r[0] !== 'Revenue Source') out.push({ src: r[0], v: pn(r[1]), m: r[2], target: pn(r[3]) }); });
    return out;
  })();
  const REVC = ['Subscriptions', 'Admob revenue', 'Content Syndication', 'Brand Deals'];
  dash.draw('mRevLegend', (el) => { el.innerHTML = REVC.map((s, i) => `<span><i style="background:${COL[i]}"></i>${s}</span>`).join('') + '<span><i style="background:var(--color-fg)"></i>Target (total)</span>'; });
  dash.draw('mRevChart', (el) => {
    const ms = [...new Set(T2.map((r) => r.m))];
    chart(el, { cats: ms, stacked: true, bars: REVC.map((s, i) => ({ name: s, values: ms.map((m) => (T2.find((r) => r.m === m && r.src === s) || {}).v), color: COL[i] })), lines: [{ name: 'Target (total)', values: ms.map((m) => d3.sum(T2.filter((r) => r.m === m), (r) => r.target || 0)), color: 'var(--color-fg)', dash: 1 }], fy: F.inr });
  });

  // ---- app insights extras
  dash.draw('mUninstChart', (el) => {
    const ms = monthly(); chart(el, { cats: ms.map((r) => r.label), bars: [{ name: 'Installs', values: ms.map((r) => r.installs), color: COL[0] }, { name: 'Uninstalls', values: ms.map((r) => r.uninst), color: COL[1] }], y2: [{ name: 'Uninstalls ÷ installs', values: ms.map((r) => (r.installs ? r.uninst / r.installs : null)), color: 'var(--color-fg)' }], fy2: F.p0 });
  });
  dash.draw('mUninstNote', (el) => {
    const c = rowsOf('cohorts').filter((r) => r.day >= '2026-09-07' && r.day >= '2026-03-23'); const i = d3.sum(c, (r) => n(r.installs));
    el.textContent = i ? `Since the relaunch, ${fmt(d3.sum(c, (r) => n(r.uninstalls_total_d0)) / i, 'p1')} of new users uninstall on install day and ${fmt(d3.sum(c, (r) => n(r.uninstalls_total_d7)) / i, 'p1')} by day 7 (Adjust cohorts).` : '';
  });
  dash.draw('mSessTbl', (el) => {
    const ms = monthly();
    table(el, [{ k: 'label', label: 'Month', l: 1 }, { k: 'sessions', label: 'Sessions', f: 'big' }, { k: 'sessDau', label: 'Sessions per active user a day', f: 'd2' }, { k: 'minSess', label: 'Watch min per session', f: 'd1' }, { k: 'minViewer', label: 'Watch min per viewer a day', f: 'd1' }, { k: 'epsViewer', label: 'Episodes per viewer a day', f: 'd1' }, { k: 'epsDau', label: 'Episodes per active user a day', f: 'd1' }, { k: 'hoursUser', label: 'Watch hours per user (month)', f: 'd2' }], ms.slice().reverse());
  });
  dash.draw('mAdmobTbl', (el) => {
    const ms = monthly().filter((r) => r.admDays);
    table(el, [{ k: 'label', label: 'Month', l: 1 }, { k: 'admob', label: 'AdMob revenue', f: 'inr' }, { k: 'admobImp', label: 'Impressions', f: 'big' }, { k: 'ecpm', label: 'eCPM (₹)', f: 'd1' }, { k: 'subRev', label: 'Subscription revenue', f: 'inr' }, { k: 'share', label: 'AdMob share of revenue', f: 'p0' }],
      ms.map((r) => ({ ...r, ecpm: r.admobImp ? (r.admob / r.admobImp) * 1000 : null, share: r.admob + r.subRev ? r.admob / (r.admob + r.subRev) : null })).reverse());
  });
  const chg = (a, b) => (fin(a) && fin(b) && b ? a / b - 1 : null);
  const arrow = (d, good = 1) => (d == null ? '' : `<b style="color:var(--color-${(d > 0) === (good > 0) ? 'ok' : 'bad'})">${d > 0 ? '+' : ''}${F.p0(d)}</b>`);
  dash.draw('mAppObs', (el) => {
    const ms = monthly().filter((r) => !r.partial); if (ms.length < 2) { el.innerHTML = '<li>Not enough months yet.</li>'; return; }
    const a = ms[ms.length - 1], b = ms[ms.length - 2]; const cur = monthly().slice(-1)[0];
    const L = [];
    L.push(`<b>${a.label} vs ${b.label}:</b> installs ${F.big(a.installs)} (${arrow(chg(a.installs, b.installs))}), average DAU ${F.big(a.dau)} (${arrow(chg(a.dau, b.dau))}), MAU ${fmt(a.mau, 'big')} (${arrow(chg(a.mau, b.mau))}).`);
    L.push(`Day-1 retention ${fmt(a.d1, 'p1')} vs ${fmt(b.d1, 'p1')}, day-7 ${fmt(a.d7, 'p1')} vs ${fmt(b.d7, 'p1')}. ${a.d1 < b.d1 ? 'New users are holding on less well — check the creatives and audiences that grew in ' + a.label + ' (Performance marketing → Creative Analysis).' : 'Retention held or improved.'}`);
    L.push(`Viewing depth: ${fmt(a.epsDau, 'd1')} episodes per active user a day (${arrow(chg(a.epsDau, b.epsDau))}) and ${fmt(a.minSess, 'd1')} watch minutes per session (${arrow(chg(a.minSess, b.minSess))}).`);
    L.push(`Uninstalls were ${fmt(a.installs ? a.uninst / a.installs : null, 'p0')} of installs in ${a.label} (${fmt(b.installs ? b.uninst / b.installs : null, 'p0')} in ${b.label}).`);
    L.push(`Paid CPI ${fmt(a.cpi, 'inr1')} (${arrow(chg(a.cpi, b.cpi), -1)}) and Ret CPI ${fmt(a.retcpi, 'inr1')} (${arrow(chg(a.retcpi, b.retcpi), -1)}); blended CPI including influencers, casting and OEM ${fmt(a.blended, 'inr1')}.`);
    L.push(`Revenue: subscriptions ${fmt(a.subRev, 'inr')} (${arrow(chg(a.subRev, b.subRev))}), AdMob ${fmt(a.admob, 'inr')} (${arrow(chg(a.admob, b.admob))}).`);
    if (cur && cur.partial && cur.days) L.push(`${cur.label} so far (${cur.days} days): ${F.big(cur.installs)} installs, ${F.big(cur.dau)} average DAU, day-1 retention ${fmt(cur.d1, 'p1')}, paid CPI ${fmt(cur.cpi, 'inr1')}.`);
    el.innerHTML = L.map((x) => `<li>${x}</li>`).join('');
  });

  // ====================================================================== series
  let SERC = {};
  function serAgg() { const k = rng().s + '|' + rng().e; if (SERC.k === k) return SERC.v; SERC = { k, v: serAgg0() }; return SERC.v; }
  function serAgg0() {
    const { s, e } = rng(); const ser = rowsOf('series_daily').filter((r) => r.day >= s && r.day <= e);
    if (!ser.length) return { rows: [], days: [], s, e };
    const days = [...new Set(ser.map((r) => r.day))].sort(); const lastD = days[days.length - 1];
    const d7 = new Date(Date.parse(lastD) - 6 * 864e5).toISOString().slice(0, 10), d14 = new Date(Date.parse(lastD) - 13 * 864e5).toISOString().slice(0, 10);
    const by = d3.group(ser, (r) => r.series); const totH = d3.sum(ser, (r) => n(r.hours));
    const rows = [...by].map(([name, v]) => {
      v.sort((a, b) => a.day.localeCompare(b.day));
      const vd = d3.sum(v, (r) => n(r.viewers)), views = d3.sum(v, (r) => n(r.views)), hours = d3.sum(v, (r) => n(r.hours));
      const h7 = d3.sum(v.filter((r) => r.day >= d7), (r) => n(r.hours)), hp = d3.sum(v.filter((r) => r.day >= d14 && r.day < d7), (r) => n(r.hours));
      // rolling 7-day viewers: best vs latest
      const map = new Map(v.map((r) => [r.day, n(r.viewers)])); let best = 0;
      const di = days.filter((d) => d >= v[0].day);
      const roll = di.map((d, i) => d3.sum(di.slice(Math.max(0, i - 6), i + 1), (x) => map.get(x) || 0));
      roll.forEach((x) => { best = Math.max(best, x); });
      const latest = roll.length ? roll[roll.length - 1] : 0;
      return { name, cat: v[0].category, vd, views, hours, share: totH ? hours / totH : null, vpv: vd ? views / vd : null, mpv: vd ? (hours * 60) / vd : null, days: v.filter((r) => n(r.viewers) > 0).length, first: v[0].day, trend: hp ? h7 / hp - 1 : null, h7, hp, latest, drop: best ? latest / best - 1 : null };
    });
    return { rows, days, s, e, totH, totViews: d3.sum(ser, (r) => n(r.views)) };
  }
  let SER_PICK = null, SER_Q = '';
  dash.draw('mSerTiles', (el) => {
    const A = serAgg(); const r = A.rows; if (!r.length) { el.innerHTML = '<div class="card"><p class="muted">No series data in this range.</p></div>'; return; }
    const top = r.slice().sort((a, b) => b.hours - a.hours)[0]; const live = r.filter((x) => x.hours > 0).length; const deep = r.filter((x) => x.vd >= 500).sort((a, b) => b.mpv - a.mpv)[0];
    const top10 = d3.sum(r.slice().sort((a, b) => b.hours - a.hours).slice(0, 10), (x) => x.hours) / (A.totH || 1);
    el.innerHTML = [['Series watched', F.int(live), `${F.int(A.days.length)} days of data`], ['Episodes watched', F.big(A.totViews), 'all series'], ['Watch hours', F.big(A.totH), 'all series'], ['Most-watched series', esc(top.name), `${F.big(top.hours)} hours · ${F.big(top.views)} episodes`], ['Deepest viewing', deep ? esc(deep.name) : '—', deep ? `${F.d1(deep.mpv)} min per viewer-day` : 'needs 500+ viewer-days'], ['Top 10 share of hours', F.p0(top10), 'how concentrated viewing is']]
      .map(([l, v, s]) => `<div class="tile"><div class="lbl">${l}</div><div class="num" style="font-size:${v.length > 14 ? '18px' : ''}">${v}</div><div class="muted">${s}</div></div>`).join('');
  });
  dash.draw('mSerTop', (el) => { const r = serAgg().rows.sort((a, b) => b.hours - a.hours).slice(0, 15); hbar(el, r.map((x) => ({ k: x.name, v: x.hours, note: F.big(x.views) + ' eps' }))); });
  dash.draw('mSerGenre', (el) => {
    const A = serAgg(); const g = d3.rollups(A.rows, (v) => ({ n: v.length, hours: d3.sum(v, (x) => x.hours), vd: d3.sum(v, (x) => x.vd), views: d3.sum(v, (x) => x.views) }), (x) => x.cat || '—');
    table(el, [{ k: 'cat', label: 'Genre', l: 1 }, { k: 'n', label: 'Series', f: 'int' }, { k: 'hours', label: 'Watch hours', f: 'big' }, { k: 'share', label: 'Share of hours', f: 'p0' }, { k: 'mpv', label: 'Min per viewer-day', f: 'd1' }, { k: 'vpv', label: 'Episodes per viewer-day', f: 'd1' }],
      g.map(([cat, a]) => ({ cat, ...a, share: A.totH ? a.hours / A.totH : null, mpv: a.vd ? (a.hours * 60) / a.vd : null, vpv: a.vd ? a.views / a.vd : null })), { sort: 'hours' });
  });
  dash.draw('mSerCount', (el) => { const r = serAgg().rows; el.textContent = `${F.int(r.length)} series`; });
  dash.draw('mSerTbl', (el) => {
    const inp = el.closest('.card').querySelector('[data-ser-search]');
    if (inp && !inp._b) { inp._b = 1; inp.addEventListener('input', () => { SER_Q = inp.value.trim().toLowerCase(); dash.draw('mSerTbl'); }); }
    const all = serAgg().rows; const r = SER_Q ? all.filter((x) => x.name.toLowerCase().includes(SER_Q)) : all;
    const pct = (v) => (fin(v) ? `<span style="color:var(--color-${v >= 0 ? 'ok' : 'bad'})">${v > 0 ? '+' : ''}${F.p0(v)}</span>` : '—');
    table(el, [{ k: 'name', label: 'Series', l: 1 }, { k: 'cat', label: 'Genre', l: 1 }, { k: 'hours', label: 'Watch hours', f: 'big' }, { k: 'share', label: 'Share', f: 'p1' }, { k: 'views', label: 'Episodes watched', f: 'big' }, { k: 'vd', label: 'Viewer-days', f: 'big' }, { k: 'vpv', label: 'Episodes per viewer-day', f: 'd1' }, { k: 'mpv', label: 'Min per viewer-day', f: 'd1' }, { k: 'days', label: 'Days watched', f: 'int' }, { k: 'first', label: 'First seen', l: 1 }, { k: 'trend', label: 'Trend (7d vs 7d before)', f: pct }, { k: 'drop', label: 'Drop from best week', f: pct }],
      r, { sort: 'hours', rowKey: 'name', selKey: SER_PICK, onRow: (k) => { SER_PICK = k; dash.draw('mSerTbl'); dash.draw('mSerDaily'); dash.draw('mSerPickTitle'); } });
  });
  const pickName = () => SER_PICK || (serAgg().rows.sort((a, b) => b.hours - a.hours)[0] || {}).name;
  dash.draw('mSerPickTitle', (el) => { el.textContent = 'Daily viewers — ' + (pickName() || '—'); });
  dash.draw('mSerDaily', (el) => {
    const nm = pickName(); const { s, e } = rng(); const v = rowsOf('series_daily').filter((r) => r.series === nm && r.day >= s && r.day <= e).sort((a, b) => a.day.localeCompare(b.day));
    chart(el, { cats: v.map((r) => d3.timeFormat('%-d %b')(new Date(r.day))), bars: [{ name: 'Viewers', values: v.map((r) => n(r.viewers)), color: COL[0] }], y2: [{ name: 'Watch hours', values: v.map((r) => n(r.hours)), color: COL[1] }], fy2: F.d1 });
  });
  // promotion vs viewing
  let PROMO = null;
  function promo() { return PROMO || (PROMO = promo0()); }
  function promo0() {
    const out = new Map(); const get = (name) => { const k = norm(name); if (!k) return null; if (!out.has(k)) out.set(k, { name, adSpend: 0, adInst: 0, adCreatives: 0, ig: 0, igReach: 0, igViews: 0, yt: 0, ytViews: 0, ytSubs: 0 }); return out.get(k); };
    const ca = sheetBlock('ads_12'); if (ca) { const { h, m } = headerMap(ca.rows); ca.rows.slice(h + 1).forEach((r) => { if (!/^Creative/.test(r[m.Level] || '')) return; const o = get(r[m.Show]); if (!o) return; o.adSpend += pn(r[m['Spend since Sep 1']]) || 0; o.adInst += pn(r[m['Installs (Adjust, since Sep 1)']] ?? r[47]) || 0; o.adCreatives++; }); }
    const pl = sheetBlock('ig_01'); if (pl) { const { h, m } = headerMap(pl.rows); pl.rows.slice(h + 1).forEach((r) => { if ((r[m['Creative type']] || '') === 'Story') return; const o = get(r[m.Show]); if (!o || r[m.Show] === '—') return; o.ig++; o.igReach += pn(r[m.Reach]) || 0; o.igViews += pn(r[m['Impressions / Views']]) || 0; }); }
    const yl = sheetBlock('ig_04'); if (yl) { const { h, m } = headerMap(yl.rows); yl.rows.slice(h + 1).forEach((r) => { const o = get(r[m.Show]); if (!o || r[m.Show] === '—' || r[m.Show] === 'Brand') return; o.yt++; o.ytViews += pn(r[m.Views]) || 0; o.ytSubs += pn(r[m['Subscribers gained']]) || 0; }); }
    // viewing, last 30 days of admin data
    const ser = rowsOf('series_daily'); const last = ser.reduce((mx, r) => (r.day > mx ? r.day : mx), ''); const from = new Date(Date.parse(last) - 29 * 864e5).toISOString().slice(0, 10);
    const vw = d3.rollup(ser.filter((r) => r.day >= from), (v) => ({ hours: d3.sum(v, (r) => n(r.hours)), views: d3.sum(v, (r) => n(r.views)), vd: d3.sum(v, (r) => n(r.viewers)), name: v[0].series }), (r) => norm(r.series));
    vw.forEach((a, k) => { const o = out.get(k) || get(a.name); if (!o) return; Object.assign(o, { hours30: a.hours, views30: a.views, vd30: a.vd, admin: a.name }); });
    // merge promo-only names into the admin series they abbreviate (e.g. 'Deva' vs 'Deva - The Return')
    [...out.entries()].forEach(([k, o]) => { if (o.admin || k.length < 5) return; const t = [...out.entries()].find(([k2, o2]) => o2.admin && k2 !== k && (k2.startsWith(k) || k.startsWith(k2))); if (!t) return; const o2 = t[1]; ['adSpend', 'adInst', 'adCreatives', 'ig', 'igReach', 'igViews', 'yt', 'ytViews', 'ytSubs'].forEach((f) => { o2[f] += o[f]; }); out.delete(k); });
    const rows = [...out.values()].map((o) => ({ ...o, name: o.admin || o.name, adCpi: o.adInst ? o.adSpend / o.adInst : null, hours30: o.hours30 || 0 }));
    const ranked = rows.slice().sort((a, b) => b.hours30 - a.hours30); ranked.forEach((r, i) => { r.rank = r.hours30 ? i + 1 : null; });
    return { rows, from, last };
  }
  let PROMO_Q = '';
  dash.draw('mPromoTbl', (el) => {
    const inp = el.closest('.card').querySelector('[data-promo-search]');
    if (inp && !inp._b) { inp._b = 1; inp.addEventListener('input', () => { PROMO_Q = inp.value.trim().toLowerCase(); dash.draw('mPromoTbl'); }); }
    const P = promo(); const r = P.rows.filter((x) => (x.adSpend || x.ig || x.yt || x.hours30) && (!PROMO_Q || x.name.toLowerCase().includes(PROMO_Q)));
    table(el, [{ k: 'name', label: 'Series', l: 1 }, { k: 'hours30', label: 'Watch hours (30 days)', f: 'big' }, { k: 'rank', label: 'Viewing rank', f: 'int' }, { k: 'views30', label: 'Episodes (30 days)', f: 'big' }, { k: 'adSpend', label: 'Meta ad spend since 1 Sep', f: 'inr' }, { k: 'adCreatives', label: 'Ad creatives', f: 'int' }, { k: 'adInst', label: 'Ad installs', f: 'int' }, { k: 'adCpi', label: 'Ad CPI', f: 'inr1' }, { k: 'ig', label: 'IG posts', f: 'int' }, { k: 'igReach', label: 'IG reach', f: 'big' }, { k: 'yt', label: 'YT videos', f: 'int' }, { k: 'ytViews', label: 'YT views', f: 'big' }, { k: 'ytSubs', label: 'YT subs gained', f: 'int' }], r, { sort: 'hours30' });
  });
  dash.draw('mSerObs', (el) => {
    const A = serAgg(); const r = A.rows; if (!r.length) { el.innerHTML = '<li>No series data in this range.</li>'; return; }
    const byH = r.slice().sort((a, b) => b.hours - a.hours); const L = [];
    L.push(`<b>Most watched:</b> ${byH.slice(0, 3).map((x) => `${esc(x.name)} (${F.big(x.hours)} h, ${F.p0(x.share)} of all hours)`).join(', ')}. The top 10 series hold ${F.p0(d3.sum(byH.slice(0, 10), (x) => x.hours) / (A.totH || 1))} of watch hours.`);
    const deep = r.filter((x) => x.vd >= 300).sort((a, b) => b.mpv - a.mpv); if (deep.length) L.push(`<b>Deepest binge:</b> ${deep.slice(0, 3).map((x) => `${esc(x.name)} (${F.d1(x.mpv)} min, ${F.d1(x.vpv)} episodes per viewer-day)`).join(', ')}. <b>Shallowest</b> among series with 300+ viewer-days: ${deep.slice(-3).reverse().map((x) => `${esc(x.name)} (${F.d1(x.mpv)} min)`).join(', ')} — people open these and leave.`);
    const up = r.filter((x) => x.hp >= 20 && fin(x.trend)).sort((a, b) => b.trend - a.trend); if (up.length) L.push(`<b>Rising:</b> ${up.slice(0, 3).map((x) => `${esc(x.name)} (${x.trend > 0 ? '+' : ''}${F.p0(x.trend)} week on week)`).join(', ')}. <b>Falling:</b> ${up.slice(-3).reverse().map((x) => `${esc(x.name)} (${F.p0(x.trend)})`).join(', ')}.`);
    const drop = r.filter((x) => x.vd >= 1000 && x.latest >= 100 && fin(x.drop)).sort((a, b) => a.drop - b.drop); if (drop.length) L.push(`<b>Biggest drops from their best week:</b> ${drop.slice(0, 3).map((x) => `${esc(x.name)} (${F.p0(x.drop)})`).join(', ')}.`);
    const P = promo().rows.filter((x) => x.adSpend > 0); if (P.length) {
      const pushedLow = P.filter((x) => x.adSpend >= 50000).sort((a, b) => (b.rank || 999) - (a.rank || 999)).slice(0, 3);
      const unpushed = promo().rows.filter((x) => !x.adSpend && x.rank && x.rank <= 15).slice(0, 4);
      if (pushedLow.length) L.push(`<b>Pushed hard, watched less:</b> ${pushedLow.map((x) => `${esc(x.name)} (${F.inr(x.adSpend)} on Meta, viewing rank ${x.rank || '—'})`).join(', ')}.`);
      if (unpushed.length) L.push(`<b>Watched without paid push:</b> ${unpushed.map((x) => `${esc(x.name)} (rank ${x.rank})`).join(', ')} — candidates for new ad creatives.`);
    }
    el.innerHTML = L.map((x) => `<li>${x}</li>`).join('');
  });
  dash.draw('mSerSugg', (el) => {
    const r = serAgg().rows; const deep = r.filter((x) => x.vd >= 300).sort((a, b) => b.mpv - a.mpv); const P = promo().rows;
    const L = [];
    if (deep.length) L.push(`Build the next ad creatives and Instagram reels around the deepest-binge series (${deep.slice(0, 3).map((x) => esc(x.name)).join(', ')}): they convert an open into minutes watched best.`);
    L.push('For series that people open but leave quickly, move the first cliffhanger into episode 1–2 and check the paywall point; compare with the drop points in App insights → Viewing.');
    const unp = P.filter((x) => !x.adSpend && x.rank && x.rank <= 15); if (unp.length) L.push(`Test paid creatives for ${unp.slice(0, 3).map((x) => esc(x.name)).join(', ')} — they rank in the top 15 for watch hours with no Meta spend.`);
    L.push('Give every series a deep link and log the open source (home rail, banner, search, push, ad, social) so this page can show which surfaces drive opens.');
    L.push('Rotate the home banner weekly to rising series (see Rising above) and retire banners for series falling week on week.');
    el.innerHTML = L.map((x) => `<li>${x}</li>`).join('');
  });

  // ====================================================================== social
  const monthRows = (sid) => { const t = sheetBlock(sid); if (!t) return { m: {}, rows: [] }; const { h, m } = headerMap(t.rows); return { m, rows: t.rows.slice(h + 1).filter((r) => /^[A-Z][a-z]{2} \d{4}/.test(r[0] || '')) }; };
  dash.draw('mIgTiles', (el) => {
    const { m, rows } = monthRows('ig_00'); if (!rows.length) { el.innerHTML = ''; return; }
    const a = rows[rows.length - 1], b = rows[rows.length - 2] || [];
    const T = [['Posts', 'Posts (total)'], ['Organic reach', 'Organic reach (sum of posts)'], ['Organic views', 'Organic views'], ['Avg views per post', 'Avg views / post (excl. stories)'], ['Avg engagement rate', 'Avg engagement rate'], ['New followers', 'New followers (month)'], ['Paid IG reach', 'Paid IG reach'], ['Paid IG spend', 'Paid IG spend (₹)']];
    el.innerHTML = T.filter(([, k]) => k in m || Object.keys(m).some((x) => x.startsWith(k.split(' (')[0]))).map(([l, k]) => { const i = k in m ? m[k] : m[Object.keys(m).find((x) => x.startsWith(k.split(' (')[0]))]; return `<div class="tile"><div class="lbl">${l}</div><div class="num">${esc(a[i] || '—')}</div><div class="muted">${esc(a[0])} · ${esc(b[0] || '')} ${esc(b[i] || '')}</div></div>`; }).join('');
  });
  dash.draw('mYtTiles', (el) => {
    const { m, rows } = monthRows('ig_03'); if (!rows.length) { el.innerHTML = ''; return; }
    const a = rows[rows.length - 1], b = rows[rows.length - 2] || [];
    const T = ['Videos (total)', 'Shorts', 'Long videos', 'Views (videos published)', 'Channel views', 'Channel watch time (h)', 'Avg long-video CTR', 'Net new subscribers'];
    el.innerHTML = T.map((k) => { const key = Object.keys(m).find((x) => x.startsWith(k)); if (key == null) return ''; const i = m[key]; return `<div class="tile"><div class="lbl">${esc(key)}</div><div class="num">${esc(a[i] || '—')}</div><div class="muted">${esc(a[0])} · ${esc(b[0] || '')} ${esc(b[i] || '')}</div></div>`; }).join('');
  });
  function initXCharts() {
    document.querySelectorAll('[data-xcharts]').forEach((g) => {
      const s = M.sheets[g.dataset.xcharts]; if (!s) return;
      g.innerHTML = s.charts.map((c, i) => `<div class="card"><h3>${esc(c.title)}</h3><p class="note">Rebuilt from the ${esc(s.bookLabel)} chart.</p><div class="legend">${c.series.map((x, j) => `<span><i style="background:${COL[j % COL.length]}"></i>${esc(x.name)}</span>`).join('')}</div><div class="chart" data-draw="mXChart" data-sid="${s.id}" data-i="${i}"></div></div>`).join('');
    });
  }
  dash.draw('mXChart', (el) => {
    const c = M.sheets[el.dataset.sid].charts[+el.dataset.i]; const ser = c.series.map((x, j) => ({ name: x.name, values: x.values, color: COL[j % COL.length] }));
    const mx = d3.max(ser.flatMap((x) => x.values.filter(fin))) || 0;
    if (c.type === 'line') chart(el, { cats: c.cats, lines: ser }); else chart(el, { cats: c.cats, bars: ser, stacked: c.grouping === 'stacked' || c.grouping === 'percentStacked' });
  });
  function logRows(src) {
    const t = sheetBlock(src === 'ig' ? 'ig_01' : 'ig_04'); if (!t) return { rows: [], m: {} };
    const { h, m } = headerMap(t.rows); const rows = t.rows.slice(h + 1).filter((r) => r[0] && /^\d+$/.test(r[0]));
    return { rows: src === 'ig' ? rows.filter((r) => r[m['Creative type']] !== 'Story') : rows, m, metric: src === 'ig' ? 'Reach' : 'Views' };
  }
  const lenBucket = (s) => { const v = pn(s); if (!fin(v)) return null; return v < 30 ? 'under 30 s' : v < 60 ? '30–59 s' : v < 120 ? '1–2 min' : v < 300 ? '2–5 min' : '5 min+'; };
  function groups(src) {
    const { rows, m, metric } = logRows(src); if (!rows.length) return [];
    const dims = src === 'ig' ? ['Creative type', 'Content category', 'Hook type', 'Cliffhanger type', 'CTA type', 'Length'] : ['Format', 'Content category', 'Hook type', 'Cliffhanger type', 'CTA type', 'Length'];
    const all = median(rows.map((r) => pn(r[m[metric]]))); const out = [];
    dims.forEach((d) => {
      const key = (r) => (d === 'Length' ? lenBucket(r[m['Length (s)']]) : r[m[d]]);
      d3.groups(rows, key).forEach(([k, v]) => { if (!k || k === '—' || v.length < 5) return; const md = median(v.map((r) => pn(r[m[metric]]))); out.push({ dim: d, k, n: v.length, med: md, idx: all ? md / all : null }); });
    });
    return out;
  }
  dash.draw('mSocGroups', (el) => {
    const g = groups(el.dataset.src);
    table(el, [{ k: 'dim', label: 'Dimension', l: 1 }, { k: 'k', label: 'Group', l: 1 }, { k: 'n', label: el.dataset.src === 'ig' ? 'Posts' : 'Videos', f: 'int' }, { k: 'med', label: el.dataset.src === 'ig' ? 'Median reach' : 'Median views', f: 'big' }, { k: 'idx', label: 'vs all', f: (v) => (fin(v) ? `<span style="color:var(--color-${v >= 1 ? 'ok' : 'bad'})">${F.d2(v)}×</span>` : '—') }], g, { sort: 'idx' });
  });
  dash.draw('mSocHour', (el) => {
    const { rows, m, metric } = logRows(el.dataset.src); const tcol = m['Posted (IST)'] ?? m['Published (IST)'];
    const by = d3.rollup(rows, (v) => ({ med: median(v.map((r) => pn(r[m[metric]]))), n: v.length }), (r) => { const x = /(\d{1,2}):\d\d/.exec(r[tcol] || ''); return x ? +x[1] : null; });
    const hrs = d3.range(24); chart(el, { cats: hrs.map((h) => (h < 10 ? '0' : '') + h + ':00'), bars: [{ name: 'Median ' + metric.toLowerCase(), values: hrs.map((h) => (by.get(h) && by.get(h).n >= 3 ? by.get(h).med : null)), color: COL[0] }], h: 200 });
  });
  dash.draw('mSocSugg', (el) => {
    const L = [];
    ['ig', 'yt'].forEach((src) => {
      const g = groups(src); const name = src === 'ig' ? 'Instagram' : 'YouTube';
      d3.groups(g, (x) => x.dim).forEach(([d, v]) => { if (v.length < 2) return; v.sort((a, b) => b.idx - a.idx); const best = v[0], worst = v[v.length - 1]; if (best.idx > 1.15) L.push(`<b>${name} · ${esc(d)}:</b> “${esc(best.k)}” gets ${F.d2(best.idx)}× the typical ${src === 'ig' ? 'reach' : 'views'} (${best.n} ${src === 'ig' ? 'posts' : 'videos'}); “${esc(worst.k)}” only ${F.d2(worst.idx)}×. Do more of the first.`); });
      const { rows, m, metric } = logRows(src); const tcol = m['Posted (IST)'] ?? m['Published (IST)'];
      const by = d3.rollups(rows, (v) => ({ med: median(v.map((r) => pn(r[m[metric]]))), n: v.length }), (r) => { const x = /(\d{1,2}):\d\d/.exec(r[tcol] || ''); return x ? +x[1] : null; }).filter(([h, a]) => h != null && a.n >= 5).sort((a, b) => b[1].med - a[1].med);
      if (by.length) L.push(`<b>${name} timing:</b> posts at ${by.slice(0, 2).map(([h]) => `${h}:00`).join(' and ')} IST get the highest median ${metric.toLowerCase()}; ${by[by.length - 1][0]}:00 the lowest.`);
    });
    const ig = monthRows('ig_00'); const yt = monthRows('ig_03');
    if (ig.rows.length >= 2) { const i = ig.m['New followers (month)']; const a = ig.rows[ig.rows.length - 1], b = ig.rows[ig.rows.length - 2]; L.push(`<b>Instagram followers:</b> ${esc(a[i])} new in ${esc(a[0])} vs ${esc(b[i])} in ${esc(b[0])}. Paid IG reach keeps growing while organic reach per post fell — pair boosted posts with the formats above rather than boosting at random.`); }
    if (yt.rows.length) { const a = yt.rows[yt.rows.length - 1]; const k = Object.keys(yt.m).find((x) => x.startsWith('Avg views / Short')), k2 = Object.keys(yt.m).find((x) => x.startsWith('Avg views / long')); if (k && k2) L.push(`<b>YouTube:</b> in ${esc(a[0])} a long video averaged ${esc(a[yt.m[k2]])} views against ${esc(a[yt.m[k]])} for a Short — long episodes earn the views and subscribers; use Shorts as trailers that link to them.`); }
    L.push('Every post and video should carry a per-series deep link so installs and series opens from social can be counted (today they land in “Organic non-trackable”).');
    el.innerHTML = L.map((x) => `<li>${x}</li>`).join('');
  });

  // ====================================================================== performance marketing
  const PM = { month: null, plat: 'All' };
  const pmMonths = () => [...new Set((M.engine.dash || []).map((r) => r.Month))].sort((a, b) => monthKey(a).localeCompare(monthKey(b)));
  function pmInit() {
    const ms = pmMonths(); const sm = document.querySelector('[data-pm="month"]'), sp = document.querySelector('[data-pm="plat"]'); if (!sm || sm._b) return; sm._b = 1;
    PM.month = ms[ms.length - 1];
    sm.innerHTML = ms.map((m) => `<option${m === PM.month ? ' selected' : ''}>${m}</option>`).join('') + '<option value="*">All months</option>';
    sp.innerHTML = ['All', 'Meta', 'Google', 'ShareChat'].map((p) => `<option>${p}</option>`).join('');
    sm.addEventListener('change', () => { PM.month = sm.value; redrawPane(sm); }); sp.addEventListener('change', () => { PM.plat = sp.value; redrawPane(sp); });
  }
  const pmRows = (month, plat) => (M.engine.dash || []).filter((r) => (month === '*' || r.Month === month) && (plat === 'All' || r.Platform === plat));
  dash.draw('mPmAsOf', (el) => { pmInit(); el.textContent = `Daily Ads report data to ${M.engine.meta.end_date || '?'} (run ${M.engine.meta.run_date || '?'})`; });
  dash.draw('mPmTiles', (el) => {
    pmInit(); const a = dashAgg(pmRows(PM.month, PM.plat));
    const T = [['Spend', a.spend, 'inr', `budget ${fmt(a.budget, 'inr')}`], ['Adjust installs', a.ainst, 'int', `Meta-reported ${fmt(a.minst, 'int')}`], ['Adjust CPI', a.cpi, 'inr1', `Meta CPI ${fmt(a.mcpi, 'inr1')}`], ['Ret CPI', a.retcpi, 'inr1', `retention index ${fmt(a.idx, 'x2')}`], ['Day-1 retention', a.d1, 'p1', 'target 14%'], ['Day-7 retention', a.d7, 'p2', 'target 3%'], ['Day-30 retention', a.d30, 'p2', 'target 0.7%'], ['CTR', a.ctr, 'p2', `${fmt(a.clicks, 'big')} clicks`], ['Purchases (Adjust)', a.apur, 'int', `Meta-reported ${fmt(a.mpur, 'int')}`], ['Cost per purchase', a.cpp, 'inr0', ''], ['First video view', a.v1, 'big', `${fmt(a.ainst ? a.v1 / a.ainst : null, 'p0')} of installs`], ['7th video complete', a.v7, 'big', `${fmt(a.ainst ? a.v7 / a.ainst : null, 'p0')} of installs`]];
    el.innerHTML = T.map(([l, v, f, s]) => `<div class="tile"><div class="lbl">${l}</div><div class="num">${fmt(v, f)}</div><div class="muted">${s}</div></div>`).join('');
  });
  const allPmMonths = () => { const h = Object.keys((M.pmHistory && M.pmHistory.months) || {}).sort(); const r = pmMonths().map(monthKey); return [...new Set([...h, ...r])].sort(); };
  dash.draw('mPmSpend', (el) => {
    const ms = allPmMonths(); const h = (M.pmHistory && M.pmHistory.months) || {};
    const val = (m, p) => { const R = (M.engine.dash || []).filter((r) => monthKey(r.Month) === m && r.Platform === p); if (R.length) return d3.sum(R, (r) => +r.spend || 0); const x = h[m]; return x ? x[p === 'Meta' ? 'meta' : p === 'Google' ? 'google' : 'sharechat'] : null; };
    chart(el, { cats: ms.map(mlabel), stacked: true, bars: ['Meta', 'Google', 'ShareChat'].map((p, i) => ({ name: p, values: ms.map((m) => val(m, p)), color: COL[i] })), fy: F.inr });
  });
  dash.draw('mPmCpi', (el) => { pmInit(); const ms = pmMonths(); const A = ms.map((m) => dashAgg(pmRows(m, PM.plat))); chart(el, { cats: ms, lines: [{ name: 'Adjust CPI', values: A.map((a) => a.cpi), color: COL[0] }, { name: 'Ret CPI', values: A.map((a) => a.retcpi), color: COL[1] }, { name: 'Meta CPI', values: A.map((a) => a.mcpi), color: COL[2], dash: 1 }], fy: F.inr0 }); });
  dash.draw('mPmRet', (el) => { pmInit(); const ms = pmMonths(); const A = ms.map((m) => dashAgg(pmRows(m, PM.plat))); chart(el, { cats: ms, lines: [{ name: 'D1', values: A.map((a) => a.d1), color: COL[0] }, { name: 'D7', values: A.map((a) => a.d7), color: COL[1] }, { name: 'D30', values: A.map((a) => a.d30), color: COL[2] }], fy: F.p1 }); });
  dash.draw('mPmFunnel', (el) => { pmInit(); const a = dashAgg(pmRows(PM.month, PM.plat)); hbar(el, [['Adjust installs', a.ainst], ['First video view', a.v1], ['3rd video complete', a.v3], ['5th video complete', a.v5], ['7th video complete', a.v7], ['Purchases', a.apur]].map(([k, v], i) => ({ k, v: v || 0, c: COL[i % COL.length], note: a.ainst && i ? F.p0((v || 0) / a.ainst) : '' }))); });
  const PMCOLS = [{ k: 'spend', label: 'Spent', f: 'inr' }, { k: 'budget', label: 'Budget', f: 'inr' }, { k: 'minst', label: 'Meta installs', f: 'int' }, { k: 'ainst', label: 'Adjust installs', f: 'int' }, { k: 'mcpi', label: 'Meta CPI', f: 'inr1' }, { k: 'cpi', label: 'Adjust CPI', f: 'inr1' }, { k: 'retcpi', label: 'Ret CPI', f: 'inr1' }, { k: 'd1', label: 'D1', f: 'p1' }, { k: 'd7', label: 'D7', f: 'p2' }, { k: 'd30', label: 'D30', f: 'p2' }, { k: 'idx', label: 'Ret. index', f: 'x2' }, { k: 'ctr', label: 'CTR', f: 'p2' }, { k: 'apur', label: 'Purchases', f: 'int' }, { k: 'cpp', label: 'Cost / purchase', f: 'inr0' }, { k: 'v1', label: '1st video', f: 'int' }, { k: 'v3', label: '3rd video', f: 'int' }, { k: 'v5', label: '5th video', f: 'int' }, { k: 'v7', label: '7th video', f: 'int' }, { k: 'mpur', label: 'Meta purchases', f: 'int' }];
  dash.draw('mPmCamp', (el) => {
    pmInit(); const R = pmRows(PM.month, PM.plat); const g = d3.groups(R, (r) => r.Platform + '|' + r.Campaign);
    const data = g.map(([k, v]) => ({ plat: k.split('|')[0], camp: k.split('|').slice(1).join('|'), ...dashAgg(v) })).filter((r) => r.spend > 0 || r.ainst > 0);
    table(el, [{ k: 'plat', label: 'Platform', l: 1 }, { k: 'camp', label: 'Campaign', l: 1 }, ...PMCOLS], data, { sort: 'spend' });
  });
  dash.draw('mPmMonths', (el) => {
    pmInit(); const data = []; pmMonths().forEach((m) => ['All', 'Meta', 'Google', 'ShareChat'].forEach((p) => { if (PM.plat !== 'All' && p !== PM.plat) return; const R = pmRows(m, p); if (R.length) data.push({ m, mk: monthKey(m), plat: p, ...dashAgg(R) }); }));
    table(el, [{ k: 'm', label: 'Month', l: 1 }, { k: 'plat', label: 'Platform', l: 1 }, ...PMCOLS], data.reverse());
  });
  // weekly & monthly, all metrics
  const WM = { metric: 'Spend', month: null, level: 'camp', q: '' };
  const WMMET = ['Spend', 'Adjust installs', 'Adjust CPI', 'Results', 'Cost per result', 'Purchases', 'Cost per purchase', 'CTR'];
  function wmInit() {
    const s = document.querySelector('[data-wm="metric"]'); if (!s || s._b) return; s._b = 1;
    const ms = [...new Set((M.engine.wm || []).map((r) => r.month))].sort(); WM.month = ms[ms.length - 1];
    s.innerHTML = WMMET.map((x) => `<option>${x}</option>`).join('');
    const sm = document.querySelector('[data-wm="month"]'); sm.innerHTML = ms.map((m) => `<option value="${m}"${m === WM.month ? ' selected' : ''}>${mfull(m)}</option>`).join('');
    document.querySelectorAll('[data-wm]').forEach((c) => c.addEventListener(c.tagName === 'INPUT' ? 'input' : 'change', () => { WM[c.dataset.wm] = c.value.trim ? c.value.trim() : c.value; dash.draw('mWm'); }));
  }
  dash.draw('mWm', (el) => {
    wmInit(); const lv = { total: 0, camp: 1, adset: 2, ad: 3 }; const max = lv[WM.level];
    const R = (M.engine.wm || []).filter((r) => r.month === WM.month && lv[r.level] <= max);
    const key = (r) => [r.level, r.camp, r.adset, r.ad, r.id].join('|');
    const ents = new Map(); R.forEach((r) => { const k = key(r); if (!ents.has(k)) ents.set(k, { r, w: {} }); ents.get(k).w[r.week] = r[WM.metric]; });
    let list = [...ents.values()];
    const q = (WM.q || '').toLowerCase(); if (q) list = list.filter((e) => [e.r.camp, e.r.adset, e.r.ad].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => (a.r.camp || '').localeCompare(b.r.camp || '') || lv[a.r.level] - lv[b.r.level] || (a.r.adset || '').localeCompare(b.r.adset || '') || (a.r.ad || '').localeCompare(b.r.ad || ''));
    list.sort((a, b) => (a.r.level === 'total' ? -1 : b.r.level === 'total' ? 1 : 0));
    const weeks = [1, 2, 3, 4, 5].filter((w) => R.some((r) => r.week === w));
    const isP = WM.metric === 'CTR', isR = /CPI|Cost/.test(WM.metric);
    const f = (v) => (v == null || v === '' ? '' : isP ? F.p2(v) : isR ? F.inr1(v) : WM.metric === 'Spend' ? F.inr0(v) : F.int(v));
    const d = (a, b) => (fin(a) && fin(b) && b ? a / b - 1 : null);
    el.innerHTML = `<table><thead><tr><th class="l">Level</th><th class="l">Campaign</th><th class="l">Ad set</th><th class="l">Ad</th>${weeks.map((w) => `<th>W${w}</th><th>Δ</th>`).join('')}<th>Month</th></tr></thead><tbody>${list.map((e) => `<tr><td class="l">${{ total: 'Total', camp: 'Campaign', adset: 'Ad set', ad: 'Ad' }[e.r.level]}</td><td class="l">${esc(e.r.camp)}</td><td class="l">${esc(e.r.adset)}</td><td class="l" title="${esc(e.r.ad)}">${esc(e.r.ad)}</td>${weeks.map((w, i) => { const dd = i ? d(e.w[w], e.w[weeks[i - 1]]) : null; return `<td>${f(e.w[w])}</td><td class="muted">${dd == null ? '' : (dd > 0 ? '+' : '') + F.p0(dd)}</td>`; }).join('')}<td><b>${f(e.w[0])}</b></td></tr>`).join('')}</tbody></table>`;
  });

  // ====================================================================== navigation
  function show(pid, tid) {
    const pages = [...document.querySelectorAll('#dash-root .m-page-pane')]; if (!pages.length) return;
    let page = pages.find((p) => p.dataset.page === pid) || pages[0];
    pages.forEach((p) => { p.hidden = p !== page; });
    document.querySelectorAll('#dash-root .m-nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.page === page.dataset.page));
    const panes = [...page.querySelectorAll(':scope > .m-tabpane')];
    const pane = panes.find((p) => p.dataset.tab === tid) || panes[0];
    panes.forEach((p) => { p.hidden = p !== pane; });
    page.querySelectorAll('.m-tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === pane.dataset.tab));
    const bar = document.getElementById('range'); if (bar) bar.style.display = pane.hasAttribute('data-range') ? '' : 'none';
    renderSheets(pane);
    requestAnimationFrame(() => dash.redraw(pane));
    const h = `#${page.dataset.page}/${pane.dataset.tab}`; if (location.hash !== h) history.replaceState(null, '', h);
    try { localStorage.setItem('mt-last', h); } catch (e) {}
  }
  function init() {
    initXCharts();
    document.querySelectorAll('#dash-root .m-nav button').forEach((b) => b.addEventListener('click', () => { show(b.dataset.page); window.scrollTo({ top: 0 }); }));
    document.querySelectorAll('#dash-root .m-tabs button').forEach((b) => b.addEventListener('click', () => show(b.closest('.m-page-pane').dataset.page, b.dataset.tab)));
    let h = location.hash.slice(1); if (!h) { try { h = (localStorage.getItem('mt-last') || '').slice(1); } catch (e) {} }
    const [p, t] = h.split('/'); show(p || 'dash', t);
    // in-page links to old section anchors (e.g. #admin) open the tab that holds them
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]'); if (!a) return; const id = a.getAttribute('href').slice(1); if (id.includes('/')) return;
      const el = document.getElementById(id) || document.getElementById('b-' + id); if (!el) return; const pane = el.closest('.m-tabpane'); if (!pane) return;
      e.preventDefault(); show(pane.closest('.m-page-pane').dataset.page, pane.dataset.tab); setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 60);
    });
    addEventListener('hashchange', () => { const [p2, t2] = location.hash.slice(1).split('/'); show(p2, t2); });
  }
  // the behaviour page redraws everything when the date range changes; refresh the open tab's series cache too
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
