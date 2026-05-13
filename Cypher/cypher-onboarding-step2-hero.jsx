// Cypher Onboarding — Step 2 Hero Mannequin

const CATEGORIES = [
  { key: 'cabeca',     name: 'Cabeça',     sub: 'Capacete',     required: true,  slot: 'capacete' },
  { key: 'olhos',      name: 'Olhos · Face', sub: 'Óculos',     required: true,  slot: 'oculos' },
  { key: 'audicao',    name: 'Audição',    sub: 'Protetor',     required: false, slot: 'auricular' },
  { key: 'respiracao', name: 'Respiração', sub: 'Máscara',      required: false, slot: 'mascara' },
  { key: 'maos',       name: 'Mãos',       sub: 'Luvas',        required: true,  slot: 'luvas' },
  { key: 'corpo',      name: 'Corpo',      sub: 'Colete · Avental', required: true,  slot: 'colete' },
  { key: 'pes',        name: 'Pés',        sub: 'Bota',         required: true,  slot: 'botas' },
  { key: 'altura',     name: 'Altura',     sub: 'Cinto · Linha de vida', required: false, slot: 'cinto' },
];

const OPTIONS = {
  cabeca: [
    { id: 'cap-a', name: 'Capacete classe A', ca: 'CA 31.469', tag: 'Obrigatório · NR-6' },
    { id: 'cap-b', name: 'Capacete classe B · isolante', ca: 'CA 35.812', tag: 'Eletricistas' },
    { id: 'cap-j', name: 'Capacete com jugular', ca: 'CA 42.901', tag: 'Trabalho em altura' },
  ],
  olhos: [
    { id: 'oc-a',  name: 'Óculos ampla visão',  ca: 'CA 28.011', tag: 'Obrigatório' },
    { id: 'oc-s',  name: 'Óculos solar escuro', ca: 'CA 30.224', tag: 'Solda · luz intensa' },
    { id: 'oc-fs', name: 'Protetor facial',     ca: 'CA 37.105', tag: 'Esmerilhamento' },
  ],
  audicao: [
    { id: 'au-p', name: 'Protetor tipo plug',  ca: 'CA 11.222', tag: 'Recomendado · NR-15' },
    { id: 'au-c', name: 'Protetor tipo concha', ca: 'CA 19.804', tag: 'Ambientes ≥ 85 dB' },
  ],
  respiracao: [
    { id: 're-p3', name: 'Respirador PFF3',    ca: 'CA 38.118', tag: 'Particulados finos' },
    { id: 're-vp', name: 'Máscara full-face',  ca: 'CA 41.207', tag: 'Vapores químicos', incompatible: ['oc-a','oc-s','oc-fs'] },
  ],
  maos: [
    { id: 'lv-vq', name: 'Luva vaqueta',     ca: 'CA 28.401', tag: 'Obrigatório' },
    { id: 'lv-ni', name: 'Luva nitrílica',   ca: 'CA 31.018', tag: 'Manuseio químico' },
    { id: 'lv-ar', name: 'Luva anticorte 5', ca: 'CA 36.221', tag: 'Corte / metal' },
  ],
  corpo: [
    { id: 'co-cv', name: 'Colete refletivo classe 2', ca: 'CA 29.776', tag: 'Obrigatório · alta vis.' },
    { id: 'co-av', name: 'Avental térmico de raspa',  ca: 'CA 34.118', tag: 'Solda' },
  ],
  pes: [
    { id: 'bo-bk', name: 'Bota com bico de aço', ca: 'CA 26.318', tag: 'Obrigatório' },
    { id: 'bo-id', name: 'Bota isolante elétrica', ca: 'CA 39.044', tag: 'Eletricistas' },
  ],
  altura: [
    { id: 'al-c5', name: 'Cinto paraquedista 5 pontos', ca: 'CA 33.501', tag: 'Acima de 2 m' },
    { id: 'al-tr', name: 'Talabarte duplo com ABS',     ca: 'CA 38.118', tag: 'Complementar' },
  ],
};

const ROLE_PRESETS = [
  { id: 'machine', name: 'Operador de máquina', picks: { cabeca:'cap-a', olhos:'oc-a', audicao:'au-c', maos:'lv-vq', corpo:'co-cv', pes:'bo-bk' } },
  { id: 'welder',  name: 'Soldador',             picks: { cabeca:'cap-a', olhos:'oc-s', audicao:'au-p', maos:'lv-vq', corpo:'co-av', pes:'bo-bk' } },
  { id: 'height',  name: 'Trabalho em altura',  picks: { cabeca:'cap-j', olhos:'oc-a', maos:'lv-vq', corpo:'co-cv', pes:'bo-bk', altura:'al-c5' } },
  { id: 'storage', name: 'Almoxarife',           picks: { cabeca:'cap-a', olhos:'oc-a', corpo:'co-cv', pes:'bo-bk' } },
  { id: 'chem',    name: 'Operador químico',    picks: { cabeca:'cap-a', respiracao:'re-vp', maos:'lv-ni', corpo:'co-cv', pes:'bo-bk' } },
];

function Mannequin({ picks, activeSlot, complete, accent }) {
  // Floating EPI composition — no body figure. All EPIs always rendered;
  // unselected ones go to low opacity + desaturation; selected ones light up.
  const catBySlot = (slot) => CATEGORIES.find(c => c.slot === slot)?.key;
  const isOn = (slot) => !!picks[catBySlot(slot)];
  const isActive = (slot) => catBySlot(slot) === activeSlot;
  const isRequired = (slot) => CATEGORIES.find(c => c.slot === slot)?.required;
  const pickId = (cat) => picks[cat];

  // Default colors echo the onboarding accent — kit reflects brand identity.
  const ACC = accent || '#F4622A';
  const capColor    = pickId('cabeca') === 'cap-b' ? '#E84A2F' : pickId('cabeca') === 'cap-j' ? '#1A6FE0' : ACC;
  const cintoColor  = ACC;
  const cuffColor   = ACC;
  const oculoStyle = pickId('olhos') === 'oc-s' ? '#0a0a0a' : pickId('olhos') === 'oc-fs' ? 'face' : 'std';
  const coleteColor = pickId('corpo') === 'co-av' ? '#8B5A2B' : ACC;
  const luvaColor = pickId('maos') === 'lv-ni' ? '#2D7A38' : pickId('maos') === 'lv-ar' ? '#2A5BB0' : ACC;
  const respFull = pickId('respiracao') === 're-vp';

  return (
    <svg viewBox="0 0 400 700" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%', display:'block' }}>
      <defs>
        <filter id="epiGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="b"/>
          <feFlood floodColor="var(--accent)" floodOpacity="0.55"/>
          <feComposite in2="b" operator="in" result="g"/>
          <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
          <feOffset dx="0" dy="4" result="o"/>
          <feComponentTransfer><feFuncA type="linear" slope="0.28"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* SLOT: COLETE (vest) - center torso area */}
      <EpiSlot on={isOn('colete')} active={isActive('colete')} required={isRequired('colete')}>
        {pickId('corpo') === 'co-av' ? (
          <g filter="url(#softShadow)">
            <path d="M148 198 L252 198 L262 412 L138 412 Z" fill={coleteColor} stroke="#3D2818" strokeWidth="2"/>
            <path d="M182 196 L218 196 L216 218 L184 218 Z" fill="#5A3818"/>
            <ellipse cx="200" cy="218" rx="4" ry="4" fill="#2A1810"/>
          </g>
        ) : (
          <g filter="url(#softShadow)">
            {/* main vest body */}
            <path d="M132 218 Q132 210 142 206 L168 196 L168 230 L232 230 L232 196 L258 206 Q268 210 268 218 L268 408 Q268 414 262 414 L138 414 Q132 414 132 408 Z"
                  fill={coleteColor} stroke="#1a3320" strokeWidth="2"/>
            {/* collar */}
            <path d="M168 196 L200 224 L232 196 L232 208 L200 234 L168 208 Z" fill="#234A2A" stroke="#1a3320" strokeWidth="1.6"/>
            {/* zipper line */}
            <line x1="200" y1="234" x2="200" y2="412" stroke="#1a3320" strokeWidth="2"/>
            {/* reflective stripes */}
            <rect x="132" y="284" width="136" height="12" fill="#E8E2D0"/>
            <rect x="132" y="262" width="136" height="4" fill="#2A2A2A"/>
            <rect x="132" y="310" width="136" height="4" fill="#2A2A2A"/>
            <rect x="132" y="358" width="136" height="12" fill="#E8E2D0"/>
            <rect x="132" y="336" width="136" height="4" fill="#2A2A2A"/>
            <rect x="132" y="384" width="136" height="4" fill="#2A2A2A"/>
            {/* pockets */}
            <rect x="148" y="308" width="36" height="40" fill="none" stroke="#1a3320" strokeWidth="1.6"/>
            <rect x="216" y="308" width="36" height="40" fill="none" stroke="#1a3320" strokeWidth="1.6"/>
            {/* pen pocket */}
            <line x1="154" y1="244" x2="154" y2="272" stroke="#1a3320" strokeWidth="1.4"/>
            <line x1="160" y1="244" x2="160" y2="272" stroke="#1a3320" strokeWidth="1.4"/>
            {/* badge holder */}
            <rect x="218" y="248" width="30" height="22" fill="#a8a59a" stroke="#1a3320" strokeWidth="1.4"/>
          </g>
        )}
      </EpiSlot>

      {/* SLOT: CINTO ALTURA - over vest */}
      <EpiSlot on={isOn('cinto')} active={isActive('cinto')} required={isRequired('cinto')}>
        <g filter="url(#softShadow)">
          <rect x="132" y="388" width="136" height="22" fill={cintoColor} stroke="#2A2A2A" strokeWidth="1.6"/>
          <rect x="190" y="384" width="20" height="32" rx="2" fill="#3A3A40" stroke="#0a0a0a" strokeWidth="1.4"/>
          <path d="M158 200 L195 388" stroke={cintoColor} strokeWidth="14" strokeLinecap="round"/>
          <path d="M242 200 L205 388" stroke={cintoColor} strokeWidth="14" strokeLinecap="round"/>
          <path d="M158 200 L242 200" stroke={cintoColor} strokeWidth="10" strokeLinecap="round"/>
          <circle cx="200" cy="308" r="9" fill="#2A2A2A" stroke={cintoColor} strokeWidth="2.2"/>
        </g>
      </EpiSlot>

      {/* SLOT: CAPACETE - top */}
      <EpiSlot on={isOn('capacete')} active={isActive('capacete')} required={isRequired('capacete')}>
        <g filter="url(#softShadow)">
          <path d="M138 110 Q138 60 200 60 Q262 60 262 110 L266 128 L134 128 Z"
                fill={capColor} stroke="#2A2A2A" strokeWidth="2.4"/>
          <path d="M132 124 L268 124 L268 134 L132 134 Z" fill="#2A2A2A"/>
          {/* crown ribs */}
          <path d="M170 72 Q170 115 174 124" stroke="#2A2A2A" strokeWidth="1.8" fill="none" opacity="0.55"/>
          <path d="M200 64 L200 124" stroke="#2A2A2A" strokeWidth="1.8" fill="none" opacity="0.55"/>
          <path d="M230 72 Q230 115 226 124" stroke="#2A2A2A" strokeWidth="1.8" fill="none" opacity="0.55"/>
          {/* highlight */}
          <path d="M156 78 Q160 70 184 68" stroke="#fff" strokeWidth="3" fill="none" opacity="0.4" strokeLinecap="round"/>
          {pickId('cabeca') === 'cap-j' && (
            <path d="M150 132 Q200 168 250 132" stroke="#2A2A2A" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
          )}
        </g>
      </EpiSlot>

      {/* SLOT: ÓCULOS / FACE SHIELD */}
      <EpiSlot on={isOn('oculos') && !respFull} active={isActive('oculos')} required={isRequired('oculos')}>
        {oculoStyle === 'face' ? (
          <g filter="url(#softShadow)">
            <path d="M144 148 L256 148 Q260 188 256 206 L144 206 Q140 188 144 148 Z"
                  fill="rgba(180,210,225,0.55)" stroke="#2A4858" strokeWidth="2.4"/>
            <path d="M148 150 L252 150 L252 156 L148 156 Z" fill="#2A4858"/>
          </g>
        ) : (
          <g filter="url(#softShadow)">
            {/* lens area */}
            <path d="M148 154 Q148 144 162 144 L238 144 Q252 144 252 154 L252 172 Q252 184 238 184 L162 184 Q148 184 148 172 Z"
                  fill={oculoStyle === 'std' ? 'rgba(180,210,225,0.7)' : '#1a1a1a'}
                  stroke="#2A2A2A" strokeWidth="2.4"/>
            {/* nose bridge */}
            <path d="M196 158 Q200 152 204 158 L204 174 Q200 178 196 174 Z" fill="#2A2A2A"/>
            {/* temple arms */}
            <line x1="148" y1="162" x2="132" y2="160" stroke="#2A2A2A" strokeWidth="2.4" strokeLinecap="round"/>
            <line x1="252" y1="162" x2="268" y2="160" stroke="#2A2A2A" strokeWidth="2.4" strokeLinecap="round"/>
            {/* highlight on lenses */}
            {oculoStyle === 'std' && (
              <>
                <path d="M158 152 L172 152" stroke="#fff" strokeWidth="2" opacity="0.7" strokeLinecap="round"/>
                <path d="M218 152 L232 152" stroke="#fff" strokeWidth="2" opacity="0.7" strokeLinecap="round"/>
              </>
            )}
          </g>
        )}
      </EpiSlot>

      {/* SLOT: AURICULAR */}
      <EpiSlot on={isOn('auricular')} active={isActive('auricular')} required={isRequired('auricular')}>
        {pickId('audicao') === 'au-c' ? (
          <g filter="url(#softShadow)">
            <path d="M132 142 Q140 92 200 90 Q260 92 268 142" stroke="#2A2A2A" strokeWidth="4" fill="none" strokeLinecap="round"/>
            <ellipse cx="130" cy="154" rx="16" ry="22" fill="#FF6A2F" stroke="#2A2A2A" strokeWidth="2"/>
            <ellipse cx="270" cy="154" rx="16" ry="22" fill="#FF6A2F" stroke="#2A2A2A" strokeWidth="2"/>
          </g>
        ) : (
          <g filter="url(#softShadow)">
            <ellipse cx="138" cy="160" rx="7" ry="10" fill="#F5E0C0" stroke="#2A2A2A" strokeWidth="1.4"/>
            <ellipse cx="262" cy="160" rx="7" ry="10" fill="#F5E0C0" stroke="#2A2A2A" strokeWidth="1.4"/>
          </g>
        )}
      </EpiSlot>

      {/* SLOT: MÁSCARA / RESPIRADOR */}
      <EpiSlot on={isOn('mascara')} active={isActive('mascara')} required={isRequired('mascara')}>
        {respFull ? (
          <g filter="url(#softShadow)">
            <path d="M132 128 L268 128 Q278 168 274 200 Q264 222 200 224 Q136 222 126 200 Q122 168 132 128 Z"
                  fill="#34373F" stroke="#0a0a0a" strokeWidth="2.4"/>
            <ellipse cx="200" cy="160" rx="58" ry="22" fill="rgba(180,210,230,0.65)" stroke="#0a0a0a" strokeWidth="2"/>
            <circle cx="200" cy="202" r="15" fill="#1a1a1a" stroke="#0a0a0a" strokeWidth="2"/>
            <circle cx="200" cy="202" r="7" fill="#0a0a0a"/>
          </g>
        ) : (
          <g filter="url(#softShadow)">
            <path d="M150 178 L250 178 Q260 198 250 218 L150 218 Q140 198 150 178 Z"
                  fill="#F4F2EC" stroke="#2A2A2A" strokeWidth="2.4"/>
            <path d="M150 178 L250 178" stroke="#2A2A2A" strokeWidth="1.4" opacity="0.5"/>
            <path d="M148 196 L252 196" stroke="#2A2A2A" strokeWidth="1.4" opacity="0.5"/>
            <path d="M150 210 L250 210" stroke="#2A2A2A" strokeWidth="1.4" opacity="0.5"/>
            <circle cx="200" cy="198" r="8" fill="#C4C0B5" stroke="#2A2A2A" strokeWidth="1.4"/>
            <line x1="144" y1="190" x2="128" y2="186" stroke="#2A2A2A" strokeWidth="1.6" strokeLinecap="round"/>
            <line x1="256" y1="190" x2="272" y2="186" stroke="#2A2A2A" strokeWidth="1.6" strokeLinecap="round"/>
          </g>
        )}
      </EpiSlot>

      {/* SLOT: LUVAS - sides at hand position */}
      <EpiSlot on={isOn('luvas')} active={isActive('luvas')} required={isRequired('luvas')}>
        <g filter="url(#softShadow)">
          {/* left glove */}
          <g transform="translate(64 426) rotate(-12)">
            <path d="M0 0 Q-4 -8 4 -10 L24 -10 Q32 -8 28 0 L34 16 Q36 36 28 48 L4 48 Q-4 36 -2 16 Z"
                  fill={luvaColor} stroke="#2A2A2A" strokeWidth="2"/>
            <path d="M28 6 Q40 8 42 18 Q40 26 32 24" fill={luvaColor} stroke="#2A2A2A" strokeWidth="2"/>
            <rect x="-2" y="42" width="34" height="14" fill={cuffColor} stroke="#2A2A2A" strokeWidth="1.8"/>
            <line x1="4" y1="10" x2="4" y2="36" stroke="#2A2A2A" strokeWidth="1" opacity="0.4"/>
            <line x1="12" y1="6" x2="12" y2="36" stroke="#2A2A2A" strokeWidth="1" opacity="0.4"/>
            <line x1="20" y1="6" x2="20" y2="36" stroke="#2A2A2A" strokeWidth="1" opacity="0.4"/>
          </g>
          {/* right glove (mirror) */}
          <g transform="translate(336 426) rotate(12) scale(-1 1)">
            <path d="M0 0 Q-4 -8 4 -10 L24 -10 Q32 -8 28 0 L34 16 Q36 36 28 48 L4 48 Q-4 36 -2 16 Z"
                  fill={luvaColor} stroke="#2A2A2A" strokeWidth="2"/>
            <path d="M28 6 Q40 8 42 18 Q40 26 32 24" fill={luvaColor} stroke="#2A2A2A" strokeWidth="2"/>
            <rect x="-2" y="42" width="34" height="14" fill={cuffColor} stroke="#2A2A2A" strokeWidth="1.8"/>
            <line x1="4" y1="10" x2="4" y2="36" stroke="#2A2A2A" strokeWidth="1" opacity="0.4"/>
            <line x1="12" y1="6" x2="12" y2="36" stroke="#2A2A2A" strokeWidth="1" opacity="0.4"/>
            <line x1="20" y1="6" x2="20" y2="36" stroke="#2A2A2A" strokeWidth="1" opacity="0.4"/>
          </g>
        </g>
      </EpiSlot>

      {/* SLOT: BOTAS - bottom */}
      <EpiSlot on={isOn('botas')} active={isActive('botas')} required={isRequired('botas')}>
        <g filter="url(#softShadow)">
          <path d="M138 590 L186 590 L196 656 L130 656 Z"
                fill={pickId('pes') === 'bo-id' ? '#3D3D3D' : '#1A1A1A'} stroke="#000" strokeWidth="2"/>
          <path d="M214 590 L262 590 L270 656 L204 656 Z"
                fill={pickId('pes') === 'bo-id' ? '#3D3D3D' : '#1A1A1A'} stroke="#000" strokeWidth="2"/>
          {/* sole */}
          <rect x="126" y="650" width="74" height="14" rx="3" fill="#0a0a0a" stroke="#000" strokeWidth="1.4"/>
          <rect x="200" y="650" width="74" height="14" rx="3" fill="#0a0a0a" stroke="#000" strokeWidth="1.4"/>
          {/* laces */}
          <line x1="148" y1="604" x2="180" y2="604" stroke="#F5E0C0" strokeWidth="2"/>
          <line x1="148" y1="618" x2="180" y2="618" stroke="#F5E0C0" strokeWidth="2"/>
          <line x1="148" y1="632" x2="180" y2="632" stroke="#F5E0C0" strokeWidth="2"/>
          <line x1="222" y1="604" x2="254" y2="604" stroke="#F5E0C0" strokeWidth="2"/>
          <line x1="222" y1="618" x2="254" y2="618" stroke="#F5E0C0" strokeWidth="2"/>
          <line x1="222" y1="632" x2="254" y2="632" stroke="#F5E0C0" strokeWidth="2"/>
          {pickId('pes') === 'bo-id' && (
            <g>
              <rect x="138" y="640" width="50" height="4" fill="#F4622A"/>
              <rect x="214" y="640" width="50" height="4" fill="#F4622A"/>
            </g>
          )}
        </g>
      </EpiSlot>
    </svg>
  );
}

function EpiSlot({ on, active, required, children }) {
  // Always render; opacity + saturation handled by class.
  // 'on' = selected (100% opacity + glow). 'off' = ghost (low opacity, desaturated).
  // 'active' adds accent outline. 'required' (and !on) adds dashed hint.
  const cls = on ? 'epi-layer is-on' :
              active ? 'epi-layer is-ghost is-active' :
              required ? 'epi-layer is-ghost is-required' :
                         'epi-layer is-ghost';
  return <g className={cls} filter={on ? 'url(#epiGlow)' : undefined}>{children}</g>;
}

function shadeColor(hex, pct) {
  const m = hex.replace('#','').match(/.{1,2}/g);
  if (!m || m.length !== 3) return hex;
  const [r,g,b] = m.map(x => parseInt(x,16));
  const f = pct < 0 ? 0 : 255;
  const p = Math.abs(pct);
  const fmt = (c) => Math.round(c + (f - c) * p);
  return `rgb(${fmt(r)},${fmt(g)},${fmt(b)})`;
}

function Step2Hero({ data, setData, errors }) {
  const [activeCat, setActiveCat] = React.useState('cabeca');
  const [warn, setWarn] = React.useState(null);
  const [shakeCard, setShakeCard] = React.useState(null);

  // data.picks: { cabeca: 'cap-a', ... }
  const picks = data.picks || {};
  const setPicks = (next) => setData({ picks: next, epis: deriveEpis(next) });

  const cat = CATEGORIES.find(c => c.key === activeCat);
  const options = OPTIONS[activeCat] || [];

  const totalRequired = CATEGORIES.filter(c => c.required).length;
  const filledRequired = CATEGORIES.filter(c => c.required && picks[c.key]).length;
  const filled = Object.values(picks).filter(Boolean).length;
  const complete = filledRequired === totalRequired;

  const selectOption = (optId) => {
    const opt = options.find(o => o.id === optId);
    // incompatibility check
    if (opt && opt.incompatible) {
      const conflicts = Object.entries(picks).filter(([k,v]) => opt.incompatible.includes(v));
      if (conflicts.length) {
        const conflictName = (() => {
          for (const [k,v] of conflicts) {
            const co = (OPTIONS[k]||[]).find(x => x.id === v);
            if (co) return co.name;
          }
          return 'um EPI já selecionado';
        })();
        setWarn(`${opt.name} é incompatível com ${conflictName}. Sugestão: remover o item conflitante antes.`);
        setShakeCard(optId);
        setTimeout(() => setShakeCard(null), 400);
        setTimeout(() => setWarn(null), 4500);
        return;
      }
    }
    const next = { ...picks };
    if (next[activeCat] === optId) {
      delete next[activeCat];
    } else {
      next[activeCat] = optId;
      // advance after small delay
      setTimeout(() => {
        const idx = CATEGORIES.findIndex(c => c.key === activeCat);
        const nextCat = CATEGORIES.slice(idx + 1).find(c => !next[c.key]);
        if (nextCat) setActiveCat(nextCat.key);
      }, 380);
    }
    setPicks(next);
  };

  const removeChip = (catKey) => {
    const next = { ...picks }; delete next[catKey]; setPicks(next);
  };

  const applyPreset = (presetId) => {
    const p = ROLE_PRESETS.find(r => r.id === presetId);
    if (p) {
      setPicks({ ...p.picks });
      setData({ rolePreset: presetId });
    }
  };

  return (
    <div className="step2-hero">
      <div className="hero-header">
        <div>
          <div className="eyebrow-accent">Etapa 02 · Monte o kit</div>
          <h1>Vista o seu <em>operador padrão.</em></h1>
        </div>
        <div className="sub">
          Percorra as categorias e escolha o EPI para cada parte do corpo. O kit ficará visível para o setor monitorado. <strong style={{color:'var(--ink)'}}>Você pode criar kits diferentes por função depois.</strong>
        </div>
      </div>

      <div className="hero-stage">
        {/* LEFT: categories */}
        <div className="cat-rail">
          {CATEGORIES.map(c => {
            const f = !!picks[c.key];
            return (
              <button key={c.key}
                      className={`cat-item ${activeCat === c.key ? 'on' : ''} ${f ? 'filled' : ''} ${c.required ? 'required' : ''}`}
                      onClick={() => setActiveCat(c.key)}>
                <div className="ci-icon">
                  <EpiIcon k={c.slot} size={22}/>
                </div>
                <div className="ci-text">
                  <div className="ci-name">{c.name}</div>
                  <div className="ci-sub">{c.sub}{c.required ? ' · obrig.' : ''}</div>
                </div>
                <div className="ci-pip"></div>
              </button>
            );
          })}
        </div>

        {/* CENTER: stage */}
        <div className={`stage-center ${complete ? 'complete' : ''}`}>


          <div className="stage-meta-tl">
            <div>Modo</div>
            <div className="big">Configuração de kit</div>
          </div>
          <div className="stage-meta-tr" style={{ textAlign:'right' }}>
            <div>Slots preenchidos</div>
            <div className="big">{filled} / {CATEGORIES.length}</div>
          </div>
          <div className="stage-meta-bl">
            <div>Status</div>
            <div className="big" style={{ color: complete ? 'var(--accent)' : 'var(--ink)' }}>
              {complete ? '● Kit completo' : `${totalRequired - filledRequired} obrigatório${totalRequired - filledRequired === 1 ? '' : 's'} pendente${totalRequired - filledRequired === 1 ? '' : 's'}`}
            </div>
          </div>
          <div className="stage-meta-br" style={{ textAlign:'right' }}>
            <div>Categoria</div>
            <div className="big">— {String(CATEGORIES.findIndex(c=>c.key===activeCat)+1).padStart(2,'0')}</div>
          </div>

          {warn && (
            <div className="warn-toast">
              <strong>Incompatibilidade</strong>
              <span>{warn}</span>
              <button className="kc-x" onClick={() => setWarn(null)} aria-label="fechar">
                <svg width="10" height="10" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>
              </button>
            </div>
          )}

          <div className="mannequin-wrap">
            <Mannequin picks={picks} activeSlot={cat.slot} complete={complete} accent={data.accent}/>
          </div>
        </div>

        {/* RIGHT: options for active category */}
        <aside className="opt-rail">
          <div className="or-head">
            <div className="kicker">Categoria · {String(CATEGORIES.findIndex(c=>c.key===activeCat)+1).padStart(2,'0')}</div>
            <div className="or-title">{cat.name}</div>
            <div className="or-sub">
              Escolha {cat.required ? <strong style={{color:'var(--accent)'}}>1 obrigatório</strong> : '1 (opcional)'} entre as opções abaixo. A peça aparecerá no manequim.
            </div>
          </div>

          {options.map(o => {
            const on = picks[activeCat] === o.id;
            return (
              <button key={o.id}
                      className={`opt-card ${on ? 'on' : ''} ${shakeCard === o.id ? 'shake' : ''}`}
                      onClick={() => selectOption(o.id)}>
                <div className="oc-thumb"><EpiIcon k={cat.slot} size={24}/></div>
                <div className="oc-body">
                  <div className="oc-name">{o.name}</div>
                  <div className="oc-meta">{o.tag} · {o.ca}</div>
                </div>
                <div className="oc-radio"></div>
              </button>
            );
          })}

          {!cat.required && (
            <button className={`opt-card skip ${!picks[activeCat] ? 'on' : ''}`}
                    onClick={() => { const n = {...picks}; delete n[activeCat]; setPicks(n); }}>
              <div className="oc-thumb">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 12h14"/></svg>
              </div>
              <div className="oc-body">
                <div className="oc-name">Sem EPI nesta categoria</div>
                <div className="oc-meta">Não monitorar este slot</div>
              </div>
              <div className="oc-radio"></div>
            </button>
          )}

          <div className="preset-row">
            <span className="preset-label">— Aplicar preset de função</span>
            {ROLE_PRESETS.map(p => (
              <button key={p.id}
                      className={`preset-chip ${data.rolePreset === p.id ? 'on' : ''}`}
                      onClick={() => applyPreset(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* BOTTOM kit bar */}
      <div className="kit-bar">
        <span className="kit-label">Kit do operador</span>
        <span className={`kit-counter ${complete ? 'complete' : ''}`}>
          {filled} de {CATEGORIES.length} · {filledRequired}/{totalRequired} obrigatórios
        </span>
        <div className="kit-chips">
          {CATEGORIES.filter(c => picks[c.key]).map(c => {
            const o = (OPTIONS[c.key]||[]).find(x => x.id === picks[c.key]);
            return (
              <span key={c.key} className="kit-chip">
                <EpiIcon k={c.slot} size={14}/>
                {o ? o.name : c.name}
                <button className="kc-x" onClick={() => removeChip(c.key)} aria-label={`Remover ${c.name}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>
                </button>
              </span>
            );
          })}
          {filled === 0 && (
            <span style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-ghost)' }}>
              Nenhum EPI selecionado · comece pela Cabeça →
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function deriveEpis(picks) {
  // map back to old epi keys for compatibility w/ later steps
  const map = { cabeca:'capacete', olhos:'oculos', audicao:'auricular', respiracao:'mascara', maos:'luvas', corpo:'colete', pes:'botas', altura:'cinto' };
  return Object.entries(picks).filter(([,v]) => !!v).map(([k]) => map[k]).filter(Boolean);
}

Object.assign(window, { Step2Hero, Mannequin, CATEGORIES, OPTIONS, ROLE_PRESETS });
