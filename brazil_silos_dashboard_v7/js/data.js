/**
 * data.js — Silo dataset loader (async fetch + one-time processing).
 * ------------------------------------------------------------------
 * The full registry (~17k records) is served as a static JSON file and
 * fetched once, rather than embedded in the bundle.
 *
 * Schema (silos_brasil_dataset.json):
 *   cda, operator, uf, state, region, municipality, type,
 *   capacity_t, lat, lon, matopiba.
 *
 * Physical keys are consumed everywhere through FIELDS (config.js); this
 * module only fetches, caches and light-normalises the raw records:
 *   - matopiba: numeric 0/1  ->  "Não" / "Sim"  (keeps the existing
 *     filter dropdown labels and predicates unchanged).
 *   - type: repairs a few known mojibake labels in the source export so
 *     tooltips, the legend and TYPE_COLORS stay coherent.
 *
 * loadSilos() is idempotent: the JSON is parsed and processed exactly
 * once; subsequent calls resolve to the same cached array.
 * ------------------------------------------------------------------
 */

const DATA_URL = 'data/silos_brasil_dataset.json';

/**
 * Repairs for storage-type labels corrupted in the source export. The
 * original accents were already lost (replaced by U+FFFD before a second
 * mis-decode), so this maps the exact damaged strings back to the correct
 * Portuguese labels. MOJIBAKE = the "ï¿½" run these strings contain.
 */
const MOJIBAKE = '\u00EF\u00BF\u00BD';
const TYPE_FIXES = {
  ['Dep' + MOJIBAKE + 'sito']: 'Depósito',
  ['Chap' + MOJIBAKE + 'u Chines']: 'Chapéu Chinês',
};

/** Normalise a single raw record in place (mutates and returns it). */
function normaliseSilo(r) {
  // matopiba: numeric flag -> the "Sim"/"Não" labels the UI expects.
  const m = r.matopiba;
  r.matopiba = (m === 1 || m === '1' || m === 'Sim') ? 'Sim' : 'Não';

  // type: repair known corrupted labels (no-op for clean ones).
  if (TYPE_FIXES[r.type]) r.type = TYPE_FIXES[r.type];

  return r;
}

let _cache = null; // parsed + processed records (shared across callers)

/**
 * Load the full silo dataset. Parsed and normalised once, then cached.
 * @returns {Promise<Array>} silo records
 */
async function loadSilos() {
  if (_cache) return _cache;

  const res = await fetch(DATA_URL);
  if (!res.ok) {
    throw new Error(`Falha ao carregar ${DATA_URL} (HTTP ${res.status})`);
  }

  const raw = await res.json(); // parse JSON exactly once
  if (!Array.isArray(raw)) {
    throw new Error('Formato de dados inesperado: esperado um array de silos.');
  }

  _cache = raw.map(normaliseSilo); // one processing pass, then cache
  return _cache;
}
