// Cypher · Chrome — shared shell (Topbar, Dock, Icons, theme/config helpers)
// Exposed via window so dashboard.jsx + heatmap.jsx can reuse.

(function () {
  const { useState, useEffect, useRef } = React;

  // ─── COLOR HELPERS ────────────────────────────────
  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function shade(hex, amt) {
    const h = hex.replace('#', '');
    const num = parseInt(h, 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + Math.round(255 * amt)));
    const g = Math.max(0, Math.min(255, (num >> 8 & 0xff) + Math.round(255 * amt)));
    const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round(255 * amt)));
    return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
  }
  function loadConfig() {
    try {
      const raw = localStorage.getItem('cypher.config');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
  function useCypherConfig() {
    const [cfg] = useState(loadConfig);
    useEffect(() => {
      if (!cfg) return;
      if (cfg.accent) {
        document.documentElement.style.setProperty('--accent', cfg.accent);
        document.documentElement.style.setProperty('--accent-soft', rgba(cfg.accent, 0.14));
        document.documentElement.style.setProperty('--accent-deep', shade(cfg.accent, -0.12));
      }
      if (cfg.theme) document.body.className = `theme-${cfg.theme}`;
    }, [cfg]);
    return cfg;
  }

  // ─── ICONS (Iconoir-style, stroke 1.5) ────────────
  function IconBase({ size = 20, children }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.5"
           strokeLinecap="round" strokeLinejoin="round">{children}</svg>
    );
  }
  const IDashboard = (p) => <IconBase {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.2"/>
    <rect x="14" y="3" width="7" height="7" rx="1.2"/>
    <rect x="3" y="14" width="7" height="7" rx="1.2"/>
    <rect x="14" y="14" width="7" height="7" rx="1.2"/>
  </IconBase>;
  const IVideo = (p) => <IconBase {...p}>
    <rect x="2.5" y="6.5" width="13" height="11" rx="2"/>
    <path d="M15.5 10.5 L21 7 V17 L15.5 13.5 Z"/>
  </IconBase>;
  const IBell = (p) => <IconBase {...p}>
    <path d="M6 16c0-7 1.5-10 6-10s6 3 6 10"/>
    <path d="M4.5 16h15"/>
    <path d="M10.5 19a1.5 1.5 0 0 0 3 0"/>
  </IconBase>;
  const IHeatmap = (p) => <IconBase {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
    <rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" stroke="none" opacity="0.55"/>
    <rect x="15.5" y="3.5" width="5" height="5" fill="currentColor" stroke="none" opacity="0.3"/>
  </IconBase>;
  const IGraph = (p) => <IconBase {...p}>
    <path d="M3 21V4M3 21h17"/>
    <path d="M6 16l4-4 3 3 6-7"/>
    <path d="M16 8h3v3"/>
  </IconBase>;
  const IGroup = (p) => <IconBase {...p}>
    <circle cx="9" cy="8" r="3"/>
    <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
    <circle cx="17" cy="9" r="2.5"/>
    <path d="M15.5 20c0-2.4 1.8-4.4 4-5"/>
  </IconBase>;
  const IAddUser = (p) => <IconBase {...p}>
    <circle cx="10" cy="8" r="3.5"/>
    <path d="M3 20c0-3.8 3-6.8 7-6.8"/>
    <path d="M18 14v6M15 17h6"/>
  </IconBase>;
  const ISettings = (p) => <IconBase {...p}>
    <path d="M3 7h7M14 7h7"/>
    <circle cx="12" cy="7" r="2"/>
    <path d="M3 17h11M18 17h3"/>
    <circle cx="16" cy="17" r="2"/>
  </IconBase>;
  const ICog = (p) => <IconBase {...p}>
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>
  </IconBase>;
  const IExpand = (p) => <IconBase {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>
  </IconBase>;
  const IDownload = (p) => <IconBase {...p}>
    <path d="M12 4v12M7 12l5 5 5-5M5 20h14"/>
  </IconBase>;
  const IRefresh = (p) => <IconBase {...p}>
    <path d="M3 12a9 9 0 0 1 15.5-6.3M21 4v5h-5"/>
    <path d="M21 12a9 9 0 0 1-15.5 6.3M3 20v-5h5"/>
  </IconBase>;
  const IWarning = (p) => <IconBase {...p}>
    <path d="M12 3 L21 19 H3 Z"/>
    <path d="M12 10v4M12 17v0.5"/>
  </IconBase>;
  const IExpandArrow = (p) => <IconBase {...p}>
    <path d="M7 17L17 7M9 7h8v8"/>
  </IconBase>;

  // ─── TOPBAR ───────────────────────────────────────
  function Topbar({ cfg, page = 'Dashboard', subtitle = '24 abr 2026', shift = 'Turno A · 06:00–14:00', live = true, notifBadge = 6 }) {
    const company = cfg && cfg.company || 'CYPHER';
    const initials = company.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'C';
    const logoUrl = cfg && cfg.logoUrl;
    return (
      <header className="dtop">
        <a href="Cypher Onboarding.html" className="brand-mini" title="Voltar ao onboarding" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="brand-logo">
            {logoUrl ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }}/> : initials.slice(0, 1)}
          </div>
          <div>
            <div className="brand-text">{company ? company.toUpperCase() : 'CYPHER'}</div>
            <div className="brand-tag">Industrial Vision AI</div>
          </div>
        </a>
        <div className="pgtitle">
          <span className="h">{page}</span>
          <span className="sep">·</span>
          <span className="meta">{subtitle}</span>
          {shift && <><span className="sep">·</span><span className="shift">{shift}</span></>}
          {live && <span className="live">ao vivo</span>}
        </div>
        <div className="tools">
          <button className="icon-btn" aria-label="Notificações">
            <IBell size={18}/>
            {notifBadge ? <span className="bdg">{notifBadge}</span> : null}
          </button>
          <a href="Cypher Onboarding.html" className="icon-btn" aria-label="Configurações do onboarding" title="Reabrir onboarding"><ICog size={18}/></a>
          <div className="avatar">AG</div>
        </div>
      </header>
    );
  }

  // ─── DOCK ─────────────────────────────────────────
  const DOCK_ITEMS = [
    { key: 'dashboard', label: 'Dashboard',     icon: IDashboard, href: 'Cypher Dashboard.html' },
    { key: 'live',      label: 'Ao Vivo',       icon: IVideo, alertDot: true },
    { key: 'alerts',    label: 'Alertas',       icon: IBell,  badge: 6 },
    { kind: 'sep' },
    { key: 'heatmap',   label: 'Heatmap',       icon: IHeatmap, href: 'Cypher Heatmap.html' },
    { key: 'history',   label: 'Histórico',     icon: IGraph },
    { kind: 'sep' },
    { key: 'team',      label: 'Colaboradores', icon: IGroup },
    { key: 'invite',    label: 'Cadastrar',     icon: IAddUser },
    { kind: 'sep' },
    { key: 'config',    label: 'Configurações', icon: ISettings },
  ];

  const SNAP_ZONES = [
    { pos: 'bottom-center', label: 'Bottom · Center', cx: () => window.innerWidth / 2, cy: () => window.innerHeight - 64 },
    { pos: 'bottom-left',   label: 'Bottom · Left',   cx: () => 168,                   cy: () => window.innerHeight - 64 },
    { pos: 'bottom-right',  label: 'Bottom · Right',  cx: () => window.innerWidth - 168, cy: () => window.innerHeight - 64 },
    { pos: 'top-center',    label: 'Top · Center',    cx: () => window.innerWidth / 2, cy: () => 116 },
    { pos: 'left-center',   label: 'Left · Vertical', cx: () => 68,                    cy: () => window.innerHeight / 2 },
  ];
  function nearestZone(x, y) {
    let best = SNAP_ZONES[0], bestD = Infinity;
    for (const z of SNAP_ZONES) {
      const dx = x - z.cx(), dy = y - z.cy();
      const d = dx*dx + dy*dy;
      if (d < bestD) { bestD = d; best = z; }
    }
    return best;
  }

  function Dock({ activeKey = 'dashboard' }) {
    const [active, setActive] = useState(activeKey);
    const [position, setPosition] = useState(() => {
      try { return localStorage.getItem('cypher.dockPos') || 'bottom-center'; } catch { return 'bottom-center'; }
    });
    const [handleVisible, setHandleVisible] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [dragPoint, setDragPoint] = useState({ x: 0, y: 0 });
    const [targetZone, setTargetZone] = useState(null);
    const [toast, setToast] = useState(false);
    const stillTimer = useRef(null);
    const wrapRef = useRef(null);
    const isVertical = position === 'left-center';

    useEffect(() => {
      try { localStorage.setItem('cypher.dockPos', position); } catch {}
    }, [position]);

    const armHandle = () => {
      if (dragging) return;
      clearTimeout(stillTimer.current);
      stillTimer.current = setTimeout(() => setHandleVisible(true), 600);
    };
    const disarmHandle = () => {
      clearTimeout(stillTimer.current);
      setHandleVisible(false);
    };

    const onHandleMouseDown = (e) => {
      e.preventDefault();
      const rect = wrapRef.current.getBoundingClientRect();
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setDragPoint({ x: e.clientX, y: e.clientY });
      setDragging(true);
      setHandleVisible(true);
    };

    const dragPointRef = useRef(dragPoint);
    useEffect(() => { dragPointRef.current = dragPoint; }, [dragPoint]);

    useEffect(() => {
      if (!dragging) return;
      const onMove = (e) => {
        setDragPoint({ x: e.clientX, y: e.clientY });
        const z = nearestZone(e.clientX, e.clientY);
        setTargetZone(z.pos);
      };
      const onUp = () => {
        const z = nearestZone(dragPointRef.current.x, dragPointRef.current.y);
        setPosition(z.pos);
        setDragging(false);
        setTargetZone(null);
        setToast(true);
        setTimeout(() => setToast(false), 1800);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp, { once: true });
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
    }, [dragging]);

    const wrapStyle = dragging ? {
      left: dragPoint.x - dragOffset.x,
      top: dragPoint.y - dragOffset.y,
      right: 'auto', bottom: 'auto', transform: 'none', padding: 0,
    } : {};

    const onItemClick = (it) => (e) => {
      if (it.href) {
        // let anchor navigate
        return;
      }
      e.preventDefault();
      setActive(it.key);
    };

    return (
      <React.Fragment>
        <div className={`snap-zones ${dragging ? 'visible' : ''}`}>
          {SNAP_ZONES.map(z => (
            <div key={z.pos} className={`snap-zone ${z.pos} ${targetZone === z.pos ? 'target' : ''}`}>
              <span className="sz-label">{z.label}</span>
            </div>
          ))}
        </div>
        <div className={`dock-toast ${toast ? 'show' : ''}`}>
          <span className="dot"/>Dock reposicionado
        </div>
        <div ref={wrapRef}
             className={`dock-wrap ${dragging ? 'dragging' : 'snap-anim'} ${isVertical ? 'vertical' : ''}`}
             data-pos={dragging ? '' : position}
             style={wrapStyle}
             onMouseEnter={armHandle}
             onMouseMove={armHandle}
             onMouseLeave={disarmHandle}>
          <div className="dock">
            <div className={`dock-handle ${handleVisible ? 'visible' : ''}`}
                 onMouseDown={onHandleMouseDown}
                 title="Arrastar para reposicionar"/>
            {DOCK_ITEMS.map((it, i) => {
              if (it.kind === 'sep') return <div key={`sep-${i}`} className="dock-sep"/>;
              const Icon = it.icon;
              const isActive = it.key === active;
              const Tag = it.href ? 'a' : 'button';
              const tagProps = it.href ? { href: it.href } : { onClick: onItemClick(it) };
              return (
                <Tag key={it.key}
                     {...tagProps}
                     className={`dock-item ${isActive ? 'active' : ''}`}
                     aria-label={it.label}>
                  <div className="dock-icon">
                    <Icon size={20}/>
                    {it.badge && <span className="dock-badge">{it.badge}</span>}
                    {it.alertDot && <span className="dock-dot"/>}
                  </div>
                  <span className="dock-label">{it.label}</span>
                  <span className="dock-tooltip">{it.label}</span>
                </Tag>
              );
            })}
          </div>
        </div>
      </React.Fragment>
    );
  }

  // Expose
  Object.assign(window, {
    CypherRgba: rgba, CypherShade: shade,
    useCypherConfig, CypherTopbar: Topbar, CypherDock: Dock,
    CypherIconBase: IconBase,
    CypherIDashboard: IDashboard, CypherIVideo: IVideo, CypherIBell: IBell,
    CypherIHeatmap: IHeatmap, CypherIGraph: IGraph, CypherIGroup: IGroup,
    CypherIAddUser: IAddUser, CypherISettings: ISettings, CypherICog: ICog,
    CypherIExpand: IExpand, CypherIDownload: IDownload, CypherIRefresh: IRefresh,
    CypherIWarning: IWarning, CypherIExpandArrow: IExpandArrow,
  });
})();
