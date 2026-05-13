// Cypher Onboarding — main app

const STEPS = [
  { key: 'identity', name: 'Identidade da empresa', hint: 'Marca · CNPJ · cor' },
  { key: 'epis',     name: 'EPIs monitorados',      hint: 'Seleção dos equipamentos' },
  { key: 'cas',      name: 'CAs e validades',       hint: 'Opcional · certificados' },
  { key: 'launch',   name: 'Confirmação',           hint: 'Revisar e iniciar' },
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showAllSteps": true,
  "compactRail": false
}/*EDITMODE-END*/;

// helpers to compute a soft variant for any hex accent
function hexToRgb(h) {
  const m = h.replace('#','').match(/.{1,2}/g);
  return m && m.length === 3 ? m.map(x => parseInt(x,16)) : [244, 98, 42];
}
function rgba(h, a) { const [r,g,b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function shade(h, pct) {
  const [r,g,b] = hexToRgb(h);
  const f = pct < 0 ? 0 : 255;
  const p = Math.abs(pct);
  const fmt = (c) => Math.round(c + (f - c) * p);
  return `rgb(${fmt(r)},${fmt(g)},${fmt(b)})`;
}

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [direction, setDirection] = React.useState('forward');
  const [step, setStep] = React.useState(0);
  const [launching, setLaunching] = React.useState(false);
  const [launched, setLaunched] = React.useState(false);

  const [data, setDataState] = React.useState({
    company: '',
    cnpj: '',
    sector: '',
    logoUrl: '',
    logoName: '',
    accent: '#F4622A',
    theme: 'dark',
    epis: [],
    cas: {},
  });
  const setData = (patch) => setDataState(prev => ({ ...prev, ...patch }));

  const [errors, setErrors] = React.useState({});

  // Apply dynamic accent + theme to document
  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', data.accent);
    document.documentElement.style.setProperty('--accent-soft', rgba(data.accent, 0.14));
    document.documentElement.style.setProperty('--accent-deep', shade(data.accent, -0.2));
    document.body.className = `theme-${data.theme}`;
  }, [data.accent, data.theme]);

  const validateStep = (s) => {
    const e = {};
    if (s === 0) {
      if (!data.company.trim()) e.company = 'Nome obrigatório';
      if (data.cnpj && data.cnpj.replace(/\D/g,'').length < 14) e.cnpj = 'CNPJ incompleto';
      if (!data.sector) e.sector = 'Selecione um setor';
    }
    if (s === 1) {
      if (data.epis.length === 0) e.epis = 'Selecione pelo menos 1 EPI';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep(step)) return;
    if (step < STEPS.length - 1) {
      setDirection('forward');
      setStep(step + 1);
    }
  };
  const back = () => {
    if (step > 0) {
      setDirection('back');
      setStep(step - 1);
      setErrors({});
    }
  };
  const skip = () => { setDirection('forward'); setStep(step + 1); };

  const launch = () => {
    setLaunching(true);
    setTimeout(() => { setLaunched(true); }, 900);
  };
  const reset = () => {
    setLaunched(false); setLaunching(false); setStep(0);
  };

  // Step content with directional animation
  const stepKey = `${step}-${direction}`;
  const stepClass = direction === 'back' ? 'step-enter-back' : 'step-enter';

  return (
    <div className="app">
      {/* TOP BAR */}
      <div className="topbar">
        <Brand company={data.company} logoUrl={data.logoUrl}/>
        <StepIndicator current={step} total={STEPS.length}/>
        <div style={{ display:'flex', gap:14, alignItems:'center' }}>
          <span className="kicker">Onboarding</span>
          <button className="btn ghost" style={{ padding: '8px 14px' }}>Salvar & sair</button>
        </div>
      </div>

      {/* SHELL */}
      <div className="shell">
        <div className="main" key={stepKey}>
          <div className={stepClass}>
            {step === 0 && <Step1Company  data={data} setData={setData} errors={errors}/>}
            {step === 1 && <Step2EPIs     data={data} setData={setData} errors={errors}/>}
            {step === 2 && <Step3CAs      data={data} setData={setData} onSkip={skip}/>}
            {step === 3 && <Step4Confirm  data={data} onLaunch={launch} launching={launching}/>}
          </div>
        </div>

        <aside className="rail">
          <div className="rail-section">
            <div className="rail-title">Etapas do setup</div>
            <Checklist steps={STEPS} current={step}/>
          </div>

          <div className="rail-section">
            <div className="rail-title">Prévia da identidade</div>
            <div style={{
              border: '1px solid var(--line-2)',
              borderRadius: 12,
              padding: 16,
              background: 'var(--surface)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: data.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                  overflow: 'hidden',
                }}>
                  {data.logoUrl
                    ? <img src={data.logoUrl} style={{width:'100%',height:'100%',objectFit:'contain'}} alt=""/>
                    : (data.company ? data.company.slice(0,1).toUpperCase() : 'C')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing:'-0.01em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {data.company || 'Sua empresa'}
                  </div>
                  <div className="kicker" style={{ fontSize: 10 }}>
                    {data.sector || 'setor pendente'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ height: 6, flex: 1, borderRadius: 3, background: data.accent }}></div>
                <div style={{ height: 6, flex: 1, borderRadius: 3, background: 'var(--line-2)' }}></div>
              </div>
              <div className="kicker" style={{ fontSize: 10 }}>
                {data.epis.length > 0
                  ? `${data.epis.length} epi${data.epis.length === 1 ? '' : 's'} no escopo`
                  : 'Sem EPIs selecionados ainda'}
              </div>
            </div>
          </div>

          {!tweaks.compactRail && (
            <div className="rail-section">
              <div className="rail-title">Suporte</div>
              <div style={{ fontSize: 13, color:'var(--ink-2)', lineHeight: 1.55 }}>
                Dúvidas durante o setup? Documentação completa em <span style={{ color: 'var(--accent)' }}>cypher.app/docs/onboarding</span> ou fale com o time pelo chat na barra inferior.
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* FOOTER NAV */}
      <div className="footer-nav">
        <button className="btn ghost" onClick={back} disabled={step === 0}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Voltar
        </button>
        <div style={{ display:'flex', gap: 12 }}>
          {step === 2 && (
            <button className="btn ghost" onClick={skip}>Pular esta etapa</button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn primary" onClick={next}>
              Continuar
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </button>
          ) : (
            <button className="btn primary" onClick={launch} disabled={launching}>
              {launching ? 'Iniciando…' : 'Iniciar Cypher'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* LAUNCH OVERLAY */}
      {launched && (
        <div className="launch-overlay">
          <div className="lpulse">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
          </div>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div className="eyebrow-accent" style={{ justifyContent: 'center', display:'inline-flex' }}>Cypher · online</div>
            <h2 style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em', margin: '14px 0 8px' }}>
              {data.company || 'Sua planta'} está pronta.
            </h2>
            <p className="sub" style={{ margin:'0 auto' }}>
              Redirecionando para o dashboard em alguns segundos.
            </p>
          </div>
          <div style={{ display:'flex', gap: 12, marginTop: 8 }}>
            <button className="btn" onClick={reset}>Refazer onboarding</button>
            <button className="btn primary">Abrir dashboard →</button>
          </div>
        </div>
      )}

      {/* TWEAKS PANEL */}
      <TweaksPanel title="Tweaks · Cypher Onboarding">
        <TweakSection title="Atalhos">
          <TweakButton label="Ir para Etapa 1 · Identidade" onClick={() => setStep(0)}/>
          <TweakButton label="Ir para Etapa 2 · EPIs" onClick={() => setStep(1)}/>
          <TweakButton label="Ir para Etapa 3 · CAs" onClick={() => setStep(2)}/>
          <TweakButton label="Ir para Etapa 4 · Confirmação" onClick={() => setStep(3)}/>
        </TweakSection>
        <TweakSection title="Demo · preencher rápido">
          <TweakButton label="Preencher dados de exemplo" onClick={() => setData({
            company: 'Acme Indústrias',
            cnpj: '12.345.678/0001-99',
            sector: 'Metalurgia',
            epis: ['capacete','colete','luvas','oculos','botas'],
          })}/>
          <TweakButton label="Limpar tudo" onClick={() => setDataState({
            company:'', cnpj:'', sector:'', logoUrl:'', logoName:'',
            accent:'#F4622A', theme: data.theme,
            epis: [], cas: {},
          })}/>
        </TweakSection>
        <TweakSection title="Aparência">
          <TweakRadio
            label="Tema"
            value={data.theme}
            onChange={v => setData({ theme: v })}
            options={[
              { value: 'dark', label: 'Escuro' },
              { value: 'light', label: 'Claro' },
            ]}
          />
          <TweakColor
            label="Accent"
            value={data.accent}
            onChange={c => setData({ accent: c })}
            options={PRESET_COLORS}
          />
          <TweakToggle label="Sidebar compacta" value={tweaks.compactRail} onChange={v => setTweak('compactRail', v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
