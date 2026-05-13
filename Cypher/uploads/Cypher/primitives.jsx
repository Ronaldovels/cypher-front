// Shared sketchy primitives for Cypher wireframes.
// SketchBox — wobbly rectangle drawn with SVG (looks hand-drawn).
// EpiIcon — lo-fi hand-drawn PPE icons (capacete, óculos, luvas, colete, botas).
// Squiggle — underline/divider helper.

const wfRand = (seed) => {
  let s = seed || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

// Wobble a rect path, seeded so it stays stable across re-renders.
function wobblePath(x, y, w, h, seed = 1, amp = 1.2) {
  const r = wfRand(seed);
  const pts = [];
  const segs = 8;
  // top
  for (let i = 0; i <= segs; i++) {
    pts.push([x + (w * i) / segs, y + (r() - 0.5) * amp * 2]);
  }
  // right
  for (let i = 1; i <= segs; i++) {
    pts.push([x + w + (r() - 0.5) * amp * 2, y + (h * i) / segs]);
  }
  // bottom
  for (let i = segs - 1; i >= 0; i--) {
    pts.push([x + (w * i) / segs, y + h + (r() - 0.5) * amp * 2]);
  }
  // left
  for (let i = segs - 1; i >= 1; i--) {
    pts.push([x + (r() - 0.5) * amp * 2, y + (h * i) / segs]);
  }
  return 'M' + pts.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L') + ' Z';
}

function SketchBox({ children, seed = 1, amp = 1.4, stroke = '#1a1a1a', strokeWidth = 1.6, fill = '#fdfcf8', style, className = '', double = false, dashed = false, onClick }) {
  // wobbly rect, rendered full-bleed absolute behind children
  const id = React.useId();
  return (
    <div
      onClick={onClick}
      className={className}
      style={{ position: 'relative', ...style }}
    >
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }} preserveAspectRatio="none" viewBox="0 0 100 100">
        <path
          d={wobblePath(1, 1, 98, 98, seed, amp)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeDasharray={dashed ? '3 2' : undefined}
          vectorEffect="non-scaling-stroke"
        />
        {double && (
          <path
            d={wobblePath(3, 3, 98, 98, seed + 7, amp)}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth * 0.7}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.5"
          />
        )}
      </svg>
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// squiggly underline
function Squiggle({ width = 80, color = '#1a1a1a', style }) {
  return (
    <svg width={width} height="8" viewBox="0 0 80 8" style={{ display: 'block', ...style }}>
      <path d="M0 4 Q 5 0, 10 4 T 20 4 T 30 4 T 40 4 T 50 4 T 60 4 T 70 4 T 80 4" fill="none" stroke={color} strokeWidth="1.3" />
    </svg>
  );
}

function Arrow({ from, to, color = '#d33b2c', curve = 20, label, width = 1.4 }) {
  const mx = (from[0] + to[0]) / 2 + curve;
  const my = (from[1] + to[1]) / 2 - curve;
  const id = React.useId();
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        <marker id={`arr-${id}`} markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto">
          <path d="M0,0 L8,5 L0,10" fill="none" stroke={color} strokeWidth={width} />
        </marker>
      </defs>
      <path d={`M ${from[0]} ${from[1]} Q ${mx} ${my} ${to[0]} ${to[1]}`} stroke={color} strokeWidth={width} fill="none" markerEnd={`url(#arr-${id})`} />
      {label && (
        <text x={mx} y={my - 6} fill={color} fontFamily="Kalam" fontSize="13">{label}</text>
      )}
    </svg>
  );
}

// ——— EPI icons — lo-fi hand-drawn ———
function IcHelmet({ size = 28, ok = null }) {
  const color = ok === true ? '#2f7a3f' : ok === false ? '#d33b2c' : '#1a1a1a';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M4 22 Q 4 10, 16 9 Q 28 10, 28 22 Z" />
      <path d="M3 22 L 29 22" />
      <path d="M14 9 L 14 4 L 18 4 L 18 9" />
      <path d="M10 15 L 10 10" opacity="0.5" />
      <path d="M22 15 L 22 10" opacity="0.5" />
    </svg>
  );
}
function IcGlasses({ size = 28, ok = null }) {
  const color = ok === true ? '#2f7a3f' : ok === false ? '#d33b2c' : '#1a1a1a';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="9" cy="17" rx="6" ry="4.5" />
      <ellipse cx="23" cy="17" rx="6" ry="4.5" />
      <path d="M15 17 Q 16 15, 17 17" />
      <path d="M3 15 L 1 11" />
      <path d="M29 15 L 31 11" />
    </svg>
  );
}
function IcGloves({ size = 28, ok = null }) {
  const color = ok === true ? '#2f7a3f' : ok === false ? '#d33b2c' : '#1a1a1a';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 28 L 8 14 Q 8 10, 12 10 L 12 6 Q 12 4, 14 4 Q 16 4, 16 6 L 16 10 L 18 10 L 18 7 Q 18 5, 20 5 Q 22 5, 22 7 L 22 10 L 23 10 Q 25 10, 25 12 L 25 16 Q 25 18, 23 19 L 23 28 Z" />
    </svg>
  );
}
function IcVest({ size = 28, ok = null }) {
  const color = ok === true ? '#2f7a3f' : ok === false ? '#d33b2c' : '#1a1a1a';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 6 L 12 4 L 16 7 L 20 4 L 24 6 L 26 28 L 6 28 Z" />
      <path d="M16 7 L 16 28" />
      <path d="M8 14 L 26 14" strokeDasharray="2 2" />
      <path d="M8 20 L 26 20" strokeDasharray="2 2" />
    </svg>
  );
}
function IcBoots({ size = 28, ok = null }) {
  const color = ok === true ? '#2f7a3f' : ok === false ? '#d33b2c' : '#1a1a1a';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M8 6 L 16 6 L 16 20 L 26 20 Q 28 20, 28 22 L 28 26 L 8 26 Z" />
      <path d="M8 22 L 28 22" />
    </svg>
  );
}

const EPI_ICONS = {
  capacete: IcHelmet,
  oculos: IcGlasses,
  luvas: IcGloves,
  colete: IcVest,
  botas: IcBoots,
};

const EPI_LABELS = {
  capacete: 'Capacete',
  oculos: 'Óculos',
  luvas: 'Luvas',
  colete: 'Colete',
  botas: 'Botas',
};

function EpiRow({ items, size = 24, direction = 'row', showLabels = true }) {
  // items = [{key, ok}]
  return (
    <div style={{ display: 'flex', flexDirection: direction, gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {items.map((it, i) => {
        const Ic = EPI_ICONS[it.key];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: it.off ? 0.35 : 1 }}>
            <Ic size={size} ok={it.ok} />
            {showLabels && (
              <span style={{ fontSize: 12, color: it.ok === true ? '#2f7a3f' : it.ok === false ? '#d33b2c' : '#3a3a3a' }}>
                {EPI_LABELS[it.key]}
              </span>
            )}
            {it.ok === true && <span style={{ color: '#2f7a3f', fontWeight: 700, fontSize: 14 }}>✓</span>}
            {it.ok === false && <span style={{ color: '#d33b2c', fontWeight: 700, fontSize: 14 }}>✗</span>}
          </div>
        );
      })}
    </div>
  );
}

// ——— Fake video feed (person silhouette) ———
function FakeFeed({ alert = false, label = 'CAM · EST-04', personPose = 'ok', style }) {
  return (
    <div className={`ph video${alert ? ' alert' : ''}`} style={{ position: 'relative', ...style }}>
      <svg viewBox="0 0 200 120" style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="xMidYMid slice">
        {/* floor grid */}
        <g opacity="0.2" stroke="#fff" strokeWidth="0.3">
          <line x1="0" y1="80" x2="200" y2="80" />
          <line x1="0" y1="100" x2="200" y2="100" />
          <line x1="40" y1="60" x2="30" y2="120" />
          <line x1="160" y1="60" x2="170" y2="120" />
          <line x1="100" y1="55" x2="100" y2="120" />
        </g>
        {/* machine block */}
        <rect x="20" y="55" width="50" height="50" fill="#444" stroke="#666" strokeWidth="0.8" />
        <rect x="25" y="60" width="40" height="8" fill="#222" />
        <circle cx="60" cy="50" r="4" fill="#8a8" />
        {/* person silhouette */}
        <g transform="translate(120 45)">
          <circle cx="0" cy="0" r="7" fill={alert ? '#d33b2c' : '#e8c77a'} stroke="#fff" strokeWidth="0.4" />
          {/* helmet */}
          {personPose !== 'no-helmet' && (
            <path d="M -8 -1 Q -8 -8, 0 -9 Q 8 -8, 8 -1 Z" fill={alert ? '#aa2a1a' : '#e0a030'} stroke="#fff" strokeWidth="0.4" />
          )}
          {/* body */}
          <path d="M -8 8 L -10 35 L -3 35 L -2 20 L 2 20 L 3 35 L 10 35 L 8 8 Z" fill={alert ? '#aa2a1a' : '#2f6ba8'} stroke="#fff" strokeWidth="0.4" />
          {/* vest */}
          {personPose !== 'no-vest' && !alert && (
            <path d="M -8 8 L -9 22 L 9 22 L 8 8 Z" fill="#e8d23a" stroke="#fff" strokeWidth="0.4" opacity="0.85" />
          )}
          {/* bounding box */}
          <rect x="-14" y="-12" width="28" height="52" fill="none" stroke={alert ? '#d33b2c' : '#3fc86a'} strokeWidth="1" strokeDasharray="2 1" />
          <text x="-14" y="-14" fill={alert ? '#d33b2c' : '#3fc86a'} fontSize="5" fontFamily="monospace">OP · 98%</text>
        </g>
        {/* scanlines */}
        <g opacity="0.08" stroke="#fff" strokeWidth="0.3">
          {Array.from({ length: 30 }).map((_, i) => (
            <line key={i} x1="0" y1={i * 4} x2="200" y2={i * 4} />
          ))}
        </g>
      </svg>
      {/* overlay */}
      <div style={{ position: 'absolute', top: 6, left: 8, color: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff3a3a', display: 'inline-block', animation: 'blink 1s infinite' }}></span>
        REC · {label}
      </div>
      <div style={{ position: 'absolute', top: 6, right: 8, color: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
        14:32:07
      </div>
      {alert && (
        <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, background: 'rgba(211,59,44,0.9)', color: '#fff', padding: '5px 8px', fontFamily: 'Kalam, cursive', fontSize: 13, borderRadius: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700 }}>⚠ VIOLAÇÃO</span>
          <span>Capacete ausente</span>
        </div>
      )}
    </div>
  );
}

// ——— Hand-drawn mini logo ———
function CypherMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="13" stroke="#1a1a1a" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="6" stroke="#1a1a1a" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="2" fill="#d33b2c" />
      <path d="M 3 16 L 7 16" stroke="#1a1a1a" strokeWidth="1.8" />
      <path d="M 25 16 L 29 16" stroke="#1a1a1a" strokeWidth="1.8" />
      <path d="M 16 3 L 16 7" stroke="#1a1a1a" strokeWidth="1.8" />
      <path d="M 16 25 L 16 29" stroke="#1a1a1a" strokeWidth="1.8" />
    </svg>
  );
}

function CypherLogo({ small = false }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <CypherMark size={small ? 22 : 28} />
      <span style={{ fontFamily: 'Caveat, cursive', fontSize: small ? 22 : 28, fontWeight: 700, letterSpacing: 0.5 }}>
        cypher
      </span>
    </div>
  );
}

// Expose globally so other babel scripts can use them
Object.assign(window, {
  SketchBox, Squiggle, Arrow,
  IcHelmet, IcGlasses, IcGloves, IcVest, IcBoots,
  EPI_ICONS, EPI_LABELS, EpiRow,
  FakeFeed, CypherMark, CypherLogo,
});
