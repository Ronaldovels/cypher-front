// Onboarding wireframes — 3 variations
// V1 · Wizard linear (step-by-step, denso)
// V2 · Checklist não-linear (cards navegáveis em qualquer ordem, respiro)
// V3 · Setup ousado (split-screen com preview ao vivo)

// ─────────────────────────────────────────────────────────
// V1 — Wizard linear clássico
// ─────────────────────────────────────────────────────────
function OnboardingV1({ step = 0 }) {
  const steps = [
    'Empresa',
    'Setores',
    'Máquinas',
    'EPIs p/ máquina',
    'Equipe',
    'Tema',
  ];
  return (
    <div className="wf paper" style={{ width: '100%', height: '100%', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* top bar */}
      <div className="between">
        <CypherLogo />
        <div className="row gap-sm">
          <span className="muted" style={{ fontSize: 13 }}>Configuração inicial</span>
          <span className="tag">passo {step + 1} de {steps.length}</span>
        </div>
      </div>

      {/* stepper */}
      <div className="row" style={{ gap: 0, padding: '8px 0' }}>
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div className="col" style={{ alignItems: 'center', gap: 4, minWidth: 70 }}>
              <span className={`step ${i < step ? 'done' : i === step ? 'current' : ''}`}>
                {i < step ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: 12, color: i === step ? '#1a1a1a' : '#7a7a7a', textAlign: 'center' }}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < step ? '#1a1a1a' : '#eae6db', marginTop: -14, borderRadius: 2 }}></div>
            )}
          </React.Fragment>
        ))}
      </div>

      <Squiggle width={800} style={{ width: '100%', opacity: 0.4 }} />

      {/* main content: step 3 (EPIs por máquina) */}
      <div className="row gap-lg" style={{ flex: 1, alignItems: 'stretch' }}>
        <div className="col" style={{ flex: 1.3 }}>
          <h2>Defina os EPIs obrigatórios por máquina</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            Selecione as máquinas à esquerda e marque os EPIs exigidos. <span className="mark">Pode ser aplicado em lote.</span>
          </p>

          <div className="row" style={{ flex: 1, alignItems: 'stretch', gap: 12 }}>
            {/* machine list */}
            <SketchBox seed={11} style={{ width: 180, padding: 10 }}>
              <div style={{ fontFamily: 'Caveat, cursive', fontSize: 16, marginBottom: 6 }}>Máquinas</div>
              {['EST-01 · Prensa', 'EST-02 · Fresa', 'EST-03 · Solda', 'EST-04 · Esteira', 'EST-05 · Corte'].map((m, i) => (
                <div key={i} className="row" style={{ padding: '5px 4px', borderBottom: '1px dashed #eae6db', fontSize: 13 }}>
                  <input type="checkbox" defaultChecked={i < 2} style={{ accentColor: '#1a1a1a' }} />
                  <span>{m}</span>
                </div>
              ))}
              <button className="btn sm ghost" style={{ marginTop: 8, width: '100%' }}>+ adicionar</button>
            </SketchBox>

            {/* epi grid */}
            <SketchBox seed={22} style={{ flex: 1, padding: 14 }}>
              <div className="between" style={{ marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'Caveat, cursive', fontSize: 18, fontWeight: 700 }}>EST-01 · Prensa Hidráulica</div>
                  <div className="muted" style={{ fontSize: 12 }}>Setor: Estamparia · Turno: 24h</div>
                </div>
                <span className="tag brand">preset: metalurgia</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                {['capacete', 'oculos', 'luvas', 'colete', 'botas'].map((k, i) => {
                  const active = i !== 3;
                  const Ic = EPI_ICONS[k];
                  return (
                    <SketchBox key={k} seed={40 + i} amp={1.0} style={{ padding: 10, opacity: active ? 1 : 0.4, background: active ? '#fff089' : '#fdfcf8' }}>
                      <div className="col" style={{ alignItems: 'center', gap: 4 }}>
                        <Ic size={34} />
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{EPI_LABELS[k]}</span>
                        <span style={{ fontSize: 10, color: active ? '#1a1a1a' : '#7a7a7a' }}>
                          {active ? '✓ obrigatório' : 'opcional'}
                        </span>
                      </div>
                    </SketchBox>
                  );
                })}
              </div>

              <div className="scribble" style={{ margin: '16px 0' }}></div>

              <div className="col gap-sm">
                <div className="row between">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Regras de alerta</span>
                  <span className="chip">OK / violação</span>
                </div>
                <label className="row" style={{ fontSize: 13 }}>
                  <input type="checkbox" defaultChecked /> Pausar máquina em violação crítica
                </label>
                <label className="row" style={{ fontSize: 13 }}>
                  <input type="checkbox" defaultChecked /> Notificar gestor via e-mail
                </label>
                <label className="row" style={{ fontSize: 13 }}>
                  <input type="checkbox" /> Tocar alarme sonoro no local
                </label>
              </div>
            </SketchBox>
          </div>
        </div>

        {/* side helper */}
        <div className="col" style={{ width: 220 }}>
          <SketchBox seed={33} style={{ padding: 12 }}>
            <div style={{ fontFamily: 'Caveat, cursive', fontSize: 18, marginBottom: 6 }}>💡 Dica</div>
            <p style={{ fontSize: 13, margin: 0 }}>
              Use <span className="mark">presets por indústria</span> para começar rápido. Você pode customizar depois.
            </p>
          </SketchBox>
          <div className="sticky">
            "Em lote: selecione várias máquinas para aplicar os mesmos EPIs de uma só vez."
          </div>
          <div style={{ fontSize: 12, color: '#7a7a7a' }}>
            <div style={{ fontFamily: 'Caveat, cursive', fontSize: 16, color: '#1a1a1a' }}>Progresso</div>
            <div className="progress" style={{ margin: '6px 0' }}>
              <i style={{ width: '58%' }}></i>
            </div>
            58% · ~3 min restantes
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="between" style={{ borderTop: '1.6px solid #1a1a1a', paddingTop: 12 }}>
        <button className="btn ghost">← voltar</button>
        <div className="row gap-sm">
          <button className="btn sm ghost">pular</button>
          <button className="btn primary">avançar →</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// V2 — Checklist não-linear (cards independentes)
// ─────────────────────────────────────────────────────────
function OnboardingV2({ step = 0 }) {
  // step controla "qual card está expandido"
  const cards = [
    { k: 'empresa', title: 'Empresa & setores', desc: 'Nome, CNPJ, setores e turnos', est: '2 min', done: true },
    { k: 'maquinas', title: 'Máquinas / estações', desc: 'Cadastre os pontos de detecção', est: '5 min', done: true },
    { k: 'epis', title: 'EPIs por máquina', desc: 'Quais EPIs cada máquina exige', est: '6 min', done: false, current: true },
    { k: 'equipe', title: 'Operadores & gestores', desc: 'Convide pessoas por e-mail', est: '3 min', done: false },
    { k: 'tema', title: 'Tema & marca', desc: 'Cores, logo, modo claro/escuro', est: '2 min', done: false },
  ];
  const currentKey = cards[Math.min(step, cards.length - 1)].k;

  return (
    <div className="wf dot" style={{ width: '100%', height: '100%', padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="between">
        <div className="row gap-sm">
          <CypherLogo />
          <span className="muted" style={{ fontSize: 13 }}>/ configurar fábrica</span>
        </div>
        <div className="row gap-sm">
          <span className="tag ok">2 de 5 prontos</span>
          <button className="btn sm ghost">salvar & sair</button>
        </div>
      </div>

      <div>
        <h1 style={{ fontSize: 38 }}>Bem-vindo, Acme Indústrias 👷</h1>
        <p className="muted" style={{ fontSize: 15, maxWidth: 620 }}>
          Faça a configuração na ordem que preferir. Quando tudo estiver verde, sua fábrica está pronta para detectar.
        </p>
      </div>

      {/* cards list */}
      <div className="col gap-sm" style={{ flex: '0 0 auto' }}>
        {cards.map((c, i) => {
          const expanded = c.k === currentKey;
          return (
            <SketchBox
              key={c.k}
              seed={50 + i}
              amp={1.1}
              style={{
                padding: 14,
                background: c.done ? '#f0f4ec' : expanded ? '#fff089' : '#fdfcf8',
              }}
            >
              <div className="between">
                <div className="row" style={{ gap: 12 }}>
                  <span
                    className="step"
                    style={{
                      background: c.done ? '#2f7a3f' : expanded ? '#1a1a1a' : '#fdfcf8',
                      color: c.done || expanded ? '#fff' : '#1a1a1a',
                      borderColor: c.done ? '#2f7a3f' : '#1a1a1a',
                      width: 28,
                      height: 28,
                      fontSize: 15,
                    }}
                  >
                    {c.done ? '✓' : i + 1}
                  </span>
                  <div>
                    <div style={{ fontFamily: 'Caveat, cursive', fontSize: 22, fontWeight: 700 }}>{c.title}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{c.desc} · ~{c.est}</div>
                  </div>
                </div>
                <div className="row gap-sm">
                  {c.done && <span className="tag ok">pronto</span>}
                  {expanded && <span className="tag">editando</span>}
                  <button className="btn sm">{c.done ? 'editar' : expanded ? 'fechar' : 'abrir'}</button>
                </div>
              </div>

              {expanded && c.k === 'epis' && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1.4px dashed #1a1a1a' }}>
                  <div className="row between" style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 14 }}>
                      Máquinas: <strong>EST-01, EST-02, EST-03</strong> <span className="muted">(+2)</span>
                    </span>
                    <span className="chip">aplicar em lote ✓</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                    {['capacete', 'oculos', 'luvas', 'colete', 'botas'].map((k, j) => {
                      const Ic = EPI_ICONS[k];
                      const on = j !== 3;
                      return (
                        <div
                          key={k}
                          style={{
                            border: `1.6px ${on ? 'solid' : 'dashed'} ${on ? '#1a1a1a' : '#7a7a7a'}`,
                            borderRadius: 6,
                            padding: 10,
                            textAlign: 'center',
                            background: on ? '#fdfcf8' : 'transparent',
                            opacity: on ? 1 : 0.55,
                          }}
                        >
                          <Ic size={28} />
                          <div style={{ fontSize: 12, marginTop: 4 }}>{EPI_LABELS[k]}</div>
                          <div style={{ fontSize: 10, color: on ? '#2f7a3f' : '#7a7a7a', marginTop: 2 }}>
                            {on ? 'ON' : 'off'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="row between" style={{ marginTop: 12 }}>
                    <label className="row" style={{ fontSize: 13 }}>
                      <input type="checkbox" defaultChecked /> Pausar máquina em violação
                    </label>
                    <button className="btn sm primary">salvar</button>
                  </div>
                </div>
              )}
            </SketchBox>
          );
        })}
      </div>

      <div className="between">
        <span className="muted" style={{ fontSize: 13 }}>
          Você pode voltar e ajustar qualquer etapa a qualquer momento.
        </span>
        <button className="btn primary">ir para o painel →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// V3 — Split screen: form + preview ao vivo
// ─────────────────────────────────────────────────────────
function OnboardingV3({ step = 0 }) {
  return (
    <div className="wf" style={{ width: '100%', height: '100%', display: 'flex' }}>
      {/* left: form */}
      <div className="col" style={{ flex: 1, padding: 30, gap: 18, background: '#fdfcf8', borderRight: '1.6px solid #1a1a1a' }}>
        <div className="between">
          <CypherLogo />
          <div className="row gap-sm">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="step" style={{ width: 18, height: 18, fontSize: 10, background: i <= step ? '#1a1a1a' : '#fdfcf8', color: i <= step ? '#fff' : '#1a1a1a' }}>
                {i + 1}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 13, letterSpacing: 1 }}>ETAPA 3 · EPIs POR MÁQUINA</div>
          <h1 style={{ fontSize: 42, margin: '6px 0' }}>O que cada posto precisa vestir?</h1>
          <p className="muted" style={{ fontSize: 15, maxWidth: 460 }}>
            Selecione os EPIs obrigatórios. O preview à direita mostra como a detecção vai se comportar.
          </p>
        </div>

        <div className="col gap-sm">
          <div style={{ fontFamily: 'Caveat, cursive', fontSize: 18 }}>Selecione a máquina</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {['EST-01', 'EST-02', 'EST-03', 'EST-04'].map((m, i) => (
              <span key={i} className={`tag ${i === 0 ? 'solid' : ''}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                {m}
              </span>
            ))}
            <span className="tag" style={{ borderStyle: 'dashed' }}>+ nova</span>
          </div>
        </div>

        <div className="col gap-sm">
          <div style={{ fontFamily: 'Caveat, cursive', fontSize: 18 }}>EPIs obrigatórios</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {['capacete', 'oculos', 'luvas', 'colete', 'botas'].map((k, i) => {
              const Ic = EPI_ICONS[k];
              const on = i !== 3;
              return (
                <SketchBox
                  key={k}
                  seed={70 + i}
                  amp={on ? 1.3 : 0.8}
                  strokeWidth={on ? 2 : 1.3}
                  dashed={!on}
                  style={{
                    padding: 12,
                    background: on ? '#fff089' : 'transparent',
                    textAlign: 'center',
                  }}
                >
                  <Ic size={32} />
                  <div style={{ fontSize: 12, marginTop: 4, fontWeight: on ? 700 : 400 }}>{EPI_LABELS[k]}</div>
                  <div style={{ fontSize: 10, color: on ? '#2f7a3f' : '#7a7a7a' }}>
                    {on ? 'obrigatório' : 'toque p/ ativar'}
                  </div>
                </SketchBox>
              );
            })}
          </div>
        </div>

        <div className="col gap-sm">
          <div style={{ fontFamily: 'Caveat, cursive', fontSize: 18 }}>Ação em violação</div>
          <div className="row gap-sm">
            <span className="tag solid" style={{ fontSize: 13 }}>pausar máquina</span>
            <span className="tag" style={{ fontSize: 13 }}>notificar gestor</span>
            <span className="tag" style={{ fontSize: 13 }}>alarme sonoro</span>
            <span className="tag" style={{ fontSize: 13, borderStyle: 'dashed' }}>+</span>
          </div>
        </div>

        <div style={{ flex: 1 }}></div>

        <div className="between">
          <button className="btn ghost">← setor anterior</button>
          <button className="btn primary">continuar →</button>
        </div>
      </div>

      {/* right: live preview */}
      <div style={{ flex: 1.1, background: '#e8e4d8', padding: 30, position: 'relative' }}>
        <div className="between" style={{ marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: 'Caveat, cursive', fontSize: 22 }}>Preview ao vivo</div>
            <div className="muted" style={{ fontSize: 12 }}>EST-01 · Prensa Hidráulica</div>
          </div>
          <span className="tag brand">teste de detecção</span>
        </div>

        <SketchBox seed={99} amp={1.6} style={{ padding: 10, background: '#fdfcf8' }}>
          <FakeFeed label="EST-01" alert={false} style={{ aspectRatio: '16 / 10', width: '100%' }} />
          <div style={{ marginTop: 10 }}>
            <EpiRow
              items={[
                { key: 'capacete', ok: true },
                { key: 'oculos', ok: true },
                { key: 'luvas', ok: true },
                { key: 'colete', ok: true, off: true },
                { key: 'botas', ok: true },
              ]}
              size={22}
            />
          </div>
        </SketchBox>

        <div className="sticky" style={{ position: 'absolute', top: 120, right: 30, width: 200, transform: 'rotate(3deg)' }}>
          <strong>Colete desativado</strong> — não será verificado nesta máquina.
        </div>

        <div style={{ marginTop: 18 }}>
          <Squiggle width={200} />
          <div style={{ marginTop: 10, fontFamily: 'Caveat, cursive', fontSize: 18 }}>Simulação do alerta</div>
          <SketchBox seed={111} amp={1.4} style={{ padding: 10, marginTop: 6, background: '#fdfcf8' }}>
            <FakeFeed label="EST-01 · SIMULADO" alert={true} personPose="no-helmet" style={{ aspectRatio: '16 / 6', width: '100%' }} />
          </SketchBox>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Assim o operador verá a violação. Máquina pausa em <span className="mark">2s</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OnboardingV1, OnboardingV2, OnboardingV3 });
