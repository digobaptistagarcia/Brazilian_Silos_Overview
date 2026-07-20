/**
 * config.js — Single source of truth for constants.
 * ------------------------------------------------------------------
 * Extend the dashboard by editing THIS file:
 *   - add a storage type  -> TYPE_COLORS
 *   - add a state name     -> UF_NAMES
 *   - add / reorder KPIs   -> KPI_DEFS
 *   - change map framing   -> MAP
 * No other module hard-codes these values.
 * ------------------------------------------------------------------
 */

/**
 * Field names as they appear in each silo record (from data.js).
 * Schema of the full dataset (silos_brasil_dataset.json):
 *   cda, operator, uf, state, region, municipality, type,
 *   capacity_t, lat, lon, matopiba.
 * This map is the ONLY place the physical keys are named — every other
 * module reads fields through FIELDS, so a schema change starts here.
 */
const FIELDS = {
  cda: 'cda',
  company: 'operator',      // storer / operator name
  city: 'municipality',
  state: 'uf',              // UF code (e.g. "BA")
  stateName: 'state',       // full state name (e.g. "Bahia")
  region: 'region',         // Brazilian macro-region
  matopiba: 'matopiba',     // MATOPIBA membership ("Sim"/"Não" after normalisation)
  type: 'type',
  capacity: 'capacity_t',
  lat: 'lat',
  lon: 'lon',
};

/** Marker / legend colour per storage type. Unknown types fall back to DEFAULT.
 *  Dark-theme palette: a cohesive green/teal family so the map reads as the
 *  green accent aesthetic while keeping the categories distinguishable. */
const TYPE_COLORS = {
  'Convencional':      '#84CC16', // lime (primary accent)
  'Graneleiro':        '#22C55E', // emerald green
  'Bateria de Silos':  '#14B8A6', // teal
  'Silo':              '#A3E635', // light lime
  'Estrutural':        '#65A30D', // olive green
  'Depósito':          '#4D7C0F', // deep green
  'Chapéu Chinês':     '#2DD4BF', // bright teal
  'Frigorificado':     '#BEF264', // pale lime
  DEFAULT:             '#94A3B8', // slate
};

/** UF code -> full state name (for tooltips / labels). Full dataset = 27 UFs. */
const UF_NAMES = {
  AC: 'Acre',            AL: 'Alagoas',           AM: 'Amazonas',
  AP: 'Amapá',           BA: 'Bahia',             CE: 'Ceará',
  DF: 'Distrito Federal',ES: 'Espírito Santo',    GO: 'Goiás',
  MA: 'Maranhão',        MG: 'Minas Gerais',      MS: 'Mato Grosso do Sul',
  MT: 'Mato Grosso',     PA: 'Pará',              PB: 'Paraíba',
  PE: 'Pernambuco',      PI: 'Piauí',             PR: 'Paraná',
  RJ: 'Rio de Janeiro',  RN: 'Rio Grande do Norte',RO: 'Rondônia',
  RR: 'Roraima',         RS: 'Rio Grande do Sul', SC: 'Santa Catarina',
  SE: 'Sergipe',         SP: 'São Paulo',         TO: 'Tocantins',
};

/**
 * Capacity bins — single source of truth shared by the histogram AND the
 * capacity-range filter. Right-skewed data, so "nice" edges beat uniform bins.
 * Edit here to retune both at once (last bucket is open-ended).
 */
const CAPACITY_BINS = {
  edges: [0, 1000, 2000, 5000, 10000, 20000, 50000, Infinity],
  labels: ['0–1k', '1–2k', '2–5k', '5–10k', '10–20k', '20–50k', '50k+'],
};

/** Index of the bin a capacity value falls into (-1 if none). */
function capacityBinIndex(c) {
  for (let i = 0; i < CAPACITY_BINS.labels.length; i++) {
    if (c >= CAPACITY_BINS.edges[i] && c < CAPACITY_BINS.edges[i + 1]) return i;
  }
  return -1;
}

/** Leaflet map defaults — framed on Brazil, adjust as coverage grows. */
const MAP = {
  center: [-9.5, -55.0],
  zoom: 4,
  minZoom: 3,
  maxZoom: 18,
  tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  tileAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  markerRadius: 6,
  // Bubble map: marker radius scales with capacity (area ∝ capacity, so
  // radius ∝ √capacity). Domain is taken from the full dataset so a silo's
  // bubble keeps the same size regardless of active filters.
  bubble: { minRadius: 4, maxRadius: 24 },
};

/**
 * KPI definitions. Each has an id, a label, and a compute(rows) function.
 * Add an object here and it renders automatically — no HTML edits needed.
 */
const KPI_DEFS = [
  {
    id: 'count',
    label: 'Silos',
    compute: (rows) => rows.length,
    format: (v) => v.toLocaleString('pt-BR'),
  },
  {
    id: 'capacity',
    label: 'Capacidade total (t)',
    compute: (rows) => rows.reduce((s, r) => s + (r[FIELDS.capacity] || 0), 0),
    format: (v) => v.toLocaleString('pt-BR'),
  },
  {
    id: 'states',
    label: 'Estados',
    compute: (rows) => new Set(rows.map((r) => r[FIELDS.state])).size,
    format: (v) => v.toLocaleString('pt-BR'),
  },
  {
    id: 'companies',
    label: 'Armazenadores',
    compute: (rows) => new Set(rows.map((r) => r[FIELDS.company])).size,
    format: (v) => v.toLocaleString('pt-BR'),
  },
  {
    id: 'avg',
    label: 'Capacidade média (t)',
    compute: (rows) =>
      rows.length
        ? Math.round(rows.reduce((s, r) => s + (r[FIELDS.capacity] || 0), 0) / rows.length)
        : 0,
    format: (v) => v.toLocaleString('pt-BR'),
  },
];

/**
 * Filter definitions.
 * Categorical filters just need `field` (options come from the data, matched by
 * equality). A filter can instead provide explicit `options` + a `match(row,
 * value)` predicate — used here for the capacity range, which is numeric.
 */
const FILTER_DEFS = [
  { id: 'state',    field: FIELDS.stateName, label: 'Estado',              allLabel: 'Todos os estados' },
  { id: 'region',   field: FIELDS.region,    label: 'Região',              allLabel: 'Todas as regiões' },
  { id: 'matopiba', field: FIELDS.matopiba,  label: 'MATOPIBA',            allLabel: 'Todos' },
  { id: 'company',  field: FIELDS.company,   label: 'Armazenador',         allLabel: 'Todos os armazenadores' },
  { id: 'type',     field: FIELDS.type,      label: 'Tipo de armazenagem', allLabel: 'Todos os tipos' },
  {
    id: 'capacity',
    label: 'Faixa de capacidade (t)',
    allLabel: 'Todas as faixas',
    // Explicit options (bin index -> label) instead of distinct data values.
    options: CAPACITY_BINS.labels.map((label, i) => ({ value: String(i), label })),
    // Predicate: keep rows whose capacity falls in the selected bin.
    match: (row, value) => capacityBinIndex(row[FIELDS.capacity] || 0) === Number(value),
  },
];

/**
 * Chart configuration.
 * Edit here to retune charts — modules read everything from CHARTS.
 */
const CHARTS = {
  // Green accent palette on dark surfaces.
  accent: '#84CC16',
  accentFill: 'rgba(132, 204, 22, 0.22)',
  // Top-município horizontal bar charts:
  //   capacity bars -> emerald, count bars -> lime.
  barCapacity: '#22C55E',
  barCapacityFill: 'rgba(34, 197, 94, 0.35)',
  barCount: '#84CC16',
  barCountFill: 'rgba(132, 204, 22, 0.32)',
  grid: 'rgba(255, 255, 255, 0.06)',
  ink: '#94A3B8',

  // Histogram uses the shared CAPACITY_BINS (see above).
  histogram: CAPACITY_BINS,

  // Top-N municípios shown in the horizontal bar charts (capacity and count).
  topMunicipios: 20,
};

/**
 * Custom SVG visualizations (boxplot, treemap). Kept separate from CHARTS so
 * the Chart.js and SVG layers stay independent.
 */
const VIZ = {
  ink: '#94A3B8',
  line: 'rgba(255, 255, 255, 0.14)',
  stroke: '#151E2E',            // slice separator = panel colour (reads on dark)
  boxplot: {
    box: '#84CC16',
    boxFill: 'rgba(132, 204, 22, 0.20)',
    whisker: '#A3E635',
    median: '#BEF264',
    outlier: 'rgba(248, 113, 113, 0.80)',
  },
  // Treemap tiles coloured by region (cohesive green/teal family), per-state fallback.
  treemap: {
    regionColors: {
      'Norte':        '#166534', // green-800
      'Nordeste':     '#15803D', // green-700
      'Centro-Oeste': '#4D7C0F', // lime-700
      'Sudeste':      '#0F766E', // teal-700
      'Sul':          '#3F6212', // lime-800
    },
    fallback: '#334155',
    gap: 3,
  },
  /**
   * Sunburst (Região → Estado). Inner ring = região (base colour), outer ring
   * = estados dentro da região (tons progressivamente mais claros da cor-base).
   * Reaproveita a paleta por região do treemap para manter a identidade visual.
   */
  sunburst: {
    regionColors: {
      'Norte':        '#166534',
      'Nordeste':     '#15803D',
      'Centro-Oeste': '#4D7C0F',
      'Sudeste':      '#0F766E',
      'Sul':          '#3F6212',
    },
    fallback: '#334155',
    innerHole: 0.30,  // raio interno vazio (fração do raio total)
    ringSplit: 0.62,  // fronteira entre anel de região e anel de estado
    gap: 0.004,       // folga angular entre fatias (rad)
    stateTintMax: 0.5, // clareamento máximo aplicado aos estados de uma região
  },
};

function colorForType(type) {
  return TYPE_COLORS[type] || TYPE_COLORS.DEFAULT;
}
