// ============================================================
// Console Grouping & Security — full overlay opened from the topbar
//
// 4 tabs: Console Group Permissions, Database Role Permissions,
//         Web Users, EDM Groups
// Left:   console tree (Console Groups + All Components + custom groups)
// Right:  permissions grid (Open / Modify / Run / Create / Delete / All)
// Modals: Add/Replace Console Group Permission Wizard (4 steps),
//         Multi-Group Operations context menu,
//         Sync with AD confirmation, Import/Export
// ============================================================

const SECURITY_TABS = [
  { id: 'console',  label: 'Console Group Permissions', icon: 'IcFolder' },
  { id: 'dbrole',   label: 'Database Role Permissions', icon: 'IcManager' },
];

const PERM_COLS = ['All', 'Open', 'Modify', 'Run', 'Create', 'Delete'];

// ============================================================
// Sample data — console tree
// ============================================================
const INITIAL_TREE = [
  { id: 'db', label: 'edmv19.3.1.2 (Implementation DB)', kind: 'database', icon: 'IcManager', open: true, children: [
    { id: 'all', label: 'All Components', kind: 'allcomp', icon: 'IcComponent', open: true, children: [
      { id: 'all-conn',  label: 'Connections',  kind: 'folder', icon: 'IcConnect',     count: 24 },
      { id: 'all-src',   label: 'Sources',      kind: 'folder', icon: 'IcSource',      count: 56 },
      { id: 'all-flow',  label: 'Flows',        kind: 'folder', icon: 'IcFlow',        count: 38 },
      { id: 'all-rules', label: 'Rules',        kind: 'folder', icon: 'IcRules',       count: 142 },
      { id: 'all-sol',   label: 'Solutions',    kind: 'folder', icon: 'IcSolutions',   count: 19 },
      { id: 'all-inbx',  label: 'Inboxes',      kind: 'folder', icon: 'IcManager',     count: 27 },
      { id: 'all-fn',    label: 'Functions',    kind: 'folder', icon: 'IcLightning',   count: 86 },
    ]},
    { id: 'cg', label: 'Console Groups', kind: 'cgroot', icon: 'IcFolder', open: true, children: [
      { id: 'cg-back',  label: 'Back Office System', kind: 'cgroup', icon: 'IcFolder', open: true, children: [
        { id: 'cg-back-bbg',  label: 'Bloomberg',  kind: 'cgroup', icon: 'IcFolder', children: [] },
        { id: 'cg-back-lseg', label: 'LSEG',       kind: 'cgroup', icon: 'IcFolder', children: [] },
        { id: 'cg-back-six',  label: 'SIX',        kind: 'cgroup', icon: 'IcFolder', children: [] },
      ]},
      { id: 'cg-mkt',   label: 'Market Data',         kind: 'cgroup', icon: 'IcFolder', children: [] },
      { id: 'cg-ref',   label: 'Reference Data',      kind: 'cgroup', icon: 'IcFolder', children: [] },
      { id: 'cg-pricing', label: 'Pricing Team',      kind: 'cgroup', icon: 'IcFolder', children: [] },
      { id: 'cg-dm',    label: 'Data Management Team',kind: 'cgroup', icon: 'IcFolder', children: [] },
      { id: 'cg-exc',   label: 'Exceptions',          kind: 'cgroup', icon: 'IcFolder', children: [
        { id: 'cg-exc-sum', label: 'Summary',         kind: 'cgroup', icon: 'IcFolder', children: [] },
        { id: 'cg-exc-det', label: 'Detailed',        kind: 'cgroup', icon: 'IcFolder', children: [] },
      ]},
      { id: 'cg-support', label: 'Support',           kind: 'cgroup', icon: 'IcFolder', children: [] },
    ]},
  ]},
];

// ============================================================
// Sample principals (users / AD groups / EDM groups) per node
// permissions: All-Open-Modify-Run-Create-Delete  (booleans)
// ============================================================
function P(name, type, perms) {
  return { id: 'p-' + Math.random().toString(36).slice(2, 9), name, type, perms };
}
function permSet(o = false, m = false, r = false, c = false, d = false) {
  return { Open: o, Modify: m, Run: r, Create: c, Delete: d };
}

const SAMPLE_PRINCIPALS = {
  all: [
    P('HHM\\saul.goodman',  'user',     permSet(true,  true,  true,  false, false)),
    P('HHM\\kim.wexler',    'user',     permSet(true,  true,  true,  true,  false)),
    P('HHM\\chuck.mcgill',  'user',     permSet(true,  false, false, false, false)),
    P('HHM\\EDM-Admins',    'adgroup',  permSet(true,  true,  true,  true,  true )),
    P('HHM\\EDM-Operators', 'adgroup',  permSet(true,  false, true,  false, false)),
    P('Web Administrators', 'edmgroup', permSet(true,  true,  true,  true,  true )),
    P('Data Stewards',      'edmgroup', permSet(true,  true,  false, false, false)),
  ],
  'cg-back-bbg': [
    P('HHM\\bbg-team',      'adgroup',  permSet(true,  true,  true,  true,  false)),
    P('HHM\\saul.goodman',  'user',     permSet(true,  false, false, false, false)),
    P('Data Stewards',      'edmgroup', permSet(true,  true,  false, false, false)),
  ],
  'cg-back-lseg': [
    P('HHM\\lseg-team',     'adgroup',  permSet(true,  true,  true,  true,  false)),
    P('Data Stewards',      'edmgroup', permSet(true,  true,  false, false, false)),
  ],
  'cg-pricing': [
    P('HHM\\pricing-team',  'adgroup',  permSet(true,  true,  true,  false, false)),
    P('HHM\\kim.wexler',    'user',     permSet(true,  true,  true,  false, false)),
  ],
  'cg-dm': [
    P('Data Stewards',      'edmgroup', permSet(true,  true,  true,  true,  true)),
    P('HHM\\chuck.mcgill',  'user',     permSet(true,  true,  false, false, false)),
  ],
};

// Web users (license: 50)
const SAMPLE_WEB_USERS = [
  { id: 'w1', login: 'saul.goodman@hhm.com',   display: 'Saul Goodman',   email: 'saul.goodman@hhm.com',   active: true,  perms: permSet(true,  true,  true,  false, false) },
  { id: 'w2', login: 'kim.wexler@hhm.com',     display: 'Kim Wexler',     email: 'kim.wexler@hhm.com',     active: true,  perms: permSet(true,  true,  true,  true,  false) },
  { id: 'w3', login: 'chuck.mcgill@hhm.com',   display: 'Chuck McGill',   email: 'chuck.mcgill@hhm.com',   active: true,  perms: permSet(true,  false, false, false, false) },
  { id: 'w4', login: 'jimmy.brown@hhm.com',    display: 'Jimmy Brown',    email: 'jimmy.brown@hhm.com',    active: true,  perms: permSet(true,  true,  true,  true,  true)  },
  { id: 'w5', login: 'mike.ehrmantraut@hhm.com', display: 'Mike Ehrmantraut', email: 'mike.ehrmantraut@hhm.com', active: false, perms: permSet(true, false, false, false, false) },
];

// DB roles
const DB_ROLES = [
  { id: 'db_owner',     name: 'db_owner',     desc: 'Members can perform all configuration and maintenance activities on the database', users: 3 },
  { id: 'db_datareader',name: 'db_datareader',desc: 'Members can read all data from all user tables and views',                          users: 12 },
  { id: 'db_datawriter',name: 'db_datawriter',desc: 'Members can add, delete, or change data in all user tables',                        users: 7 },
  { id: 'edm_admin',    name: 'edm_admin',    desc: 'Full EDM administrator role',                                                       users: 2 },
  { id: 'edm_user',     name: 'edm_user',     desc: 'Standard EDM read/write user',                                                      users: 18 },
  { id: 'edm_viewer',   name: 'edm_viewer',   desc: 'Read-only access to EDM components',                                                users: 24 },
];

// EDM Groups
const SAMPLE_EDM_GROUPS = [
  { id: 'g1', name: 'Web Administrators', desc: 'Manages the EDM web UI', clonedFromAD: false, members: [
    { name: 'jimmy.brown@hhm.com',  type: 'user' },
    { name: 'kim.wexler@hhm.com',   type: 'user' },
  ]},
  { id: 'g2', name: 'Data Stewards', desc: 'Approves master record changes', clonedFromAD: false, members: [
    { name: 'kim.wexler@hhm.com',   type: 'user' },
    { name: 'chuck.mcgill@hhm.com', type: 'user' },
    { name: 'HHM\\Data-Governance', type: 'adgroup' },
  ]},
  { id: 'g3', name: 'HHM\\EDM-Operators', desc: 'Cloned from Active Directory', clonedFromAD: true, members: [
    { name: 'saul.goodman@hhm.com',  type: 'user' },
    { name: 'jimmy.brown@hhm.com',   type: 'user' },
    { name: 'mike.ehrmantraut@hhm.com', type: 'user' },
  ]},
];

// ============================================================
// Helpers
// ============================================================
function principalInitials(name) {
  const stripped = name.replace(/^.*\\/, '');
  return stripped.split(/[ ._@-]+/).filter(Boolean).slice(0, 2)
    .map(s => s[0]?.toUpperCase()).join('');
}
function principalTypeLabel(t) {
  return ({ user: 'User', adgroup: 'AD Group', edmgroup: 'EDM Group' })[t] || t;
}
function allChecked(p) { return p.Open && p.Modify && p.Run && p.Create && p.Delete; }
function someChecked(p) { return p.Open || p.Modify || p.Run || p.Create || p.Delete; }

// ============================================================
// Permission checkbox
// ============================================================
function PCheck({ checked, partial, disabled, onClick }) {
  return (
    <span className={`perm-checkbox ${checked ? 'checked' : ''} ${partial ? 'partial' : ''} ${disabled ? 'disabled' : ''}`}
          onClick={disabled ? null : onClick}>
      {checked && <IcCheck size={13} />}
      {!checked && partial && <span style={{ width: 8, height: 2, background: 'currentColor', borderRadius: 1 }} />}
    </span>
  );
}

// ============================================================
// Console tree
// ============================================================
function ConsoleTree({ nodes, selectedId, onSelect, onContextMenu }) {
  function render(node, depth = 0) {
    const Icon = window[node.icon] || IcFolder;
    const hasKids = node.children && node.children.length > 0;
    const isOpen = node.open;
    const cls = node.kind === 'cgroup' || node.kind === 'cgroot' ? 'console-group'
              : node.kind === 'allcomp' ? 'all-components'
              : '';
    return (
      <div key={node.id}>
        <div className={`tree-node group-row ${cls} ${selectedId === node.id ? 'selected' : ''}`}
             style={{ paddingLeft: 6 + depth * 14 }}
             onClick={() => onSelect(node)}
             onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, node); }}>
          <span className="tn-toggle"
                onClick={(e) => { e.stopPropagation(); if (hasKids) node.open = !node.open; onSelect({ ...node }); }}>
            {hasKids ? (isOpen ? '▾' : '▸') : ' '}
          </span>
          <span className="tn-icon"><Icon size={14} /></span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.label}
          </span>
          {node.count != null && <span className="group-count">{node.count}</span>}
        </div>
        {hasKids && isOpen && node.children.map(c => render(c, depth + 1))}
      </div>
    );
  }
  return <div className="tree">{nodes.map(n => render(n, 0))}</div>;
}

// ============================================================
// Permissions grid (used by Console Group + Web Users + EDM Groups tabs)
// ============================================================
function PermissionsGrid({ principals, locked, onTogglePerm, onToggleAll, onRemove, emptyMsg }) {
  if (!principals.length) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-4)',
                    border: '1px dashed var(--line-2)', borderRadius: 6,
                    background: 'var(--bg-1)' }}>
        {emptyMsg || 'No users or groups assigned to this node yet. Click "Add" to assign permissions.'}
      </div>
    );
  }
  return (
    <div className="perm-grid">
      <div className="perm-grid-head">
        <span>Name</span>
        {PERM_COLS.map(c => <span key={c}>{c}</span>)}
        <span />
      </div>
      {principals.map(p => {
        const a = allChecked(p.perms);
        const some = !a && someChecked(p.perms);
        return (
          <div key={p.id} className="perm-grid-row">
            <span className="name">
              <span className={`principal-icon ${p.type}`}>{principalInitials(p.name)}</span>
              <span className="principal-meta">
                <span className="pname">{p.name}</span>
                <span className="ptype">{principalTypeLabel(p.type)}</span>
              </span>
            </span>
            <span className="perm-cell">
              <PCheck checked={a} partial={some} disabled={locked}
                      onClick={() => onToggleAll(p.id, !a)} />
            </span>
            {['Open','Modify','Run','Create','Delete'].map(c => (
              <span key={c} className="perm-cell">
                <PCheck checked={p.perms[c]} disabled={locked}
                        onClick={() => onTogglePerm(p.id, c)} />
              </span>
            ))}
            <span className="perm-cell">
              <button className="icon-btn" disabled={locked}
                      title="Remove" onClick={() => onRemove(p.id)}>
                <IcTrash size={13} />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Add Principal Modal (lets you pick from AD or EDM Groups)
// ============================================================
const AD_DIRECTORY = [
  { name: 'HHM\\saul.goodman',     type: 'user' },
  { name: 'HHM\\kim.wexler',       type: 'user' },
  { name: 'HHM\\chuck.mcgill',     type: 'user' },
  { name: 'HHM\\jimmy.brown',      type: 'user' },
  { name: 'HHM\\mike.ehrmantraut', type: 'user' },
  { name: 'HHM\\howard.hamlin',    type: 'user' },
  { name: 'HHM\\EDM-Admins',       type: 'adgroup' },
  { name: 'HHM\\EDM-Operators',    type: 'adgroup' },
  { name: 'HHM\\Data-Governance',  type: 'adgroup' },
  { name: 'HHM\\bbg-team',         type: 'adgroup' },
  { name: 'HHM\\lseg-team',        type: 'adgroup' },
  { name: 'HHM\\pricing-team',     type: 'adgroup' },
];
const EDM_DIRECTORY = [
  { name: 'Web Administrators', type: 'edmgroup' },
  { name: 'Data Stewards',      type: 'edmgroup' },
  { name: 'Read-Only Users',    type: 'edmgroup' },
  { name: 'Master Editors',     type: 'edmgroup' },
];

function AddPrincipalModal({ onAdd, onCancel, allowEdmGroups = true }) {
  const [source, setSource] = React.useState('ad');
  const [filter, setFilter] = React.useState('');
  const dir = source === 'ad' ? AD_DIRECTORY : EDM_DIRECTORY;
  const list = dir.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));
  const [picked, setPicked] = React.useState({});
  const pickedList = list.filter(p => picked[p.name]);
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" style={{ width: 540, maxWidth: '95vw' }}>
        <div className="modal-head">
          <h3>
            <IcUserShield size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Add Users or Groups
          </h3>
        </div>
        <div className="modal-body">
          <div className="hstack" style={{ gap: 18, marginBottom: 14 }}>
            <label className="radio">
              <input type="radio" checked={source === 'ad'} onChange={() => setSource('ad')} />
              <span className="rdot" /> Active Directory
            </label>
            {allowEdmGroups && (
              <label className="radio">
                <input type="radio" checked={source === 'edm'} onChange={() => setSource('edm')} />
                <span className="rdot" /> EDM Groups
              </label>
            )}
            <div className="spacer" style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 12 }}>
              {Object.values(picked).filter(Boolean).length} selected
            </span>
          </div>
          <div className="wb-list-search-wrap" style={{ marginBottom: 8 }}>
            <IcSearch size={14} />
            <input className="input" placeholder={`Search ${source === 'ad' ? 'Active Directory' : 'EDM Groups'}…`}
                   value={filter} onChange={e => setFilter(e.target.value)}
                   style={{ paddingLeft: 32 }} autoFocus />
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 6,
                        maxHeight: 240, overflow: 'auto' }}>
            {list.map(p => {
              const checked = !!picked[p.name];
              return (
                <div key={p.name}
                     className="dtable-row" style={{ gridTemplateColumns: '32px 1fr 110px', padding: '0 12px' }}
                     onClick={() => setPicked({ ...picked, [p.name]: !checked })}>
                  <span>
                    <span className={`perm-checkbox ${checked ? 'checked' : ''}`}>
                      {checked && <IcCheck size={12} />}
                    </span>
                  </span>
                  <span className="name" style={{ padding: 0 }}>
                    <span className={`principal-icon ${p.type}`}
                          style={{ width: 24, height: 24 }}>
                      {principalInitials(p.name)}
                    </span>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                  </span>
                  <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>
                    {principalTypeLabel(p.type)}
                  </span>
                </div>
              );
            })}
            {list.length === 0 && (
              <div className="dtable-empty">No matches for "{filter}"</div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={pickedList.length === 0}
                  onClick={() => onAdd(pickedList)}>
            Add {pickedList.length || ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 4-step Add/Replace Permission Wizard
// ============================================================
const WIZ_STEPS = [
  { id: 1, label: 'Select users / groups' },
  { id: 2, label: 'Set permissions' },
  { id: 3, label: 'Resolve existing' },
  { id: 4, label: 'Review changes' },
];

function PermissionWizard({ targetNode, applyToSubgroups, onApply, onCancel }) {
  const [step, setStep] = React.useState(1);
  const [principals, setPrincipals] = React.useState([]);
  const [showAdd, setShowAdd] = React.useState(false);
  const [perms, setPerms] = React.useState(permSet(true, true, false, false, false));
  const [resolve, setResolve] = React.useState('add');   // 'add' | 'replace' | 'remove'
  const [addToEmpty, setAddToEmpty] = React.useState(true);

  function togglePerm(k) { setPerms({ ...perms, [k]: !perms[k] }); }
  function toggleAll() {
    const a = allChecked(perms);
    setPerms(permSet(!a, !a, !a, !a, !a));
  }

  function next() { setStep(s => Math.min(4, s + 1)); }
  function back() { setStep(s => Math.max(1, s - 1)); }

  function finish() {
    onApply({ principals, perms, resolve, addToEmpty });
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="wizard">
        <div className="wizard-head">
          <div className="title">
            <IcWand size={16} /> Add / Replace Console Group Permission Wizard
          </div>
          <div className="sub">
            Apply permissions to <strong>{targetNode?.label || 'this group'}</strong>
            {applyToSubgroups && ' and all sub-groups'}
          </div>
        </div>
        <div className="wizard-steps">
          {WIZ_STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={`wizard-step ${step === s.id ? 'active' : ''} ${step > s.id ? 'done' : ''}`}>
                <span className="ws-bubble">{step > s.id ? <IcCheck size={11} /> : s.id}</span>
                <span>{s.label}</span>
              </div>
              {i < WIZ_STEPS.length - 1 && (
                <span className={`wizard-connector ${step > s.id ? 'done' : ''}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="wizard-body">
          {step === 1 && (
            <>
              <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
                Add users or groups that should receive permissions on this console group.
              </div>
              <button className="btn primary" onClick={() => setShowAdd(true)}>
                <IcPlus size={14} /> Add users / groups
              </button>
              <div style={{ marginTop: 16, minHeight: 60 }}>
                {principals.length === 0 && (
                  <div style={{ color: 'var(--ink-4)', fontSize: 13, fontStyle: 'italic' }}>
                    No users or groups selected yet.
                  </div>
                )}
                {principals.map(p => (
                  <span key={p.name} className="principal-chip">
                    <span className={`principal-icon ${p.type}`}
                          style={{ width: 22, height: 22 }}>
                      {principalInitials(p.name)}
                    </span>
                    {p.name}
                    <span className="px" onClick={() => setPrincipals(principals.filter(x => x.name !== p.name))}>
                      <IcX size={11} />
                    </span>
                  </span>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
                Set the permissions that will be applied to each user / group you added.
              </div>
              <div className="perm-grid">
                <div className="perm-grid-head">
                  <span>Permission to apply</span>
                  {PERM_COLS.map(c => <span key={c}>{c}</span>)}
                  <span />
                </div>
                <div className="perm-grid-row" style={{ background: '#fff' }}>
                  <span className="name">
                    <strong>Apply to all selected</strong>
                  </span>
                  <span className="perm-cell">
                    <PCheck checked={allChecked(perms)} onClick={toggleAll} />
                  </span>
                  {['Open','Modify','Run','Create','Delete'].map(c => (
                    <span key={c} className="perm-cell">
                      <PCheck checked={perms[c]} onClick={() => togglePerm(c)} />
                    </span>
                  ))}
                  <span />
                </div>
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-4)' }}>
                <IcInfo size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Granting <strong>Create</strong> automatically grants <strong>Modify</strong>.
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
                How should existing permissions on this group be handled?
              </div>
              <div className="vstack" style={{ gap: 12 }}>
                <label className="radio" style={{ alignItems: 'flex-start' }}>
                  <input type="radio" checked={resolve === 'add'} onChange={() => setResolve('add')} />
                  <span className="rdot" style={{ marginTop: 3 }} />
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: 13 }}>Add to existing permissions</strong>
                    <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>
                      Existing permissions stay; new permissions are added on top.
                    </span>
                  </span>
                </label>
                <label className="radio" style={{ alignItems: 'flex-start' }}>
                  <input type="radio" checked={resolve === 'replace'} onChange={() => setResolve('replace')} />
                  <span className="rdot" style={{ marginTop: 3 }} />
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: 13 }}>Replace existing permissions</strong>
                    <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>
                      Existing permissions for the selected users / groups are removed and replaced with the new ones.
                    </span>
                  </span>
                </label>
                <label className="radio" style={{ alignItems: 'flex-start' }}>
                  <input type="radio" checked={resolve === 'remove'} onChange={() => setResolve('remove')} />
                  <span className="rdot" style={{ marginTop: 3 }} />
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: 13 }}>Remove the selected permissions</strong>
                    <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>
                      Strip the chosen permissions from the selected users / groups.
                    </span>
                  </span>
                </label>
                <label className="checkbox" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={addToEmpty}
                         onChange={e => setAddToEmpty(e.target.checked)} />
                  <span className="box"><IcCheck size={12} /></span>
                  <span>Add permissions to empty console groups</span>
                </label>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
                Review the changes below. Nothing has been applied yet.
              </div>
              <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 4 }}>
                {principals.map(p => (
                  <div key={p.name} className="diff-row">
                    <span className={`principal-icon ${p.type}`}
                          style={{ width: 24, height: 24 }}>
                      {principalInitials(p.name)}
                    </span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{p.name}</span>
                    <span className={`badge ${resolve === 'remove' ? 'remove' : resolve === 'replace' ? 'update' : 'add'}`}>
                      {resolve === 'remove' ? 'Remove' : resolve === 'replace' ? 'Replace' : 'Add'}
                    </span>
                    <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                      {Object.keys(perms).filter(k => perms[k]).join(', ') || '(none)'}
                    </span>
                  </div>
                ))}
                {principals.length === 0 && (
                  <div className="dtable-empty">Nothing to apply.</div>
                )}
              </div>
              <div style={{ marginTop: 12, padding: 10, background: '#eff7ff',
                            border: '1px solid #cee0fb', borderRadius: 6, fontSize: 12,
                            color: '#0c5fb8' }}>
                <strong>Target:</strong> {targetNode?.label || 'this group'}
                {applyToSubgroups && ' (and all sub-groups)'} · changes will be applied to {principals.length} {principals.length === 1 ? 'principal' : 'principals'}.
              </div>
            </>
          )}
        </div>

        <div className="wizard-foot">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <div className="hstack" style={{ gap: 8 }}>
            <button className="btn" onClick={back} disabled={step === 1}>
              <IcChevLeft size={14} /> Back
            </button>
            {step < 4 ? (
              <button className="btn primary" onClick={next}
                      disabled={(step === 1 && principals.length === 0)}>
                Next <IcChevRight size={14} />
              </button>
            ) : (
              <button className="btn primary" onClick={finish}>
                <IcCheck size={14} /> Finish & apply
              </button>
            )}
          </div>
        </div>
      </div>

      {showAdd && (
        <AddPrincipalModal
          onAdd={(picked) => {
            const merged = [...principals];
            picked.forEach(p => { if (!merged.find(x => x.name === p.name)) merged.push(p); });
            setPrincipals(merged);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)} />
      )}
    </div>
  );
}

// ============================================================
// Right-click context menu
// ============================================================
function NodeContextMenu({ x, y, node, onClose, onMultiGroup, onAddPermission, onRename, onDelete }) {
  React.useEffect(() => {
    function onDoc() { onClose(); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);
  const isCgroup = node.kind === 'cgroup' || node.kind === 'cgroot';
  return (
    <div className="popover fade-in"
         style={{ position: 'fixed', top: y, left: x, minWidth: 260, padding: 4, zIndex: 250 }}
         onMouseDown={e => e.stopPropagation()}>
      <div className="menu-item" onClick={() => { onAddPermission(); onClose(); }}>
        <IcUserShield size={14} /> Add permissions…
      </div>
      <div className="menu-item" onClick={() => { onMultiGroup(); onClose(); }}>
        <IcRibbon size={14} /> Multi-Group Operations
        <IcChevRight size={12} style={{ marginLeft: 'auto', color: 'var(--ink-4)' }} />
      </div>
      <div className="menu-divider" />
      <div className="menu-item" onClick={() => { onRename(); onClose(); }}>
        <IcEdit size={14} /> Rename…
      </div>
      {isCgroup && (
        <div className="menu-item" onClick={() => { onClose(); }}>
          <IcPlus size={14} /> New console sub-group…
        </div>
      )}
      <div className="menu-divider" />
      <div className="menu-item" style={{ color: 'var(--red)' }}
           onClick={() => { onDelete(); onClose(); }}>
        <IcTrash size={14} /> Delete
      </div>
    </div>
  );
}

// ============================================================
// Tab: Console Group Permissions
// ============================================================
function ConsoleGroupTab({ tree, selectedId, onSelectNode, principals, onPrincipalsChange, locked }) {
  const [showAdd, setShowAdd] = React.useState(false);
  const [wizard, setWizard] = React.useState(null);  // null | { multi: bool }
  const [ctx, setCtx] = React.useState(null);

  function findNode(nodes, id) {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const f = findNode(n.children, id); if (f) return f; }
    }
    return null;
  }
  const selectedNode = findNode(tree, selectedId);

  function togglePerm(pid, key) {
    onPrincipalsChange(principals.map(p =>
      p.id === pid ? { ...p, perms: { ...p.perms, [key]: !p.perms[key] } } : p));
  }
  function toggleAll(pid, value) {
    onPrincipalsChange(principals.map(p =>
      p.id === pid ? { ...p, perms: permSet(value, value, value, value, value) } : p));
  }
  function removeP(pid) {
    onPrincipalsChange(principals.filter(p => p.id !== pid));
    ruleToast('Principal removed', 'info');
  }

  return (
    <>
      <div className="security-detail-head">
        <h2>
          <IcFolder size={18} style={{ color: 'var(--magenta)' }} />
          {selectedNode?.label || 'Select a node from the tree'}
        </h2>
        <div className="hstack" style={{ gap: 14 }}>
          <span className="crumb">
            <IcManager size={11} /> edmv19.3.1.2
            {selectedNode && selectedNode.id !== 'db' && <> · <IcChevRight size={10} /> {selectedNode.label}</>}
          </span>
          <span className="spacer" style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12 }}>
            {principals.length} {principals.length === 1 ? 'principal' : 'principals'}
          </span>
          <button className="btn primary" disabled={locked || !selectedNode}
                  onClick={() => setShowAdd(true)}>
            <IcPlus size={14} /> Add
          </button>
          <button className="btn" disabled={locked || !selectedNode}
                  onClick={() => setWizard({ multi: false })}>
            <IcWand size={14} /> Permission wizard…
          </button>
        </div>
      </div>
      <div className="security-detail-body">
        <PermissionsGrid
          principals={principals}
          locked={locked}
          onTogglePerm={togglePerm}
          onToggleAll={toggleAll}
          onRemove={removeP} />
        {selectedNode && (selectedNode.kind === 'cgroup' || selectedNode.kind === 'cgroot') && (
          <div style={{ marginTop: 14, padding: 10, background: '#fefce8',
                        border: '1px solid #fde047', borderRadius: 6, fontSize: 12,
                        color: '#854d0e', display: 'flex', alignItems: 'center', gap: 8 }}>
            <IcInfo size={14} />
            From EDM v17.1, granting <strong>Run</strong> on a parent Solution propagates to all its underlying components at run time — no need to assign them separately.
          </div>
        )}
      </div>

      {showAdd && (
        <AddPrincipalModal
          onAdd={(picked) => {
            const next = [...principals];
            picked.forEach(p => {
              if (!next.find(x => x.name === p.name)) {
                next.push({ id: 'p-' + Math.random().toString(36).slice(2, 9),
                            name: p.name, type: p.type,
                            perms: permSet(true, false, false, false, false) });
              }
            });
            onPrincipalsChange(next);
            setShowAdd(false);
            ruleToast(`${picked.length} principal${picked.length === 1 ? '' : 's'} added`, 'success');
          }}
          onCancel={() => setShowAdd(false)} />
      )}

      {wizard && (
        <PermissionWizard
          targetNode={selectedNode}
          applyToSubgroups={wizard.multi}
          onCancel={() => setWizard(null)}
          onApply={({ principals: added, perms, resolve, addToEmpty }) => {
            let next = [...principals];
            added.forEach(p => {
              const existing = next.find(x => x.name === p.name);
              if (resolve === 'remove') {
                if (existing) {
                  const np = { ...existing.perms };
                  Object.keys(perms).forEach(k => { if (perms[k]) np[k] = false; });
                  next = next.map(x => x.name === p.name ? { ...x, perms: np } : x);
                }
              } else if (resolve === 'replace') {
                if (existing) {
                  next = next.map(x => x.name === p.name ? { ...x, perms: { ...perms } } : x);
                } else {
                  next.push({ id: 'p-' + Math.random().toString(36).slice(2, 9),
                              name: p.name, type: p.type, perms: { ...perms } });
                }
              } else {
                if (existing) {
                  const np = { ...existing.perms };
                  Object.keys(perms).forEach(k => { if (perms[k]) np[k] = true; });
                  next = next.map(x => x.name === p.name ? { ...x, perms: np } : x);
                } else {
                  next.push({ id: 'p-' + Math.random().toString(36).slice(2, 9),
                              name: p.name, type: p.type, perms: { ...perms } });
                }
              }
            });
            onPrincipalsChange(next);
            setWizard(null);
            ruleToast(`Wizard applied — ${added.length} principal${added.length === 1 ? '' : 's'} updated`, 'success');
          }} />
      )}
    </>
  );
}

// ============================================================
// Tab: Database Role Permissions
// ============================================================
function DbRolesTab() {
  const [selected, setSelected] = React.useState(DB_ROLES[0].id);
  const role = DB_ROLES.find(r => r.id === selected);
  const [members] = React.useState([
    P('HHM\\saul.goodman',  'user',     permSet(true,  true,  true,  true,  true)),
    P('HHM\\kim.wexler',    'user',     permSet(true,  true,  true,  true,  true)),
    P('HHM\\EDM-Admins',    'adgroup',  permSet(true,  true,  true,  true,  true)),
  ]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', flex: 1, minHeight: 0 }}>
      <div style={{ borderRight: '1px solid var(--line)',
                    overflow: 'auto', padding: '10px 6px' }}>
        <div className="security-tree-head" style={{ background: '#fff', borderBottom: 0, padding: '0 8px 8px' }}>
          Database Roles
        </div>
        {DB_ROLES.map(r => (
          <div key={r.id}
               className={`wb-list-item ${r.id === selected ? 'active' : ''}`}
               onClick={() => setSelected(r.id)}
               style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{r.users} members</span>
            </div>
          </div>
        ))}
      </div>
      <div className="security-detail">
        <div className="security-detail-head">
          <h2>
            <IcShield size={18} style={{ color: 'var(--magenta)' }} />
            {role.name}
          </h2>
          <div className="crumb">{role.desc}</div>
        </div>
        <div className="security-detail-body">
          <div className="hstack" style={{ marginBottom: 14 }}>
            <span className="muted">{members.length} members assigned</span>
            <span className="spacer" style={{ flex: 1 }} />
            <button className="btn">
              <IcImport size={14} /> Open SSMS
            </button>
            <button className="btn primary">
              <IcPlus size={14} /> Add member
            </button>
          </div>
          <PermissionsGrid
            principals={members}
            onTogglePerm={() => {}} onToggleAll={() => {}} onRemove={() => {}} />
          <div style={{ marginTop: 14, padding: 10, background: '#eff7ff',
                        border: '1px solid #cee0fb', borderRadius: 6,
                        fontSize: 12, color: '#0c5fb8',
                        display: 'flex', alignItems: 'center', gap: 8 }}>
            <IcInfo size={14} />
            Server-wide logins are managed via SQL Server Management Studio. Use <strong>Open SSMS</strong> to launch the matching object explorer.
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tab: Web Users
// ============================================================
function WebUsersTab() {
  const [users, setUsers] = React.useState(SAMPLE_WEB_USERS);
  const [filter, setFilter] = React.useState('');
  const [selectedId, setSelectedId] = React.useState(users[0]?.id);

  const filtered = users.filter(u =>
    u.display.toLowerCase().includes(filter.toLowerCase()) ||
    u.login.toLowerCase().includes(filter.toLowerCase()));

  function toggle(uid, key) {
    setUsers(users.map(u => u.id === uid ? { ...u, perms: { ...u.perms, [key]: !u.perms[key] } } : u));
  }
  function toggleAllU(uid, value) {
    setUsers(users.map(u => u.id === uid ? { ...u, perms: permSet(value, value, value, value, value) } : u));
  }
  function setActive(uid, v) {
    setUsers(users.map(u => u.id === uid ? { ...u, active: v } : u));
  }

  // map web users to principal shape
  const asPrincipals = filtered.map(u => ({
    id: u.id, name: u.display, type: 'user', perms: u.perms,
  }));

  const active = users.filter(u => u.active).length;
  const license = 50;

  return (
    <>
      <div className="security-detail-head">
        <h2>
          <IcUser size={18} style={{ color: 'var(--magenta)' }} />
          Web Users
        </h2>
        <div className="hstack" style={{ gap: 14 }}>
          <span className="crumb">Configure permissions for the EDM thin-client web UI</span>
          <span className="spacer" style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: active >= license * .8 ? '#b91c1c' : 'var(--ink-3)',
                          fontWeight: 500 }}>
            {active} / {license} active web users
          </span>
          <button className="btn">
            <IcUsers size={14} /> Sync (All) Web Users with AD
          </button>
          <button className="btn primary">
            <IcPlus size={14} /> Add web user
          </button>
        </div>
      </div>
      <div className="security-detail-body">
        <div className="hstack" style={{ marginBottom: 14 }}>
          <div className="wb-list-search-wrap" style={{ width: 300 }}>
            <IcSearch size={14} />
            <input className="input" placeholder="Search web users…"
                   value={filter} onChange={e => setFilter(e.target.value)}
                   style={{ paddingLeft: 32 }} />
          </div>
          <span className="spacer" style={{ flex: 1 }} />
          <label className="checkbox" style={{ fontSize: 12 }}>
            <input type="checkbox" defaultChecked />
            <span className="box"><IcCheck size={12} /></span>
            Show inactive
          </label>
        </div>

        <div className="perm-grid">
          <div className="perm-grid-head"
               style={{ gridTemplateColumns: '1fr 70px 70px 70px 70px 70px 70px 70px 40px' }}>
            <span>User</span>
            <span>Active</span>
            {PERM_COLS.map(c => <span key={c}>{c}</span>)}
            <span />
          </div>
          {filtered.map(u => {
            const a = allChecked(u.perms);
            return (
              <div key={u.id} className="perm-grid-row"
                   style={{ gridTemplateColumns: '1fr 70px 70px 70px 70px 70px 70px 70px 40px',
                             opacity: u.active ? 1 : .55 }}>
                <span className="name">
                  <span className="principal-icon user">{principalInitials(u.display)}</span>
                  <span className="principal-meta">
                    <span className="pname">{u.display}</span>
                    <span className="ptype">{u.email}</span>
                  </span>
                </span>
                <span className="perm-cell">
                  <label className="toggle">
                    <input type="checkbox" checked={u.active}
                           onChange={e => setActive(u.id, e.target.checked)} />
                    <span className="track" />
                  </label>
                </span>
                <span className="perm-cell">
                  <PCheck checked={a}
                          onClick={() => toggleAllU(u.id, !a)} />
                </span>
                {['Open','Modify','Run','Create','Delete'].map(c => (
                  <span key={c} className="perm-cell">
                    <PCheck checked={u.perms[c]} onClick={() => toggle(u.id, c)} />
                  </span>
                ))}
                <span className="perm-cell">
                  <button className="icon-btn" title="Delete"
                          onClick={() => setUsers(users.filter(x => x.id !== u.id))}>
                    <IcTrash size={13} />
                  </button>
                </span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="dtable-empty">No web users match "{filter}"</div>
          )}
        </div>
        <div style={{ marginTop: 14, padding: 10, background: '#fff7e6',
                      border: '1px solid #f0d28a', borderRadius: 6,
                      fontSize: 12, color: '#92400e',
                      display: 'flex', alignItems: 'center', gap: 8 }}>
          <IcWarn size={14} />
          Active Directory <strong>groups</strong> are allowed only with an unlimited-web-users license. For standard licenses, add individual users instead.
        </div>
      </div>
    </>
  );
}

// ============================================================
// Tab: EDM Groups
// ============================================================
function EdmGroupsTab() {
  const [groups, setGroups] = React.useState(SAMPLE_EDM_GROUPS);
  const [selectedId, setSelectedId] = React.useState(groups[0]?.id);
  const [renaming, setRenaming] = React.useState(null);
  const [confirmDel, setConfirmDel] = React.useState(null);
  const [showAddMember, setShowAddMember] = React.useState(false);

  const group = groups.find(g => g.id === selectedId);

  function createGroup({ name, description }) {
    const g = { id: 'g-' + Date.now(), name, desc: description || '', clonedFromAD: false, members: [] };
    setGroups([...groups, g]);
    setSelectedId(g.id);
    setRenaming(null);
    ruleToast(`Group "${name}" created`, 'success');
  }
  function deleteGroup() {
    const next = groups.filter(g => g.id !== confirmDel.id);
    setGroups(next);
    setSelectedId(next[0]?.id);
    setConfirmDel(null);
    ruleToast('Group deleted', 'info');
  }
  function addMembers(picked) {
    const next = groups.map(g => g.id === selectedId
      ? { ...g, members: [...g.members, ...picked.filter(p => !g.members.find(m => m.name === p.name))] }
      : g);
    setGroups(next);
    setShowAddMember(false);
  }
  function removeMember(name) {
    setGroups(groups.map(g => g.id === selectedId
      ? { ...g, members: g.members.filter(m => m.name !== name) }
      : g));
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', flex: 1, minHeight: 0 }}>
      <div style={{ borderRight: '1px solid var(--line)',
                    overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div className="security-tree-head" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>EDM Groups</span>
          <button className="icon-btn" title="New group"
                  onClick={() => setRenaming('new')}>
            <IcPlus size={14} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '6px' }}>
          {groups.map(g => (
            <div key={g.id}
                 className={`wb-list-item ${g.id === selectedId ? 'active' : ''}`}
                 onClick={() => setSelectedId(g.id)}
                 style={{ padding: '8px 12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2,
                            overflow: 'hidden', flex: 1 }}>
                <span style={{ fontWeight: 500, fontSize: 13, display: 'inline-flex',
                               alignItems: 'center', gap: 6 }}>
                  <IcUsers size={13} />
                  {g.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-4)',
                                display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {g.members.length} member{g.members.length === 1 ? '' : 's'}
                  {g.clonedFromAD && <span style={{ background: 'var(--magenta-soft)',
                                                     color: 'var(--magenta)',
                                                     padding: '0 6px', borderRadius: 3,
                                                     fontWeight: 600 }}>AD</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="security-detail">
        {group ? (
          <>
            <div className="security-detail-head">
              <h2>
                <IcUsers size={18} style={{ color: 'var(--magenta)' }} />
                {group.name}
              </h2>
              <div className="hstack" style={{ gap: 14 }}>
                <span className="crumb">{group.desc || 'Custom EDM group'}</span>
                <span className="spacer" style={{ flex: 1 }} />
                {group.clonedFromAD && (
                  <button className="btn">
                    <IcUserShield size={14} /> Sync EDM Groups with AD
                  </button>
                )}
                <button className="btn"
                        onClick={() => setConfirmDel(group)}>
                  <IcTrash size={14} /> Delete
                </button>
                <button className="btn primary"
                        onClick={() => setShowAddMember(true)}>
                  <IcPlus size={14} /> Add member
                </button>
              </div>
            </div>
            <div className="security-detail-body">
              <div className="dtable">
                <div className="dtable-head" style={{ gridTemplateColumns: '32px 1fr 140px 40px' }}>
                  <span /><span>Member</span><span>Type</span><span />
                </div>
                {group.members.length === 0 && (
                  <div className="dtable-empty">No members yet.</div>
                )}
                {group.members.map(m => (
                  <div key={m.name} className="dtable-row"
                       style={{ gridTemplateColumns: '32px 1fr 140px 40px' }}>
                    <span>
                      <span className={`principal-icon ${m.type}`}
                            style={{ width: 22, height: 22 }}>
                        {principalInitials(m.name)}
                      </span>
                    </span>
                    <span style={{ fontWeight: 500 }}>{m.name}</span>
                    <span style={{ color: 'var(--ink-3)' }}>
                      {principalTypeLabel(m.type)}
                    </span>
                    <button className="icon-btn" title="Remove"
                            onClick={() => removeMember(m.name)}>
                      <IcTrash size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="coming-soon">
            <span className="cs-icon"><IcUsers size={28} /></span>
            <h2>No group selected</h2>
            <p>Pick a group from the list, or create a new one.</p>
          </div>
        )}
      </div>

      {renaming === 'new' && (
        <RuleNameModal title="New EDM Group" onSave={createGroup}
                       onCancel={() => setRenaming(null)} />
      )}
      {confirmDel && (
        <ConfirmModal
          title="Delete EDM Group?"
          message={<>Delete <strong>{confirmDel.name}</strong>? Members will not be deleted, but the group's permissions will be removed.</>}
          confirmLabel="Delete" confirmKind="danger"
          onConfirm={deleteGroup}
          onCancel={() => setConfirmDel(null)} />
      )}
      {showAddMember && (
        <AddPrincipalModal onAdd={addMembers}
                            onCancel={() => setShowAddMember(false)} />
      )}
    </div>
  );
}

// ============================================================
// Main: Console Grouping & Security overlay
// ============================================================
function ConsoleSecurity({ onClose, inline }) {
  const [tab, setTab] = React.useState('console');
  const [tree, setTree] = React.useState(INITIAL_TREE);
  const [selectedId, setSelectedId] = React.useState('cg-back-bbg');
  const [permsByNode, setPermsByNode] = React.useState(() => {
    const map = {};
    Object.keys(SAMPLE_PRINCIPALS).forEach(k => { map[k] = [...SAMPLE_PRINCIPALS[k]]; });
    return map;
  });
  const [ctx, setCtx] = React.useState(null);
  const [locked, setLocked] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);

  function selectNode(node) {
    // toggle expand when caller clones node
    setTree([...tree]);
    setSelectedId(node.id);
  }
  function onContextMenu(e, node) {
    setCtx({ x: e.clientX, y: e.clientY, node });
  }
  function setPrincipalsForSelected(next) {
    setPermsByNode({ ...permsByNode, [selectedId]: next });
    setDirty(true);
  }

  function save() {
    setDirty(false);
    ruleToast('Console grouping & security saved', 'success');
  }

  function syncWithAD() {
    ruleToast('Sync with Active Directory complete', 'success');
  }

  const principals = permsByNode[selectedId] || [];

  const headButtons = (
    <div className="right">
      <button className="btn" onClick={syncWithAD}>
        <IcUserShield size={14} /> Sync with AD
      </button>
      <div className="tool-sep" />
      <button className="btn primary" disabled={!dirty} onClick={save}>
        Save
      </button>
      {!inline && (
        <>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="icon-btn" onClick={onClose} title="Close"><IcX size={16} /></button>
        </>
      )}
    </div>
  );

  const shellContent = (
    <div className={inline ? 'security-inline' : 'security-shell'} onMouseDown={() => setCtx(null)}>
      <div className="security-head">
        <span className="title">
          <span className="ic"><IcUserShield size={18} /></span>
          Console Grouping & Security
        </span>
        <span className="lim">·  edmv19.3.1.2 (Implementation DB)</span>
        {dirty && <span style={{ color: '#92400e', fontSize: 12, fontWeight: 500 }}>● unsaved changes</span>}
        {headButtons}
      </div>

      <div className="security-tabs">
        {SECURITY_TABS.map(t => {
          const Icon = window[t.icon];
          return (
            <button key={t.id}
                    className={`tab ${tab === t.id ? 'active' : ''}`}
                    onClick={() => setTab(t.id)}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'console' && (
        <div className="security-body">
          <div className="security-tree-pane">
            <div className="security-tree-head">
              <IcFolder size={12} /> Console Tree
            </div>
            <div className="security-tree-body">
              <ConsoleTree nodes={tree}
                           selectedId={selectedId}
                           onSelect={selectNode}
                           onContextMenu={onContextMenu} />
            </div>
          </div>
          <div className="security-detail">
            <ConsoleGroupTab tree={tree}
                              selectedId={selectedId}
                              onSelectNode={selectNode}
                              principals={principals}
                              onPrincipalsChange={setPrincipalsForSelected}
                              locked={locked} />
          </div>
        </div>
      )}
      {tab === 'dbrole' && (
        <div className="security-body" style={{ gridTemplateColumns: '1fr' }}>
          <DbRolesTab />
        </div>
      )}
    </div>
  );

  const modals = (
    <>
      {ctx && (
        <NodeContextMenu
          x={ctx.x} y={ctx.y} node={ctx.node}
          onClose={() => setCtx(null)}
          onAddPermission={() => { setSelectedId(ctx.node.id); }}
          onMultiGroup={() => {
            setSelectedId(ctx.node.id);
            ruleToast('Multi-Group Operations — opening permission wizard', 'info');
          }}
          onRename={() => ruleToast('Rename: opening dialog', 'info')}
          onDelete={() => ruleToast('Delete: confirm before destructive action', 'info')} />
      )}
      {showImport && (
        <ConfirmModal
          title="Import EDM Groups"
          message={
            <div>
              <p>Choose how to merge the imported groups into <strong>edmv19.3.1.2</strong>:</p>
              <div className="vstack" style={{ gap: 8, marginTop: 10 }}>
                <label className="radio">
                  <input type="radio" name="mode" defaultChecked />
                  <span className="rdot" /> <strong>Append</strong> — add to existing, keep current members
                </label>
                <label className="radio">
                  <input type="radio" name="mode" />
                  <span className="rdot" /> <strong>Overwrite</strong> — delete existing groups + permissions, replace with imported ones
                </label>
              </div>
            </div>
          }
          confirmLabel="Import"
          onConfirm={() => {
            setShowImport(false);
            ruleToast('EDM groups imported', 'success');
          }}
          onCancel={() => setShowImport(false)} />
      )}
    </>
  );

  if (inline) {
    return <>{shellContent}{modals}</>;
  }

  return (
    <div className="security-overlay">
      {shellContent}
      {modals}
    </div>
  );
}

window.ConsoleSecurity = ConsoleSecurity;
