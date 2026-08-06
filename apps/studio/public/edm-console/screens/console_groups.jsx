// ============================================================
// Console Groups — live integration (Option A)
// Sidebar group tree + main group view. Reuses cg.css component
// classes (.cg-tbl/.cg-row/.cg-chip/.cg-perms/.cg-note).
// ============================================================

// admin-built console-group tree
const CONSOLE_GROUPS = [
  { id: 'cg-back', label: 'Back Office System', count: 38, children: [
    { id: 'cg-back-bbg', label: 'Bloomberg', count: 14 },
    { id: 'cg-back-lseg', label: 'LSEG', count: 11 },
    { id: 'cg-back-six', label: 'SIX', count: 9 },
  ]},
  { id: 'cg-mkt', label: 'Market Data', count: 22 },
  { id: 'cg-ref', label: 'Reference Data', count: 31 },
  { id: 'cg-pricing', label: 'Pricing Team', count: 17 },
  { id: 'cg-dm', label: 'Data Management', count: 26 },
  { id: 'cg-exc', label: 'Exceptions', count: 12, children: [
    { id: 'cg-exc-sum', label: 'Summary', count: 5 },
    { id: 'cg-exc-det', label: 'Detailed', count: 7 },
  ]},
  { id: 'cg-support', label: 'Support', count: 8 },
];

function cgPerm(O, M, R, C, D) { return { Open: O, Modify: M, Run: R, Create: C, Delete: D }; }

// component contents per group — using the real All-Components taxonomy
// (Source, Data Flow, Rule Builder, Data Matcher → Core Matcher, Solution,
//  Connection, Data Porter, Data Manager, Data Product, …)
const GROUP_CONTENTS = {
  'cg-pricing': {
    desc: 'Pricing controls, EOD marks & tolerance checks',
    members: 12, grants: 4, access: 'Open · Run',
    sections: [
      { type: 'Source', icon: 'IcSource', items: [
        { name: 'Pricing — EOD Marks', sub: 'SRC-0142', status: ['ok', 'Validated'], perms: cgPerm(1,1,1,0,0) },
        { name: 'Intraday FX Rates', sub: 'SRC-0188', status: ['run', 'Running'], perms: cgPerm(1,1,1,0,0) },
      ]},
      { type: 'Data Flow', icon: 'IcFlow', items: [
        { name: 'Pricing ingest → validate', sub: 'FLW-0061', status: ['ok', 'Validated'], perms: cgPerm(1,1,1,0,0) },
        { name: 'Tolerance check 0.5%', sub: 'FLW-0073', status: ['warn', 'Review'], perms: cgPerm(1,1,1,0,0) },
      ]},
      { type: 'Rule Builder', icon: 'IcRules', items: [
        { name: 'Stale price > 24h', sub: 'RUL-0210', status: ['ok', 'Active'], perms: cgPerm(1,1,1,1,0) },
        { name: 'Cross-source variance', sub: 'RUL-0231', status: ['ok', 'Active'], perms: cgPerm(1,1,1,1,0) },
        { name: 'Missing benchmark', sub: 'RUL-0244', status: ['idle', 'On hold'], perms: cgPerm(1,0,0,0,0) },
      ]},
      { type: 'Data Matcher · Core Matcher', icon: 'IcMatcher', items: [
        { name: 'Price vs benchmark — Security', sub: 'MAT-0027', status: ['ok', 'Matched'], perms: cgPerm(1,1,1,0,0) },
      ]},
      { type: 'Solution', icon: 'IcSolutions', items: [
        { name: 'Daily Pricing Control', sub: 'SOL-0018', status: ['run', 'Running'], perms: cgPerm(1,1,1,0,0) },
      ]},
    ],
  },
  'cg-back-bbg': {
    desc: 'Bloomberg back-office feeds & enrichment',
    members: 8, grants: 3, access: 'Open · Modify · Run',
    sections: [
      { type: 'Connection', icon: 'IcConnect', items: [
        { name: 'Bloomberg SFTP', sub: 'CON-0031', status: ['ok', 'Connected'], perms: cgPerm(1,1,1,0,0) },
      ]},
      { type: 'Source', icon: 'IcSource', items: [
        { name: 'BBG Security Master', sub: 'SRC-0090', status: ['ok', 'Validated'], perms: cgPerm(1,1,1,0,0) },
        { name: 'BBG Corporate Actions', sub: 'SRC-0094', status: ['run', 'Running'], perms: cgPerm(1,1,1,0,0) },
      ]},
      { type: 'Data Porter', icon: 'IcPorter', items: [
        { name: 'BBG nightly file porter', sub: 'POR-0012', status: ['ok', 'Validated'], perms: cgPerm(1,1,1,0,0) },
      ]},
      { type: 'Data Flow', icon: 'IcFlow', items: [
        { name: 'BBG nightly ingest', sub: 'FLW-0040', status: ['ok', 'Validated'], perms: cgPerm(1,1,1,0,0) },
      ]},
    ],
  },
  'cg-mkt': {
    desc: 'Market data ingestion & distribution',
    members: 15, grants: 5, access: 'Open · Run',
    sections: [
      { type: 'Source', icon: 'IcSource', items: [
        { name: 'Equity Prices (NYSE)', sub: 'SRC-0201', status: ['ok', 'Validated'], perms: cgPerm(1,1,1,0,0) },
        { name: 'FX Spot Rates', sub: 'SRC-0205', status: ['run', 'Running'], perms: cgPerm(1,0,1,0,0) },
      ]},
      { type: 'Data Flow', icon: 'IcFlow', items: [
        { name: 'Market data distribution', sub: 'FLW-0112', status: ['ok', 'Validated'], perms: cgPerm(1,1,1,0,0) },
      ]},
      { type: 'Data Manager', icon: 'IcManager', items: [
        { name: 'Instrument master', sub: 'MGR-0007', status: ['ok', 'Validated'], perms: cgPerm(1,1,1,0,0) },
      ]},
      { type: 'Data Product', icon: 'IcDataProducts', items: [
        { name: 'Consolidated Market Feed', sub: 'DP-0003', status: ['ok', 'Published'], perms: cgPerm(1,0,1,0,0) },
      ]},
    ],
  },
};

function groupById(id, list = CONSOLE_GROUPS) {
  for (const g of list) {
    if (g.id === id) return g;
    if (g.children) { const f = groupById(id, g.children); if (f) return f; }
  }
  return null;
}

// generic fallback contents for groups without tailored data
function genericContents(group) {
  const n = group?.count || 12;
  return {
    desc: 'Logical grouping of components',
    members: Math.max(4, Math.round(n / 3)), grants: 3, access: 'Open · Run',
    sections: [
      { type: 'Source', icon: 'IcSource', items: [
        { name: group.label + ' — Primary Source', sub: 'SRC-0' + (100 + n), status: ['ok', 'Validated'], perms: cgPerm(1,1,1,0,0) },
      ]},
      { type: 'Data Flow', icon: 'IcFlow', items: [
        { name: group.label + ' ingest', sub: 'FLW-00' + n, status: ['run', 'Running'], perms: cgPerm(1,1,1,0,0) },
      ]},
      { type: 'Rule Builder', icon: 'IcRules', items: [
        { name: 'Completeness check', sub: 'RUL-0' + (200 + n), status: ['ok', 'Active'], perms: cgPerm(1,1,1,1,0) },
      ]},
    ],
  };
}

// O/M/R/C/D mini pills
function GroupPerms({ p }) {
  const cols = [['O', p.Open], ['M', p.Modify], ['R', p.Run], ['C', p.Create], ['D', p.Delete]];
  return (
    <span className="cg-perms">
      {cols.map(([k, on]) => <span key={k} className={`cg-pp ${on ? 'on' : ''}`}>{k}</span>)}
    </span>
  );
}

// ---- sidebar group tree ----
function SidebarGroupTree({ activeId, onSelect, expanded }) {
  const [open, setOpen] = React.useState({ 'cg-back': true, 'cg-exc': true });

  if (!expanded) {
    // collapsed rail — top-level folders only, icons with tooltips
    return (
      <div className="gnav-collapsed">
        {CONSOLE_GROUPS.map(g => (
          <button key={g.id}
                  className={`nav-item ${activeId === g.id ? 'active' : ''}`}
                  onClick={() => onSelect(g.id)}>
            <span className="nav-icon"><IcFolder size={20} /></span>
            <span className="tip">{g.label}</span>
          </button>
        ))}
      </div>
    );
  }

  const render = (g, depth) => {
    const hasKids = g.children && g.children.length;
    const isOpen = open[g.id];
    return (
      <React.Fragment key={g.id}>
        <button className={`gnav-row ${activeId === g.id ? 'active' : ''}`}
                style={{ paddingLeft: 10 + depth * 14 }}
                onClick={() => onSelect(g.id)}>
          <span className="gnav-tw"
                onClick={(e) => { if (hasKids) { e.stopPropagation(); setOpen(o => ({ ...o, [g.id]: !isOpen })); } }}>
            {hasKids ? (isOpen ? '▾' : '▸') : ''}
          </span>
          <span className="gnav-ic">{isOpen && hasKids ? <IcFolderOpen size={16} /> : <IcFolder size={16} />}</span>
          <span className="gnav-label">{g.label}</span>
          <span className="gnav-ct">{g.count}</span>
        </button>
        {hasKids && isOpen && g.children.map(c => render(c, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="gnav">
      <div className="sidebar-section"><span className="sidebar-section-full">Console Groups</span></div>
      {CONSOLE_GROUPS.map(g => render(g, 0))}
      <button className="gnav-new" onClick={() => ruleToast && ruleToast('New console group — opens the create wizard', 'info')}>
        <IcPlus size={15} /> New console group
      </button>
    </div>
  );
}

// ---- main group view ----
function ConsoleGroupView({ groupId, onOpenSecurity }) {
  const group = groupById(groupId) || CONSOLE_GROUPS[0];
  const data = GROUP_CONTENTS[group.id] || genericContents(group);

  return (
    <div className="page">
      <div className="cg-crumb" style={{ marginBottom: 10 }}>
        <IcFolderOpen size={13} /> Console groups <IcChevRight size={12} /> <b>{group.label}</b>
      </div>
      <div className="head-flex">
        <div>
          <h1 className="cg-h1" style={{ fontSize: 22 }}>
            <span className="gi"><IcFolderOpen size={18} /></span> {group.label}
          </h1>
          <div className="cg-chips" style={{ marginTop: 10 }}>
            <span className="cg-chip scope"><IcFolder size={13} /> {group.count} components</span>
            <span className="cg-chip"><IcUsers size={13} /> {data.members} members · {data.grants} grants</span>
            <span className="cg-chip grant"><IcUserShield size={13} /> {data.access}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onOpenSecurity}><IcUserShield size={15} /> Permissions</button>
          <button className="btn primary"><IcPlus size={15} /> Add component</button>
        </div>
      </div>

      <div className="cg-note" style={{ margin: '18px 0' }}>
        <IcInfo size={16} />
        <span>This is a logical view across every component type. The same structure scopes what each team can open, run and edit — switch to <b>Components</b> in the sidebar to browse the full catalogue by type.</span>
      </div>

      <div className="cg-tbl">
        {data.sections.map((sec, si) => {
          const Ic = window[sec.icon];
          return (
            <React.Fragment key={si}>
              <div className="cg-tbl-grp">
                <Ic size={14} /> {sec.type}
                <span className="gct">{sec.items.length}</span>
              </div>
              {sec.items.map((it, i) => (
                <div key={i} className="cg-row">
                  <span className="ci"><Ic size={18} /></span>
                  <span className="cname">{it.name}<small>{it.sub}</small></span>
                  <span className="ctype cg-stat"><span className={`cg-dot ${it.status[0]}`} />{it.status[1]}</span>
                  <span className="cg-muted" style={{ fontSize: 12 }}>2 min ago</span>
                  <GroupPerms p={it.perms} />
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

window.CONSOLE_GROUPS = CONSOLE_GROUPS;
window.SidebarGroupTree = SidebarGroupTree;
window.ConsoleGroupView = ConsoleGroupView;
window.groupById = groupById;
