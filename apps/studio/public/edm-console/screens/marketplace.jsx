// ============================================================
// Opus Marketplace
// Three tabs:
//   - Adapters     — 3rd-party data adapters (BBG, LSEG, GLEIF, etc)
//   - Modules      — Pre-configured implementation modules
//   - Versions     — EDM platform versions / updater
// ============================================================

const MP_TABS = [
  { id: 'adapters', label: 'Adapters',         icon: 'IcConnect' },
  { id: 'modules',  label: 'Modules',          icon: 'IcPackage' },
  { id: 'versions', label: 'EDM Versions',     icon: 'IcUpgrade' },
];

const MP_CATEGORIES = [
  'All',
  'Security Master',
  'Party Master',
  'Price Master',
  'Private Markets',
  'Sustainability',
  'Corporate Actions',
  'Rates, Curves & Surfaces',
];

// Logo background colours (vendor-ish but distinct + reused for category vibe)
function logoColor(s) {
  const colors = [
    'linear-gradient(135deg, #ff8a65, #c2185b)',
    'linear-gradient(135deg, #6366f1, #4f46e5)',
    'linear-gradient(135deg, #06b6d4, #0891b2)',
    'linear-gradient(135deg, #10b981, #047857)',
    'linear-gradient(135deg, #f59e0b, #b45309)',
    'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    'linear-gradient(135deg, #ec4899, #be185d)',
    'linear-gradient(135deg, #14b8a6, #0f766e)',
    'linear-gradient(135deg, #ef4444, #b91c1c)',
    'linear-gradient(135deg, #3b82f6, #1e40af)',
  ];
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}
function logoInitials(name) {
  return name.replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(s => s[0].toUpperCase()).join('') || '??';
}

// ============================================================
// Catalog data
// ============================================================
const ADAPTERS = [
  // Security Master
  { id: 'bbg-bo',    name: 'Bloomberg BO',          vendor: 'Bloomberg',  category: 'Security Master',  status: 'installed', version: '4.2.1', desc: 'Back-Office reference data feed covering equity, fixed income, derivatives and FX.', features: ['CINS, ISIN, CUSIP, SEDOL, RIC mapping', 'Corporate actions schedule', 'Reference data deltas via SFTP'] },
  { id: 'lseg-dss',  name: 'LSEG DSS',              vendor: 'LSEG',       category: 'Security Master',  status: 'installed', version: '3.8.0', desc: 'DataScope Select for equities, bonds, derivatives, ETFs and indices.', features: ['Full and delta extracts', 'Configurable templates', 'Native EDM mapping'] },
  { id: 'lseg-dsp',  name: 'LSEG DSP',              vendor: 'LSEG',       category: 'Security Master',  status: 'update',    version: '2.1.4', desc: 'DataScope Plus FI & Equity reference data with sub-licensing entitlement.', features: ['Fixed Income + Equity', 'Streaming entitlements', 'Bulk + delta'] },
  { id: 'bbg-bbo',   name: 'Bloomberg BBO',         vendor: 'Bloomberg',  category: 'Security Master',  status: 'available', version: '1.0.0', desc: 'BBO 150 reference dataset for pricing and corporate events.', features: ['150 BBO fields', 'Daily cycle', 'CAX integration'] },
  { id: 'six',       name: 'SIX',                   vendor: 'SIX',        category: 'Security Master',  status: 'installed', version: '2.4.0', desc: 'SIX Financial Information reference data for global securities.', features: ['Cross-listed identifier resolution', 'Corporate actions', 'Multi-language descriptions'] },
  { id: 'red-cds',   name: 'RED CDS',               vendor: 'Markit',     category: 'Security Master',  status: 'installed', version: '1.7.0', desc: 'RED reference data for Credit Default Swaps.', features: ['REDcode mapping', 'CDS curves linkage', 'Tier + DocClause coverage'] },
  { id: 'gicrs',     name: 'GICRS',                 vendor: 'S&P',        category: 'Security Master',  status: 'available', version: '1.0.0', desc: 'Global Industry Classification Reference Standard.', features: ['Sector / industry codes', 'Mapping to GICS', 'Historic versions'] },
  { id: 'iscrs',     name: 'ISCRS',                 vendor: 'S&P',        category: 'Security Master',  status: 'available', version: '1.0.0', desc: 'Issuer & Security Credit Reference Service.', features: ['Issuer ratings', 'Watchlist outlook', 'Migration history'] },
  // Party Master
  { id: 'gleif',     name: 'GLEIF',                 vendor: 'GLEIF',      category: 'Party Master',     status: 'installed', version: '2.0.1', desc: 'Global Legal Entity Identifier Foundation feed for LEI data.', features: ['Daily LEI Concatenated File', 'Relationship records', 'Renewal status'] },
  { id: 'kensho',    name: 'Kensho',                vendor: 'S&P',        category: 'Party Master',     status: 'installed', version: '1.4.0', desc: 'Kensho NERD entity resolution and linking service.', features: ['Free-text → entity', 'Confidence scoring', 'Bulk + streaming'] },
  { id: 'becrs',     name: 'BECRS',                 vendor: 'Bloomberg',  category: 'Party Master',     status: 'installed', version: '2.2.0', desc: 'Bloomberg Entity & Credit Reference Service.', features: ['Issuer hierarchy', 'Industry codes', 'Credit ratings'] },
  { id: 'gics-d',    name: 'GICS Direct',           vendor: 'S&P',        category: 'Party Master',     status: 'available', version: '1.0.0', desc: 'GICS classification feed direct from S&P.', features: ['Industry codes', 'Sub-industry detail', 'Daily updates'] },
  { id: 'gearbox',   name: 'Gearbox',               vendor: 'Refinitiv',  category: 'Party Master',     status: 'available', version: '1.0.0', desc: 'Entity relationship & ownership graph.', features: ['Parent / sub linkage', 'Voting interests', 'Beneficial ownership'] },
  // Price Master
  { id: 'sp-corp',   name: 'S&P Corporate & Sov.',  vendor: 'S&P',        category: 'Price Master',     status: 'installed', version: '1.8.0', desc: 'S&P Corporate & Sovereign Bond pricing service.', features: ['EOD + intraday', 'Yield curves attached', 'Quality scores'] },
  { id: 'cds-pricing',name: 'CDS Pricing',          vendor: 'Markit',     category: 'Price Master',     status: 'installed', version: '2.0.0', desc: 'Markit CDS Pricing Service.', features: ['Multi-tier spreads', 'Recovery rates', 'Implied probability'] },
  { id: 'bbg-bo-pr', name: 'BBG BO Pricing',        vendor: 'Bloomberg',  category: 'Price Master',     status: 'installed', version: '3.0.0', desc: 'Bloomberg Back-Office pricing — equities, FI, derivatives.', features: ['EOD + intraday snapshots', 'BPS', 'Quality + source attribution'] },
  { id: 'bps',       name: 'BPS',                   vendor: 'Bloomberg',  category: 'Price Master',     status: 'installed', version: '4.1.0', desc: 'Bloomberg Pricing Service (BVAL).', features: ['Evaluated pricing', 'Confidence intervals', 'Daily delivery'] },
  { id: 'muni',      name: 'Municipal Bonds',       vendor: 'Various',    category: 'Price Master',     status: 'available', version: '1.0.0', desc: 'Coverage for U.S. municipal bond pricing.', features: ['Tax-status flags', 'Call schedules', 'EMMA disclosures'] },
  { id: 'sec-prod',  name: 'Securitized Products',  vendor: 'Various',    category: 'Price Master',     status: 'available', version: '1.0.0', desc: 'ABS, MBS, CMBS pricing & analytics.', features: ['Pool-level cashflows', 'Pre-pay assumptions', 'Loss curves'] },
  { id: 'six-vdf',   name: 'SIX VDF PRD',           vendor: 'SIX',        category: 'Price Master',     status: 'available', version: '1.0.0', desc: 'SIX Valor Data Feed Pricing Reference Data.', features: ['Multi-source consolidation', 'Switch source rules', 'Asia coverage'] },
  // Private Markets
  { id: 'ilevel',    name: 'iLEVEL',                vendor: 'S&P',        category: 'Private Markets',  status: 'installed', version: '2.5.0', desc: 'Private Markets portfolio monitoring & GP data.', features: ['Fund + portfolio company data', 'NAV waterfall', 'Quarterly cycle'] },
  { id: 'capiq',     name: 'S&P Capital IQ',        vendor: 'S&P',        category: 'Private Markets',  status: 'installed', version: '3.2.0', desc: 'Capital IQ private + public entity data.', features: ['Ownership graph', 'Transactions / M&A', 'CAPIQ_ID linking'] },
  { id: 'investran', name: 'Investran',             vendor: 'SS&C',       category: 'Private Markets',  status: 'available', version: '1.0.0', desc: 'Investran investor & transaction data.', features: ['Capital calls + distributions', 'GP commitments', 'NAV history'] },
  // Sustainability / ESG
  { id: 'msci-esg',  name: 'MSCI ESG',              vendor: 'MSCI',       category: 'Sustainability',   status: 'installed', version: '2.0.0', desc: 'MSCI ESG Ratings + Climate data.', features: ['ESG ratings + scores', 'Controversies', 'Carbon footprint'] },
  { id: 'lseg-esg',  name: 'LSEG ESG',              vendor: 'LSEG',       category: 'Sustainability',   status: 'installed', version: '1.4.0', desc: 'LSEG Sustainable Investing ESG dataset.', features: ['350+ raw metrics', 'Industry-relative scores', 'Materiality weighting'] },
  { id: 'sustain',   name: 'Sustainalytics',        vendor: 'Morningstar',category: 'Sustainability',   status: 'installed', version: '1.6.0', desc: 'Sustainalytics ESG Risk Ratings.', features: ['Exposure + Management', 'Risk categories', 'Daily updates'] },
  { id: 'gresb',     name: 'GRESB',                 vendor: 'GRESB',      category: 'Sustainability',   status: 'available', version: '1.0.0', desc: 'Real estate & infrastructure ESG benchmarking.', features: ['Asset-level metrics', 'Peer benchmarks', 'Annual + interim'] },
  { id: 'cdp',       name: 'CDP',                   vendor: 'CDP',        category: 'Sustainability',   status: 'available', version: '1.0.0', desc: 'Carbon Disclosure Project — climate, water, forests.', features: ['Scope 1/2/3 emissions', 'Disclosure scores', 'Sector benchmarks'] },
  { id: 'knoema',    name: 'Knoema',                vendor: 'Knoema',     category: 'Sustainability',   status: 'available', version: '1.0.0', desc: 'Macro & ESG indicators across 2.5B time series.', features: ['Country-level data', 'Custom basket support', 'Daily / monthly'] },
  { id: 'trucost',   name: 'S&P Trucost',           vendor: 'S&P',        category: 'Sustainability',   status: 'available', version: '1.0.0', desc: 'Climate risk, carbon and natural capital data.', features: ['Carbon footprinting', 'Paris Alignment', 'Physical risk scores'] },
  // Corporate Actions
  { id: 'cax',       name: 'CAX (Corporate Actions)', vendor: 'S&P',      category: 'Corporate Actions', status: 'installed', version: '2.0.0', desc: 'Corporate actions feed with announcement, election, payment.', features: ['ISO 20022', '120+ event types', 'Election workflow'] },
  // Rates
  { id: 'sp-curves', name: 'S&P Rates & Curves',    vendor: 'S&P',        category: 'Rates, Curves & Surfaces', status: 'available', version: '1.0.0', desc: 'Multi-currency rates, swap curves and volatility surfaces.', features: ['Curve construction', 'Vol surfaces', 'Historical playback'] },
];

const MODULES = [
  { id: 'fs-dash',    name: 'Common Financial Services Dashboard', category: 'Cross-cutting',  status: 'installed', version: '4.2.1', desc: 'Out-of-the-box dashboard for data quality, feed processing and vendor metrics.', features: ['Data-quality heatmap', 'Feed status overview', 'Vendor SLA scoreboard', 'Pre-built persona views'] },
  { id: 'persona-wf', name: 'Persona-driven Workflows',             category: 'Cross-cutting',  status: 'installed', version: '4.2.1', desc: 'Pre-built workflows for Security and Party search/edit, tuned per persona.', features: ['Security search & edit', 'Party search & edit', 'Configurable approvers'] },
  { id: 'exc-mgmt',   name: 'Streamlined Exception Management',     category: 'Cross-cutting',  status: 'installed', version: '4.2.1', desc: 'Exception triage with fewer clicks, queue routing and bulk actions.', features: ['Inbox + detail panel', 'Bulk fix actions', 'SLA timers'] },
  { id: 'it-audit',   name: 'IT & Audit Transparency',              category: 'Cross-cutting',  status: 'update',    version: '4.2.0', desc: 'Complete audit trail of who changed what, when and why.', features: ['Field-level audit', 'Export-ready reports', 'Sox-compliant'] },
  { id: 'sm-10',      name: 'Security Master 1.0',                  category: 'Security Master', status: 'installed', version: '1.0.3', desc: 'Pre-built Security Master with sources, matching, mastering, CAX and persona dashboards.', features: ['Pre-defined data structures', 'Built-in matching rules', 'Pre-configured validations', 'Native dashboards'] },
  { id: 'pm-10',      name: 'Party Master 1.0',                     category: 'Party Master',    status: 'installed', version: '1.0.2', desc: 'Pre-built Party Master with LEI / GICS / hierarchy resolution.', features: ['Issuer hierarchy', 'Ownership graph', 'CAPIQ_ID linking'] },
  { id: 'pr-10',      name: 'Price Master 1.0',                     category: 'Price Master',    status: 'available', version: '1.0.0', desc: 'Complete price mastering: matching, exception mgmt, SLA + IT & Audit tools.', features: ['Price matching', 'Source switch rules', 'SLA management'] },
  { id: 'priv-10',    name: 'Private Markets 1.0',                  category: 'Private Markets', status: 'available', version: '1.0.0', desc: 'Private Markets module with FS Dashboard, persona views and audit transparency.', features: ['Fund / company / investment model', 'NAV waterfall', 'GP reporting cycle'] },
  { id: 'sus-10',     name: 'Sustainability 1.0',                   category: 'Sustainability',  status: 'beta',     version: '0.9.0-beta', desc: 'Sustainability module with ESG analytics, Paris Alignment and Trucost integration.', features: ['Carbon footprinting', 'Paris Alignment', 'Multi-vendor ESG'] },
  { id: 'rcs-10',     name: 'Rates, Curves & Surfaces 1.0',         category: 'Rates, Curves & Surfaces', status: 'available', version: '1.0.0', desc: 'Mastering layer for rate curves and vol surfaces.', features: ['Curve construction', 'Vol surface bootstrapping', 'Multi-source switching'] },
];

const VERSIONS = [
  { v: '20.0.0-beta',   date: 'April 2026',     status: 'beta',      title: 'EDM 20.0 Preview',
    notes: [
      'Native cloud-first architecture with separate compute & storage',
      'AI-assisted rule authoring (preview)',
      'Re-imagined Solution canvas with auto-layout',
      'Web-first thick-client parity for Porter and Constructor',
    ], compat: 'Requires SQL Server 2022+', size: '1.2 GB' },
  { v: '19.4.0',        date: 'May 2026',       status: 'available', title: 'EDM 19.4 Stable',
    notes: [
      'Rule Builder: Generate Unit Test Arguments now infers from parameter types',
      'Console Grouping: Import/Export now supports EDM Groups (CLI parity)',
      'Performance: 30% faster Solution execution on large data sets',
      'Security: bumped to OpenSSL 3.0 and patched CVE-2025-0843',
    ], compat: 'Requires SQL Server 2019+', size: '880 MB' },
  { v: '19.3.2',        date: 'February 2026',  status: 'available', title: 'EDM 19.3.2 Maintenance',
    notes: [
      'Fix: Porter file monitor occasionally missed deltas at midnight UTC',
      'Fix: BBG BO adapter handle large CINS files (>2GB) without OOM',
      'Improved error messages on Rule Builder Build action',
    ], compat: 'Requires SQL Server 2019+', size: '410 MB' },
  { v: '19.3.1.2',      date: 'November 2025',  status: 'current',   title: 'EDM 19.3.1.2 (current)',
    notes: [
      'Active Directory sync flag controls for new web users',
      'Console Grouping & Security: Multi-Group operations wizard',
      'Persona-driven Workflows for Security and Party',
    ], compat: 'Requires SQL Server 2019+', size: '850 MB' },
];

// ============================================================
// Cards
// ============================================================
function StatusBadge({ status }) {
  const labels = { installed: 'Installed', update: 'Update available', available: 'Available', beta: 'Beta', included: 'Included', current: 'Current install' };
  return <span className={`mp-status ${status}`}>{labels[status] || status}</span>;
}

function AdapterCard({ a, onOpen }) {
  return (
    <div className="mp-card" onClick={onOpen}>
      <div className="mp-card-head">
        <span className="mp-logo" style={{ background: logoColor(a.name) }}>
          {logoInitials(a.name)}
        </span>
        <div className="mp-card-title">
          <div className="t" title={a.name}>{a.name}</div>
          <div className="s">{a.vendor}</div>
        </div>
      </div>
      <StatusBadge status={a.status} />
      <div className="mp-card-desc">{a.desc}</div>
      <div className="mp-tags">
        <span className="mp-tag">{a.category}</span>
        <span className="mp-tag">v{a.version}</span>
      </div>
      <div className="mp-card-foot">
        {a.status === 'installed' && (
          <button className="btn"><IcCog size={13} /> Configure</button>
        )}
        {a.status === 'update' && (
          <button className="btn primary"><IcUpgrade size={13} /> Update</button>
        )}
        {a.status === 'available' && (
          <button className="btn primary"><IcDownload size={13} /> Install</button>
        )}
        {a.status === 'beta' && (
          <button className="btn"><IcDownload size={13} /> Install (Beta)</button>
        )}
      </div>
    </div>
  );
}

function ModuleCard({ m, onOpen }) {
  return (
    <div className="mp-card" onClick={onOpen}>
      <div className="mp-card-head">
        <span className="mp-logo" style={{ background: logoColor('mod-' + m.name) }}>
          <IcPackage size={20} />
        </span>
        <div className="mp-card-title">
          <div className="t" title={m.name}>{m.name}</div>
          <div className="s">{m.category}</div>
        </div>
      </div>
      <StatusBadge status={m.status} />
      <div className="mp-card-desc">{m.desc}</div>
      <div className="mp-tags">
        <span className="mp-tag">v{m.version}</span>
        <span className="mp-tag">{m.features.length} features</span>
      </div>
      <div className="mp-card-foot">
        {m.status === 'installed' && (
          <button className="btn"><IcCog size={13} /> Configure</button>
        )}
        {m.status === 'update' && (
          <button className="btn primary"><IcUpgrade size={13} /> Update</button>
        )}
        {m.status === 'available' && (
          <button className="btn primary"><IcDownload size={13} /> Install</button>
        )}
        {m.status === 'beta' && (
          <button className="btn"><IcStar size={13} /> Try Beta</button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Detail drawer (slide-in right panel)
// ============================================================
function Drawer({ item, kind, onClose, onAction }) {
  const [installing, setInstalling] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  function install() {
    setInstalling(true);
    setProgress(0);
    const steps = ['Resolving dependencies', 'Downloading package', 'Validating signature', 'Installing files', 'Registering with EDM', 'Running smoke tests'];
    let p = 0;
    const t = setInterval(() => {
      p += 100 / steps.length;
      setProgress(Math.min(100, p));
      if (p >= 100) {
        clearInterval(t);
        setTimeout(() => {
          setInstalling(false);
          onAction('installed');
          onClose();
        }, 500);
      }
    }, 380);
  }

  if (!item) return null;

  return (
    <>
      <div className="mp-drawer-backdrop" onClick={onClose} />
      <div className="mp-drawer">
        <div className="mp-drawer-head">
          <span className="mp-logo"
                style={{ background: logoColor((kind === 'module' ? 'mod-' : '') + item.name) }}>
            {kind === 'module' ? <IcPackage size={22} /> : logoInitials(item.name)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{item.name}</h2>
            <div style={{ color: 'var(--ink-4)', fontSize: 13, marginTop: 2 }}>
              {kind === 'adapter' ? item.vendor + ' · ' + item.category : item.category}
              {' · v' + item.version}
            </div>
            <div style={{ marginTop: 8 }}>
              <StatusBadge status={item.status} />
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><IcX size={16} /></button>
        </div>

        <div className="mp-drawer-body">
          <div className="mp-drawer-section">
            <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: 0 }}>
              {item.desc}
            </p>
          </div>

          <div className="mp-drawer-section">
            <div className="h">What's included</div>
            <div>
              {item.features.map((f, i) => (
                <div key={i} className="mp-feature">
                  <IcCheck size={14} />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {kind === 'adapter' && (
            <div className="mp-drawer-section">
              <div className="h">Delivery</div>
              <div className="prop-grid">
                <div className="prop-grid-row">
                  <div className="pg-k">Cycle</div>
                  <div className="pg-v readonly">Daily delta + weekly full</div>
                </div>
                <div className="prop-grid-row">
                  <div className="pg-k">Protocol</div>
                  <div className="pg-v readonly">SFTP / HTTPS / REST</div>
                </div>
                <div className="prop-grid-row">
                  <div className="pg-k">Format</div>
                  <div className="pg-v readonly">CSV / XML / JSON</div>
                </div>
                <div className="prop-grid-row">
                  <div className="pg-k">Entitlement</div>
                  <div className="pg-v readonly">Per-data-pack</div>
                </div>
              </div>
            </div>
          )}

          <div className="mp-drawer-section">
            <div className="h">Resources</div>
            <div className="vstack" style={{ gap: 6 }}>
              <a href="#" onClick={e => e.preventDefault()}
                 style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 13 }}>
                <IcFile size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Installation & configuration guide
              </a>
              <a href="#" onClick={e => e.preventDefault()}
                 style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 13 }}>
                <IcRules size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Field mapping reference
              </a>
              <a href="#" onClick={e => e.preventDefault()}
                 style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 13 }}>
                <IcHistory size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Changelog
              </a>
            </div>
          </div>

          {installing && (
            <div className="mp-progress">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Installing {item.name}…
              </div>
              <div className="bar"><i style={{ width: progress + '%' }} /></div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {Math.round(progress)}% complete
              </div>
            </div>
          )}
        </div>

        <div className="mp-drawer-foot">
          <button className="btn" onClick={onClose}>Close</button>
          {item.status === 'installed' && (
            <>
              <button className="btn">
                <IcCog size={14} /> Configure
              </button>
              <button className="btn primary"
                      onClick={() => { onAction('uninstall'); onClose(); }}>
                <IcTrash size={14} /> Uninstall
              </button>
            </>
          )}
          {item.status === 'update' && (
            <button className="btn primary" onClick={install} disabled={installing}>
              <IcUpgrade size={14} /> Update to latest
            </button>
          )}
          {(item.status === 'available' || item.status === 'beta') && (
            <button className="btn primary" onClick={install} disabled={installing}>
              <IcDownload size={14} /> Install {item.status === 'beta' ? '(beta)' : ''}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// Versions tab
// ============================================================
function VersionsTab() {
  const [versions, setVersions] = React.useState(VERSIONS);
  const [installing, setInstalling] = React.useState(null);
  const [progress, setProgress] = React.useState(0);
  const [confirm, setConfirm] = React.useState(null);

  function startInstall(v) {
    setConfirm(null);
    setInstalling(v.v);
    setProgress(0);
    const t = setInterval(() => {
      setProgress(p => {
        const next = p + 6;
        if (next >= 100) {
          clearInterval(t);
          setTimeout(() => {
            setVersions(versions.map(x =>
              x.v === v.v ? { ...x, status: 'current' }
                          : x.status === 'current' ? { ...x, status: 'available' } : x));
            setInstalling(null);
            ruleToast(`Updated to EDM ${v.v}`, 'success');
          }, 400);
          return 100;
        }
        return next;
      });
    }, 200);
  }

  return (
    <div style={{ padding: '20px 36px 60px' }}>
      <div className="hstack" style={{ marginBottom: 14, gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>EDM Available Versions</h2>
        <span className="muted">Install or upgrade your Opus EDM installation. Updates are validated against your data and downstream consumers.</span>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn">
          <IcRedo size={14} /> Check for updates
        </button>
      </div>

      {versions.map(v => (
        <div key={v.v} className={`mp-version ${v.status === 'current' ? 'current' : ''} ${v.status === 'beta' ? 'beta' : ''}`}>
          <div className="mp-version-left">
            <div className="num">{v.v}</div>
            <div className="date">Released {v.date}</div>
            <div className="badges">
              <StatusBadge status={v.status} />
              {v.status === 'current' && <span className="mp-tag" style={{ background: 'var(--magenta-soft)', color: 'var(--magenta)' }}>Current</span>}
            </div>
          </div>
          <div className="mp-version-notes">
            <h4>{v.title}</h4>
            <ul>{v.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-4)' }}>
              <IcInfo size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {v.compat} · download size {v.size}
            </div>
            {installing === v.v && (
              <div className="mp-progress" style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Installing EDM {v.v}…
                </div>
                <div className="bar"><i style={{ width: progress + '%' }} /></div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {Math.round(progress)}% complete · {progress < 30 ? 'Downloading' : progress < 60 ? 'Verifying signature' : progress < 90 ? 'Applying database migrations' : 'Restarting services'}
                </div>
              </div>
            )}
          </div>
          <div className="mp-version-actions">
            {v.status === 'current' && (
              <>
                <button className="btn" disabled>Currently installed</button>
                <button className="btn ghost" style={{ fontSize: 12 }}>
                  <IcFile size={12} /> Release notes
                </button>
              </>
            )}
            {v.status === 'available' && (
              <>
                <button className="btn primary" onClick={() => setConfirm(v)} disabled={!!installing}>
                  {versions.findIndex(x => x.status === 'current') > versions.findIndex(x => x.v === v.v)
                    ? <><IcUpgrade size={13} /> Upgrade</>
                    : <><IcDownload size={13} /> Install</>}
                </button>
                <button className="btn ghost" style={{ fontSize: 12 }}>
                  <IcFile size={12} /> Release notes
                </button>
              </>
            )}
            {v.status === 'beta' && (
              <>
                <button className="btn primary" onClick={() => setConfirm(v)} disabled={!!installing}>
                  <IcStar size={13} /> Try preview
                </button>
                <button className="btn ghost" style={{ fontSize: 12 }}>
                  <IcFile size={12} /> Release notes
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {confirm && (
        <ConfirmModal
          title={`Install EDM ${confirm.v}?`}
          message={
            <div>
              <p>This will replace your current EDM installation (<strong>edmv19.3.1.2</strong>) with version <strong>{confirm.v}</strong>.</p>
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-3)' }}>
                <li>Database schema will be migrated automatically</li>
                <li>Active sessions will be drained gracefully (≈2 min)</li>
                <li>You can roll back from the Versions tab if needed</li>
              </ul>
            </div>
          }
          confirmLabel={confirm.status === 'beta' ? 'Install preview' : 'Install update'}
          onConfirm={() => startInstall(confirm)}
          onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ============================================================
// Main Marketplace screen
// ============================================================
function Marketplace() {
  const [tab, setTab] = React.useState('adapters');
  const [category, setCategory] = React.useState('All');
  const [filter, setFilter] = React.useState('');
  const [drawer, setDrawer] = React.useState(null); // { item, kind }
  const [adapters, setAdapters] = React.useState(ADAPTERS);
  const [modules, setModules] = React.useState(MODULES);
  const [showInstalledOnly, setShowInstalledOnly] = React.useState(false);

  const filteredAdapters = adapters.filter(a =>
    (category === 'All' || a.category === category) &&
    (!showInstalledOnly || a.status !== 'available') &&
    a.name.toLowerCase().includes(filter.toLowerCase()));

  const filteredModules = modules.filter(m =>
    (category === 'All' || m.category === category) &&
    (!showInstalledOnly || m.status !== 'available') &&
    m.name.toLowerCase().includes(filter.toLowerCase()));

  function onDrawerAction(action) {
    if (!drawer) return;
    const { item, kind } = drawer;
    if (kind === 'adapter') {
      setAdapters(adapters.map(a => a.id === item.id
        ? { ...a, status: action === 'uninstall' ? 'available' : 'installed' } : a));
      ruleToast(action === 'uninstall'
        ? `${item.name} uninstalled`
        : `${item.name} installed`, 'success');
    } else {
      setModules(modules.map(m => m.id === item.id
        ? { ...m, status: action === 'uninstall' ? 'available' : 'installed' } : m));
      ruleToast(action === 'uninstall'
        ? `${item.name} uninstalled`
        : `${item.name} installed`, 'success');
    }
  }

  // counts for tab badges
  const counts = {
    adapters: adapters.length,
    modules: modules.length,
    versions: VERSIONS.length,
  };
  const installedA = adapters.filter(a => a.status === 'installed').length;
  const updatesA = adapters.filter(a => a.status === 'update').length;
  const installedM = modules.filter(m => m.status === 'installed').length;
  const updatesM = modules.filter(m => m.status === 'update').length;

  return (
    <div className="mp-page fade-in">
      <div className="mp-hero">
        <h1>Opus Marketplace</h1>
        <p>Install adapters, pre-configured modules and platform updates from one place. Everything is signed,
           validated and ready to plug into your EDM environment.</p>
        <div className="mp-stats">
          <div className="mp-stat">
            <span className="v">{installedA + installedM}</span>
            <span className="k">Installed</span>
          </div>
          <div className="mp-stat">
            <span className="v">{updatesA + updatesM}</span>
            <span className="k">Updates available</span>
          </div>
          <div className="mp-stat">
            <span className="v">{adapters.length}</span>
            <span className="k">Adapters</span>
          </div>
          <div className="mp-stat">
            <span className="v">{modules.length}</span>
            <span className="k">Modules</span>
          </div>
          <div className="mp-stat">
            <span className="v">v19.3.1.2</span>
            <span className="k">EDM installed</span>
          </div>
        </div>
      </div>

      <div className="mp-tabs">
        {MP_TABS.map(t => {
          const Icon = window[t.icon];
          return (
            <button key={t.id}
                    className={`tab ${tab === t.id ? 'active' : ''}`}
                    onClick={() => setTab(t.id)}>
              <Icon size={14} /> {t.label}
              <span className="count">{counts[t.id]}</span>
            </button>
          );
        })}
      </div>

      {tab !== 'versions' && (
        <div className="mp-toolbar">
          <div className="wb-list-search-wrap" style={{ width: 300 }}>
            <IcSearch size={14} />
            <input className="input"
                   placeholder={`Search ${tab}…`}
                   value={filter}
                   onChange={e => setFilter(e.target.value)}
                   style={{ paddingLeft: 32 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {MP_CATEGORIES.map(c => (
              <button key={c}
                      className={`mp-chip ${category === c ? 'active' : ''}`}
                      onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          <label className="checkbox" style={{ fontSize: 12 }}>
            <input type="checkbox" checked={showInstalledOnly}
                   onChange={e => setShowInstalledOnly(e.target.checked)} />
            <span className="box"><IcCheck size={12} /></span>
            Installed only
          </label>
        </div>
      )}

      {tab === 'adapters' && (
        <div className="mp-grid">
          {filteredAdapters.map(a => (
            <AdapterCard key={a.id} a={a}
                         onOpen={() => setDrawer({ item: a, kind: 'adapter' })} />
          ))}
          {filteredAdapters.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center',
                          color: 'var(--ink-4)' }}>
              No adapters match the current filters.
            </div>
          )}
        </div>
      )}

      {tab === 'modules' && (
        <div className="mp-grid">
          {filteredModules.map(m => (
            <ModuleCard key={m.id} m={m}
                        onOpen={() => setDrawer({ item: m, kind: 'module' })} />
          ))}
          {filteredModules.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center',
                          color: 'var(--ink-4)' }}>
              No modules match the current filters.
            </div>
          )}
        </div>
      )}

      {tab === 'versions' && <VersionsTab />}

      {drawer && (
        <Drawer item={drawer.item} kind={drawer.kind}
                onClose={() => setDrawer(null)}
                onAction={onDrawerAction} />
      )}
    </div>
  );
}

window.Marketplace = Marketplace;
window.ADAPTERS_CATALOG = ADAPTERS;
window.MODULES_CATALOG = MODULES;
window.VERSIONS_CATALOG = VERSIONS;
window.MP_CATEGORIES_LIST = MP_CATEGORIES;
window.logoColor = logoColor;
window.logoInitials = logoInitials;
