// Cypher Onboarding — components: icons + layout primitives

const EPI_LIST = [
  { key: 'capacete', name: 'Capacete', nrm: 'NR-6 · CA' },
  { key: 'colete',   name: 'Colete refletivo', nrm: 'ALTA VIS.' },
  { key: 'luvas',    name: 'Luvas',     nrm: 'NR-6' },
  { key: 'oculos',   name: 'Óculos de proteção', nrm: 'NR-6' },
  { key: 'mascara',  name: 'Máscara / Respirador', nrm: 'NR-15' },
  { key: 'auricular',name: 'Protetor auricular', nrm: 'NR-15' },
  { key: 'botas',    name: 'Bota de segurança', nrm: 'NR-6' },
  { key: 'cinto',    name: 'Cinto de segurança', nrm: 'NR-35' },
];

const SECTORS = ['Metalurgia', 'Automotivo', 'Químico', 'Alimentício', 'Construção', 'Outros'];

const PRESET_COLORS = ['#F4622A', '#2A6FDB', '#1F8A5B', '#C03E5C', '#7A4FDB', '#E0A93B'];

// SVG outline EPI icons (no emoji — industrial vocabulary)
function EpiIcon({ k, size = 28, color = 'currentColor' }) {
  const s = size;
  const props = {
    width: s, height: s, viewBox: '0 0 32 32', fill: 'none',
    stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round'
  };
  switch (k) {
    case 'capacete':
      return <svg {...props}><path d="M5 22h22"/><path d="M6 22c0-7 4.5-11 10-11s10 4 10 11"/><path d="M14 11V7h4v4"/><path d="M10 16h12"/></svg>;
    case 'colete':
      return <svg {...props}><path d="M9 6l3 4h8l3-4"/><path d="M9 6l-2 4v16h18V10l-2-4"/><path d="M16 10v16"/><path d="M11 16h2M19 16h2"/></svg>;
    case 'luvas':
      return <svg {...props}><path d="M10 27V13c0-1 .8-2 2-2s2 1 2 2v3"/><path d="M14 16v-5c0-1 .8-2 2-2s2 1 2 2v5"/><path d="M18 16v-3c0-1 .8-2 2-2s2 1 2 2v6"/><path d="M22 19v-2c0-1 .8-2 2-2s2 1 2 2v6c0 3-2 6-5 6h-7c-3 0-4-2-4-4"/></svg>;
    case 'oculos':
      return <svg {...props}><circle cx="9" cy="17" r="5"/><circle cx="23" cy="17" r="5"/><path d="M14 17h4"/><path d="M4 13l3-2M28 13l-3-2"/></svg>;
    case 'mascara':
      return <svg {...props}><path d="M6 12c0-2 2-3 4-3l3 1h6l3-1c2 0 4 1 4 3v8c0 2-2 3-4 3l-3-1h-6l-3 1c-2 0-4-1-4-3z"/><path d="M11 14l-4-2M21 14l4-2M11 21l-4 2M21 21l4 2"/><path d="M11 16h10M11 19h10"/></svg>;
    case 'auricular':
      return <svg {...props}><path d="M5 18v-2a11 11 0 0 1 22 0v2"/><path d="M5 18c0-2 2-3 3-3h2v8H8c-2 0-3-1-3-3z"/><path d="M27 18c0-2-2-3-3-3h-2v8h2c2 0 3-1 3-3z"/></svg>;
    case 'botas':
      return <svg {...props}><path d="M9 6h5v14"/><path d="M9 20v-6"/><path d="M14 20l9 2c2 .5 3 1 3 3v1H6v-2c0-2 1-3 3-4z"/><path d="M14 12h4"/></svg>;
    case 'cinto':
      return <svg {...props}><rect x="4" y="13" width="24" height="6" rx="1"/><rect x="13" y="11" width="6" height="10" rx="1"/><circle cx="16" cy="16" r="1.2" fill={color}/></svg>;
    default: return null;
  }
}

function StepIndicator({ current, total }) {
  return (
    <div className="stepind">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`seg ${i < current ? 'done' : i === current ? 'current' : ''}`}>
          <div className="fill"></div>
        </div>
      ))}
      <span className="counter">{String(current + 1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span>
    </div>
  );
}

function Checklist({ steps, current }) {
  return (
    <ul className="checklist">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'pending';
        return (
          <li key={s.key} className={state}>
            <div className="marker">
              {state === 'done' ? '✓' : state === 'current' ? '◉' : String(i+1).padStart(2,'0')}
            </div>
            <div className="step-info">
              <div className="step-name">{s.name}</div>
              <div className="step-hint">{s.hint}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Brand({ company, logoUrl }) {
  return (
    <div className="brand">
      <span className="brand-dot"></span>
      <span>Cypher</span>
      {company && <span className="brand-meta">por · {company}</span>}
    </div>
  );
}

function ThemeToggle({ theme, onChange }) {
  return (
    <div className="theme-toggle">
      <button className={theme === 'light' ? 'on' : ''} onClick={() => onChange('light')}>Claro</button>
      <button className={theme === 'dark' ? 'on' : ''} onClick={() => onChange('dark')}>Escuro</button>
    </div>
  );
}

Object.assign(window, {
  EPI_LIST, SECTORS, PRESET_COLORS,
  EpiIcon, StepIndicator, Checklist, Brand, ThemeToggle
});
