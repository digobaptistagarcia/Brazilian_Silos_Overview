/**
 * app.js — Orchestrator.
 * ------------------------------------------------------------------
 * Boot sequence:
 *   1. load data          (data.js)
 *   2. init map + KPIs     (map.js, kpis.js)
 *   3. init filters, subscribing refresh() to any change (filters.js)
 *   4. first render
 * refresh() is the single re-render path: filter -> map + KPIs.
 * ------------------------------------------------------------------
 */

(async function main() {
  const els = {
    map: document.getElementById('map'),
    kpis: document.getElementById('kpis'),
    filters: document.getElementById('filters'),
    reset: document.getElementById('reset'),
    count: document.getElementById('result-count'),
  };

  let rows = [];
  try {
    rows = await loadSilos();
  } catch (err) {
    els.map.innerHTML = `<div class="error">Não foi possível carregar os dados dos silos.</div>`;
    console.error(err);
    return;
  }

  SiloMap.init(els.map, rows);
  KPIs.init(els.kpis);
  Charts.init({
    histEl: document.getElementById('chart-histogram'),
    stateEl: document.getElementById('chart-state'),
    cityEl: document.getElementById('chart-city'),
  });
  Viz.init({
    boxEl: document.getElementById('viz-boxplot'),
    treeEl: document.getElementById('viz-treemap'),
    sunCapEl: document.getElementById('viz-sunburst-cap'),
    sunCountEl: document.getElementById('viz-sunburst-count'),
  });

  function refresh() {
    const filtered = Filters.apply();
    SiloMap.render(filtered);
    KPIs.render(filtered);
    Charts.render(filtered);
    Viz.render(filtered);
    els.count.textContent =
      `${filtered.length.toLocaleString('pt-BR')} de ${rows.length.toLocaleString('pt-BR')} silos`;
  }

  Filters.init({ rows, container: els.filters, onChange: refresh });
  els.reset.addEventListener('click', () => Filters.reset());

  refresh();
})();
