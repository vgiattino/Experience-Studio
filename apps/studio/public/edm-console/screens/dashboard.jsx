// ============================================================
// Administration dashboard (Home page)
// ============================================================

const ADMIN_CARDS = [
  { id: 'sources',   title: 'Modify sources',
    desc: 'Manage the fields included in your source requests for each data vendor',
    icon: 'IcSourceCard', goto: 'source',
    iconBg: '#eaf2fc', iconFg: '#1968d3' },
  { id: 'attribs',   title: 'Add attributes',
    desc: 'Create new attributes to customize the master model to suite your business needs',
    icon: 'IcAttribute', goto: 'rules',
    iconBg: '#fdf3f9', iconFg: '#b51e7a' },
  { id: 'models',    title: 'Browse data models',
    desc: 'Explore existing data models and make minor adjustments as needed.',
    icon: 'IcBrowseModels', goto: 'models',
    iconBg: '#e7f6f1', iconFg: '#0f7c70' },
  { id: 'match',     title: 'Adjust match settings',
    desc: 'Customize and fine-tune the settings for your data matching process',
    icon: 'IcMatcher', goto: 'matcher',
    iconBg: '#eaf2fc', iconFg: '#1968d3' },
  { id: 'master',    title: 'Adjust mastering settings',
    desc: 'Configure and refine the settings for your data mastering process',
    icon: 'IcSliders', goto: 'constructor',
    iconBg: '#fdf3f9', iconFg: '#b51e7a' },
  { id: 'flow',      title: 'Modify a flow',
    desc: 'Refine your data using filters, validation, and transformations.',
    icon: 'IcFlow', goto: 'flow',
    iconBg: '#e7f6f1', iconFg: '#0f7c70' },
  { id: 'users',     title: 'Manage users',
    desc: 'Manage individual user accounts',
    icon: 'IcUser', goto: 'home',
    iconBg: '#f4f4f4', iconFg: '#5a5a5a' },
  { id: 'groups',    title: 'Manage groups',
    desc: 'create and organize user groups for efficient access management',
    icon: 'IcUsers', goto: 'home',
    iconBg: '#f4f4f4', iconFg: '#5a5a5a' },
];

const INITIAL_OPEN_ITEMS = [
  { id: 'oi-1', name: 'My custom source', icon: 'IcFile',
    leftKey: 'TYPE', leftVal: 'Source',
    midKey: 'STEP', midVal: 'SFTP configuration', warn: true,
    by: 'saul.goodman@hhm.com', accessed: '10 Sep 2023 01:31:17 PM' },
  { id: 'oi-2', name: 'Add an attribute', icon: 'IcFile',
    leftKey: 'MODEL', leftVal: 'Master security',
    progress: 40,
    by: 'chuck.mcgill@hhm.com', accessed: '10 Sep 2023 01:31:17 PM' },
  { id: 'oi-3', name: 'Add an attribute', icon: 'IcFile',
    leftKey: 'MODEL', leftVal: 'Master security',
    progress: 80,
    by: 'kim.wexler@email.com', accessed: '10 Sep 2023 01:31:17 PM' },
  { id: 'oi-4', name: 'My custom source', icon: 'IcFile',
    leftKey: 'TYPE', leftVal: 'Source',
    midKey: 'STEP', midVal: 'SFTP configuration', warn: true,
    by: 'saul.goodman@hhm.com', accessed: '10 Sep 2023 01:31:17 PM' },
];

const INITIAL_RECENT = {
  'Last week': [
    { id: 'r1', title: 'Matching', sub: 'Model: Security master', icon: 'IcMatching', goto: 'matcher' },
    { id: 'r2', title: 'Master security', sub: 'Mastering', icon: 'IcMastering', goto: 'constructor' },
  ],
  'Older': [
    { id: 'r3', title: 'Bloomberg flow', sub: 'Flows', icon: 'IcFlow', goto: 'flow' },
    { id: 'r4', title: 'Master fixed income', sub: 'Model: Security master', icon: 'IcModels', goto: 'models' },
    { id: 'r5', title: 'BPS', sub: 'Sources', icon: 'IcSource', goto: 'source' },
    { id: 'r6', title: 'Master equity', sub: 'Mastering', icon: 'IcMastering', goto: 'constructor' },
    { id: 'r7', title: 'Refinitiv', sub: 'Sources', icon: 'IcSource', goto: 'source' },
  ]
};

function Dashboard({ onNavigate }) {
  const [items, setItems] = React.useState(INITIAL_OPEN_ITEMS);
  const [recent, setRecent] = React.useState(INITIAL_RECENT);
  const [sortOpen, setSortOpen] = React.useState(false);
  const [sort, setSort] = React.useState('Last accessed (Newest)');
  const [dragId, setDragId] = React.useState(null);

  // sort items
  const sortedItems = React.useMemo(() => {
    if (sort === 'Last accessed (Newest)') return items;
    if (sort === 'Last accessed (Oldest)') return [...items].reverse();
    if (sort === 'Name (A-Z)') return [...items].sort((a,b) => a.name.localeCompare(b.name));
    if (sort === 'Started by') return [...items].sort((a,b) => a.by.localeCompare(b.by));
    return items;
  }, [items, sort]);

  // open-item drag reorder
  function onDragStart(id) { setDragId(id); }
  function onDragOver(e, overId) {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    const from = items.findIndex(x => x.id === dragId);
    const to   = items.findIndex(x => x.id === overId);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setItems(next);
  }

  // recent-item drag reorder (within a group)
  const [dragR, setDragR] = React.useState(null);
  function rOver(e, group, overId) {
    e.preventDefault();
    if (!dragR || dragR.id === overId) return;
    const list = recent[group];
    const from = list.findIndex(x => x.id === dragR.id);
    const to   = list.findIndex(x => x.id === overId);
    if (from < 0 || to < 0) return;
    const next = [...list];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setRecent({ ...recent, [group]: next });
  }

  return (
    <div className="page fade-in">
      <h1 className="h1">Administration</h1>

      <div className="page-grid">
        <div>
          <div className="admin-cards">
            {ADMIN_CARDS.map(c => {
              const Icon = window[c.icon];
              return (
                <div key={c.id} className="card admin-card clickable"
                     onClick={() => onNavigate(c.goto)}>
                  <span className="icon-tile" style={{ background: c.iconBg, color: c.iconFg }}>
                    <Icon size={20} />
                  </span>
                  <div className="admin-card-title">{c.title}</div>
                  <div className="admin-card-desc">{c.desc}</div>
                </div>
              );
            })}
          </div>

          <div className="open-items-head">
            <div className="open-items-head-left">
              <h2 className="h2">Open items</h2>
              <span className="muted">Finish your incomplete items to ensure data is processed correctly</span>
            </div>
            <div className="open-items-head-right" style={{ position: 'relative' }}>
              <span>Sort by:</span>
              <button className="btn ghost" onClick={() => setSortOpen(o => !o)}
                      style={{ padding: '4px 8px' }}>
                {sort} <IcChevDown size={14} />
              </button>
              {sortOpen && (
                <div className="dropdown-menu fade-in">
                  {['Last accessed (Newest)', 'Last accessed (Oldest)', 'Name (A-Z)', 'Started by'].map(o => (
                    <div key={o} className="menu-item"
                         onClick={() => { setSort(o); setSortOpen(false); }}>
                      {o === sort && <IcCheck size={14} />}
                      <span style={{ marginLeft: o === sort ? 0 : 22 }}>{o}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sortedItems.map(it => {
            const Icon = window[it.icon];
            return (
              <div key={it.id}
                   className={`open-item ${dragId === it.id ? 'dragging' : ''}`}
                   draggable
                   onDragStart={() => onDragStart(it.id)}
                   onDragEnd={() => setDragId(null)}
                   onDragOver={(e) => onDragOver(e, it.id)}>
                <span style={{ color: 'var(--ink-4)' }}><Icon size={20} /></span>
                <span className="open-item-name">
                  <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('porter'); }}>
                    {it.name}
                  </a>
                </span>
                {it.progress != null ? (
                  <div>
                    <span className="progress-pill">{it.progress}%</span>
                    <div className="progress"><i style={{ width: `${it.progress}%` }} /></div>
                  </div>
                ) : (
                  <div className="hstack" style={{ gap: 28 }}>
                    <div className="field-pair">
                      <span className="k">{it.leftKey}</span>
                      <span className="v">{it.leftVal}</span>
                    </div>
                    <div className="field-pair">
                      <span className="k">{it.midKey}</span>
                      <span className="v hstack" style={{ gap: 6 }}>
                        {it.midVal}
                        {it.warn && <span className="warn-icon"><IcWarn size={16} /></span>}
                      </span>
                    </div>
                  </div>
                )}
                <div className="field-pair">
                  <span className="k">STARTED BY</span>
                  <span className="v">{it.by}</span>
                </div>
                <div className="field-pair">
                  <span className="k">LAST ACCESSED</span>
                  <span className="v">{it.accessed}</span>
                </div>
                <span style={{ color: 'var(--ink-5)', cursor: 'grab' }}>⋮</span>
              </div>
            );
          })}
        </div>

        <aside className="recent">
          <h2>Recent visited</h2>
          <div className="lead">Your most recently accessed pages for quick and easy reference</div>
          {Object.entries(recent).map(([group, list]) => (
            <div key={group}>
              <div className="recent-group-label">{group}</div>
              {list.map(r => {
                const Icon = window[r.icon];
                return (
                  <div key={r.id}
                       className={`recent-item ${dragR && dragR.id === r.id ? 'dragging' : ''}`}
                       draggable
                       onClick={() => onNavigate(r.goto)}
                       onDragStart={() => setDragR({ id: r.id, group })}
                       onDragEnd={() => setDragR(null)}
                       onDragOver={(e) => dragR && dragR.group === group && rOver(e, group, r.id)}>
                    <span className="ri-icon"><Icon size={18} /></span>
                    <div className="ri-text">
                      <span className="ri-title">{r.title}</span>
                      <span className="ri-sub">{r.sub}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
