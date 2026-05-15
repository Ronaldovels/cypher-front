// Cypher · Dashboard — page (KPIs, heatmap mini, alerts, chart) — chrome from cypher-chrome.jsx

const { useState, useEffect, useRef } = React;

// ─── KPI CARD ─────────────────────────────────────────
function KpiRing({ pct, color = 'var(--accent)' }) {
  const r = 18, c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <svg className="kpi-ring" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={r} stroke="var(--line)" strokeWidth="4" fill="none"/>
      <circle cx="24" cy="24" r={r} stroke={color} strokeWidth="4" fill="none"
              strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
              transform="rotate(-90 24 24)"/>
    </svg>
  );
}

function KpiRow() {
  return (
    <section className="kpi-row">
      <article className="kpi" style={{ '--kpi-color': '#EE4242' }}>
        <div className="kpi-row1">
          <span className="kpi-label">Incidentes hoje</span>
          <span className="kpi-ico">⚠</span>
        </div>
        <div>
          <div className="kpi-val">6</div>
          <div className="kpi-sub up"><strong>↑ 2</strong> vs ontem</div>
        </div>
      </article>

      <article className="kpi" style={{ '--kpi-color': 'var(--accent)' }}>
        <div className="kpi-row1">
          <span className="kpi-label">Conformidade geral</span>
          <KpiRing pct={94.2}/>
        </div>
        <div>
          <div className="kpi-val">94.2<span className="denom">%</span></div>
          <div className="kpi-sub">Meta: ≥ 98%</div>
        </div>
      </article>

      <article className="kpi" style={{ '--kpi-color': '#34D07E' }}>
        <div className="kpi-row1">
          <span className="kpi-label">Estações ativas</span>
        </div>
        <div>
          <div className="kpi-val">42<span className="denom">/ 48</span></div>
          <div className="kpi-sub warn">6 em alerta agora</div>
        </div>
      </article>

      <article className="kpi" style={{ '--kpi-color': '#FFCE38' }}>
        <div className="kpi-row1">
          <span className="kpi-label">Linha parada hoje</span>
          <span className="kpi-ico">⚙</span>
        </div>
        <div>
          <div className="kpi-val">18<span className="denom">min</span></div>
          <div className="kpi-sub">≈ R$ 4.200 em impacto</div>
        </div>
      </article>
    </section>
  );
}

// ─── HEATMAP MINI ─────────────────────────────────────
const HEAT_DATA = [
  { id: 'EST-01', n: 0 }, { id: 'EST-02', n: 1 }, { id: 'EST-03', n: 3 }, null, { id: 'EST-04', n: 1 },
  { id: 'EST-05', n: 0 }, { id: 'EST-06', n: 2 }, { id: 'EST-07', n: 0 }, { id: 'EST-08', n: 1 }, { id: 'EST-09', n: 3 },
  null, null, { id: 'EST-10', n: 0 }, { id: 'EST-11', n: 1 }, { id: 'EST-12', n: 0 },
  { id: 'EST-13', n: 2 }, { id: 'EST-14', n: 0 }, { id: 'EST-15', n: 0 }, { id: 'EST-16', n: 0 }, { id: 'EST-17', n: 1 },
];
function heatClass(n) { return n === 0 ? 'ok' : n === 1 ? 'low' : n === 2 ? 'mid' : 'hi'; }
function heatLabel(n) { return n === 0 ? 'ok' : n === 1 ? '1 inf' : n === 2 ? '2 inf' : n + ' inf'; }

function Heatmap() {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="ph-left">
          <span className="ph-title">Mapa de Calor de Infrações</span>
          <span className="ph-meta">Setor A · últimas 8h</span>
        </div>
        <div className="ph-right">
          <span className="updated">atualizado há 3s</span>
          <a href="Cypher Heatmap.html" className="expand" title="Ver análise completa">
            <CypherIExpand size={13}/>
          </a>
        </div>
      </div>
      <div className="heat-grid">
        {HEAT_DATA.map((t, i) => {
          if (!t) return <div key={i} className="heat-tile empty"/>;
          return (
            <div key={t.id} className={`heat-tile ${heatClass(t.n)}`}>
              <span className="tid">{t.id}</span>
              <span className="tst">{heatLabel(t.n)}</span>
              {t.n >= 3 && (
                <div className="ann">{t.n} violações · CAM-{t.id.slice(-2)} → <em>Ver câmera</em></div>
              )}
            </div>
          );
        })}
      </div>
      <div className="heat-legend">
        <span className="lg"><span className="sw ok"/>ok</span>
        <span className="lg"><span className="sw low"/>1 inf</span>
        <span className="lg"><span className="sw mid"/>2 inf</span>
        <span className="lg"><span className="sw hi"/>3+ inf</span>
      </div>
    </div>
  );
}

// ─── ALERTS ─────────────────────────────────────────
const ALERTS = [
  { time: '14:31', est: 'EST-04', type: 'Capacete ausente', sev: 'crit' },
  { time: '13:45', est: 'EST-09', type: 'Zona de risco',    sev: 'crit' },
  { time: '12:10', est: 'EST-03', type: 'Óculos ausente',   sev: 'high' },
  { time: '11:58', est: 'EST-03', type: 'Capacete ausente', sev: 'high' },
  { time: '10:22', est: 'EST-09', type: 'Luvas ausentes',   sev: 'high' },
];
const SEV_LABEL = { crit: 'CRÍTICO', high: 'ALTO' };

function Alerts({ variant = 'neutral' }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="ph-left"><span className="ph-title">Alertas recentes</span></div>
        <a className="link" href="#">Ver todos →</a>
      </div>
      <div className="alerts-list" data-variant={variant}>
        {ALERTS.map((a, i) => (
          <div key={i} className={`alert-row ${a.sev}`}>
            <span className="a-time">{a.time}</span>
            <span className="a-station">{a.est}</span>
            <span className="a-type">{a.type}</span>
            <span className="a-sev">{SEV_LABEL[a.sev]}</span>
          </div>
        ))}
      </div>
      <div className="alerts-foot">
        <span className="l">2 alertas críticos ativos</span>
        <a className="r" href="#">Resolver pendências →</a>
      </div>
    </div>
  );
}

// ─── PREDICTIVE CHART ─────────────────────────────────
const BAR_DATA = [
  { d: 'Seg', v: 8 }, { d: 'Ter', v: 5 }, { d: 'Qua', v: 12, peak: true },
  { d: 'Qui', v: 4 }, { d: 'Sex', v: 9 }, { d: 'Sáb', v: 3 }, { d: 'Dom', v: 2 },
];
function Chart() {
  const maxV = 14;
  const meanV = BAR_DATA.reduce((a, b) => a + b.v, 0) / BAR_DATA.length;
  const meanPct = meanV / maxV * 100;
  return (
    <div className="chart-panel">
      <div className="chart-head">
        <div className="ch-l">
          <span className="t">Análise Preditiva · Infrações por Dia da Semana</span>
          <span className="s">Padrão identificado: pico às quartas-feiras — recomendação de reforço preventivo</span>
        </div>
        <span className="ai-badge">IA</span>
      </div>
      <div className="bars">
        <div className="mean" style={{ bottom: `${meanPct}%` }}/>
        {BAR_DATA.map((b, i) => (
          <div key={i} className={`bar-col ${b.peak ? 'peak' : ''}`}>
            <span className="bar-val">{b.v}</span>
            <div className="bar" style={{ height: `${b.v / maxV * 100}%` }}/>
          </div>
        ))}
      </div>
      <div className="bars-axis">
        {BAR_DATA.map((b, i) => <span key={i} className="bd">{b.d}</span>)}
      </div>
      <div className="insight">
        <span className="diam">◆</span>
        <span>
          <strong>Recomendação:</strong> aumentar frequência de verificação presencial nas quartas-feiras,
          especialmente no turno noturno. Pico semanal está 96% acima da média.
        </span>
      </div>
    </div>
  );
}

// ─── APP ───────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "alertVariant": "neutral"
}/*EDITMODE-END*/;

function App() {
  const cfg = useCypherConfig();
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const plantName = cfg && cfg.company ? cfg.company : 'sua planta';

  useEffect(() => { document.body.className = `theme-${t.theme}`; }, [t.theme]);

  const resetDock = () => {
    try { localStorage.removeItem('cypher.dockPos'); } catch {}
    window.location.reload();
  };

  return (
    <div className="dash">
      <CypherTopbar cfg={cfg} page="Dashboard"/>
      <main className="dcontent">
        {!cfg &&
          <a href="Cypher Onboarding.html" className="setup-banner">
            <span className="sb-dot"/>
            <span className="sb-text">
              <strong>Configuração pendente.</strong> Conclua o onboarding para personalizar marca, EPIs e validades.
            </span>
            <span className="sb-cta">Abrir onboarding →</span>
          </a>
        }
        <div className="greeting">
          <div className="gtext">
            <span className="hi">Bom dia, <em>Ana</em>.</span>
            <span className="sub">Hoje você tem 6 incidentes para revisar em <strong style={{ color: 'var(--ink)' }}>{plantName}</strong>.</span>
          </div>
          <div className="gstatus">
            <span className="dot"/>
            <span>Sistema operando normalmente · <strong>17 câmeras ativas</strong></span>
          </div>
        </div>

        <KpiRow/>
        <div className="mid-row">
          <Heatmap/>
          <Alerts variant={t.alertVariant}/>
        </div>
        <Chart/>
      </main>
      <CypherDock activeKey="dashboard"/>

      <TweaksPanel title="Tweaks · Cypher Dashboard">
        <TweakSection label="Tema"/>
        <TweakRadio label="Aparência" value={t.theme}
                    options={['dark', 'light']}
                    onChange={(v) => setTweak('theme', v)}/>
        <TweakSection label="Cards de alerta"/>
        <TweakRadio label="Variante" value={t.alertVariant}
                    options={[
                      { value: 'chromatic', label: 'Chromatic' },
                      { value: 'neutral',   label: 'Neutral' },
                      { value: 'contrast',  label: 'Contrast' },
                    ]}
                    onChange={(v) => setTweak('alertVariant', v)}/>
        <TweakSection label="Dock"/>
        <TweakButton label="Resetar posição do dock" onClick={resetDock}/>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
