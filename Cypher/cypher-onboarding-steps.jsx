// Cypher Onboarding — Step components

function Step1Company({ data, setData, errors }) {
  const onLogoChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setData({ logoUrl: url, logoName: f.name });
  };
  const cnpjMask = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 14);
    return d.
    replace(/^(\d{2})(\d)/, '$1.$2').
    replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').
    replace(/\.(\d{3})(\d)/, '.$1/$2').
    replace(/(\d{4})(\d)/, '$1-$2');
  };

  return (
    <div className="step-enter">
      <div className="eyebrow-accent">Etapa 01 · Identidade</div>
      <h1 className="q" style={{ fontFamily: "Montserrat" }}>Configure sua <em style={{ fontFamily: "Montserrat" }}>instância Cypher.</em></h1>
      <p className="sub">Esses dados aparecem em todo o sistema. A cor escolhida define o accent visual da plataforma — botões, alertas, indicadores e gráficos passam a usá-la em tempo real.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginTop: 44 }}>
        <div className="field">
          <label>Nome da empresa</label>
          <input className="input" placeholder="Acme Indústrias Ltda."
          value={data.company} onChange={(e) => setData({ company: e.target.value })} />
          {errors.company && <div className="field-error">{errors.company}</div>}
        </div>
        <div className="field">
          <label>CNPJ</label>
          <input className="input" placeholder="00.000.000/0000-00"
          value={data.cnpj} onChange={(e) => setData({ cnpj: cnpjMask(e.target.value) })} />
          {errors.cnpj && <div className="field-error">{errors.cnpj}</div>}
        </div>
        <div className="field">
          <label>Setor industrial</label>
          <select className="select" value={data.sector} onChange={(e) => setData({ sector: e.target.value })}>
            <option value="">Selecione um setor</option>
            {SECTORS.map((s) => <option key={s}>{s}</option>)}
          </select>
          {errors.sector && <div className="field-error">{errors.sector}</div>}
        </div>
        <div className="field">
          <label>Logo da empresa</label>
          <label className="logo-drop">
            <div className="logo-preview">
              {data.logoUrl ? <img src={data.logoUrl} alt="logo" /> : 'SEM\nLOGO'.split('\n').map((t, i) => <div key={i}>{t}</div>)}
            </div>
            <div className="logo-meta">
              <div className="t">{data.logoName || 'Arraste ou selecione SVG/PNG'}</div>
              <div className="s">Recomendado · 256 × 256</div>
            </div>
            <input type="file" accept="image/*" onChange={onLogoChange} style={{ display: 'none' }} />
          </label>
        </div>

        <div className="field" style={{ gridColumn: '1 / -1', marginTop: 12 }}>
          <label>Cor principal · accent</label>
          <div className="swatches">
            {PRESET_COLORS.map((c) =>
            <button key={c} className={`swatch ${data.accent === c ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => setData({ accent: c })}>
                <span className="tick">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                </span>
              </button>
            )}
            <label className="swatch-custom">
              <input type="color" value={data.accent} onChange={(e) => setData({ accent: e.target.value })} />
              <span>{data.accent.toUpperCase()}</span>
            </label>
          </div>
        </div>

        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Tema da plataforma</label>
          <ThemeToggle theme={data.theme} onChange={(t) => setData({ theme: t })} />
        </div>
      </div>
    </div>);

}

function Step2EPIs({ data, setData, errors, visual }) {
  const toggle = (k) => {
    const set = new Set(data.epis);
    set.has(k) ? set.delete(k) : set.add(k);
    setData({ epis: Array.from(set) });
  };

  // Map epi keys → category keys used by Mannequin
  const epiToCat = { capacete: 'cabeca', oculos: 'olhos', auricular: 'audicao', mascara: 'respiracao', luvas: 'maos', colete: 'corpo', botas: 'pes', cinto: 'altura' };
  const picks = (data.epis || []).reduce((acc, e) => {const c = epiToCat[e];if (c) acc[c] = 'on';return acc;}, {});

  return (
    <div className="step-enter">
      <div className="eyebrow-accent">Etapa 02 · EPIs monitorados</div>
      <h1 className="q">Quais EPIs sua <em>operação</em> exige?</h1>
      <p className="sub">Selecione o equipamento de proteção individual que será detectado pela visão computacional. O operador ao centro veste o kit em tempo real.</p>

      {/* Hero — centralized */}
      <div style={{
        position: 'relative',
        margin: '24px auto 8px',
        maxWidth: 560,
        height: 440,
        borderRadius: 20,
        border: '1px solid var(--line-2)',
        background: 'radial-gradient(60% 70% at 50% 45%, var(--accent-soft), transparent 70%), var(--surface)',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: 14, left: 18, zIndex: 3 }} className="kicker">— Prévia do kit</div>
        <div style={{ position: 'absolute', top: 14, right: 18, zIndex: 3, display: 'flex', gap: 8, alignItems: 'center' }} className="kicker">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: data.epis.length >= 5 ? 'var(--accent)' : 'var(--ink-mute)', display: 'inline-block' }}></span>
          <span>{data.epis.length === 0 ? 'vazio' : data.epis.length >= 5 ? 'kit robusto' : 'parcial'}</span>
        </div>
        <div style={{ position: 'absolute', bottom: 14, left: 18, zIndex: 3 }} className="kicker">{data.epis.length} de 8</div>
        <div style={{ position: 'absolute', bottom: 14, right: 18, zIndex: 3, color: data.epis.length ? 'var(--accent)' : 'var(--ink-mute)' }} className="kicker">
          {data.epis.length} selecionado{data.epis.length === 1 ? '' : 's'}
        </div>
        <div style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '56%', maxWidth: 240, aspectRatio: '400/700' }}>
            <Mannequin picks={picks} activeSlot={null} complete={data.epis.length >= 6} accent={data.accent} />
          </div>
        </div>
      </div>

      <div className="epi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 24 }}>
        {EPI_LIST.map((e) => {
          const on = data.epis.includes(e.key);
          return (
            <button key={e.key} className={`epi-card ${on ? 'on' : ''}`} onClick={() => toggle(e.key)}>
              <div className="icon-frame">
                <EpiIcon k={e.key} size={26} />
              </div>
              <div>
                <div className="name">{e.name}</div>
                <div className="nrm">{e.nrm}</div>
              </div>
              <div className="check">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </div>
            </button>);

        })}
      </div>

      {errors.epis && <div className="field-error" style={{ marginTop: 14 }}>{errors.epis}</div>}
    </div>);

}

function Step3CAs({ data, setData, onSkip }) {
  const update = (k, field, val) => {
    setData({ cas: { ...data.cas, [k]: { ...(data.cas[k] || {}), [field]: val } } });
  };
  const selected = EPI_LIST.filter((e) => data.epis.includes(e.key));

  return (
    <div className="step-enter">
      <div className="eyebrow-accent">Etapa 03 · CAs e validades</div>
      <h1 className="q">Registre os <em>Certificados de Aprovação.</em></h1>
      <p className="sub">Esta etapa é opcional. Você pode pular e cadastrar depois nas Definições — o Cypher monitora os EPIs mesmo sem o CA registrado, mas com ele você ganha alertas de validade.</p>

      <div className="optional-banner" style={{ marginTop: 36 }}>
        <div className="b-text">
          <strong>Opcional</strong>
          <span>Pule para configurar depois, ou registre agora para receber alertas 60 dias antes do vencimento.</span>
        </div>
        <button className="btn ghost" onClick={onSkip}>Pular esta etapa →</button>
      </div>

      <div className="ca-table">
        <div className="ca-head">
          <span>EPI</span>
          <span>Nº do CA</span>
          <span>Validade</span>
          <span>Fabricante (opcional)</span>
        </div>
        {selected.map((e) => {
          const v = data.cas[e.key] || {};
          return (
            <div key={e.key} className="ca-row">
              <div className="epi-tag">
                <div className="tag-icon"><EpiIcon k={e.key} size={18} /></div>
                <div>
                  <div className="tag-name">{e.name}</div>
                  <div className="kicker" style={{ fontSize: 10 }}>{e.nrm}</div>
                </div>
              </div>
              <input type="text" inputMode="numeric" placeholder="ex. 12345"
              value={v.ca || ''} onChange={(ev) => update(e.key, 'ca', ev.target.value.replace(/\D/g, '').slice(0, 8))} />
              <input type="date" value={v.validade || ''} onChange={(ev) => update(e.key, 'validade', ev.target.value)} />
              <input type="text" placeholder="ex. 3M, MSA, Bracol"
              value={v.fab || ''} onChange={(ev) => update(e.key, 'fab', ev.target.value)} />
            </div>);

        })}
      </div>

      <p className="sub" style={{ marginTop: 20, fontSize: 13, color: 'var(--ink-mute)' }}>
        {Object.values(data.cas).filter((v) => v && v.ca).length} de {selected.length} EPIs com CA registrado
      </p>
    </div>);

}

function Step4Confirm({ data, onLaunch, launching }) {
  const selected = EPI_LIST.filter((e) => data.epis.includes(e.key));
  const casCount = Object.values(data.cas).filter((v) => v && v.ca).length;

  return (
    <div className="step-enter">
      <div className="eyebrow-accent">Etapa 04 · Confirmação</div>
      <h1 className="q">Tudo pronto, <em>{data.company || 'sua operação'}</em>.</h1>
      <p className="sub">Revise a configuração abaixo. Você pode ajustar qualquer item nas Definições da plataforma a qualquer momento — nada aqui é permanente.</p>

      <div className="summary-grid">
        <div className="summary-card">
          <div className="h">
            <span className="l">Identidade</span>
            <span className="n">— 01</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.15 }}>
            {data.company || '—'}
          </div>
          <div className="kicker" style={{ fontSize: 11 }}>
            {data.cnpj || 'CNPJ não informado'} · {data.sector || 'setor não definido'}
          </div>
          <div className="ident-row">
            <div className="sw" style={{ background: data.accent }}></div>
            <div className="kicker" style={{ fontSize: 11 }}>
              {data.accent.toUpperCase()} · tema {data.theme}
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="h">
            <span className="l">EPIs monitorados</span>
            <span className="n">— 02</span>
          </div>
          <div className="big">{selected.length} ativos</div>
          <div className="pile">
            {selected.slice(0, 5).map((e) => <span key={e.key} className="chip">{e.name}</span>)}
            {selected.length > 5 && <span className="chip">+{selected.length - 5}</span>}
          </div>
        </div>

        <div className="summary-card">
          <div className="h">
            <span className="l">CAs registrados</span>
            <span className="n">— 03</span>
          </div>
          <div className="big" style={{ color: casCount ? 'var(--accent)' : 'var(--ink)' }}>
            {casCount} <span style={{ color: 'var(--ink-mute)', fontSize: 18 }}>/ {selected.length}</span>
          </div>
          <div className="kicker" style={{ fontSize: 11 }}>
            {casCount === 0 ?
            'Você pode adicionar depois em Definições' :
            `${selected.length - casCount} pendente${selected.length - casCount === 1 ? '' : 's'} de cadastro`}
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 56,
        padding: 32,
        border: '1px solid var(--line-2)',
        borderRadius: 16,
        background: 'linear-gradient(135deg, var(--accent-soft), transparent 60%)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 28
      }}>
        <div>
          <div className="kicker" style={{ color: 'var(--accent)' }}>— Lançamento</div>
          <h3 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.025em', margin: '10px 0 6px' }}>
            Iniciar Cypher agora.
          </h3>
          <p style={{ color: 'var(--ink-2)', fontSize: 15, margin: 0, maxWidth: 460 }}>
            Você pode ajustar todas essas configurações em Definições a qualquer momento.
          </p>
        </div>
        <button className="btn primary lg pulsing" onClick={onLaunch} disabled={launching}>
          {launching ? 'Iniciando…' : 'Iniciar Cypher'}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>);

}

Object.assign(window, { Step1Company, Step2EPIs, Step3CAs, Step4Confirm });