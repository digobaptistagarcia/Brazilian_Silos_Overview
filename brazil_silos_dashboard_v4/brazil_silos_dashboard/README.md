# Silos do Brasil — Painel MVP

Painel HTML/CSS/JS para o registro de armazéns de grãos brasileiros.
Primeira visualização: mapa interativo (Leaflet) com todos os silos plotados
por coordenada — zoom, pan, tooltip no hover e popup com informações no clique.

## Como rodar

Abra `index.html` no navegador. **Não precisa de servidor** — os dados estão
embutidos em `js/data.js`, então funciona direto do `file://`.

## Estrutura

```
brazil_silos_dashboard/
├── index.html          # shell + ordem de carregamento dos módulos
├── css/styles.css      # layout e tema (básico, funcional)
├── data/silos.json     # dataset limpo (para carregamento via fetch no futuro)
└── js/
    ├── config.js       # ÚNICA fonte de constantes (cores, KPIs, filtros, mapa, gráficos)
    ├── data.js         # dataset embutido + loadSilos()
    ├── filters.js      # estado dos filtros + construção dos selects
    ├── kpis.js         # cálculo e render dos cards de KPI
    ├── map.js          # mapa Leaflet: bolhas ∝ capacidade, tooltip, popup, legendas
    ├── charts.js       # histograma + gráficos de área (Chart.js)
    ├── viz.js          # boxplot + treemap + sunbursts (SVG customizado)
    └── app.js          # orquestrador: carrega dados → inicia módulos → refresh
```

Fluxo único de re-render: mudança em filtro → `app.refresh()` → mapa + KPIs + gráficos + viz.

## Visualizações

- **Mapa (bubble map)** — silos por coordenada; **tamanho da bolha ∝ capacidade** (área ∝ capacidade, raio ∝ √capacidade), com legenda de tamanho.
- **Histograma** — distribuição da capacidade por faixa (t).
- **Boxplot** — mediana, quartis, dispersão e outliers (Tukey 1,5·IQR).
- **Área por estado** e **Treemap por estado** — capacidade agregada e participação.
- **Área por município** — capacidade agregada (20 maiores).
- **Sunburst Região → Estado (capacidade)** — anel interno por região, anel externo por estado; ângulo ∝ capacidade total (t).
- **Sunburst Região → Estado (quantidade)** — mesma hierarquia; ângulo ∝ número de silos.

Todas reagem aos filtros ao mesmo tempo.

## Dados

Fonte: `base_de_silos_brasileira.xlsx` (298 silos, UFs AC/AL/AM/AP/BA).
Colunas: CDA, Armazenador, Município, UF, Tipo, Capacidade (t), Lat, Lon,
Estado, Região, MATOPIBA.

Filtros: Estado, Região, MATOPIBA, Armazenador, Tipo, Faixa de capacidade.

O filtro de faixa de capacidade usa `CAPACITY_BINS` (config.js) — a mesma
fonte do histograma, então faixas e barras ficam sempre em sincronia.

Tratamento aplicado no ETL:
- correção de mojibake em `Tipo` (`Depï¿½sito` → `Depósito`);
- tipagem de capacidade (int) e coordenadas (float);
- `matopiba` 0/1 → "Sim"/"Não" (rótulos legíveis no filtro);
- validação de coordenadas dentro dos limites do Brasil.

> Nota sobre MATOPIBA: a base marca todos os silos da BA como MATOPIBA.
> Oficialmente (Decreto 8.447/2015) a região cobre apenas municípios do
> oeste baiano — refine para nível-município se precisar de rigor geográfico.

## Como estender

- **Novo tipo de armazenagem / cor** → `TYPE_COLORS` em `config.js`
  (marcadores e legenda se atualizam sozinhos).
- **Novo KPI** → adicionar objeto em `KPI_DEFS` (`config.js`); o card renderiza automático.
- **Novo filtro** → adicionar objeto em `FILTER_DEFS` (`config.js`).
- **Sunbursts (cores/anéis/tons)** → `VIZ.sunburst` em `config.js` (`regionColors`,
  `innerHole`, `ringSplit`, `stateTintMax`). A hierarquia Região → Estado é genérica:
  `renderSunburst(el, rows, valueFn, ...)` — troque `valueFn` para plotar outra métrica.
- **Trocar fonte de dados** → substituir o corpo de `loadSilos()` em `data.js`
  por um `fetch()` (todos os consumidores já usam `await`).
- **Novas UFs** → basta incluir os registros; adicione o nome em `UF_NAMES` para o tooltip.

## Próximos passos sugeridos

- Camada de clusters para densidade de marcadores conforme a base cresce.
- Segunda visualização (ex.: capacidade por UF / por tipo) num painel lateral.
- Busca textual por armazenador/município.
