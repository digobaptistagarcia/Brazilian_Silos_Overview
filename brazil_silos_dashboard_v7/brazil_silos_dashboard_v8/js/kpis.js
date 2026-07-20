/**
 * kpis.js — KPI card computation and rendering.
 * ------------------------------------------------------------------
 * Renders one card per entry in KPI_DEFS (config.js). Call render(rows)
 * with the current filtered subset to update values in place.
 * ------------------------------------------------------------------
 */

const KPIs = (() => {
  let container = null;

  function init(el) {
    container = el;
    container.innerHTML = '';
    KPI_DEFS.forEach((def) => {
      const card = document.createElement('div');
      card.className = 'kpi';
      card.id = `kpi-${def.id}`;
      card.innerHTML = `
        <span class="kpi-value" data-role="value">—</span>
        <span class="kpi-label">${def.label}</span>`;
      container.appendChild(card);
    });
  }

  function render(rows) {
    KPI_DEFS.forEach((def) => {
      const el = document.querySelector(`#kpi-${def.id} [data-role="value"]`);
      if (el) el.textContent = def.format(def.compute(rows));
    });
  }

  return { init, render };
})();
