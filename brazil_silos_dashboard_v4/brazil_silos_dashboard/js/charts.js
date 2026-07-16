/**
 * charts.js — Capacity charts (Chart.js).
 * ------------------------------------------------------------------
 * Charts.init(els)      creates the three charts once.
 * Charts.render(rows)   recomputes aggregates for the filtered subset
 *                       and updates every chart in place.
 *
 * All tuning (bin edges, top-N, colours) lives in CHARTS (config.js);
 * this module only reads it. Add a chart by extending init()/render().
 * ------------------------------------------------------------------
 */

const Charts = (() => {
  let histChart = null;
  let stateChart = null;
  let cityChart = null;

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

  /* ---------- shared Chart.js options ---------- */

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

  function areaDataset(label, line, fill) {
    return {
      label,
      data: [],
      borderColor: line,
      backgroundColor: fill,
      fill: true,
      tension: 0.3,
      pointRadius: 3,
      pointBackgroundColor: line,
      borderWidth: 2,
    };
  }

  /* ---------- lifecycle ---------- */

  function init({ histEl, stateEl, cityEl }) {
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

    stateChart = new Chart(stateEl, {
      type: 'line',
      data: { labels: [], datasets: [areaDataset('Capacidade (t)', CHARTS.areaState, CHARTS.areaStateFill)] },
      options: baseOptions('Capacidade (t)'),
    });

    cityChart = new Chart(cityEl, {
      type: 'line',
      data: { labels: [], datasets: [areaDataset('Capacidade (t)', CHARTS.areaCity, CHARTS.areaCityFill)] },
      options: baseOptions('Capacidade (t)'),
    });
  }

  function render(rows) {
    // Histogram — capacity distribution
    histChart.data.datasets[0].data = binHistogram(rows);
    histChart.update();

    // Area — aggregate capacity by state (all states)
    const byState = aggregateBy(rows, FIELDS.stateName);
    stateChart.data.labels = byState.map((d) => d.key);
    stateChart.data.datasets[0].data = byState.map((d) => d.total);
    stateChart.update();

    // Area — aggregate capacity by município (top N)
    const byCity = aggregateBy(rows, FIELDS.city).slice(0, CHARTS.topMunicipios);
    cityChart.data.labels = byCity.map((d) => d.key);
    cityChart.data.datasets[0].data = byCity.map((d) => d.total);
    cityChart.update();
  }

  return { init, render };
})();
