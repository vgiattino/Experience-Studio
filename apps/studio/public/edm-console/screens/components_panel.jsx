// ============================================================
// Components Explorer panel — persistent second column shown when
// "Components" is selected in the main side nav.
//   • All Components tab — every component CATEGORY expands to the list
//     of component instances under it (Data Porter ▸ its porters,
//     Solution ▸ its solutions, …); selecting an instance opens the editor.
//   • Collections tab — the console-group "groups concept" tree.
// Reuses cb.css (.cb-comp/.cb-tabs/.cb-tn …).
// ============================================================

// build instance leaves under a category: all route to the category's editor
const mkItems = (pid, route, icon, labels) =>
  labels.map((l, i) => ({ id: pid + '-i' + i, label: l, icon, route, leaf: true }));

const ALL_COMPONENTS_TREE = [
  { id: 'porter', label: 'Data Porter', icon: 'IcPorter', children: mkItems('porter', 'porter', 'IcPorter', [
    'Insert Party Adaptor Process Keys', 'Append Process Monitor', 'Archive & Update File Monitor', 'BBG Nightly File Porter',
  ])},
  { id: 'inspector', label: 'Data Inspector', icon: 'IcInspector', children: mkItems('inspector', 'inspector', 'IcInspector', [
    'Party Inspector', 'Security Inspector', 'Pricing Inspector',
  ])},
  { id: 'matcher', label: 'Data Matcher', icon: 'IcMatcher', children: mkItems('matcher', 'matcher', 'IcMatcher', [
    'Pricing Matcher', 'Reference Matcher',
  ])},
  { id: 'core-matcher', label: 'Core Matcher', icon: 'IcMatching', children: mkItems('core-matcher', 'matcher', 'IcMatcher', [
    'Fund', 'Party', 'Security',
  ])},
  { id: 'constructor', label: 'Data Constructor', icon: 'IcConstructor', children: mkItems('constructor', 'constructor', 'IcConstructor', [
    'Party Constructor', 'Security Constructor',
  ])},
  { id: 'illustrator', label: 'Data Illustrator', icon: 'IcIllustrator', children: [
    { id: 'illus-tpl', label: 'Data Illustrator Template', icon: 'IcFile', children: mkItems('illus-tpl', 'illustrator', 'IcFile', ['Party Template', 'Pricing Template']) },
    { id: 'illus-doc', label: 'Data Illustrator', icon: 'IcIllustrator', children: mkItems('illus-doc', 'illustrator', 'IcIllustrator', ['Party Illustrator', 'Pricing Illustrator']) },
  ]},
  { id: 'generator', label: 'Data Generator', icon: 'IcGenerator', children: mkItems('generator', 'generator', 'IcGenerator', [
    'Key Generator', 'Reference Generator',
  ])},
  { id: 'manager', label: 'Data Manager', icon: 'IcManager', children: mkItems('manager', 'manager', 'IcManager', [
    'Instrument Master', 'Counterparty Master',
  ])},
  { id: 'flow', label: 'Data Flow', icon: 'IcFlow', children: mkItems('flow', 'flow', 'IcFlow', [
    'Pricing ingest → validate', 'BBG nightly ingest', 'Market data distribution',
  ])},
  { id: 'rules', label: 'Rule Builder', icon: 'IcRules', children: mkItems('rules', 'rules', 'IcRules', [
    'Stale price > 24h', 'Cross-source variance', 'Missing benchmark',
  ])},
  { id: 'diagram', label: 'Diagram', icon: 'IcSitemap', children: mkItems('diagram', 'diagram', 'IcSitemap', [
    'Party Lineage', 'Pricing Flow',
  ])},
  { id: 'webui', label: 'UI Workflow', icon: 'IcWorkflows', children: [
    { id: 'wf-workflow', label: 'Workflow', icon: 'IcWorkflows', children: mkItems('wf-workflow', 'workflows', 'IcWorkflows', ['Onboarding Workflow', 'Approval Workflow']) },
    { id: 'wf-page', label: 'Page', icon: 'IcPages', children: mkItems('wf-page', 'pages', 'IcPages', ['Party Page', 'Pricing Page']) },
    { id: 'wf-dash', label: 'Dashboard', icon: 'IcElements', children: mkItems('wf-dash', 'workflows', 'IcElements', ['Ops Dashboard']) },
    { id: 'wf-element', label: 'Element', icon: 'IcElements', children: mkItems('wf-element', 'elements', 'IcElements', ['Party Grid Element']) },
  ]},
  { id: 'dbobj', label: 'Database Objects', icon: 'IcServer', children: [
    { id: 'tbl-builder', label: 'Table Builder', icon: 'IcManager', children: mkItems('tbl-builder', 'database-objects', 'IcManager', ['Party Table', 'Security Table']) },
    { id: 'view-builder', label: 'View Builder', icon: 'IcManager', children: mkItems('view-builder', 'database-objects', 'IcManager', ['Party View']) },
    { id: 'sp-builder', label: 'Stored Procedure Builder', icon: 'IcFile', children: mkItems('sp-builder', 'database-objects', 'IcFile', ['Load Party SP']) },
    { id: 'fn-builder', label: 'Function Builder', icon: 'IcLightning', children: mkItems('fn-builder', 'database-objects', 'IcLightning', ['Hash Key Fn']) },
  ]},
  { id: 'solutions', label: 'Solution', icon: 'IcSolutions', children: mkItems('solutions', 'solutions', 'IcSolutions', [
    '0000 GLEIF Party', '2000 Party', '4000 Master Party', 'Daily Pricing Control',
  ])},
  { id: 'data-products', label: 'Data Product', icon: 'IcDataProducts', children: mkItems('data-products', 'data-products', 'IcDataProducts', [
    'Consolidated Market Feed', 'Reference Data Product',
  ])},
  { id: 'simple-config', label: 'Simple Config', icon: 'IcCog', children: mkItems('simple-config', 'simple-config', 'IcCog', [
    'SFTP Config', 'Schedule Config',
  ])},
  { id: 'connection', label: 'Connection', icon: 'IcConnect', children: mkItems('connection', 'connection', 'IcConnect', [
    'Bloomberg SFTP', 'LSEG API', 'SIX FTP',
  ])},
  { id: 'source', label: 'Source', icon: 'IcSource', children: mkItems('source', 'source', 'IcSource', [
    'BBG Security Master', 'Equity Prices (NYSE)', 'FX Spot Rates',
  ])},
  { id: 'data-model', label: 'Data Model', icon: 'IcModels', children: mkItems('data-model', 'models', 'IcModels', [
    'Party Model', 'Security Model',
  ])},
  { id: 'approval', label: 'Approval Workflow', icon: 'IcApproval', children: mkItems('approval', 'approval', 'IcApproval', [
    'Master Change Approval', 'New Source Approval',
  ])},
  { id: 'service', label: 'Service', icon: 'IcServer', children: [
    { id: 'svc-launcher', label: 'Process Launcher', icon: 'IcPlay', children: mkItems('svc-launcher', 'service', 'IcPlay', ['Nightly Batch Launcher']) },
    { id: 'svc-watcher', label: 'Event Watcher', icon: 'IcBell', children: mkItems('svc-watcher', 'service', 'IcBell', ['SFTP Drop Watcher']) },
  ]},
];

function ComponentsExplorerPanel({ current, activeGroup, onSelectComponent, onSelectGroup }) {
  const [tab, setTab] = React.useState('all');           // 'all' | 'collections'
  const [openA, setOpenA] = React.useState({ solutions: true, porter: true });
  const [openC, setOpenC] = React.useState({ 'cg-back': true });
  const [selLeaf, setSelLeaf] = React.useState(null);
  const [filter, setFilter] = React.useState('');
  const groups = window.CONSOLE_GROUPS || [];

  // --- All Components tree (category ▸ instances) ---
  const renderAll = (n, depth) => {
    const Ic = window[n.icon] || IcComponent;
    const kids = n.children && n.children.length;
    const isOpen = openA[n.id];
    const isLeaf = n.leaf || !kids;
    const active = isLeaf && selLeaf === n.id;
    return (
      <React.Fragment key={n.id}>
        <div className={`cb-tn ${active ? 'on' : ''}`}
             style={{ paddingLeft: 6 + depth * 15 }}
             onClick={() => {
               if (!isLeaf) setOpenA(o => ({ ...o, [n.id]: !isOpen }));
               else { setSelLeaf(n.id); onSelectComponent(n.route, n.label); }
             }}>
          <span className="cv">{!isLeaf ? (isOpen ? <IcChevDown size={13} /> : <IcChevRight size={13} />) : ''}</span>
          <span className="ic leaf"
                style={{ color: active ? 'var(--magenta)' : (isLeaf ? '#5b7fb8' : 'var(--ink-3)') }}>
            <Ic size={15} />
          </span>
          <span className="lb">{n.label}</span>
          {!isLeaf && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-5)', fontWeight: 600 }}>{n.children.length}</span>}
        </div>
        {!isLeaf && isOpen && n.children.map(c => renderAll(c, depth + 1))}
      </React.Fragment>
    );
  };

  // --- Collections (console groups) tree ---
  const renderCol = (g, depth) => {
    const kids = g.children && g.children.length;
    const isOpen = openC[g.id];
    const active = current === 'group' && activeGroup === g.id;
    const Fi = isOpen && kids ? IcFolderOpen : IcFolder;
    return (
      <React.Fragment key={g.id}>
        <div className={`cb-tn ${active ? 'on' : ''}`}
             style={{ paddingLeft: 6 + depth * 15 }}
             onClick={() => { onSelectGroup(g.id); if (kids) setOpenC(o => ({ ...o, [g.id]: !isOpen })); }}>
          <span className="cv">{kids ? (isOpen ? <IcChevDown size={13} /> : <IcChevRight size={13} />) : ''}</span>
          <span className="ic folder" style={{ color: active ? 'var(--magenta)' : '#e3a008' }}><Fi size={15} /></span>
          <span className="lb">{g.label}</span>
          {g.count != null && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-5)', fontWeight: 600 }}>{g.count}</span>}
        </div>
        {kids && isOpen && g.children.map(c => renderCol(c, depth + 1))}
      </React.Fragment>
    );
  };

  // flat filter across all-components instance labels
  const flatMatch = () => {
    const out = [];
    const walk = (arr) => arr.forEach(n => {
      if (n.leaf && n.label.toLowerCase().includes(filter.toLowerCase())) out.push(n);
      if (n.children) walk(n.children);
    });
    walk(ALL_COMPONENTS_TREE);
    return out;
  };

  return (
    <div className="cb-comp" style={{ borderRight: '1px solid var(--line)', flex: '0 0 280px' }}>
      <div className="cb-comp-h">
        <span className="t">Components</span>
        <span className="sp" />
        <span className="ia" title="New component" onClick={() => window.ruleToast && window.ruleToast('New component…', 'info')}><IcPlus size={16} /></span>
        <span className="ia" title="Clone selected" onClick={() => window.ruleToast && window.ruleToast('Clone component…', 'info')}><IcDiff size={15} /></span>
        <span className="ia" title="Delete selected" onClick={() => window.ruleToast && window.ruleToast('Delete component…', 'info')}><IcTrash size={15} /></span>
      </div>
      <div className="cb-tabs">
        <span className={`cb-tab ${tab === 'all' ? 'on' : ''}`} onClick={() => setTab('all')}>All Components</span>
        <span className={`cb-tab ${tab === 'collections' ? 'on' : ''}`} onClick={() => setTab('collections')}>Collections</span>
      </div>
      <div className="cb-search">
        <IcSearch size={15} />
        <input placeholder={tab === 'all' ? 'Filter components…' : 'Filter collections…'}
               value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      <div className="cb-tree">
        {tab === 'all'
          ? (filter
              ? flatMatch().map(n => {
                  const Ic = window[n.icon] || IcComponent;
                  return (
                    <div key={n.id} className={`cb-tn ${selLeaf === n.id ? 'on' : ''}`}
                         onClick={() => { setSelLeaf(n.id); onSelectComponent(n.route, n.label); }}>
                      <span className="cv" />
                      <span className="ic leaf" style={{ color: '#5b7fb8' }}><Ic size={15} /></span>
                      <span className="lb">{n.label}</span>
                    </div>
                  );
                })
              : ALL_COMPONENTS_TREE.map(n => renderAll(n, 0)))
          : groups.map(g => renderCol(g, 0))}
      </div>
      <div className="cb-pin"><span className="b"><IcTag size={15} /></span></div>
    </div>
  );
}

window.ComponentsExplorerPanel = ComponentsExplorerPanel;
window.ALL_COMPONENTS_TREE = ALL_COMPONENTS_TREE;
