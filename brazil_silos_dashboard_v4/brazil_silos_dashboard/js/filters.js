/**
 * filters.js — Filter state and controls.
 * ------------------------------------------------------------------
 * Owns the active filter values, builds the <select> controls from the
 * data (so option lists always match the dataset), and applies filters
 * to produce the working subset. Emits a callback whenever anything
 * changes so app.js can re-render map + KPIs.
 * ------------------------------------------------------------------
 */

const Filters = (() => {
  let allRows = [];
  let onChange = () => {};
  const state = {}; // { state: '', company: '', type: '' }  ('' = no filter)

  /** Distinct, sorted values for a field. */
  function distinct(field) {
    return [...new Set(allRows.map((r) => r[field]))]
      .filter((v) => v !== undefined && v !== null && v !== '')
      .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  }

  /** Build one labelled <select> for a filter definition. */
  function buildSelect(def) {
    const wrap = document.createElement('label');
    wrap.className = 'filter';
    wrap.textContent = def.label;

    const sel = document.createElement('select');
    sel.id = `filter-${def.id}`;
    if (def.field) sel.dataset.field = def.field;

    sel.add(new Option(def.allLabel, ''));

    // Explicit options (e.g. capacity ranges) or distinct values from the data.
    if (def.options) {
      def.options.forEach((o) => sel.add(new Option(o.label, o.value)));
    } else {
      distinct(def.field).forEach((v) => sel.add(new Option(v, v)));
    }

    sel.addEventListener('change', () => {
      state[def.id] = sel.value;
      onChange();
    });

    state[def.id] = '';
    wrap.appendChild(sel);
    return wrap;
  }

  /** Render all filter controls into a container. */
  function render(container) {
    container.innerHTML = '';
    FILTER_DEFS.forEach((def) => container.appendChild(buildSelect(def)));
  }

  /** Apply active filters -> filtered rows. Uses def.match when provided. */
  function apply() {
    return allRows.filter((r) =>
      FILTER_DEFS.every((def) => {
        const val = state[def.id];
        if (!val) return true; // no selection = pass
        return def.match ? def.match(r, val) : r[def.field] === val;
      })
    );
  }

  /** Reset all selects to "all". */
  function reset() {
    FILTER_DEFS.forEach((def) => {
      state[def.id] = '';
      const sel = document.getElementById(`filter-${def.id}`);
      if (sel) sel.value = '';
    });
    onChange();
  }

  function init({ rows, container, onChange: cb }) {
    allRows = rows;
    onChange = cb || (() => {});
    render(container);
  }

  return { init, apply, reset, get state() { return { ...state }; } };
})();
