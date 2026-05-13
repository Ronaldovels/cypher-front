// Gestor wireframes — 3 variações
// V1 · Clássico — sidebar + dashboard KPIs + mapa denso
// V2 · Alternativo — topbar + mapa protagonista + painel lateral
// V3 · Ousado — grid modular reorganizável (estilo "bento") com respiro

function GestorTopbar({ title = 'Visão geral' }) {
  return (
    <div className="row between" style={{ padding: '10px 18px', borderBottom: '2px solid #1a1a1a', background: '#fdfcf8' }}>
      <div className="row" style={{ gap: 20 }}>
        <CypherLogo small />
        <span className="muted" style={{ fontSize: 13 }}>/ Acme Indústrias / {title}</span>
      </div>
      <div className="row gap-sm">
        <span className="chip">hoje · 24 abr</span>
        <span className="chip">todos setores</span>
        <span className="tag ok">● 42/48 ok</span>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a1a1a', color: '#fdfcf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Caveat', fontWeight: 700, fontSize: 13 }}>JG</div>
      </div>
    </div>
  );
}

function FloorMap({ compact = false }) {
  // 5x4 grid of tiles representing machines in a floor plan
  const tiles = [
    ['EST-01', 'ok'], ['EST-02', 'ok'], ['EST-03', 'alert'], [null], ['EST-04', 'ok'],
    ['EST-05', 'ok'], ['EST-06', 'idle'], ['EST-07', 'ok'], ['EST-08', 'ok'], ['EST-09', 'alert'],
    [null], [null], ['EST-10', 'ok'], ['EST-11', 'ok'], ['EST-12', 'ok'],
    ['EST-13', 'idle'], ['EST-14', 'ok'], ['EST-15', 'ok'], ['EST-16', 'ok'], ['EST-17', 'ok'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, padding: 8, background: '#f5f3ec', borderRadius: 6, border: '1.4px dashed #7a7a7a', position: 'relative' }}>
      {/* zones overlay labels */}
      <div style={{ position: 'absolute', top: -10, left: 10, background: '#fdfcf8', padding: '0 6px', fontFamily: 'Caveat', fontSize: 13, color: '#7a7a7a' }}>
        Setor A · estamparia
      </div>
      {tiles.map((t, i) => {
        if (!t[0]) return <div key={i}></div>;
        const [name, st] = t;
        return (
          <div key={i} className={`tile ${st}`} style={{ minHeight: compact ? 44 : 58 }}>
            <div style={{ fontFamily: 'Caveat', fontSize: compact ? 12 : 13, fontWeight: 600 }}>{name}</div>
            {!compact && (
              <div style={{ fontSize: 10, marginTop: 2 }}>
                {st === 'ok' && <span>● operando</span>}
                {st === 'alert' && <span style={{ color: '#d33b2c', fontWeight: 700 }}>⚠ viol.</span>}
                {st === 'idle' && <span>○ parada</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniChart({ bars = [4, 6, 3, 5, 8, 6, 4, 7, 5, 9, 6, 4], color = '#1a1a1a', height = 40 }) {
  const max = Math.max(...bars);
  return (
    <div className="row" style={{ alignItems: 'flex-end', gap: 2, height }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, height: `${(b / max) * 100}%`, background: color, opacity: 0.8, borderRadius: '1px 1px 0 0' }}></div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// V1 — Clássico: sidebar + KPIs + mapa
// ─────────────────────────────────────────────────────────
function GestorV1() {
  return (
    <div className="wf" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fdfcf8' }}>
      <GestorTopbar />
      <div className="row" style={{ flex: 1, minHeight: 0 }}>
        {/* sidebar */}
        <div className="col" style={{ width: 180, padding: 12, borderRight: '1.4px solid #1a1a1a', gap: 4, background: '#f5f3ec' }}>
          <div style={{ fontFamily: 'Caveat', fontSize: 14, color: '#7a7a7a' }}>MONITORAR</div>
          {[
            { l: 'Visão geral', a: true },
            { l: 'Mapa da fábrica' },
            { l: 'Câmeras (48)' },
            { l: 'Timeline de incidentes' },
          ].map((it, i) => (
            <div key={i} className={`sidenav-item ${it.a ? 'active' : ''}`}>{it.l}</div>
          ))}
          <div style={{ fontFamily: 'Caveat', fontSize: 14, color: '#7a7a7a', marginTop: 10 }}>ANÁLISE</div>
          {['Ranking', 'Relatórios', 'Exportar'].map((l, i) => (
            <div key={i} className="sidenav-item">{l}</div>
          ))}
          <div style={{ fontFamily: 'Caveat', fontSize: 14, color: '#7a7a7a', marginTop: 10 }}>CONFIG</div>
          {['Equipe & permissões', 'Máquinas & EPIs', 'Tema & marca'].map((l, i) => (
            <div key={i} className="sidenav-item">{l}</div>
          ))}
        </div>

        {/* content */}
        <div className="col" style={{ flex: 1, padding: 16, gap: 14, minHeight: 0, overflow: 'hidden' }}>
          {/* KPI row */}
          <div className="row" style={{ gap: 10 }}>
            {[
              { l: 'conformidade geral', v: '92%', s: '+3pt', c: '#2f7a3f' },
              { l: 'violações hoje', v: '17', s: '-5 vs ontem', c: '#2f7a3f' },
              { l: 'máquinas ativas', v: '42/48', s: '6 paradas', c: '#7a7a7a' },
              { l: 'alertas críticos', v: '2', s: 'ativos agora', c: '#d33b2c' },
            ].map((k, i) => (
              <SketchBox key={i} seed={80 + i} style={{ flex: 1, padding: 10 }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.l}</div>
                <div style={{ fontFamily: 'Caveat', fontSize: 32, fontWeight: 700 }}>{k.v}</div>
                <div style={{ fontSize: 12, color: k.c }}>{k.s}</div>
              </SketchBox>
            ))}
          </div>

          <div className="row" style={{ gap: 14, flex: 1, minHeight: 0 }}>
            {/* mapa */}
            <SketchBox seed={90} amp={1.4} style={{ flex: 2, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
              <div className="between">
                <div>
                  <div style={{ fontFamily: 'Caveat', fontSize: 22 }}>Planta baixa · Galpão 1</div>
                  <div className="muted" style={{ fontSize: 12 }}>clique numa máquina para ver a câmera</div>
                </div>
                <div className="row gap-sm">
                  <span className="tag ok">ok</span>
                  <span className="tag alert">violação</span>
                  <span className="tag">parada</span>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <FloorMap />
              </div>
            </SketchBox>

            {/* right column: timeline + ranking */}
            <div className="col" style={{ flex: 1.1, gap: 14, minHeight: 0 }}>
              <SketchBox seed={91} style={{ padding: 12, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div className="between">
                  <div style={{ fontFamily: 'Caveat', fontSize: 18 }}>Timeline de incidentes</div>
                  <span className="chip">hoje</span>
                </div>
                <Squiggle width={200} />
                <div className="col gap-sm" style={{ marginTop: 8, fontSize: 12, overflow: 'auto', flex: 1 }}>
                  {[
                    { t: '14:28', m: 'EST-03', e: 'capacete ausente', op: 'L. Silva', c: '#d33b2c' },
                    { t: '14:15', m: 'EST-09', e: 'luvas ausentes', op: 'R. Costa', c: '#d33b2c' },
                    { t: '13:47', m: 'EST-03', e: 'regularizado', op: 'L. Silva', c: '#2f7a3f' },
                    { t: '12:02', m: 'EST-11', e: 'óculos ausentes', op: 'P. Lima', c: '#d33b2c' },
                    { t: '11:44', m: 'EST-04', e: 'colete ausente', op: 'M. Rocha', c: '#d33b2c' },
                    { t: '10:20', m: 'EST-02', e: 'capacete ausente', op: 'A. Nunes', c: '#d33b2c' },
                    { t: '09:15', m: 'EST-05', e: 'regularizado', op: 'T. Mendes', c: '#2f7a3f' },
                  ].map((r, i) => (
                    <div key={i} className="row" style={{ gap: 10, borderBottom: '1px dashed #eae6db', paddingBottom: 5 }}>
                      <span className="mono muted" style={{ minWidth: 44 }}>{r.t}</span>
                      <span style={{ minWidth: 52, fontWeight: 600 }}>{r.m}</span>
                      <span style={{ color: r.c, flex: 1 }}>{r.e}</span>
                      <span className="muted">{r.op}</span>
                    </div>
                  ))}
                </div>
              </SketchBox>

              <SketchBox seed={92} style={{ padding: 12 }}>
                <div style={{ fontFamily: 'Caveat', fontSize: 18 }}>Ranking · setores</div>
                <Squiggle width={180} />
                <table className="tbl" style={{ marginTop: 6 }}>
                  <tbody>
                    {[
                      ['Estamparia', '96%', 2],
                      ['Montagem', '92%', 5],
                      ['Pintura', '88%', 7],
                      ['Solda', '81%', 11],
                    ].map((r, i) => (
                      <tr key={i}>
                        <td>{r[0]}</td>
                        <td style={{ width: 60, fontFamily: 'Caveat', fontSize: 16 }}>{r[1]}</td>
                        <td style={{ width: 50, textAlign: 'right' }} className="muted">{r[2]} viol.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SketchBox>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// V2 — Alternativo: mapa protagonista + painel lateral
// ─────────────────────────────────────────────────────────
function GestorV2() {
  return (
    <div className="wf" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f3ec' }}>
      <GestorTopbar title="Mapa da fábrica" />

      {/* tabs */}
      <div className="row" style={{ padding: '0 18px', borderBottom: '1.4px solid #1a1a1a', background: '#fdfcf8' }}>
        {['Mapa', 'Câmeras', 'Timeline', 'Ranking', 'Relatórios', 'Equipe'].map((t, i) => (
          <div key={i} style={{
            padding: '10px 14px',
            fontSize: 14,
            borderBottom: i === 0 ? '3px solid #1a1a1a' : '3px solid transparent',
            fontWeight: i === 0 ? 700 : 400,
            color: i === 0 ? '#1a1a1a' : '#7a7a7a',
            cursor: 'pointer',
          }}>
            {t}
          </div>
        ))}
      </div>

      <div className="row" style={{ flex: 1, padding: 20, gap: 16, minHeight: 0 }}>
        {/* big map */}
        <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div className="between">
            <div>
              <h2>Galpão 1 · visão em tempo real</h2>
              <div className="muted" style={{ fontSize: 13 }}>48 estações · 2 violações ativas · atualizado há 3s</div>
            </div>
            <div className="row gap-sm">
              <span className="chip">Galpão 1</span>
              <span className="chip muted">Galpão 2</span>
              <button className="btn sm ghost">+ layout</button>
            </div>
          </div>
          <SketchBox seed={100} amp={1.8} strokeWidth={2} style={{ flex: 1, padding: 14, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <FloorMap />
            </div>
            <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
              <span className="tag ok">42 ok</span>
              <span className="tag alert">2 violação</span>
              <span className="tag">4 paradas</span>
            </div>
          </SketchBox>
        </div>

        {/* right panel */}
        <div className="col" style={{ width: 340, gap: 14, minHeight: 0 }}>
          <SketchBox seed={101} amp={1.6} strokeWidth={2} style={{ padding: 12, background: '#f4c7c1' }}>
            <div className="row between">
              <div style={{ fontFamily: 'Caveat', fontSize: 20, color: '#d33b2c', fontWeight: 700 }}>⚠ 2 alertas ativos</div>
              <span className="chip alert">agora</span>
            </div>
            <div className="col gap-sm" style={{ marginTop: 10 }}>
              {[
                { m: 'EST-03', op: 'L. Silva', e: 'capacete · 00:42', sec: 'estamparia' },
                { m: 'EST-09', op: 'R. Costa', e: 'luvas · 00:18', sec: 'montagem' },
              ].map((r, i) => (
                <div key={i} style={{ padding: 8, background: '#fdfcf8', border: '1.4px solid #d33b2c', borderRadius: 4 }}>
                  <div className="row between">
                    <span style={{ fontFamily: 'Caveat', fontSize: 16, fontWeight: 700 }}>{r.m}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{r.sec}</span>
                  </div>
                  <div style={{ fontSize: 12 }}>{r.e} · <span className="muted">{r.op}</span></div>
                  <div className="row gap-sm" style={{ marginTop: 6 }}>
                    <button className="btn sm">ver câmera</button>
                    <button className="btn sm ghost">notificar</button>
                  </div>
                </div>
              ))}
            </div>
          </SketchBox>

          <SketchBox seed={102} style={{ padding: 12 }}>
            <div className="between">
              <div style={{ fontFamily: 'Caveat', fontSize: 18 }}>Conformidade · hoje</div>
              <span className="chip">por hora</span>
            </div>
            <Squiggle width={200} />
            <div style={{ fontFamily: 'Caveat', fontSize: 36, fontWeight: 700, marginTop: 4 }}>
              92<span style={{ fontSize: 18 }}>%</span>
              <span style={{ fontSize: 13, color: '#2f7a3f', marginLeft: 8 }}>+3pt</span>
            </div>
            <MiniChart bars={[6, 8, 5, 7, 9, 6, 4, 8, 7, 9, 8, 6]} height={50} />
            <div className="row between muted" style={{ fontSize: 11, marginTop: 4 }}>
              <span>06h</span><span>12h</span><span>18h</span>
            </div>
          </SketchBox>

          <SketchBox seed={103} style={{ padding: 12, flex: 1, minHeight: 0 }}>
            <div style={{ fontFamily: 'Caveat', fontSize: 18 }}>Timeline</div>
            <Squiggle width={120} />
            <div className="col gap-sm" style={{ marginTop: 6, fontSize: 12 }}>
              {[
                { t: '14:28', e: '⚠ EST-03 · capacete' },
                { t: '14:15', e: '⚠ EST-09 · luvas' },
                { t: '13:47', e: '✓ EST-03 · regular.' },
                { t: '12:02', e: '⚠ EST-11 · óculos' },
              ].map((r, i) => (
                <div key={i} className="row" style={{ gap: 8 }}>
                  <span className="mono muted" style={{ minWidth: 40 }}>{r.t}</span>
                  <span>{r.e}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, marginTop: 8 }} className="underline">ver tudo →</div>
          </SketchBox>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// V3 — Ousado: grid modular (bento) + respiro
// ─────────────────────────────────────────────────────────
function GestorV3() {
  return (
    <div className="wf dot" style={{ width: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', background: '#fdfcf8' }}>
      {/* top */}
      <div className="row between" style={{ padding: '18px 28px' }}>
        <div className="row" style={{ gap: 20 }}>
          <CypherLogo />
          <div className="row gap-sm">
            {['visão geral', 'câmeras', 'equipe', 'relatórios'].map((l, i) => (
              <span key={i} className={i === 0 ? 'tag solid' : 'tag'} style={{ fontSize: 13, padding: '4px 12px' }}>{l}</span>
            ))}
          </div>
        </div>
        <div className="row gap-sm">
          <button className="btn sm ghost">⚙ editar painel</button>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a1a1a', color: '#fdfcf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Caveat', fontWeight: 700 }}>JG</div>
        </div>
      </div>

      <div style={{ padding: '0 28px 20px' }}>
        <div className="between">
          <h1 style={{ fontSize: 44 }}>Bom dia, João 👋</h1>
          <div className="sticky" style={{ transform: 'rotate(2deg)' }}>
            hoje: <strong>92%</strong> conformidade · 2 ativos agora
          </div>
        </div>
        <p className="muted" style={{ fontSize: 15 }}>Seu painel hoje · arraste para reorganizar · <span className="underline">personalizar widgets</span></p>
      </div>

      {/* bento grid */}
      <div style={{ padding: '0 28px 28px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, gridAutoRows: 'minmax(120px, auto)' }}>
        {/* big: mapa */}
        <SketchBox seed={200} amp={1.8} strokeWidth={2} style={{ gridColumn: 'span 4', gridRow: 'span 2', padding: 18 }}>
          <div className="between">
            <div>
              <div style={{ fontFamily: 'Caveat', fontSize: 24 }}>Mapa da fábrica</div>
              <div className="muted" style={{ fontSize: 12 }}>48 estações · tempo real</div>
            </div>
            <div className="row gap-sm">
              <span className="tag ok">42</span>
              <span className="tag alert">2</span>
              <span className="tag">4</span>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <FloorMap />
          </div>
        </SketchBox>

        {/* conformidade grande */}
        <SketchBox seed={201} amp={1.6} style={{ gridColumn: 'span 2', padding: 18, background: '#fff089' }}>
          <div className="muted" style={{ fontSize: 11, letterSpacing: 1 }}>CONFORMIDADE · HOJE</div>
          <div style={{ fontFamily: 'Caveat', fontSize: 72, fontWeight: 700, lineHeight: 1 }}>92<span style={{ fontSize: 28 }}>%</span></div>
          <div style={{ color: '#2f7a3f', fontSize: 14, fontWeight: 600 }}>▲ +3pt vs ontem</div>
          <MiniChart bars={[6, 8, 5, 7, 9, 6, 4, 8, 7, 9, 8, 6]} height={44} />
        </SketchBox>

        {/* alertas ativos */}
        <SketchBox seed={202} amp={1.4} style={{ gridColumn: 'span 2', padding: 16, background: '#f4c7c1' }}>
          <div className="row between">
            <div style={{ fontFamily: 'Caveat', fontSize: 20, color: '#d33b2c' }}>⚠ Ativos agora</div>
            <span style={{ fontFamily: 'Caveat', fontSize: 28, color: '#d33b2c', fontWeight: 700 }}>2</span>
          </div>
          <Squiggle width={140} color="#d33b2c" style={{ opacity: 0.5 }} />
          <div className="col gap-sm" style={{ marginTop: 6, fontSize: 12 }}>
            <div className="row between"><span style={{ fontWeight: 700 }}>EST-03</span><span>capacete · 00:42</span></div>
            <div className="row between"><span style={{ fontWeight: 700 }}>EST-09</span><span>luvas · 00:18</span></div>
          </div>
        </SketchBox>

        {/* ranking setores */}
        <SketchBox seed={203} style={{ gridColumn: 'span 2', padding: 16 }}>
          <div style={{ fontFamily: 'Caveat', fontSize: 20 }}>Ranking · setores</div>
          <Squiggle width={140} />
          <table className="tbl" style={{ marginTop: 6 }}>
            <tbody>
              {[['Estamparia', '96%'], ['Montagem', '92%'], ['Pintura', '88%'], ['Solda', '81%']].map((r, i) => (
                <tr key={i}><td>{r[0]}</td><td style={{ fontFamily: 'Caveat', fontSize: 16, textAlign: 'right' }}>{r[1]}</td></tr>
              ))}
            </tbody>
          </table>
        </SketchBox>

        {/* violações por EPI */}
        <SketchBox seed={204} style={{ gridColumn: 'span 2', padding: 16 }}>
          <div style={{ fontFamily: 'Caveat', fontSize: 20 }}>Violações por EPI</div>
          <Squiggle width={160} />
          <div className="col gap-sm" style={{ marginTop: 8 }}>
            {[
              { k: 'capacete', n: 8 },
              { k: 'luvas', n: 5 },
              { k: 'oculos', n: 3 },
              { k: 'colete', n: 1 },
              { k: 'botas', n: 0 },
            ].map((r) => {
              const Ic = EPI_ICONS[r.k];
              return (
                <div key={r.k} className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <Ic size={18} />
                  <span style={{ fontSize: 13, width: 60 }}>{EPI_LABELS[r.k]}</span>
                  <div style={{ flex: 1, height: 8, background: '#eae6db', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(r.n / 8) * 100}%`, height: '100%', background: r.n > 0 ? '#d33b2c' : '#c8e2c8' }}></div>
                  </div>
                  <span className="mono" style={{ fontSize: 12, minWidth: 18, textAlign: 'right' }}>{r.n}</span>
                </div>
              );
            })}
          </div>
        </SketchBox>

        {/* top câmeras */}
        <SketchBox seed={205} style={{ gridColumn: 'span 2', padding: 14 }}>
          <div className="between">
            <div style={{ fontFamily: 'Caveat', fontSize: 20 }}>Câmeras · atenção</div>
            <span className="chip">2</span>
          </div>
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <div style={{ flex: 1, aspectRatio: '16/10' }}>
              <FakeFeed label="EST-03" alert={true} personPose="no-helmet" style={{ width: '100%', height: '100%' }} />
            </div>
            <div style={{ flex: 1, aspectRatio: '16/10' }}>
              <FakeFeed label="EST-09" alert={true} personPose="no-helmet" style={{ width: '100%', height: '100%' }} />
            </div>
          </div>
        </SketchBox>

        {/* timeline */}
        <SketchBox seed={206} style={{ gridColumn: 'span 4', padding: 16 }}>
          <div className="between">
            <div style={{ fontFamily: 'Caveat', fontSize: 20 }}>Timeline · hoje</div>
            <span className="chip">24 abr · todas máquinas</span>
          </div>
          <Squiggle width={200} />
          <div style={{ position: 'relative', height: 60, marginTop: 10, borderTop: '1.4px solid #1a1a1a', borderBottom: '1.4px dashed #7a7a7a' }}>
            {/* hour ticks */}
            {[0, 4, 8, 12, 16, 20, 24].map((h, i) => (
              <div key={i} style={{ position: 'absolute', left: `${(h / 24) * 100}%`, top: 0, bottom: 0, borderLeft: '1px dashed #eae6db' }}>
                <span style={{ position: 'absolute', top: -18, fontSize: 11 }} className="muted">{String(h).padStart(2, '0')}h</span>
              </div>
            ))}
            {/* incidents */}
            {[
              { h: 9.2, c: '#2f7a3f' },
              { h: 10.3, c: '#d33b2c' },
              { h: 11.7, c: '#d33b2c' },
              { h: 12.0, c: '#d33b2c' },
              { h: 13.8, c: '#2f7a3f' },
              { h: 14.2, c: '#d33b2c' },
              { h: 14.5, c: '#d33b2c' },
            ].map((it, i) => (
              <div key={i} style={{ position: 'absolute', left: `${(it.h / 24) * 100}%`, top: 18, width: 10, height: 28, background: it.c, borderRadius: 2, transform: 'translateX(-5px)' }}></div>
            ))}
            {/* now */}
            <div style={{ position: 'absolute', left: `${(14.5 / 24) * 100}%`, top: -4, bottom: -4, borderLeft: '2px solid #1a1a1a' }}>
              <span style={{ position: 'absolute', top: -16, left: 4, fontFamily: 'Caveat', fontSize: 13 }}>agora</span>
            </div>
          </div>
          <div className="row gap-sm muted" style={{ fontSize: 12, marginTop: 14 }}>
            <span>● violações</span><span style={{ color: '#2f7a3f' }}>● regularizados</span>
            <span className="grow"></span>
            <span className="underline">ver detalhado →</span>
          </div>
        </SketchBox>

        {/* equipe */}
        <SketchBox seed={207} style={{ gridColumn: 'span 2', padding: 14 }}>
          <div style={{ fontFamily: 'Caveat', fontSize: 20 }}>Equipe · conformidade</div>
          <Squiggle width={140} />
          <div className="col gap-sm" style={{ marginTop: 8, fontSize: 13 }}>
            {[
              ['M. Rocha', '98%', '#2f7a3f'],
              ['A. Nunes', '95%', '#2f7a3f'],
              ['L. Silva', '87%', '#7a7a7a'],
              ['R. Costa', '79%', '#d33b2c'],
            ].map((r, i) => (
              <div key={i} className="row between" style={{ padding: '4px 0', borderBottom: '1px dashed #eae6db' }}>
                <div className="row gap-sm">
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#1a1a1a', color: '#fdfcf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: 'Caveat', fontWeight: 700 }}>{r[0].split(' ').map(s => s[0]).join('')}</div>
                  <span>{r[0]}</span>
                </div>
                <span style={{ color: r[2], fontFamily: 'Caveat', fontSize: 16 }}>{r[1]}</span>
              </div>
            ))}
          </div>
        </SketchBox>
      </div>
    </div>
  );
}

Object.assign(window, { GestorV1, GestorV2, GestorV3, FloorMap });
