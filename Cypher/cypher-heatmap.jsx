// Cypher · Heatmap — Spatial + Temporal + Annual analysis page

const { useState, useEffect } = React;

// ─── DATA ──────────────────────────────────────────────
// Spatial: 17 stations grouped into 3 zones
const ZONES = [
  {
    key: 'estamparia', label: 'Zona · Estamparia', cols: 3,
    cells: [
      { id: 'EST-01', n: 0,  type: 'Prensa hidráulica' },
      { id: 'EST-02', n: 2,  type: 'Estampagem A' },
      { id: 'EST-03', n: 11, type: 'Estampagem B' },
      { id: 'EST-04', n: 4,  type: 'Esteira de carga' },
      { id: 'EST-05', n: 1,  type: 'Inspeção visual' },
      null,
    ],
  },
  {
    key: 'soldagem', label: 'Zona · Soldagem', cols: 3,
    cells: [
      { id: 'EST-06', n: 7,  type: 'Solda MIG' },
      { id: 'EST-07', n: 0,  type: 'Solda ponto' },
      { id: 'EST-08', n: 3,  type: 'Acabamento' },
      null,
      { id: 'EST-09', n: 14, type: 'Solda robotizada' },
      { id: 'EST-10', n: 1,  type: 'Verificação' },
    ],
  },
  {
    key: 'montagem', label: 'Zona · Montagem', cols: 5,
    cells: [
      { id: 'EST-11', n: 2, type: 'Montagem A' },
      { id: 'EST-12', n: 0, type: 'Montagem B' },
      { id: 'EST-13', n: 6, type: 'Esteira principal' },
      { id: 'EST-14', n: 1, type: 'Inspeção' },
      { id: 'EST-15', n: 0, type: 'Embalagem' },
      { id: 'EST-16', n: 3, type: 'Expedição' },
      { id: 'EST-17', n: 2, type: 'Logística' },
      null, null, null,
    ],
  },
];

// Temporal: 12 hour-rows × 7 day-cols (last 30 days totals)
const TEMP_HOURS = ['12AM','2AM','4AM','6AM','8AM','10AM','12PM','2PM','4PM','6PM','8PM','10PM'];
const TEMP_DAYS  = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const TEMP_MATRIX = [
  [2, 1,  8, 2, 3, 0, 0],   // 12AM
  [3, 2,  5, 1, 2, 0, 0],   // 2AM
  [1, 0,  3, 1, 1, 0, 0],   // 4AM
  [0, 1,  2, 0, 0, 0, 0],   // 6AM
  [4, 3,  9, 3, 5, 1, 0],   // 8AM
  [3, 2,  7, 2, 4, 1, 0],   // 10AM
  [2, 3,  5, 2, 3, 0, 0],   // 12PM
  [3, 2,  6, 3, 4, 1, 0],   // 2PM
  [2, 1,  4, 1, 3, 0, 0],   // 4PM
  [1, 1,  3, 1, 2, 0, 0],   // 6PM
  [2, 1,  5, 2, 3, 0, 0],   // 8PM
  [3, 2, 14, 2, 4, 0, 0],   // 10PM
];

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Generate 52w × 7d annual data with a plausible incident pattern.
function buildAnnual() {
  // base profile per week (0..51) — narrative: peak in mid-March (week 11),
  // dip in April–June, second wave in Aug, decline Nov–Dec
  const weekBase = (w) => {
    if (w === 11) return 9;                 // peak week
    if (w >= 8 && w <= 13) return 5;        // March–early Apr buildup
    if (w >= 0 && w <= 7)  return 4;        // Jan–Feb
    if (w >= 14 && w <= 24) return 1.6;     // Apr–Jun valley
    if (w >= 25 && w <= 34) return 5;       // Jul–Aug second wave
    if (w >= 35 && w <= 43) return 3;       // Sep–Oct moderate
    return 1;                                // Nov–Dec
  };
  const out = [];
  let seed = 7;
  const rng = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let w = 0; w < 52; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const dayMul = (d === 6 || d === 5) ? 0.35 : 1;  // weekends lower
      const wedBoost = d === 2 ? 1.4 : 1;
      const raw = weekBase(w) * dayMul * wedBoost * (0.5 + rng());
      const val = Math.round(Math.max(0, raw));
      col.push({ w, d, v: val, peak: w === 11 && val > 6 });
    }
    out.push(col);
  }
  return out;
}
const ANNUAL = buildAnnual();

// ─── HELPERS ───────────────────────────────────────────
function spatialTier(n) {
  if (n === 0) return 't0';
  if (n <= 2)  return 't1';
  if (n <= 5)  return 't2';
  if (n <= 9)  return 't3';
  return 't4';
}
function tempTier(n) {
  if (n === 0) return 'h0';
  if (n <= 3)  return 'h1';
  if (n <= 7)  return 'h2';
  if (n <= 12) return 'h3';
  return 'h4';
}
function annualTier(n) {
  if (n === 0) return 'a0';
  if (n <= 2)  return 'a1';
  if (n <= 5)  return 'a2';
  if (n <= 9)  return 'a3';
  return 'a4';
}

// ─── FILTER BAR ────────────────────────────────────────
function FilterBar() {
  const [period, setPeriod] = useState('7d');
  const [shift, setShift]   = useState('all');
  return (
    <div className="filterbar">
      <span className="fb-label">Período</span>
      <div className="fb-group">
        {[
          ['hoje','Hoje'], ['7d','7 dias'], ['30d','30 dias'], ['90d','90 dias'], ['custom','Custom ▾'],
        ].map(([k, l]) => (
          <button key={k} className={`chip ${period === k ? 'on' : ''}`} onClick={() => setPeriod(k)}>
            {period === k && <span className="dotind"/>}
            {l}
          </button>
        ))}
      </div>
      <div className="fb-sep"/>
      <span className="fb-label">Setor</span>
      <select className="fb-select" defaultValue="A">
        <option value="A">Setor A</option>
        <option value="B">Setor B</option>
        <option value="C">Setor C</option>
      </select>
      <div className="fb-sep"/>
      <span className="fb-label">EPI</span>
      <select className="fb-select" defaultValue="all">
        <option value="all">Todos os EPIs</option>
        <option>Capacete</option>
        <option>Óculos</option>
        <option>Luvas</option>
      </select>
      <div className="fb-sep"/>
      <span className="fb-label">Turno</span>
      <div className="fb-group">
        {[
          ['all','Todos'], ['A','A · 06–14h'], ['B','B · 14–22h'], ['N','N · 22–06h'],
        ].map(([k, l]) => (
          <button key={k} className={`chip ${shift === k ? 'on' : ''}`} onClick={() => setShift(k)}>{l}</button>
        ))}
      </div>
      <div className="spacer"/>
      <span className="fb-status">atualizado há 3s</span>
      <button className="fb-export"><CypherIDownload size={13}/> Exportar PDF</button>
    </div>
  );
}

// ─── SPATIAL HEATMAP ──────────────────────────────────
function ScaleLegend() {
  return (
    <div className="scale-legend">
      <span className="sl-label">Incidentes:</span>
      <span className="scale-pill s0">Nenhum</span>
      <span className="scale-pill s1">1–2</span>
      <span className="scale-pill s2">3–5</span>
      <span className="scale-pill s3">6–9</span>
      <span className="scale-pill s4">10+</span>
    </div>
  );
}

function Station({ s }) {
  if (!s) return <div className="station empty"/>;
  return (
    <div className={`station ${spatialTier(s.n)}`} role="button" aria-label={`${s.id}: ${s.n} incidentes`}>
      <span className="sid">{s.id}</span>
      <span className={`sn ${s.n === 0 ? 'zero' : ''}`}>{s.n === 0 ? '—' : s.n}</span>
      <div className="tt">
        <div className="t1">{s.id} · {s.type}</div>
        <div className="t2"><span className="ico"><CypherIWarning size={13}/></span>{s.n} incidente{s.n === 1 ? '' : 's'} nos últimos 7 dias</div>
        <div className="t3">Último: Capacete ausente · 14:31 hoje</div>
        <div className="t4">Câmera: CAM-{s.id.slice(-2)} · <a href="#">Ver ao vivo →</a></div>
      </div>
    </div>
  );
}

function SpatialHeatmap() {
  // top 5 — derived from data
  const top5 = ZONES.flatMap(z => z.cells.filter(Boolean))
                    .sort((a, b) => b.n - a.n)
                    .slice(0, 5);
  const max = top5[0]?.n || 1;
  const sev = (n) => n >= 10 ? 'crit' : n >= 6 ? 'alto' : 'med';
  const sevLabel = (s) => ({ crit: 'CRÍTICO', alto: 'ALTO', med: 'MÉDIO' }[s]);

  return (
    <div className="hp-card">
      <div className="hc-head">
        <div className="hch-l">
          <div className="hch-title">
            Planta Baixa · Setor A
            <span className="sep">·</span>
            <span className="quiet">17 estações monitoradas</span>
          </div>
          <div className="hch-sub">Intensidade de incidentes por estação · últimos 7 dias</div>
        </div>
        <div className="hch-r">
          <select className="fb-select" defaultValue="rank">
            <option value="rank">Ordenar: ranking</option>
            <option value="name">Ordenar: nome</option>
            <option value="zone">Ordenar: zona</option>
          </select>
        </div>
      </div>

      <ScaleLegend/>

      <div className="spatial-zones">
        {ZONES.map(z => (
          <div key={z.key} className="zone">
            <div className="zone-label">{z.label}</div>
            <div className="zone-grid" style={{ gridTemplateColumns: `repeat(${z.cols}, 1fr)` }}>
              {z.cells.map((c, i) => <Station key={i} s={c}/>)}
            </div>
          </div>
        ))}
      </div>

      <div className="ranking">
        <div className="ranking-title">Top 5 · Maior concentração</div>
        {top5.map((s, i) => {
          const sv = sev(s.n);
          return (
            <div key={s.id} className={`rk-row ${sv}`}>
              <span className="pos">{String(i + 1).padStart(2, '0')}</span>
              <span className="id">{s.id}</span>
              <div className="rk-bar"><div className="fill" style={{ width: `${(s.n / max) * 100}%` }}/></div>
              <span className="nm">{s.n}</span>
              <span className="bdg">{sevLabel(sv)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TEMPORAL HEATMAP ──────────────────────────────────
function TemporalHeatmap() {
  return (
    <div className="hp-card">
      <div className="hc-head">
        <div className="hch-l">
          <div className="hch-title">Distribuição Temporal · Incidentes por Horário</div>
          <div className="hch-sub">Dia da semana × faixa horária · últimos 30 dias</div>
        </div>
        <div className="hch-r">
          <select className="fb-select" defaultValue="2h">
            <option value="1h">Por hora</option>
            <option value="2h">Por 2h</option>
            <option value="shift">Por turno</option>
          </select>
        </div>
      </div>

      <div className="temporal">
        <span className="corner"/>
        {TEMP_DAYS.map((d, i) => (
          <span key={d} className={`day-h ${i === 2 ? 'peak' : ''}`}>{d}</span>
        ))}
        {TEMP_MATRIX.map((row, ri) => (
          <React.Fragment key={ri}>
            <span className="hr-l">{TEMP_HOURS[ri]}</span>
            {row.map((v, ci) => (
              <div key={ci} className={`temp-cell ${tempTier(v)}`}>
                <div className="ttsmall">
                  <div className="l1">{TEMP_DAYS[ci]} · {TEMP_HOURS[ri]} – {TEMP_HOURS[(ri + 1) % 12]}</div>
                  <div className="l2"><span className="ico"><CypherIWarning size={12}/></span>{v} incidente{v === 1 ? '' : 's'} em 30 dias</div>
                  {v >= 13 && <div className="l3">Pico da semana neste período</div>}
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      <div className="lh-legend">
        <span>Baixo</span>
        <div className="swatches">
          {['h0','h1','h2','h3','h4'].map(t => (
            <span key={t} className={`sw temp-cell ${t}`}/>
          ))}
        </div>
        <span>Alto</span>
      </div>

      <div className="temp-kpis">
        <div className="tkpi bad">
          <span className="tkpi-label">Hoje</span>
          <span className="tkpi-val">3 incidentes</span>
          <span className="tkpi-trend">↑ vs ontem</span>
        </div>
        <div className="tkpi ok">
          <span className="tkpi-label">Média semanal</span>
          <span className="tkpi-val">28</span>
          <span className="tkpi-trend">↓ vs semana ant.</span>
        </div>
        <div className="tkpi flat">
          <span className="tkpi-label">Média mensal</span>
          <span className="tkpi-val">112</span>
          <span className="tkpi-trend">→ estável</span>
        </div>
      </div>
    </div>
  );
}

// ─── ANNUAL HEATMAP ────────────────────────────────────
function AnnualHeatmap() {
  // month label positions (week index where each month begins)
  const monthStarts = [0, 5, 9, 13, 17, 22, 26, 31, 35, 40, 44, 48];
  const total = ANNUAL.flat().reduce((a, b) => a + b.v, 0);

  return (
    <div className="hp-card annual">
      <div className="hc-head annual-head">
        <div className="hch-l">
          <div className="hch-title">Histórico Anual de Incidentes</div>
          <div className="hch-sub">Setor A · Jan–Dez 2025 · {total} incidentes registrados</div>
        </div>
        <div className="ah-r">
          <CypherIWarning size={13}/>
          Pior semana: 12–18 mar · 38 incidentes
        </div>
      </div>

      <div className="annual-wrap">
        <div className="annual-days">
          <span>Seg</span><span/>
          <span>Qua</span><span/>
          <span>Sex</span><span/><span/>
        </div>
        <div className="annual-months">
          {MONTHS.map((m, i) => (
            <span key={m} className="mlbl" style={{ left: `calc(${monthStarts[i]} * (100% / 52))` }}>{m}</span>
          ))}
        </div>
        <div className="annual-grid">
          {ANNUAL.map((col, wi) =>
            col.map((cell, di) => (
              <div key={`${wi}-${di}`}
                   className={`acell ${annualTier(cell.v)} ${cell.peak ? 'peak' : ''}`}
                   title={`Semana ${wi + 1} · ${TEMP_DAYS[di] || ''} · ${cell.v} incidente${cell.v === 1 ? '' : 's'}`}/>
            ))
          )}
        </div>
      </div>

      <div className="annual-foot">
        <a href="#" className="l">Aprenda como calculamos os incidentes →</a>
        <span className="lg">
          Menos
          <span className="acell a0"/>
          <span className="acell a1"/>
          <span className="acell a2"/>
          <span className="acell a3"/>
          <span className="acell a4"/>
          Mais
        </span>
      </div>
    </div>
  );
}

// ─── APP ───────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark"
}/*EDITMODE-END*/;

function App() {
  const cfg = useCypherConfig();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(() => { document.body.className = `theme-${t.theme}`; }, [t.theme]);

  const resetDock = () => {
    try { localStorage.removeItem('cypher.dockPos'); } catch {}
    window.location.reload();
  };

  return (
    <div className="heatpage">
      <CypherTopbar cfg={cfg} page="Heatmap" subtitle="Análise espacial e temporal · Setor A" shift={null} live={false}/>
      <FilterBar/>
      <main className="hp-content">
        <SpatialHeatmap/>
        <TemporalHeatmap/>
        <AnnualHeatmap/>
      </main>
      <CypherDock activeKey="heatmap"/>

      <TweaksPanel title="Tweaks · Cypher Heatmap">
        <TweakSection label="Tema"/>
        <TweakRadio label="Aparência" value={t.theme}
                    options={['dark', 'light']}
                    onChange={(v) => setTweak('theme', v)}/>
        <TweakSection label="Dock"/>
        <TweakButton label="Resetar posição do dock" onClick={resetDock}/>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
