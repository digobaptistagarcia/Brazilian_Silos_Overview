/**
 * viz.js — Custom SVG visualizations: boxplot + treemap.
 * ------------------------------------------------------------------
 * Kept separate from charts.js (Chart.js) because these are hand-drawn
 * SVG. Same contract as the other viz modules:
 *   Viz.init({ boxEl, treeEl })   grab containers, wire resize.
 *   Viz.render(rows)              redraw both for the filtered subset.
 * Colours/spacing come from VIZ (config.js).
 * ------------------------------------------------------------------
 */

const Viz = (() => {
  let boxEl = null;
  let treeEl = null;
  let sunCapEl = null;
  let sunCountEl = null;
  let lastRows = [];

  const nf = new Intl.NumberFormat('pt-BR');
  const compact = (v) =>
    v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : `${v}`;

  /* ================= boxplot ================= */

  /** Linear-interpolation quantile (type-7, like numpy default). */
  function quantile(sorted, q) {
    if (sorted.length === 1) return sorted[0];
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined
      ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
      : sorted[base];
  }

  /** Five-number summary + Tukey fences and outliers. */
  function boxStats(caps) {
    const s = [...caps].sort((a, b) => a - b);
    const q1 = quantile(s, 0.25);
    const med = quantile(s, 0.5);
    const q3 = quantile(s, 0.75);
    const iqr = q3 - q1;
    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;
    const inFence = s.filter((v) => v >= loFence && v <= hiFence);
    return {
      n: s.length,
      min: s[0],
      max: s[s.length - 1],
      q1, med, q3,
      loWhisker: inFence.length ? inFence[0] : s[0],
      hiWhisker: inFence.length ? inFence[inFence.length - 1] : s[s.length - 1],
      outliers: s.filter((v) => v < loFence || v > hiFence),
    };
  }

  function renderBoxplot(rows) {
    const caps = rows.map((r) => r[FIELDS.capacity] || 0);
    if (!caps.length) {
      boxEl.innerHTML = '<div class="viz-empty">Sem dados para os filtros atuais.</div>';
      return;
    }
    const st = boxStats(caps);
    const { width: W, height: H } = boxEl.getBoundingClientRect();
    const w = W || 700;
    const h = H || 180;

    const padL = 56, padR = 24, padT = 24, padB = 34;
    const xmax = st.max * 1.02 || 1;
    const x = (v) => padL + (v / xmax) * (w - padL - padR);
    const cy = (padT + (h - padB)) / 2;
    const bh = Math.min(46, (h - padT - padB) * 0.7);
    const c = VIZ.boxplot;

    // axis ticks (0..xmax, 4 intervals)
    let ticks = '';
    for (let i = 0; i <= 4; i++) {
      const v = (xmax / 4) * i;
      const px = x(v);
      ticks += `
        <line x1="${px}" y1="${padT}" x2="${px}" y2="${h - padB}" stroke="${VIZ.line}" stroke-width="1" stroke-dasharray="2 3" opacity="0.5"/>
        <text x="${px}" y="${h - padB + 16}" text-anchor="middle" font-size="11" fill="${VIZ.ink}">${compact(Math.round(v))}</text>`;
    }

    const outliers = st.outliers
      .map((v) => `<circle cx="${x(v)}" cy="${cy}" r="3" fill="${c.outlier}"/>`)
      .join('');

    const svg = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Boxplot da capacidade">
        ${ticks}
        <!-- whisker -->
        <line x1="${x(st.loWhisker)}" y1="${cy}" x2="${x(st.hiWhisker)}" y2="${cy}" stroke="${c.whisker}" stroke-width="1.5"/>
        <line x1="${x(st.loWhisker)}" y1="${cy - 9}" x2="${x(st.loWhisker)}" y2="${cy + 9}" stroke="${c.whisker}" stroke-width="1.5"/>
        <line x1="${x(st.hiWhisker)}" y1="${cy - 9}" x2="${x(st.hiWhisker)}" y2="${cy + 9}" stroke="${c.whisker}" stroke-width="1.5"/>
        <!-- box -->
        <rect x="${x(st.q1)}" y="${cy - bh / 2}" width="${Math.max(1, x(st.q3) - x(st.q1))}" height="${bh}" fill="${c.boxFill}" stroke="${c.box}" stroke-width="1.5" rx="2"/>
        <!-- median -->
        <line x1="${x(st.med)}" y1="${cy - bh / 2}" x2="${x(st.med)}" y2="${cy + bh / 2}" stroke="${c.median}" stroke-width="2.5"/>
        <text x="${x(st.med)}" y="${cy - bh / 2 - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="${c.median}">${nf.format(Math.round(st.med))}</text>
        ${outliers}
      </svg>`;

    const caption = `
      <div class="viz-caption">
        n=${nf.format(st.n)} · mín ${nf.format(st.min)} · Q1 ${nf.format(Math.round(st.q1))} ·
        mediana ${nf.format(Math.round(st.med))} · Q3 ${nf.format(Math.round(st.q3))} ·
        máx ${nf.format(st.max)} · outliers: ${nf.format(st.outliers.length)}
      </div>`;

    boxEl.innerHTML = svg + caption;
  }

  /* ================= treemap ================= */

  /**
   * Squarified treemap (Bruls et al.). Returns rects for items [{value,...}]
   * laid out inside (x,y,w,h) with good aspect ratios.
   */
  function squarify(items, x, y, w, h) {
    const nodes = items.map((d) => ({ ...d }));
    const total = nodes.reduce((s, n) => s + n.value, 0) || 1;
    const scale = (w * h) / total;
    nodes.forEach((n) => (n._a = n.value * scale));

    const rects = [];
    let X = x, Y = y, W = w, H = h;
    const list = nodes.slice();
    let row = [];

    const worst = (r, len) => {
      let s = 0, mn = Infinity, mx = 0;
      for (const it of r) { s += it._a; mn = Math.min(mn, it._a); mx = Math.max(mx, it._a); }
      return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
    };

    const layout = () => {
      const rowArea = row.reduce((a, r) => a + r._a, 0);
      if (W >= H) {
        const rw = rowArea / H;
        let ry = Y;
        row.forEach((r) => { const rh = r._a / rw; rects.push({ ...r, x: X, y: ry, w: rw, h: rh }); ry += rh; });
        X += rw; W -= rw;
      } else {
        const rh = rowArea / W;
        let rx = X;
        row.forEach((r) => { const rw = r._a / rh; rects.push({ ...r, x: rx, y: Y, w: rw, h: rh }); rx += rw; });
        Y += rh; H -= rh;
      }
    };

    while (list.length) {
      const shortest = Math.min(W, H);
      const next = list[0];
      const withNext = row.concat(next);
      if (row.length === 0 || worst(withNext, shortest) <= worst(row, shortest)) {
        row = withNext; list.shift();
      } else {
        layout(); row = [];
      }
    }
    if (row.length) layout();
    return rects;
  }

  function renderTreemap(rows) {
    if (!rows.length) {
      treeEl.innerHTML = '<div class="viz-empty">Sem dados para os filtros atuais.</div>';
      return;
    }
    // aggregate capacity by state + capture region for colour
    const agg = new Map();
    rows.forEach((r) => {
      const k = r[FIELDS.stateName];
      const cur = agg.get(k) || { key: k, value: 0, region: r[FIELDS.region] };
      cur.value += r[FIELDS.capacity] || 0;
      agg.set(k, cur);
    });
    const items = [...agg.values()].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    const grand = items.reduce((s, d) => s + d.value, 0) || 1;

    const { width: W, height: H } = treeEl.getBoundingClientRect();
    const w = W || 400, h = H || 300;
    const gap = VIZ.treemap.gap;
    const rects = squarify(items, 0, 0, w, h);

    const tiles = rects
      .map((r) => {
        const fill = VIZ.treemap.regionColors[r.region] || VIZ.treemap.fallback;
        const pct = ((r.value / grand) * 100).toFixed(1);
        const iw = Math.max(0, r.w - gap);
        const ih = Math.max(0, r.h - gap);
        const showLabel = iw > 54 && ih > 34;
        const label = showLabel
          ? `<text x="${r.x + 8}" y="${r.y + 20}" font-size="13" font-weight="600" fill="#fff">${r.key}</text>
             <text x="${r.x + 8}" y="${r.y + 37}" font-size="11" fill="rgba(255,255,255,0.9)">${nf.format(Math.round(r.value))} t</text>
             <text x="${r.x + 8}" y="${r.y + 52}" font-size="10" fill="rgba(255,255,255,0.8)">${pct}%</text>`
          : '';
        return `
          <g>
            <rect x="${r.x}" y="${r.y}" width="${iw}" height="${ih}" fill="${fill}" rx="3">
              <title>${r.key}: ${nf.format(Math.round(r.value))} t (${pct}%)</title>
            </rect>
            ${label}
          </g>`;
      })
      .join('');

    treeEl.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label="Treemap da capacidade por estado">
        ${tiles}
      </svg>`;
  }

  /* ================= sunburst ================= */

  /** Point on a circle (angle in rad, 0 = top, clockwise). */
  function polarXY(cx, cy, r, a) {
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  }

  /** Donut segment path. Splits into two arcs when it spans the full circle. */
  function donutPath(cx, cy, rIn, rOut, a0, a1) {
    const TWO_PI = Math.PI * 2;
    if (a1 - a0 >= TWO_PI - 1e-6) {
      const mid = a0 + Math.PI;
      return donutPath(cx, cy, rIn, rOut, a0, mid) + ' ' + donutPath(cx, cy, rIn, rOut, mid, a1);
    }
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0o, y0o] = polarXY(cx, cy, rOut, a0);
    const [x1o, y1o] = polarXY(cx, cy, rOut, a1);
    const [x1i, y1i] = polarXY(cx, cy, rIn, a1);
    const [x0i, y0i] = polarXY(cx, cy, rIn, a0);
    return `M ${x0o} ${y0o} A ${rOut} ${rOut} 0 ${large} 1 ${x1o} ${y1o} `
         + `L ${x1i} ${y1i} A ${rIn} ${rIn} 0 ${large} 0 ${x0i} ${y0i} Z`;
  }

  /* colour helpers */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  /** Blend a hex colour toward white by t ∈ [0,1]. */
  function tint(hex, t) {
    const [r, g, b] = hexToRgb(hex);
    const m = (c) => Math.round(c + (255 - c) * t);
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
  }
  /** Readable text colour (dark/light) for a given hex fill. */
  function textOn(hex, t) {
    const [r, g, b] = hexToRgb(hex).map((c) => c + (255 - c) * t);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#1f2937' : '#ffffff';
  }

  /** Aggregate rows into região → estados, each with a numeric value. */
  function aggregateRegionState(rows, valueFn) {
    const regions = new Map();
    rows.forEach((r) => {
      const region = r[FIELDS.region] || '—';
      const state = r[FIELDS.stateName] || '—';
      const cur = regions.get(region) || { key: region, value: 0, states: new Map() };
      const v = valueFn(r);
      cur.value += v;
      cur.states.set(state, (cur.states.get(state) || 0) + v);
      regions.set(region, cur);
    });
    return [...regions.values()]
      .map((reg) => ({
        key: reg.key,
        value: reg.value,
        states: [...reg.states.entries()]
          .map(([key, value]) => ({ key, value }))
          .sort((a, b) => b.value - a.value),
      }))
      .filter((reg) => reg.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  /**
   * Generic two-ring sunburst renderer.
   * @param el       container element
   * @param rows     filtered rows
   * @param valueFn  row -> numeric contribution (capacity or 1)
   * @param fmtValue value -> display string
   * @param unit     short unit label ('t' or 'silos')
   */
  function renderSunburst(el, rows, valueFn, fmtValue, unit) {
    if (!rows.length) {
      el.innerHTML = '<div class="viz-empty">Sem dados para os filtros atuais.</div>';
      return;
    }
    const regions = aggregateRegionState(rows, valueFn);
    const grand = regions.reduce((s, r) => s + r.value, 0) || 1;

    const { width: W, height: H } = el.getBoundingClientRect();
    const w = W || 360, h = H || 300;
    const cx = w / 2, cy = h / 2;
    const cfg = VIZ.sunburst;
    const R = Math.min(w, h) / 2 - 6;
    const rHole = R * cfg.innerHole;
    const rMid = R * cfg.ringSplit;
    const gap = cfg.gap;

    let arcs = '';
    let labels = '';
    let a0 = 0;

    regions.forEach((reg) => {
      const regSpan = (reg.value / grand) * Math.PI * 2;
      const rA0 = a0 + gap / 2;
      const rA1 = a0 + regSpan - gap / 2;
      const base = cfg.regionColors[reg.key] || cfg.fallback;

      // inner ring — região
      arcs += `<path d="${donutPath(cx, cy, rHole, rMid, rA0, rA1)}" fill="${base}" stroke="${VIZ.stroke}" stroke-width="1">
        <title>${reg.key}: ${fmtValue(reg.value)} ${unit} (${((reg.value / grand) * 100).toFixed(1)}%)</title>
      </path>`;

      // inner label if the wedge is wide enough
      if (regSpan > 0.28) {
        const mid = (rA0 + rA1) / 2;
        const [lx, ly] = polarXY(cx, cy, (rHole + rMid) / 2, mid);
        labels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
          font-size="12" font-weight="700" fill="${textOn(base, 0)}">${reg.key}</text>`;
      }

      // outer ring — estados (tons mais claros da cor-base)
      const n = reg.states.length;
      let s0 = rA0;
      reg.states.forEach((st, i) => {
        const stSpan = (st.value / reg.value) * (rA1 - rA0);
        const sA0 = s0;
        const sA1 = s0 + stSpan;
        s0 = sA1;
        const t = n > 1 ? (i / (n - 1)) * cfg.stateTintMax : 0;
        const fill = tint(base, t);
        arcs += `<path d="${donutPath(cx, cy, rMid + 1, R, sA0, sA1)}" fill="${fill}" stroke="${VIZ.stroke}" stroke-width="1">
          <title>${st.key} · ${reg.key}: ${fmtValue(st.value)} ${unit} (${((st.value / grand) * 100).toFixed(1)}%)</title>
        </path>`;

        if (sA1 - sA0 > 0.16) {
          const mid = (sA0 + sA1) / 2;
          const [lx, ly] = polarXY(cx, cy, (rMid + R) / 2, mid);
          labels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
            font-size="10.5" font-weight="600" fill="${textOn(base, t)}">${st.key}</text>`;
        }
      });

      a0 += regSpan;
    });

    // centre total
    const center = `
      <text x="${cx}" y="${cy - 7}" text-anchor="middle" font-size="15" font-weight="700" fill="${VIZ.ink}">${fmtValue(grand)}</text>
      <text x="${cx}" y="${cy + 11}" text-anchor="middle" font-size="10.5" fill="${VIZ.ink}">${unit} · total</text>`;

    el.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="Sunburst: região e estado por ${unit}">
        ${arcs}
        ${labels}
        ${center}
      </svg>`;
  }

  function renderSunburstCapacity(rows) {
    renderSunburst(
      sunCapEl, rows,
      (r) => r[FIELDS.capacity] || 0,
      (v) => nf.format(Math.round(v)),
      't'
    );
  }

  function renderSunburstCount(rows) {
    renderSunburst(
      sunCountEl, rows,
      () => 1,
      (v) => nf.format(v),
      'silos'
    );
  }

  /* ================= lifecycle ================= */

  function init({ boxEl: b, treeEl: t, sunCapEl: sc, sunCountEl: sn }) {
    boxEl = b;
    treeEl = t;
    sunCapEl = sc;
    sunCountEl = sn;
    let raf = null;
    window.addEventListener('resize', () => {
      if (!lastRows.length) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        renderBoxplot(lastRows);
        renderTreemap(lastRows);
        renderSunburstCapacity(lastRows);
        renderSunburstCount(lastRows);
      });
    });
  }

  function render(rows) {
    lastRows = rows;
    renderBoxplot(rows);
    renderTreemap(rows);
    renderSunburstCapacity(rows);
    renderSunburstCount(rows);
  }

  return { init, render };
})();
