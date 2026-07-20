/**
 * charts.js — Capacity charts (Chart.js).
 * ------------------------------------------------------------------
 * Charts.init(els)      creates the charts once.
 * Charts.render(rows)   recomputes aggregates for the filtered subset
 *                       and updates every chart in place.
 *
 * All tuning (bin edges, top-N, colours) lives in CHARTS (config.js);
 * this module only reads it. Add a chart by extending init()/render().
 *
 * Charts:
 *   - histogram              (vertical bars) — capacity distribution
 *   - top-20 by capacity     (horizontal bars) — soma da capacidade (t)
 *   - top-20 by silo count   (horizontal bars) — número de silos
 * The two "top-20" charts receive the already-filtered rows, so they
 * honour exactly the same filters as every other visual.
 * ------------------------------------------------------------------
 */

const Charts = (() => {
  let histChart = null;
  let capCityChart = null;   // top-20 municípios por capacidade
  let countCityChart = null; // top-20 municípios por quantidade de silos

  const nf = new Intl.NumberFormat('pt-BR');

  /* ---------- aggregation helpers ---------- */

  /** Count silos per capacity bin (edges/labels from config). */
  function binHistogram(rows) {
    const { edges, labels } = CHARTS.histogram;
    const counts = new Array(labels.length).fill(0);
    rows.forEach((r) => {
      const c = r[FIELDS.capacity] || 0;
      for (let i = 0; i < labels.length; i++) {
        if (c >= edges[i] && c < edges[i + 1]) {
          counts[i]++;
          break;
        }
      }
    });
    return counts;
  }

  /** Sum capacity grouped by a field, sorted descending. */
  function aggregateBy(rows, field) {
    const totals = new Map();
    rows.forEach((r) => {
      const k = r[field];
      totals.set(k, (totals.get(k) || 0) + (r[FIELDS.capacity] || 0));
    });
    return [...totals.entries()]
      .map(([key, total]) => ({ key, total }))
      .sort((a, b) => b.total - a.total);
  }

  /** Count rows grouped by a field, sorted descending. */
  function countBy(rows, field) {
    const counts = new Map();
    rows.forEach((r) => {
      const k = r[field];
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([key, total]) => ({ key, total }))
      .sort((a, b) => b.total - a.total);
  }

  /** Truncate long município names for the category axis (tooltip keeps full). */
  function truncate(label, max = 22) {
    const s = String(label);
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  /* ---------- value labels on bars (inline plugin, no extra library) ---------- */

  /**
   * Draws each bar's value at the tip of the bar. For horizontal bars the
   * label sits just to the right of the bar, or inside (right-aligned, white)
   * when there isn't room before the chart edge.
   */
  const valueLabelPlugin = {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const meta = chart.getDatasetMeta(0);
      const data = chart.data.datasets[0].data;
      ctx.save();
      ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textBaseline = 'middle';
      meta.data.forEach((bar, i) => {
        const value = data[i];
        if (value == null) return;
        const text = nf.format(value);
        const w = ctx.measureText(text).width;
        if (bar.x + 6 + w <= chartArea.right) {
          ctx.fillStyle = CHARTS.ink;
          ctx.textAlign = 'left';
          ctx.fillText(text, bar.x + 6, bar.y);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'right';
          ctx.fillText(text, bar.x - 6, bar.y);
        }
      });
      ctx.restore();
    },
  };

  /* ---------- shared Chart.js options ---------- */

  /** Vertical bars (histogram): category on x, value on y. */
  function baseOptions(valueLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${valueLabel}: ${nf.format(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: CHARTS.ink, maxRotation: 60, minRotation: 0, autoSkip: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: CHARTS.grid },
          ticks: { color: CHARTS.ink, callback: (v) => nf.format(v) },
        },
      },
    };
  }

  /** Horizontal bars (top-N): value on x, category on y. */
  function horizontalBarOptions(valueLabel) {
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      // Room on the right so value labels sitting past the bar tip don't clip.
      layout: { padding: { right: 56 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${valueLabel}: ${nf.format(ctx.parsed.x)}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: CHARTS.grid },
          ticks: { color: CHARTS.ink, callback: (v) => nf.format(v) },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: CHARTS.ink,
            autoSkip: false,
            callback(v) { return truncate(this.getLabelForValue(v)); },
          },
        },
      },
    };
  }

  function barDataset(label, line, fill) {
    return {
      label,
      data: [],
      backgroundColor: fill,
      borderColor: line,
      borderWidth: 1.5,
      borderRadius: 3,
    };
  }

  /* ---------- lifecycle ---------- */

  function init({ histEl, capCityEl, countCityEl }) {
    // One reusable Chart.js theme: unified typography + muted base colours
    // for the dark surface. Per-chart colours still come from CHARTS.
    Chart.defaults.font.family =
      '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.font.size = 11;
    Chart.defaults.color = CHARTS.ink;
    Chart.defaults.borderColor = CHARTS.grid;

    histChart = new Chart(histEl, {
      type: 'bar',
      data: {
        labels: CHARTS.histogram.labels,
        datasets: [
          {
            label: 'Silos',
            data: [],
            backgroundColor: CHARTS.accentFill,
            borderColor: CHARTS.accent,
            borderWidth: 1.5,
            borderRadius: 3,
          },
        ],
      },
      options: baseOptions('Silos'),
    });

    capCityChart = new Chart(capCityEl, {
      type: 'bar',
      data: { labels: [], datasets: [barDataset('Capacidade (t)', CHARTS.barCapacity, CHARTS.barCapacityFill)] },
      options: horizontalBarOptions('Capacidade (t)'),
      plugins: [valueLabelPlugin],
    });

    countCityChart = new Chart(countCityEl, {
      type: 'bar',
      data: { labels: [], datasets: [barDataset('Silos', CHARTS.barCount, CHARTS.barCountFill)] },
      options: horizontalBarOptions('Silos'),
      plugins: [valueLabelPlugin],
    });
  }

  function render(rows) {
    // Histogram — capacity distribution
    histChart.data.datasets[0].data = binHistogram(rows);
    histChart.update();

    // Horizontal bars — top-20 municípios por capacidade (maior → menor)
    const byCityCap = aggregateBy(rows, FIELDS.city).slice(0, CHARTS.topMunicipios);
    capCityChart.data.labels = byCityCap.map((d) => d.key);
    capCityChart.data.datasets[0].data = byCityCap.map((d) => d.total);
    capCityChart.update();

    // Horizontal bars — top-20 municípios por quantidade de silos (maior → menor)
    const byCityCount = countBy(rows, FIELDS.city).slice(0, CHARTS.topMunicipios);
    countCityChart.data.labels = byCityCount.map((d) => d.key);
    countCityChart.data.datasets[0].data = byCityCount.map((d) => d.total);
    countCityChart.update();
  }

  return { init, render };
})();
