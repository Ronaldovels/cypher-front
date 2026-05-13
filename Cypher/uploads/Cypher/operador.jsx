// Operador wireframes — 3 variações
// V1 · Clássico — sidebar + feed protagonista + checklist lateral (denso)
// V2 · Alternativo — topbar + feed ocupa tela + EPIs no rodapé (respiro)
// V3 · Ousado — ambient / full-bleed feed, overlay minimal, modo kiosk

function OpStatusBar({ alert = false }) {
  return (
    <div className="row between" style={{ padding: '6px 12px', borderBottom: '1.4px solid #1a1a1a', fontSize: 13, background: '#fdfcf8' }}>
      <div className="row gap-sm">
        <CypherLogo small />
        <span className="muted">/ EST-04 · Esteira de montagem</span>
      </div>
      <div className="row gap-sm">
        <span className={`tag ${alert ? 'alert' : 'ok'}`}>{alert ? '⚠ violação' : '● operando'}</span>
        <span className="chip">Turno noturno · 22:00→06:00</span>
        <span className="chip mono">14:32</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// V1 — Clássico (sidebar + feed + checklist lateral)
// ─────────────────────────────────────────────────────────
function OperadorV1({ alert = false }) {
  return (
    <div className="wf" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fdfcf8' }}>
      <OpStatusBar alert={alert} />
      <div className="row" style={{ flex: 1, alignItems: 'stretch', minHeight: 0 }}>
        {/* sidebar */}
        <div className="col" style={{ width: 160, padding: 12, borderRight: '1.4px solid #1a1a1a', gap: 4, background: '#f5f3ec' }}>
          <div style={{ fontFamily: 'Caveat, cursive', fontSize: 16, color: '#7a7a7a', marginBottom: 4 }}>menu</div>
          {[
            { i: '●', l: 'Ao vivo', active: true },
            { i: '⟲', l: 'Histórico' },
            { i: '⚑', l: 'Alertas' },
            { i: '⚙', l: 'Ajustes' },
          ].map((it, i) => (
            <div key={i} className={`sidenav-item ${it.active ? 'active' : ''}`}>
              <span>{it.i}</span>
              <span>{it.l}</span>
            </div>
          ))}
          <div style={{ flex: 1 }}></div>
          <SketchBox seed={3} style={{ padding: 8 }}>
            <div className="row gap-sm">
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a1a1a', color: '#fdfcf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Caveat', fontWeight: 700 }}>MR</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>M. Rocha</div>
                <div className="muted" style={{ fontSize: 11 }}>ID · 00241</div>
              </div>
            </div>
          </SketchBox>
        </div>

        {/* center: feed */}
        <div className="col" style={{ flex: 1, padding: 14, gap: 12 }}>
          <SketchBox seed={4} amp={1.6} style={{ padding: 8, flex: 1 }}>
            <FakeFeed alert={alert} label="EST-04" personPose={alert ? 'no-helmet' : 'ok'} style={{ width: '100%', height: '100%', minHeight: 260 }} />
          </SketchBox>

          <div className="row gap-sm" style={{ alignItems: 'stretch' }}>
            <SketchBox seed={5} style={{ flex: 1, padding: 10 }}>
              <div className="muted" style={{ fontSize: 11 }}>CONFORMIDADE · TURNO</div>
              <div style={{ fontFamily: 'Caveat', fontSize: 32, fontWeight: 700 }}>94<span style={{ fontSize: 18 }}>%</span></div>
              <div className="progress"><i style={{ width: '94%' }}></i></div>
            </SketchBox>
            <SketchBox seed={6} style={{ flex: 1, padding: 10 }}>
              <div className="muted" style={{ fontSize: 11 }}>EVENTOS</div>
              <div style={{ fontFamily: 'Caveat', fontSize: 32, fontWeight: 700 }}>3</div>
              <div style={{ fontSize: 12 }}>últ: capacete · 21:47</div>
            </SketchBox>
            <SketchBox seed={7} style={{ flex: 1, padding: 10 }}>
              <div className="muted" style={{ fontSize: 11 }}>MÁQUINA</div>
              <div className="row gap-sm" style={{ marginTop: 4 }}>
                <span className={`dot ${alert ? 'alert' : 'ok'}`}></span>
                <span style={{ fontFamily: 'Caveat', fontSize: 20 }}>{alert ? 'pausada' : 'operando'}</span>
              </div>
              <div style={{ fontSize: 12 }} className="muted">
                {alert ? 'aguardando liberação' : 'ciclo #2.341'}
              </div>
            </SketchBox>
          </div>
        </div>

        {/* right: checklist + history */}
        <div className="col" style={{ width: 240, padding: 12, gap: 12, borderLeft: '1.4px solid #1a1a1a', background: '#f5f3ec' }}>
          <div>
            <div className="row between">
              <div style={{ fontFamily: 'Caveat, cursive', fontSize: 18 }}>EPIs detectados</div>
              {alert && <span className="tag alert">ação!</span>}
            </div>
            <Squiggle width={200} />
            <div className="col gap-sm" style={{ marginTop: 8 }}>
              <EpiRow direction="column" items={[
                { key: 'capacete', ok: !alert },
                { key: 'oculos', ok: true },
                { key: 'luvas', ok: true },
                { key: 'colete', ok: true },
                { key: 'botas', ok: true },
              ]} />
            </div>
          </div>

          <div>
            <div style={{ fontFamily: 'Caveat, cursive', fontSize: 18 }}>Histórico do turno</div>
            <Squiggle width={160} />
            <div className="col gap-sm" style={{ marginTop: 8, fontSize: 12 }}>
              {[
                { t: '22:04', e: '✓ Início de turno', ok: true },
                { t: '22:47', e: '✗ Capacete · 4s', ok: false },
                { t: '23:10', e: '✓ Regularizado', ok: true },
                { t: '00:32', e: '✗ Luvas · 2s', ok: false },
                { t: '01:05', e: '✓ Regularizado', ok: true },
              ].map((r, i) => (
                <div key={i} className="row between">
                  <span className="mono muted">{r.t}</span>
                  <span style={{ color: r.ok ? '#2f7a3f' : '#d33b2c', textAlign: 'right', flex: 1 }}>{r.e}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// V2 — Alternativo (topbar, feed grande, EPIs no rodapé)
// ─────────────────────────────────────────────────────────
function OperadorV2({ alert = false }) {
  return (
    <div className="wf" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fdfcf8' }}>
      {/* topbar */}
      <div className="row between" style={{ padding: '10px 18px', borderBottom: '2px solid #1a1a1a' }}>
        <div className="row" style={{ gap: 20 }}>
          <CypherLogo small />
          <div className="row gap-sm" style={{ fontSize: 14 }}>
            <span style={{ fontFamily: 'Caveat', fontSize: 18 }}>EST-04</span>
            <span className="muted">·</span>
            <span>Esteira de montagem</span>
          </div>
        </div>
        <div className="row" style={{ gap: 18 }}>
          <span className="chip">turno noturno</span>
          <div className="row gap-sm">
            <span className={`dot ${alert ? 'alert' : 'ok'}`}></span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{alert ? 'violação detectada' : 'tudo certo'}</span>
          </div>
          <div className="row gap-sm">
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#1a1a1a', color: '#fdfcf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: 'Caveat', fontWeight: 700 }}>MR</div>
            <span style={{ fontSize: 13 }}>M. Rocha</span>
          </div>
        </div>
      </div>

      {/* main */}
      <div className="col" style={{ flex: 1, padding: 24, gap: 16, minHeight: 0 }}>
        <div className="row" style={{ flex: 1, gap: 20, minHeight: 0, alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SketchBox seed={20} amp={1.8} strokeWidth={2} style={{ padding: 10, height: '100%' }}>
              <FakeFeed alert={alert} label="EST-04 · CAM-01" personPose={alert ? 'no-helmet' : 'ok'} style={{ width: '100%', height: '100%', minHeight: 320 }} />
            </SketchBox>
          </div>

          <div className="col" style={{ width: 260, gap: 12 }}>
            {alert ? (
              <SketchBox seed={21} amp={1.6} strokeWidth={2.4} style={{ padding: 14, background: '#f4c7c1', border: 'none' }}>
                <div style={{ fontFamily: 'Caveat', fontSize: 28, color: '#d33b2c', fontWeight: 700 }}>⚠ Alerta</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>Capacete ausente</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Máquina pausada há 00:04</div>
                <div className="col gap-sm" style={{ marginTop: 10 }}>
                  <button className="btn primary" style={{ width: '100%' }}>Coloquei o EPI ✓</button>
                  <button className="btn ghost sm" style={{ width: '100%' }}>Chamar supervisor</button>
                </div>
              </SketchBox>
            ) : (
              <SketchBox seed={21} style={{ padding: 14, background: '#c8e2c8' }}>
                <div style={{ fontFamily: 'Caveat', fontSize: 24, color: '#2f7a3f', fontWeight: 700 }}>● Tudo certo</div>
                <div style={{ fontSize: 13 }}>Todos os EPIs em conformidade.</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Próxima verificação automática em 2s</div>
              </SketchBox>
            )}

            <SketchBox seed={22} style={{ padding: 12, flex: 1 }}>
              <div className="between">
                <div style={{ fontFamily: 'Caveat', fontSize: 18 }}>Turno</div>
                <span className="chip mono">22:00 → 06:00</span>
              </div>
              <Squiggle width={180} />
              <div className="row gap-sm" style={{ marginTop: 10 }}>
                <div style={{ flex: 1 }}>
                  <div className="muted" style={{ fontSize: 11 }}>conformidade</div>
                  <div style={{ fontFamily: 'Caveat', fontSize: 28, fontWeight: 700 }}>94%</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="muted" style={{ fontSize: 11 }}>violações</div>
                  <div style={{ fontFamily: 'Caveat', fontSize: 28, fontWeight: 700 }}>3</div>
                </div>
              </div>
              <div style={{ fontSize: 12, marginTop: 10 }} className="muted">
                última há 2h · <span className="underline">ver histórico</span>
              </div>
            </SketchBox>
          </div>
        </div>

        {/* bottom: EPIs */}
        <SketchBox seed={23} style={{ padding: 14 }}>
          <div className="between" style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: 'Caveat', fontSize: 20 }}>EPIs desta estação</div>
            <span className="muted" style={{ fontSize: 12 }}>detectado há 0.3s</span>
          </div>
          <div className="row" style={{ gap: 14, justifyContent: 'space-around' }}>
            {[
              { k: 'capacete', ok: !alert },
              { k: 'oculos', ok: true },
              { k: 'luvas', ok: true },
              { k: 'colete', ok: true },
              { k: 'botas', ok: true },
            ].map((it, i) => {
              const Ic = EPI_ICONS[it.k];
              return (
                <div key={i} className="col" style={{ alignItems: 'center', gap: 4, flex: 1 }}>
                  <Ic size={44} ok={it.ok} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: it.ok ? '#2f7a3f' : '#d33b2c' }}>
                    {EPI_LABELS[it.k]}
                  </div>
                  <div style={{ fontSize: 11 }} className="muted">
                    {it.ok ? '✓ conforme' : '✗ ausente'}
                  </div>
                </div>
              );
            })}
          </div>
        </SketchBox>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// V3 — Ousado / Kiosk (feed fullbleed, overlays mínimos)
// ─────────────────────────────────────────────────────────
function OperadorV3({ alert = false }) {
  return (
    <div className="wf" style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0a0a', overflow: 'hidden' }}>
      {/* fullbleed feed */}
      <FakeFeed alert={alert} label="EST-04" personPose={alert ? 'no-helmet' : 'ok'} style={{ position: 'absolute', inset: 0, border: 'none', outline: 'none' }} />

      {/* top overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(180deg, rgba(0,0,0,0.7), transparent)', color: '#fdfcf8' }}>
        <div className="row" style={{ gap: 14, color: '#fdfcf8' }}>
          <CypherMark size={26} />
          <div>
            <div style={{ fontFamily: 'Caveat', fontSize: 22, color: '#fdfcf8' }}>EST-04</div>
            <div style={{ fontSize: 12, color: '#c8c8c8' }}>Esteira de montagem · Turno N</div>
          </div>
        </div>
        <div className="row gap-sm">
          <div style={{ color: '#fdfcf8', fontFamily: 'monospace', fontSize: 14, background: 'rgba(0,0,0,0.4)', padding: '4px 10px', borderRadius: 4 }}>
            M. Rocha · 14:32
          </div>
        </div>
      </div>

      {/* bottom overlay: big status */}
      <div style={{ position: 'absolute', bottom: 30, left: 30, right: 30, display: 'flex', gap: 20, alignItems: 'flex-end' }}>
        {alert ? (
          <div style={{ flex: 1, background: 'rgba(211,59,44,0.95)', color: '#fdfcf8', padding: '18px 22px', border: '2px solid #fdfcf8', borderRadius: 8 }}>
            <div style={{ fontFamily: 'Caveat', fontSize: 48, fontWeight: 700, lineHeight: 1 }}>⚠ pare</div>
            <div style={{ fontSize: 18, marginTop: 6 }}>Capacete não detectado.</div>
            <div style={{ fontSize: 14, marginTop: 2, opacity: 0.85 }}>Máquina pausada. Regularize para continuar.</div>
            <div className="row gap-sm" style={{ marginTop: 12 }}>
              <button className="btn primary" style={{ background: '#fdfcf8', color: '#d33b2c', border: '2px solid #fdfcf8', boxShadow: 'none' }}>Coloquei ✓</button>
              <button className="btn ghost" style={{ color: '#fdfcf8', borderColor: '#fdfcf8' }}>Chamar supervisor</button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, color: '#fdfcf8' }}>
            <div style={{ fontFamily: 'Caveat', fontSize: 56, fontWeight: 700, lineHeight: 1, textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
              tudo ok
            </div>
            <div style={{ fontSize: 15, opacity: 0.85, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
              5 de 5 EPIs detectados · conformidade 94% no turno
            </div>
          </div>
        )}

        {/* EPI cluster */}
        <div style={{ background: 'rgba(253,252,248,0.95)', padding: 14, borderRadius: 8, border: '2px solid #1a1a1a', display: 'flex', gap: 14 }}>
          {[
            { k: 'capacete', ok: !alert },
            { k: 'oculos', ok: true },
            { k: 'luvas', ok: true },
            { k: 'colete', ok: true },
            { k: 'botas', ok: true },
          ].map((it, i) => {
            const Ic = EPI_ICONS[it.k];
            return (
              <div key={i} className="col" style={{ alignItems: 'center', gap: 2 }}>
                <Ic size={32} ok={it.ok} />
                <div style={{ fontSize: 11, color: it.ok ? '#2f7a3f' : '#d33b2c', fontWeight: 700 }}>
                  {it.ok ? '✓' : '✗'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* right side: ticker */}
      <div style={{ position: 'absolute', top: 90, right: 20, width: 220, background: 'rgba(10,10,10,0.7)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, padding: 12, color: '#fdfcf8' }}>
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.7 }}>HISTÓRICO · TURNO</div>
        <Squiggle width={180} color="#fdfcf8" style={{ opacity: 0.4, margin: '4px 0' }} />
        <div className="col" style={{ gap: 6, fontSize: 12, marginTop: 4 }}>
          {[
            { t: '22:04', e: '✓ início', c: '#8cd0a0' },
            { t: '22:47', e: '✗ capacete', c: '#ff8a7a' },
            { t: '23:10', e: '✓ regularizado', c: '#8cd0a0' },
            { t: '00:32', e: '✗ luvas', c: '#ff8a7a' },
            { t: '01:05', e: '✓ regularizado', c: '#8cd0a0' },
          ].map((r, i) => (
            <div key={i} className="row between" style={{ color: r.c }}>
              <span style={{ fontFamily: 'monospace', opacity: 0.7 }}>{r.t}</span>
              <span>{r.e}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OperadorV1, OperadorV2, OperadorV3 });
