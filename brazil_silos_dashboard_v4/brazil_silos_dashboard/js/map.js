/**
 * map.js — Leaflet map: markers, hover tooltips, click popups, legend.
 * ------------------------------------------------------------------
 * SiloMap.init(el)      creates the map once.
 * SiloMap.render(rows)  redraws markers for the given subset and fits
 *                       the view to them.
 * Colours come from config.js (colorForType), so the legend and markers
 * stay in sync automatically.
 * ------------------------------------------------------------------
 */

const SiloMap = (() => {
  let map = null;
  let markerLayer = null;
  let radiusFor = () => MAP.markerRadius; // set in init() from the data domain

  const nf = new Intl.NumberFormat('pt-BR');

  /** Build a √-scaled radius function (area ∝ capacity) over a fixed domain. */
  function makeRadiusScale(rows) {
    const caps = rows.map((r) => r[FIELDS.capacity] || 0);
    const min = Math.min(...caps);
    const max = Math.max(...caps);
    const { minRadius, maxRadius } = MAP.bubble;
    const span = Math.sqrt(max) - Math.sqrt(min) || 1;
    return (c) => {
      const t = (Math.sqrt(Math.max(c, min)) - Math.sqrt(min)) / span;
      return minRadius + t * (maxRadius - minRadius);
    };
  }

  function init(el, allRows) {
    // Fixed domain from the full dataset -> bubble sizes stay comparable
    // across filter states.
    if (allRows && allRows.length) radiusFor = makeRadiusScale(allRows);

    map = L.map(el, {
      center: MAP.center,
      zoom: MAP.zoom,
      minZoom: MAP.minZoom,
      maxZoom: MAP.maxZoom,
      scrollWheelZoom: true,
    });

    L.tileLayer(MAP.tileUrl, {
      attribution: MAP.tileAttribution,
      maxZoom: MAP.maxZoom,
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    addLegend();
    addSizeLegend();
  }

  /** Tooltip (hover) — compact identity line. */
  function tooltipHtml(r) {
    return `<strong>${r[FIELDS.company]}</strong><br>${r[FIELDS.city]}/${r[FIELDS.state]}`;
  }

  /** Popup (click) — key information. */
  function popupHtml(r) {
    const stateName = UF_NAMES[r[FIELDS.state]] || r[FIELDS.state];
    return `
      <div class="popup">
        <div class="popup-title">${r[FIELDS.company]}</div>
        <table class="popup-table">
          <tr><th>Município</th><td>${r[FIELDS.city]} (${stateName})</td></tr>
          <tr><th>Tipo</th><td>${r[FIELDS.type]}</td></tr>
          <tr><th>Capacidade</th><td>${nf.format(r[FIELDS.capacity])} t</td></tr>
          <tr><th>CDA</th><td>${r[FIELDS.cda]}</td></tr>
        </table>
      </div>`;
  }

  /** Draw markers for a subset and fit bounds. */
  function render(rows) {
    markerLayer.clearLayers();
    const latlngs = [];

    rows.forEach((r) => {
      const lat = r[FIELDS.lat];
      const lon = r[FIELDS.lon];
      if (typeof lat !== 'number' || typeof lon !== 'number') return;

      const marker = L.circleMarker([lat, lon], {
        radius: radiusFor(r[FIELDS.capacity] || 0),
        color: '#ffffff',
        weight: 1,
        fillColor: colorForType(r[FIELDS.type]),
        fillOpacity: 0.8,
      });

      marker.bindTooltip(tooltipHtml(r), { direction: 'top', offset: [0, -4] });
      marker.bindPopup(popupHtml(r), { maxWidth: 280 });
      marker.addTo(markerLayer);
      latlngs.push([lat, lon]);
    });

    if (latlngs.length) {
      map.fitBounds(L.latLngBounds(latlngs).pad(0.15));
    } else {
      map.setView(MAP.center, MAP.zoom);
    }
  }

  /** Legend keyed on the storage-type colours actually in the data. */
  function addLegend() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      const items = Object.entries(TYPE_COLORS)
        .filter(([k]) => k !== 'DEFAULT')
        .map(
          ([type, color]) =>
            `<span class="legend-item"><i style="background:${color}"></i>${type}</span>`
        )
        .join('');
      div.innerHTML = `<div class="legend-title">Tipo</div>${items}`;
      return div;
    };
    legend.addTo(map);
  }

  /** Size legend — reference bubbles showing the capacity → radius scale. */
  function addSizeLegend() {
    const refs = [2000, 20000, 100000]; // representative capacities (t)
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend size-legend');
      const items = refs
        .map((c) => {
          const d = radiusFor(c) * 2;
          return `<span class="legend-item">
            <i class="size-dot" style="width:${d}px;height:${d}px"></i>
            ${nf.format(c)} t</span>`;
        })
        .join('');
      div.innerHTML = `<div class="legend-title">Capacidade</div>${items}`;
      return div;
    };
    legend.addTo(map);
  }

  return { init, render };
})();
