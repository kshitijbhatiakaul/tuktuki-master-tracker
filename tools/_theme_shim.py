THEME = """
:root{--color-bg:#fafaf7;--color-panel:#ffffff;--color-fg:#1f1e1c;--color-fg-muted:#6b6a65;--color-border-line:#e4e2dc;--color-bad:#c2410c;--color-ok:#15803d;
--cds-chart-grid:#ecebe6;--cds-chart-reference:#9a9890;--cds-chart-muted:#d6d4cd;--cds-chart-status-critical:#c2410c;--cds-surface-popover:#ffffff;--cds-border:#dcdad3;
--cds-shadow-popover:0 4px 16px rgba(0,0,0,.12);--cds-text-secondary:#6b6a65;
--cds-gap-xs:4px;--cds-gap-sm:8px;--cds-gap-md:12px;--cds-gap-lg:20px;--cds-gap-xl:28px;--cds-pad-xs:4px;--cds-pad-sm:8px;--cds-pad-md:12px;--cds-pad-lg:16px;--cds-radius:10px;
--cds-font-size-caption:12.5px;--cds-font-size-body:15px;--cds-font-size-heading:18px;--cds-font-size-title:28px;--cds-font-weight-medium:600;--cds-dur-slow:.4s;
--font-anthropic-serif:Georgia,"Times New Roman",serif;--font-anthropic-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--color-bg:#1b1a18;--color-panel:#252422;--color-fg:#eceae4;--color-fg-muted:#a3a19a;--color-border-line:#3a3936;
--cds-chart-grid:#33322f;--cds-chart-muted:#4a4945;--cds-surface-popover:#2c2b28;--cds-border:#44433f;--cds-text-secondary:#a3a19a;--color-bad:#f97316;--color-ok:#4ade80}}
:root[data-theme=dark]{--color-bg:#1b1a18;--color-panel:#252422;--color-fg:#eceae4;--color-fg-muted:#a3a19a;--color-border-line:#3a3936;
--cds-chart-grid:#33322f;--cds-chart-muted:#4a4945;--cds-surface-popover:#2c2b28;--cds-border:#44433f;--cds-text-secondary:#a3a19a;--color-bad:#f97316;--color-ok:#4ade80}
html,body{margin:0;background:var(--color-bg);color:var(--color-fg)}
#dash-root{max-width:1200px;margin:0 auto;padding:16px;box-sizing:border-box;overflow-x:hidden}
#dash-root a{color:inherit}
.snap{font:12.5px var(--font-anthropic-sans);color:var(--color-fg-muted);max-width:1200px;margin:0 auto;padding:12px 16px 0;box-sizing:border-box}
@media (max-width:600px){:root{--cds-font-size-title:22px;--cds-pad-lg:12px}}
"""

SHIM = r"""
window.dash = (function () {
  const RAW = window.__DASH_RAW || {};
  const loaders = {}, calcs = {}, draws = new Map(), onDataFns = [], cache = {};
  let params = {};
  const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
  const api = {
    colors: ['#2f6fd1', '#d9822b', '#1f9d8a', '#b8478f', '#7a5cc4', '#6b8e23'],
    loader(id, o) { loaders[id] = o; },
    calc(id, o) { calcs[id] = o; },
    data(id) {
      if (cache[id]) return cache[id];
      if (calcs[id]) {
        const c = calcs[id];
        const ins = (c.inputs || []).map((i) => { const d = api.data(i); return d.status === 'ok' ? d.data : []; });
        try { cache[id] = { status: 'ok', data: c.fn(...ins), refreshing: false, meta: {} }; }
        catch (e) { cache[id] = { status: 'error', data: null, message: String(e) }; }
        return cache[id];
      }
      const r = RAW[id];
      if (!r) return { status: 'missing', data: [], message: 'Not in this snapshot', refreshing: false, meta: {} };
      try {
        let rows, cols;
        if (loaders[id]) { const o = loaders[id].fn({ answer: r.text !== undefined ? r.text : r.data }); rows = o.rows || o; cols = o.columns || (rows[0] ? Object.keys(rows[0]) : []); }
        else { rows = r.data; cols = rows[0] ? Object.keys(rows[0]) : []; }
        rows.columns = cols;
        cache[id] = { status: 'ok', data: rows, columns: cols, refreshing: false, meta: {} };
      } catch (e) { console.error(id, e); cache[id] = { status: 'error', data: [], message: String(e), refreshing: false, meta: {} }; }
      return cache[id];
    },
    onData(fn) { onDataFns.push(fn); },
    draw(name, fn) { if (typeof fn !== 'function') { const f = draws.get(name); if (f) document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => { try { f(el); } catch (e) { console.error(name, e); } }); return; } draws.set(name, fn); },
    params() { return Object.assign({}, params); },
    setParams(o) { Object.assign(params, o); render(); },
    resetParams() { params = {}; render(); },
    refresh() {}, setLink() {}
  };
  function render() {
    onDataFns.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    draws.forEach((fn, name) => document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => { try { fn(el); } catch (e) { console.error(name, e); } }));
  }
  let lastW = 0, t;
  addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(t); t = setTimeout(render, 150); });
  document.addEventListener('DOMContentLoaded', () => { lastW = innerWidth; render(); });
  return api;
})();
"""


