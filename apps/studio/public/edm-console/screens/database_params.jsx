// ============================================================
// Database Parameters — Opus EDM
//   Per-database configuration: Variables, File Locations,
//   Connections, Message Queues, Solution Return Codes, XML
//   Schema, Categories, Channels, Keywords, Languages, Version
//   Control. Seeded from a real DatabaseParametersExport XML.
// ============================================================

const DBP_DATA = (window.DB_PARAMS || { meta: {}, counts: {}, variables: [], locations: [], connections: [], queues: [], retcodes: [], categories: [], xmlschemas: [], versionControl: {} });

const DBP_CATS = [
  { id: 'variables',      label: 'Variables',             icon: 'IcVariables', kind: 'grid' },
  { id: 'locations',      label: 'File Locations',        icon: 'IcFolder',    kind: 'grid' },
  { id: 'connections',    label: 'Connections',           icon: 'IcConnect',   kind: 'grid' },
  { id: 'queues',         label: 'Message Queues',        icon: 'IcLayers',    kind: 'grid' },
  { id: 'retcodes',       label: 'Solution Return Codes', icon: 'IcCircleDot', kind: 'grid' },
  { id: 'xmlschemas',     label: 'XML Schema',            icon: 'IcSitemap',   kind: 'grid' },
  { id: 'categories',     label: 'Categories',            icon: 'IcTag',       kind: 'grid' },
  { id: 'channels',       label: 'Channels',              icon: 'IcSend',      kind: 'empty' },
  { id: 'keywords',       label: 'Keywords',              icon: 'IcStar',      kind: 'empty' },
  { id: 'languages',      label: 'Languages',             icon: 'IcBook',      kind: 'languages' },
  { id: 'versioncontrol', label: 'Version Control',       icon: 'IcGitBranch', kind: 'vc' },
];

const DBP_SCHEMAS = {
  variables: { add: 'New variable', cols: [
    { key: 'name',  label: 'Variable', w: 'minmax(220px,1.3fr)', filter: true, primary: true },
    { key: 'enc',   label: 'Encrypt',  w: '110px', type: 'check', center: true },
    { key: 'value', label: 'Value',    w: 'minmax(240px,1.7fr)', filter: true, editable: true, secret: 'enc' },
  ]},
  locations: { add: 'New file location', cols: [
    { key: 'name', label: 'Name',     w: 'minmax(200px,1fr)',   filter: true, primary: true },
    { key: 'path', label: 'Path',     w: 'minmax(240px,1.4fr)', filter: true, mono: true, editable: true },
    { key: 'unc',  label: 'UNC Path', w: 'minmax(240px,1.4fr)', mono: true, editable: true },
  ]},
  connections: { add: 'New connection', cols: [
    { key: 'name',       label: 'Name',            w: 'minmax(120px,.8fr)',  filter: true, primary: true },
    { key: 'type',       label: 'Type',            w: '130px', badge: true },
    { key: 'dataSource', label: 'Data source',     w: 'minmax(160px,1.2fr)', mono: true },
    { key: 'systemDB',   label: 'System database', w: 'minmax(160px,1.2fr)', mono: true },
    { key: 'auth',       label: 'Auth',            w: '130px' },
  ]},
  queues: { add: 'New message queue', cols: [
    { key: 'name',     label: 'Name',       w: 'minmax(160px,1fr)',   filter: true, primary: true },
    { key: 'queue',    label: 'Queue name', w: 'minmax(140px,.9fr)',  mono: true },
    { key: 'encoding', label: 'Encoding',   w: '110px', center: true },
    { key: 'plugin',   label: 'Plugin',     w: 'minmax(180px,1.2fr)', mono: true },
  ]},
  retcodes: { add: 'New return code', cols: [
    { key: 'code',    label: 'Code',    w: '120px', mono: true, primary: true, filter: true, center: true },
    { key: 'message', label: 'Message', w: 'minmax(280px,1fr)', filter: true, editable: true },
  ]},
  xmlschemas: { add: 'New schema', editAction: true, cols: [
    { key: 'name', label: 'Schema name', w: 'minmax(280px,1fr)', filter: true, primary: true },
  ]},
  categories: { add: 'New category', cols: [
    { key: 'id',   label: 'ID',   w: '90px', mono: true, center: true },
    { key: 'name', label: 'Name', w: 'minmax(240px,1fr)', filter: true, primary: true, editable: true },
  ]},
};

// ---- small inline icons not in the icon set ----
const IcSortAZ = (p) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4v16M7 20l-3-3M7 20l3-3" /><path d="M14 7h6M14 12h4M14 17h2" />
  </svg>
);
const IcColumns = (p) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M9 4v16M15 4v16" />
  </svg>
);
const IcDots3 = (p) => (
  <svg width={p.size || 15} height={p.size || 15} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
  </svg>
);
const IcChevUp = (p) => (
  <svg width={p.size || 12} height={p.size || 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
);
const IcChevDn = (p) => (
  <svg width={p.size || 12} height={p.size || 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
);

// ---- build initial row state with stable ids + derived fields ----
function dbpInitRows() {
  let id = 0;
  const mk = (arr) => (arr || []).map(r => ({ _id: ++id, ...r }));
  const conns = mk(DBP_DATA.connections).map(c => ({ ...c, auth: c.winAuth ? 'Windows' : 'SQL login' }));
  return {
    variables: mk(DBP_DATA.variables),
    locations: mk(DBP_DATA.locations),
    connections: conns,
    queues: mk(DBP_DATA.queues),
    retcodes: mk(DBP_DATA.retcodes),
    categories: mk(DBP_DATA.categories),
    xmlschemas: mk(DBP_DATA.xmlschemas),
    languages: mk(DBP_DATA.languages),
  };
}

// =============================================================
// Data grid for a category
// =============================================================
function DbpGrid({ catId, rows, onChange, markDirty, onNew, onEdit }) {
  const schema = DBP_SCHEMAS[catId];
  const rowClickEditor = catId === 'connections' || catId === 'queues';
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(10);
  const [sort, setSort] = React.useState({ key: null, dir: 1 });
  const [search, setSearch] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(catId === 'variables');
  const [filters, setFilters] = React.useState({});
  const [sel, setSel] = React.useState(() => new Set());
  const [hidden, setHidden] = React.useState(() => new Set());
  const [colMenu, setColMenu] = React.useState(false);
  const [edit, setEdit] = React.useState(null); // { id, key }
  const colMenuRef = React.useRef(null);

  React.useEffect(() => { setPage(1); }, [catId, search, perPage, JSON.stringify(filters)]);
  React.useEffect(() => {
    function onDoc(e) { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setColMenu(false); }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const cols = schema.cols.filter(c => !hidden.has(c.key));
  const filterCols = schema.cols.filter(c => c.filter);

  // ---- derive filtered + sorted rows ----
  let view = rows.slice();
  if (search.trim()) {
    const q = search.toLowerCase();
    view = view.filter(r => schema.cols.some(c => String(r[c.key] ?? '').toLowerCase().includes(q)));
  }
  for (const c of filterCols) {
    const f = (filters[c.key] || '').toLowerCase();
    if (f) view = view.filter(r => String(r[c.key] ?? '').toLowerCase().includes(f));
  }
  if (sort.key) {
    view.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      const na = parseFloat(av), nb = parseFloat(bv);
      const bothNum = !isNaN(na) && !isNaN(nb) && String(av).trim() !== '' && String(bv).trim() !== '';
      let r = bothNum ? na - nb : String(av ?? '').localeCompare(String(bv ?? ''));
      return r * sort.dir;
    });
  }

  const total = view.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const cur = Math.min(page, totalPages);
  const start = (cur - 1) * perPage;
  const pageRows = view.slice(start, start + perPage);

  const lead = '40px';
  const trail = (schema.editAction ? '78px ' : '') + '46px';
  const gridCols = [lead, ...cols.map(c => c.w), trail].join(' ');

  function setSortCol(key) {
    setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  }
  function patchRow(id, patch) {
    onChange(rows.map(r => r._id === id ? { ...r, ...patch } : r));
    markDirty();
  }
  function delRow(id) {
    onChange(rows.filter(r => r._id !== id));
    setSel(s => { const n = new Set(s); n.delete(id); return n; });
    markDirty();
    ruleToast && ruleToast('Row removed — Save to commit', 'info');
  }
  const pageIds = pageRows.map(r => r._id);
  const allSel = pageIds.length > 0 && pageIds.every(id => sel.has(id));
  function toggleAll() {
    setSel(s => {
      const n = new Set(s);
      if (allSel) pageIds.forEach(id => n.delete(id));
      else pageIds.forEach(id => n.add(id));
      return n;
    });
  }
  function toggleSel(id) { setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  // page number window
  function pageList() {
    const out = [];
    const win = 5;
    let lo = Math.max(1, cur - 2), hi = Math.min(totalPages, lo + win - 1);
    lo = Math.max(1, hi - win + 1);
    for (let i = lo; i <= hi; i++) out.push(i);
    if (out[0] > 1) { if (out[0] > 2) out.unshift('…'); out.unshift(1); }
    if (out[out.length - 1] < totalPages) { if (out[out.length - 1] < totalPages - 1) out.push('…'); out.push(totalPages); }
    return out;
  }

  return (
    <React.Fragment>
      <div className="dbp-grid-toolbar">
        <button className={`dbp-tool ${showSearch ? 'on' : ''}`} onClick={() => { setShowSearch(v => !v); if (showSearch) setSearch(''); }}>
          <IcSearch size={16} /> Search
        </button>
        <button className={`dbp-tool ${showFilters ? 'on' : ''}`} onClick={() => setShowFilters(v => !v)}>
          <IcFilter size={16} /> Filter
        </button>
        <button className={`dbp-tool ${sort.key ? 'on' : ''}`} onClick={() => setSortCol(schema.cols[0].key)}>
          <IcSortAZ size={16} /> Sort
        </button>
        <div style={{ position: 'relative' }} ref={colMenuRef}>
          <button className={`dbp-tool ${hidden.size ? 'on' : ''}`} onClick={() => setColMenu(v => !v)}>
            <IcColumns size={16} /> Columns
          </button>
          {colMenu && (
            <div className="popover fade-in" style={{ position: 'absolute', top: 38, left: 0, width: 200, zIndex: 20, padding: 6 }}>
              {schema.cols.map(c => (
                <label key={c.key} className="menu-item" style={{ gap: 10, cursor: 'pointer' }}>
                  <span className={`dbp-cbx ${!hidden.has(c.key) ? 'on' : ''}`}><IcCheck size={11} /></span>
                  <input type="checkbox" style={{ display: 'none' }} checked={!hidden.has(c.key)}
                    onChange={() => setHidden(h => { const n = new Set(h); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        {showSearch && (
          <div className="dbp-search-wrap">
            <IcSearch size={14} />
            <input autoFocus placeholder={`Search ${DBP_CATS.find(c => c.id === catId).label.toLowerCase()}…`}
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
        <div className="dbp-tool-spacer" />
        <button className="dbp-tool" onClick={() => onNew(catId)}>
          <IcPlus size={16} /> {schema.add}
        </button>
      </div>

      <div className="dbp-grid-scroll">
        <div className="dbp-grid" role="table">
          {/* header */}
          <div className="dbp-grow head" style={{ gridTemplateColumns: gridCols }}>
            <div className="dbp-cell dbp-sel">
              <span className={`dbp-cbx head ${allSel ? 'on' : ''}`} onClick={toggleAll}><IcCheck size={11} /></span>
            </div>
            {cols.map(c => (
              <div key={c.key} className="dbp-cell" style={c.center ? { justifyContent: 'center' } : null}>
                <span className="dbp-col-label" onClick={() => setSortCol(c.key)}>
                  {c.label}
                  {sort.key === c.key && <span className="dbp-col-sort">{sort.dir === 1 ? <IcChevUp /> : <IcChevDn />}</span>}
                </span>
                <span className="dbp-col-menu" title="Column options"><IcDots3 /></span>
              </div>
            ))}
            {schema.editAction && <div className="dbp-cell" />}
            <div className="dbp-cell" />
          </div>

          {/* filter row */}
          {showFilters && (
            <div className="dbp-grow filterrow" style={{ gridTemplateColumns: gridCols }}>
              <div className="dbp-cell dbp-sel" />
              {cols.map(c => (
                <div key={c.key} className="dbp-cell" style={{ paddingTop: 0, paddingBottom: 0 }}>
                  {c.filter ? (
                    <div className="dbp-filter-in">
                      <IcSearch size={13} />
                      <input placeholder={c.label} value={filters[c.key] || ''}
                        onChange={e => setFilters(f => ({ ...f, [c.key]: e.target.value }))} />
                    </div>
                  ) : null}
                </div>
              ))}
              {schema.editAction && <div className="dbp-cell" />}
              <div className="dbp-cell" />
            </div>
          )}

          {/* rows */}
          {pageRows.map(r => {
            const isSel = sel.has(r._id);
            return (
              <div key={r._id} className={`dbp-grow row ${isSel ? 'sel' : ''} ${rowClickEditor ? 'clickable' : ''}`} style={{ gridTemplateColumns: gridCols }}
                onClick={rowClickEditor ? () => onEdit(catId, r) : undefined}>
                <div className="dbp-cell dbp-sel">
                  <span className={`dbp-cbx ${isSel ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleSel(r._id); }}><IcCheck size={11} /></span>
                </div>
                {cols.map(c => {
                  const editing = edit && edit.id === r._id && edit.key === c.key;
                  const cellStyle = c.center ? { justifyContent: 'center' } : null;
                  // checkbox cell (encrypt)
                  if (c.type === 'check') {
                    return (
                      <div key={c.key} className="dbp-cell dbp-encbox">
                        <span className={`dbp-cbx ${r[c.key] ? 'on' : ''}`}
                          title={r[c.key] ? 'Encrypted — value stored as ciphertext' : 'Encrypt this value'}
                          onClick={() => patchRow(r._id, { [c.key]: !r[c.key] })}><IcCheck size={11} /></span>
                      </div>
                    );
                  }
                  const secret = c.secret && r[c.secret];
                  if (editing && !secret) {
                    return (
                      <div key={c.key} className="dbp-cell">
                        <input className="dbp-val-edit" autoFocus defaultValue={r[c.key]}
                          onBlur={e => { patchRow(r._id, { [c.key]: e.target.value }); setEdit(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEdit(null); }} />
                      </div>
                    );
                  }
                  // badge (connection type)
                  if (c.badge) {
                    return (
                      <div key={c.key} className="dbp-cell" style={cellStyle}>
                        <span className="mp-tag" style={{ fontSize: 11, padding: '2px 8px' }}>{r[c.key] || '—'}</span>
                      </div>
                    );
                  }
                  const display = secret ? '••••••••••••' : (r[c.key] === '' || r[c.key] == null ? '—' : r[c.key]);
                  const klass = ['dbp-cell', 'ellip', c.mono ? 'mono' : '', c.primary ? 'code-cell' : '', secret ? 'dbp-enc-val' : ''].filter(Boolean).join(' ');
                  return (
                    <div key={c.key} className={klass} style={cellStyle}
                      title={secret ? 'Encrypted' : String(r[c.key] ?? '')}
                      onClick={c.editable && !secret ? () => setEdit({ id: r._id, key: c.key }) : undefined}>
                      {display}
                      {secret && <span className="dbp-enc-tag">enc</span>}
                    </div>
                  );
                })}
                {schema.editAction && (
                  <div className="dbp-cell" style={{ justifyContent: 'center' }}>
                    <button className="btn ghost" style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => onEdit(catId, r)}>
                      <IcEdit size={13} /> Edit
                    </button>
                  </div>
                )}
                <div className="dbp-cell dbp-rowact">
                  {rowClickEditor && <button className="dbp-rowedit" title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(catId, r); }}><IcEdit size={14} /></button>}
                  <button className="dbp-trash" title="Delete row" onClick={(e) => { e.stopPropagation(); delRow(r._id); }}><IcTrash size={15} /></button>
                </div>
              </div>
            );
          })}

          {pageRows.length === 0 && (
            <div className="dbp-empty" style={{ minHeight: 200 }}>
              <p>No rows match your search or filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* pager */}
      <div className="dbp-pager">
        <div className="dbp-pages">
          <button className="dbp-pg" disabled={cur === 1} onClick={() => setPage(1)} title="First">«</button>
          <button className="dbp-pg" disabled={cur === 1} onClick={() => setPage(cur - 1)} title="Previous">‹</button>
          {pageList().map((p, i) => p === '…'
            ? <span key={'d' + i} className="dbp-pg dots">…</span>
            : <button key={p} className={`dbp-pg ${p === cur ? 'cur' : ''}`} onClick={() => setPage(p)}>{p}</button>)}
          <button className="dbp-pg" disabled={cur === totalPages} onClick={() => setPage(cur + 1)} title="Next">›</button>
          <button className="dbp-pg" disabled={cur === totalPages} onClick={() => setPage(totalPages)} title="Last">»</button>
        </div>
        <div className="dbp-perpage">
          <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}>
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>Items per page</span>
        </div>
        <div className="dbp-pager-right">
          {total === 0 ? 'No items' : `Showing ${start + 1} – ${Math.min(start + perPage, total)} of ${total} items`}
          {sel.size > 0 && <span style={{ color: 'var(--magenta)', marginLeft: 12, fontWeight: 500 }}>{sel.size} selected</span>}
        </div>
      </div>
    </React.Fragment>
  );
}

// ---- empty categories (Channels / Keywords / Languages) ----
const DBP_EMPTY_COPY = {
  channels: { icon: 'IcSend', title: 'No channels defined', body: 'Channels are used only for publishing elements in UI Dashboards. Add a channel to route published content.' },
  keywords: { icon: 'IcStar', title: 'No keywords defined', body: 'Keywords are used only for publishing elements in UI Dashboards. Add keywords to make published elements discoverable.' },
  languages: { icon: 'IcBook', title: 'No languages defined', body: 'Add alternative languages to EDM. The first language added to the ID 1 row is automatically set as the primary language, used by the Data Illustrator.' },
};
function DbpEmpty({ catId, markDirty }) {
  const c = DBP_EMPTY_COPY[catId];
  const Icon = window[c.icon] || IcVariables;
  return (
    <div className="dbp-empty">
      <span className="dbp-empty-ic"><Icon size={26} /></span>
      <h3>{c.title}</h3>
      <p>{c.body}</p>
      <button className="btn primary" style={{ marginTop: 6 }} onClick={() => { markDirty(); ruleToast && ruleToast('Row added — Save to commit', 'info'); }}>
        <IcPlus size={14} /> {catId === 'languages' ? 'Add language' : catId === 'channels' ? 'Add channel' : 'Add keyword'}
      </button>
    </div>
  );
}

// ---- Version Control panel ----
function DbpVersionControl({ markDirty }) {
  const [on, setOn] = React.useState(!!(DBP_DATA.versionControl && DBP_DATA.versionControl.using));
  const [provider, setProvider] = React.useState('Database');
  return (
    <div className={`dbp-vc ${on ? '' : 'disabled-children'}`}>
      <div className="dbp-vc-row">
        <label className="dbp-check-row" onClick={() => { setOn(v => !v); markDirty(); }}>
          <span className={`dbp-cbx ${on ? 'on' : ''}`}><IcCheck size={11} /></span>
          <span>
            <span className="ttl">Use version control for component development</span>
            <span className="sub">Activate the version control provider and add change-control to component development across the platform.</span>
          </span>
        </label>
      </div>
      <div className={`dbp-vc ${on ? '' : 'disabled'}`} style={{ padding: 0, maxWidth: 'none' }}>
        <div className="dbp-vc-grid">
          <div className="dbp-vc-row" style={{ margin: 0 }}>
            <label className="dbp-fl">Version control provider</label>
            <div className="select-wrap"><select className="select" value={provider} onChange={e => { setProvider(e.target.value); markDirty(); }}>
              <option>Database</option><option>Team Foundation Server</option><option>Git</option>
            </select></div>
            <div className="dbp-help">Where component versions are stored and retrieved.</div>
          </div>
          <div className="dbp-vc-row" style={{ margin: 0 }}>
            <label className="dbp-fl">Database connection parameter</label>
            <div className="select-wrap"><select className="select" defaultValue="VC" onChange={markDirty}>
              <option>VC</option><option>EDM_MODULES_FS_RELEASE</option>
            </select></div>
            <div className="dbp-help">A Connection defined in the Connections tab.</div>
          </div>
          <div className="dbp-vc-row" style={{ margin: 0 }}>
            <label className="dbp-fl">Repository name</label>
            <input className="input" defaultValue="EDM_MODULES_FS_RELEASE_VC" onChange={markDirty} style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12 }} />
            <div className="dbp-help">Repository that holds the component history.</div>
          </div>
          <div className="dbp-vc-row" style={{ margin: 0 }}>
            <label className="dbp-fl">Proxy</label>
            <input className="input" placeholder="(none)" onChange={markDirty} />
          </div>
        </div>
        <div className="dbp-vc-actions">
          <button className="btn" onClick={() => ruleToast && ruleToast('Connection test succeeded', 'success')}><IcLightning size={14} /> Test connection</button>
          <button className="btn" onClick={() => ruleToast && ruleToast('Synchronised with database', 'success')}><IcRedo size={14} /> Synchronise with database</button>
        </div>
      </div>
    </div>
  );
}

// ---- Languages panel (legacy inline grid w/ primary language) ----
const DBP_LANGS = ['English', 'French', 'German', 'Japanese', 'Spanish', 'Italian', 'Portuguese', 'Dutch', 'Chinese (Simplified)', 'Korean', 'Arabic', 'Russian', 'Polish'];
function DbpLanguages({ rows, onChange, markDirty }) {
  function add() {
    const nextId = rows.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
    onChange([...rows, { _id: Date.now() + Math.random(), id: nextId, language: '', localName: '' }]);
    markDirty();
  }
  const patch = (rid, p) => { onChange(rows.map(r => r._id === rid ? { ...r, ...p } : r)); markDirty(); };
  const del = (rid) => { onChange(rows.filter(r => r._id !== rid)); markDirty(); };
  const primary = rows.find(r => r.id === 1);
  return (
    <div className="dbp-langs">
      <div className="dbp-lang-banner">
        <span className="dbp-lang-ic"><IcBook size={18} /></span>
        <div className="dbp-lang-banner-txt">
          <div className="t">Primary language (ID 1)</div>
          <div className="s">{primary && primary.language ? primary.language : 'Not set — the first language you add (ID 1) becomes primary and is used by the Data Illustrator.'}</div>
        </div>
        <button className="btn primary" onClick={add}><IcPlus size={14} /> Add language</button>
      </div>
      {rows.length === 0 ? (
        <div className="dbp-empty" style={{ minHeight: 200 }}>
          <span className="dbp-empty-ic"><IcBook size={26} /></span>
          <h3>No languages defined</h3>
          <p>Add alternative languages to EDM. The first language added (ID 1) is automatically set as the primary language.</p>
        </div>
      ) : (
        <div className="dbp-lang-table">
          <div className="dbp-lang-row head"><span>ID</span><span>Language</span><span>Local name</span><span /></div>
          {rows.map(r => (
            <div key={r._id} className="dbp-lang-row">
              <span className="mono dbp-lang-id">{r.id}{r.id === 1 && <span className="dbp-prim-tag">Primary</span>}</span>
              <span>
                <div className="select-wrap"><select className="select" value={r.language} onChange={e => patch(r._id, { language: e.target.value })}>
                  <option value="" disabled>Select language…</option>
                  {DBP_LANGS.map(l => <option key={l}>{l}</option>)}
                </select></div>
              </span>
              <span><input className="input" value={r.localName} onChange={e => patch(r._id, { localName: e.target.value })} placeholder="Local name (optional)" /></span>
              <span><button className="dbp-trash" onClick={() => del(r._id)} title="Remove language"><IcTrash size={15} /></button></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================
// Main screen
// =============================================================
function DatabaseParameters() {
  const [active, setActive] = React.useState('variables');
  const [data, setData] = React.useState(dbpInitRows);
  const [dirty, setDirty] = React.useState(false);
  const markDirty = React.useCallback(() => setDirty(true), []);
  const [editor, setEditor] = React.useState(null);
  const cat = DBP_CATS.find(c => c.id === active);
  const counts = DBP_DATA.counts || {};

  function setCatRows(rows) { setData(d => ({ ...d, [active]: rows })); }
  function openNew(c) { setEditor({ cat: c, row: null }); }
  function openEdit(c, row) { setEditor({ cat: c, row }); }
  function saveEditor(rec) {
    const c = editor.cat;
    setData(d => {
      const list = d[c] || [];
      if (rec._id != null) return { ...d, [c]: list.map(r => r._id === rec._id ? rec : r) };
      const nextId = list.reduce((m, r) => Math.max(m, r._id || 0), 0) + 1;
      return { ...d, [c]: [{ ...rec, _id: nextId }, ...list] };
    });
    markDirty();
    ruleToast && ruleToast(rec._id != null ? 'Changes applied — Save to commit' : 'Added — Save to commit', 'success');
    setEditor(null);
  }
  function save() { setDirty(false); ruleToast && ruleToast('Database parameters saved', 'success'); }
  function cancel() {
    setData(dbpInitRows());
    setDirty(false);
    ruleToast && ruleToast('Changes discarded', 'info');
  }

  return (
    <div className="dbp fade-in">
      {/* header */}
      <div className="dbp-head">
        <span className="dbp-head-icon"><IcServer size={22} /></span>
        <div>
          <div className="dbp-title-row">
            <h1>Database parameters</h1>
            <button className="dbp-ver" title="Switch parameter set version">v4.2.1 <IcChevDown size={12} /></button>
          </div>
          <div className="dbp-sub">Configuration values held per database and reused across Porter, Data Flow, Event Watcher and Process Launcher.</div>
        </div>
      </div>

      {/* action toolbar */}
      <div className="dbp-actions">
        <button className="dbp-act primary" disabled={!dirty} onClick={save}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
          Save
        </button>
        <button className="dbp-act" disabled={!dirty} onClick={cancel}>
          <IcX size={15} /> Cancel
        </button>
        <span className="dbp-act-sep" />
        <button className="dbp-act dbp-act-icon" disabled={!dirty} title="Undo"><IcUndo size={16} /></button>
        <button className="dbp-act dbp-act-icon" disabled title="Redo"><IcRedo size={16} /></button>
        <span className="dbp-act-sep" />
        <button className="dbp-act dbp-act-icon" title="Import parameters" onClick={() => ruleToast && ruleToast('Import database parameters…', 'info')}><IcImport size={16} /></button>
        <button className="dbp-act dbp-act-icon" title="Export parameters" onClick={() => ruleToast && ruleToast('Exported database parameters to XML', 'success')}><IcExport size={16} /></button>
        {dirty && <span className="dbp-dirty-note"><span className="dot" /> Unsaved changes</span>}
      </div>

      {/* body */}
      <div className="dbp-body">
        <nav className="dbp-cats">
          {DBP_CATS.map(c => {
            const Icon = window[c.icon] || IcVariables;
            const n = counts[c.id];
            return (
              <button key={c.id} className={`dbp-cat ${c.id === active ? 'active' : ''}`} onClick={() => setActive(c.id)}>
                <span className="dbp-cat-ic"><Icon size={17} /></span>
                {c.label}
                {n != null && <span className="dbp-cat-count">{n}</span>}
              </button>
            );
          })}
        </nav>

        <div className="dbp-pane">
          {cat.kind === 'grid' && (
            <DbpGrid catId={active} rows={data[active]} onChange={setCatRows} markDirty={markDirty} onNew={openNew} onEdit={openEdit} />
          )}
          {cat.kind === 'languages' && (
            <DbpLanguages rows={data.languages} onChange={(r) => setData(d => ({ ...d, languages: r }))} markDirty={markDirty} />
          )}
          {cat.kind === 'empty' && <DbpEmpty catId={active} markDirty={markDirty} />}
          {cat.kind === 'vc' && <DbpVersionControl markDirty={markDirty} />}
        </div>
      </div>

      {editor && <DbpEditor editor={editor} onClose={() => setEditor(null)} onSave={saveEditor} />}
    </div>
  );
}

window.DatabaseParameters = DatabaseParameters;
