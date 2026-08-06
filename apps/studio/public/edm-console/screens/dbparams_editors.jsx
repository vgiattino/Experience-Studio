// ============================================================
// Database Parameters — record editors (modal dialogs)
//   Modern CODA recreations of the legacy thick-client editors:
//   Connection properties, Message-queue properties, XML schema,
//   plus a generic field-driven editor for the simpler grids.
//   Exposed on window for database_params.jsx to dispatch.
// ============================================================
const toast = (m, k) => window.ruleToast && window.ruleToast(m, k);

// ---- shared inline icons ----
const IcRefresh2 = (p) => (
  <svg width={p.size || 15} height={p.size || 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </svg>
);
const IcCaret = (p) => (
  <svg width={p.size || 11} height={p.size || 11} viewBox="0 0 24 24" fill="currentColor" style={{ transition: 'transform .12s', transform: p.open ? 'rotate(90deg)' : 'none' }}>
    <path d="M8 5l8 7-8 7z" />
  </svg>
);
const IcBracket = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 7 4 12 9 17" /><polyline points="15 7 20 12 15 17" />
  </svg>
);

// ---- modal shell ----
function DbpModal({ title, icon, sub, size, onClose, children, footL, footR }) {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const Icon = icon ? (window[icon] || window.IcServer) : null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal dbp-edit ${size || ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="dbp-edit-head">
          <div className="dbp-edit-head-l">
            {Icon && <span className="dbp-edit-ic"><Icon size={18} /></span>}
            <div>
              <h3>{title}</h3>
              {sub && <div className="dbp-edit-sub">{sub}</div>}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><IcX size={17} /></button>
        </div>
        <div className="dbp-edit-body">{children}</div>
        <div className="dbp-edit-foot">
          <div className="dbp-edit-foot-l">{footL}</div>
          <div className="dbp-edit-foot-r">{footR}</div>
        </div>
      </div>
    </div>
  );
}

function DbpField({ label, help, required, children, full }) {
  return (
    <div className={`dbp-fld ${full ? 'full' : ''}`}>
      {label && <label className="dbp-fl">{label}{required && <span className="field-required"> *</span>}</label>}
      {children}
      {help && <div className="dbp-fhelp">{help}</div>}
    </div>
  );
}

// ---- test-connection pill state ----
function useTest() {
  const [state, setState] = React.useState(null); // null | 'testing' | 'ok' | 'fail'
  const run = (okMsg) => {
    setState('testing');
    setTimeout(() => { setState('ok'); toast(okMsg || 'Connection test succeeded', 'success'); }, 900);
  };
  return [state, run];
}
function TestState({ state }) {
  if (!state) return null;
  if (state === 'testing') return <span className="dbp-test-stat testing"><span className="spin" /> Testing…</span>;
  if (state === 'ok') return <span className="dbp-test-stat ok"><IcCircleCheck size={14} /> Connected</span>;
  return <span className="dbp-test-stat fail"><IcWarn size={14} /> Failed</span>;
}

// =============================================================
// Connection editor  (legacy "Specify Connection")
// =============================================================
const CONN_PROVIDERS = [
  { label: 'OLEDB Provider for SQL Server', code: 'SQLOLEDB', type: 'SQLServer' },
  { label: 'OLEDB Provider for Oracle', code: 'OraOLEDB.Oracle', type: 'Oracle' },
  { label: 'ODBC Provider for Sybase', code: 'Sybase.ASEOLEDBProvider', type: 'Sybase' },
];
function DbpConnectionEditor({ row, onClose, onSave }) {
  const isNew = !row;
  const [name, setName] = React.useState(row?.name || '');
  const [providerLabel, setProviderLabel] = React.useState(row?.providerLabel || CONN_PROVIDERS[0].label);
  const [server, setServer] = React.useState(row?.dataSource || '');
  const [database, setDatabase] = React.useState(row?.systemDB || '');
  const [winAuth, setWinAuth] = React.useState(row ? !!row.winAuth : true);
  const [user, setUser] = React.useState(row?.user || '');
  const [pass, setPass] = React.useState('');
  const [showPass, setShowPass] = React.useState(false);
  const [test, runTest] = useTest();

  const prov = CONN_PROVIDERS.find(p => p.label === providerLabel) || CONN_PROVIDERS[0];
  const valid = name.trim() && server.trim() && database.trim() && (winAuth || user.trim());

  function save() {
    onSave({
      ...(row || {}),
      name: name.trim(), providerLabel, provider: prov.code, type: prov.type,
      dataSource: server.trim(), systemDB: database.trim(), winAuth, user: winAuth ? '' : user.trim(),
    });
  }

  return (
    <DbpModal
      title={isNew ? 'New connection' : 'Edit connection'} icon="IcConnect" size="dbp-edit-md"
      sub="Connection used to read and write Opus EDM data."
      onClose={onClose}
      footL={
        <React.Fragment>
          <button className="btn" onClick={() => runTest('Connection test succeeded')} disabled={test === 'testing' || !server.trim()}>
            <IcLightning size={14} /> Test connection
          </button>
          <TestState state={test} />
        </React.Fragment>
      }
      footR={
        <React.Fragment>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!valid} onClick={save}>{isNew ? 'Add connection' : 'Save'}</button>
        </React.Fragment>
      }>
      <div className="dbp-form2">
        <DbpField label="Name" required full>
          <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. VC" />
        </DbpField>
        <DbpField label="Provider" full help="The OLEDB / ODBC provider EDM uses to reach the database.">
          <div className="select-wrap">
            <select className="select" value={providerLabel} onChange={e => setProviderLabel(e.target.value)}>
              {CONN_PROVIDERS.map(p => <option key={p.code} value={p.label}>{p.label}</option>)}
            </select>
          </div>
        </DbpField>
        <DbpField label="Server">
          <input className="input mono-in" value={server} onChange={e => setServer(e.target.value)} placeholder="host.example.com" />
        </DbpField>
        <DbpField label="Database">
          <input className="input mono-in" value={database} onChange={e => setDatabase(e.target.value)} placeholder="EDM_MODULES_FS_RELEASE_VC" />
        </DbpField>
      </div>

      <div className="dbp-sec-label">Authentication</div>
      <div className="dbp-auth">
        <label className={`dbp-auth-opt ${winAuth ? 'on' : ''}`} onClick={() => setWinAuth(true)}>
          <span className="dbp-rd" />
          <span>
            <span className="t">Integrated security</span>
            <span className="s">Use the Windows account running the EDM service.</span>
          </span>
        </label>
        <label className={`dbp-auth-opt ${!winAuth ? 'on' : ''}`} onClick={() => setWinAuth(false)}>
          <span className="dbp-rd" />
          <span>
            <span className="t">Specify user name and password</span>
            <span className="s">Authenticate with a database login.</span>
          </span>
        </label>
      </div>
      {!winAuth && (
        <div className="dbp-form2" style={{ marginTop: 14 }}>
          <DbpField label="User name">
            <input className="input" value={user} onChange={e => setUser(e.target.value)} placeholder="db_user" />
          </DbpField>
          <DbpField label="Password">
            <div className="input-wrap">
              <input className="input has-icon" type={showPass ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" />
              <span className="input-icon" onClick={() => setShowPass(v => !v)}>{showPass ? <IcEyeOff size={15} /> : <IcEye size={15} />}</span>
            </div>
          </DbpField>
        </div>
      )}
    </DbpModal>
  );
}

// =============================================================
// Message-queue editor  (legacy "Specify Queue")
// =============================================================
const QUEUE_TYPES = ['Database', 'ActiveMQ', 'Amazon SQS', 'Kafka', 'MSMQ', 'OracleAQ', 'RabbitMQ Send', 'SolaceMQ'];
const QUEUE_ENCODINGS = [
  { v: '1200', l: '1200 — Unicode (UTF-16)' },
  { v: '65001', l: '65001 — UTF-8' },
  { v: '1252', l: '1252 — Windows-1252' },
];
function DbpQueueEditor({ row, onClose, onSave }) {
  const isNew = !row;
  const [name, setName] = React.useState(row?.name || '');
  const [qtype, setQtype] = React.useState(row?.qtype || 'Database');
  const [queue, setQueue] = React.useState(row?.queue || '');
  const [encoding, setEncoding] = React.useState(row?.encoding || '1200');
  const [batch, setBatch] = React.useState(row?.batch || '1000');
  const [readCount, setReadCount] = React.useState(row?.readCount || '1000');
  const [plugin, setPlugin] = React.useState(row?.plugin || 'CADIS.Messaging.DataFactory');
  const [newQ, setNewQ] = React.useState('');
  const [test, runTest] = useTest();

  const valid = name.trim() && queue.trim();
  function save() {
    onSave({ ...(row || {}), name: name.trim(), qtype, queue: queue.trim(), encoding, batch, readCount, plugin });
  }

  return (
    <DbpModal
      title={isNew ? 'New message queue' : 'Edit message queue'} icon="IcLayers" size="dbp-edit-md"
      sub="Queue used to pass messages between EDM processes."
      onClose={onClose}
      footL={<TestState state={test} />}
      footR={
        <React.Fragment>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!valid} onClick={save}>{isNew ? 'Add queue' : 'Save'}</button>
        </React.Fragment>
      }>
      <div className="dbp-form2">
        <DbpField label="Name" required>
          <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Exceptions" />
        </DbpField>
        <DbpField label="Queue type">
          <div className="select-wrap">
            <select className="select" value={qtype} onChange={e => setQtype(e.target.value)}>
              {QUEUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </DbpField>
        <DbpField label="Queue name" required full help="The physical queue on the broker. Refresh to list, Test to verify reachability.">
          <div className="dbp-test-row">
            <input className="input mono-in" value={queue} onChange={e => setQueue(e.target.value)} placeholder="Exceptions" />
            <button className="btn" onClick={() => toast('Refreshed queue list', 'info')}><IcRefresh2 size={14} /> Refresh</button>
            <button className="btn" onClick={() => runTest('Queue reachable')} disabled={!queue.trim() || test === 'testing'}><IcLightning size={14} /> Test</button>
          </div>
        </DbpField>
        <DbpField label="Encoding">
          <div className="select-wrap">
            <select className="select" value={encoding} onChange={e => setEncoding(e.target.value)}>
              {QUEUE_ENCODINGS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
            </select>
          </div>
        </DbpField>
        <DbpField label="Plugin">
          <input className="input mono-in" value={plugin} onChange={e => setPlugin(e.target.value)} />
        </DbpField>
        <DbpField label="Message batch size" help="Messages written per batch.">
          <input className="input mono-in" value={batch} onChange={e => setBatch(e.target.value.replace(/[^\d]/g, ''))} />
        </DbpField>
        <DbpField label="Messages read per poll" help="Default 1000 messages per read.">
          <input className="input mono-in" value={readCount} onChange={e => setReadCount(e.target.value.replace(/[^\d]/g, ''))} />
        </DbpField>
      </div>

      <div className="dbp-sec-label">Queue management</div>
      <div className="dbp-qm">
        <div className="dbp-qm-row">
          <span className="dbp-qm-lbl">Create queue</span>
          <input className="input mono-in" value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="New queue name" />
          <button className="btn" disabled={!newQ.trim()} onClick={() => { toast(`Queue “${newQ.trim()}” created`, 'success'); setNewQ(''); }}><IcPlus size={14} /> Create</button>
        </div>
        <div className="dbp-qm-row">
          <span className="dbp-qm-lbl">Remove queue</span>
          <div className="select-wrap" style={{ flex: 1 }}>
            <select className="select" defaultValue=""><option value="" disabled>Select a queue…</option>{QUEUE_TYPES.length && <option>{queue || 'Exceptions'}</option>}</select>
          </div>
          <button className="btn" onClick={() => toast('Queue deleted', 'info')}><IcTrash size={13} /> Delete</button>
          <button className="btn" onClick={() => toast('All messages removed from queue', 'info')}>Purge messages</button>
        </div>
      </div>
    </DbpModal>
  );
}

// =============================================================
// XML schema editor  (legacy "Xml Schema Database Parameter")
// =============================================================
const XSD_TREE = [
  { name: 'ReportRequest', children: [
    { name: 'InputList', children: [ { name: 'Instrument', card: '1 .. *' } ] },
    { name: 'Schedule', children: [
      { name: 'TermsandConditionsSchedule', children: [
        { name: 'InputList' }, { name: 'ReportTemplate' }, { name: 'ScheduleImmediate' },
      ] },
    ] },
  ] },
];
const XSD_ATTRS = {
  Instrument: [
    { name: 'IdentifierType', desc: 'Simple child element' },
    { name: 'Identifier', desc: 'Simple child element' },
    { name: 'EDM_SEC_ID', desc: 'Simple child element' },
    { name: 'Exchange', desc: 'Simple child element' },
  ],
  ReportTemplate: [
    { name: 'TemplateName', desc: 'Simple child element' },
    { name: 'Format', desc: 'Simple child element', fixed: 'XML' },
  ],
};
function XsdNode({ node, path, depth, sel, onSel, open, toggle }) {
  const has = node.children && node.children.length;
  const here = [...path, node.name];
  const key = here.join('\\');
  const isOpen = open.has(key);
  return (
    <React.Fragment>
      <div className={`dbp-tree-row ${sel === key ? 'sel' : ''}`} style={{ paddingLeft: 8 + depth * 16 }} onClick={() => onSel(key, here)}>
        <span className="dbp-tree-tw" onClick={e => { e.stopPropagation(); if (has) toggle(key); }}>
          {has ? <IcCaret open={isOpen} /> : null}
        </span>
        <span className="dbp-tree-ic"><IcBracket size={13} /></span>
        <span className="dbp-tree-name">{node.name}</span>
        {node.card && <span className="dbp-tree-card">[{node.card}]</span>}
      </div>
      {has && isOpen && node.children.map(c => (
        <XsdNode key={c.name} node={c} path={here} depth={depth + 1} sel={sel} onSel={onSel} open={open} toggle={toggle} />
      ))}
    </React.Fragment>
  );
}
function DbpXmlSchemaEditor({ row, onClose, onSave }) {
  const isNew = !row;
  const [name, setName] = React.useState(row?.name || '');
  const [open, setOpen] = React.useState(() => new Set(['ReportRequest', 'ReportRequest\\InputList', 'ReportRequest\\Schedule', 'ReportRequest\\Schedule\\TermsandConditionsSchedule']));
  const [sel, setSel] = React.useState('ReportRequest\\InputList\\Instrument');
  const [selPath, setSelPath] = React.useState(['ReportRequest', 'InputList', 'Instrument']);
  function toggle(k) { setOpen(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  const attrs = XSD_ATTRS[selPath[selPath.length - 1]] || [];

  return (
    <DbpModal
      title={isNew ? 'New XML schema' : 'XML schema'} icon="IcSitemap" size="dbp-edit-lg"
      sub="Define the element hierarchy and attributes used to parse XML payloads."
      onClose={onClose}
      footL={
        <React.Fragment>
          <button className="btn" onClick={() => toast('Loaded schema from XSD', 'success')}><IcImport size={14} /> Load from XSD</button>
          <button className="btn" onClick={() => toast('Inferred schema from sample XML', 'success')}><IcLightning size={14} /> Infer from XML</button>
        </React.Fragment>
      }
      footR={
        <React.Fragment>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => onSave({ ...(row || {}), name: name.trim() })}>{isNew ? 'Add schema' : 'Save'}</button>
        </React.Fragment>
      }>
      <div className="dbp-form2" style={{ marginBottom: 14 }}>
        <DbpField label="Schema name" required full>
          <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. RED CDS Index Standard Schema" />
        </DbpField>
      </div>
      <div className="dbp-xsd-crumb">
        <span className="lbl">Currently selected level</span>
        <span className="path">{selPath.join(' \\ ')}</span>
      </div>
      <div className="dbp-xsd-grid">
        <div className="dbp-xsd-panel">
          <div className="dbp-xsd-ph">Schema elements</div>
          <div className="dbp-xsd-tree">
            {XSD_TREE.map(n => (
              <XsdNode key={n.name} node={n} path={[]} depth={0} sel={sel}
                onSel={(k, p) => { setSel(k); setSelPath(p); }} open={open} toggle={toggle} />
            ))}
          </div>
        </div>
        <div className="dbp-xsd-panel">
          <div className="dbp-xsd-ph">Selected element’s attributes</div>
          <div className="dbp-attr">
            <div className="dbp-attr-head">
              <span>Name</span><span>Description</span><span>Default / fixed value</span>
            </div>
            <div className="dbp-attr-scroll">
              {attrs.length ? attrs.map(a => (
                <div key={a.name} className="dbp-attr-row">
                  <span className="dbp-attr-n"><IcBracket size={12} /> {a.name}</span>
                  <span className="dbp-attr-d">{a.desc}</span>
                  <span className="dbp-attr-f">{a.fixed || '—'}</span>
                </div>
              )) : <div className="dbp-attr-empty">No attributes on this element.</div>}
            </div>
          </div>
        </div>
      </div>
    </DbpModal>
  );
}

// =============================================================
// Generic record editor (variables / locations / return codes / categories)
// =============================================================
const RECORD_SCHEMAS = {
  variables: { icon: 'IcVariables', titleNew: 'New variable', titleEdit: 'Edit variable',
    fields: [
      { key: 'name', label: 'Variable', required: true, full: true, placeholder: 'e.g. Bloomberg FTP Host' },
      { key: 'value', label: 'Value', full: true, mono: true, area: true, placeholder: 'Value' },
      { key: 'enc', label: 'Encrypt value', type: 'check', help: 'Store the value as ciphertext in the database.' },
    ] },
  locations: { icon: 'IcFolder', titleNew: 'New file location', titleEdit: 'Edit file location',
    fields: [
      { key: 'name', label: 'Name', required: true, full: true, placeholder: 'e.g. Refinitiv In' },
      { key: 'path', label: 'Path', full: true, mono: true, placeholder: 'D:\\Data\\In\\…' },
      { key: 'unc', label: 'UNC path', full: true, mono: true, placeholder: '\\\\server\\share\\…' },
    ] },
  retcodes: { icon: 'IcCircleDot', titleNew: 'New return code', titleEdit: 'Edit return code',
    fields: [
      { key: 'code', label: 'Code', required: true, mono: true, placeholder: '101' },
      { key: 'message', label: 'Message', full: true, area: true, placeholder: 'No more Porter files exist' },
    ] },
  categories: { icon: 'IcTag', titleNew: 'New category', titleEdit: 'Edit category',
    fields: [
      { key: 'id', label: 'ID', mono: true, placeholder: '5' },
      { key: 'name', label: 'Name', required: true, full: true, placeholder: 'e.g. Reconciliation' },
    ] },
};
function DbpRecordEditor({ cat, row, onClose, onSave }) {
  const schema = RECORD_SCHEMAS[cat];
  const isNew = !row;
  const [vals, setVals] = React.useState(() => {
    const o = {};
    schema.fields.forEach(f => { o[f.key] = row ? (row[f.key] ?? (f.type === 'check' ? false : '')) : (f.type === 'check' ? false : ''); });
    return o;
  });
  const set = (k, v) => setVals(s => ({ ...s, [k]: v }));
  const reqOk = schema.fields.every(f => !f.required || String(vals[f.key] ?? '').trim());

  return (
    <DbpModal
      title={isNew ? schema.titleNew : schema.titleEdit} icon={schema.icon} size="dbp-edit-sm"
      onClose={onClose}
      footR={
        <React.Fragment>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!reqOk} onClick={() => onSave({ ...(row || {}), ...vals })}>{isNew ? 'Add' : 'Save'}</button>
        </React.Fragment>
      }>
      <div className="dbp-form2">
        {schema.fields.map((f, i) => {
          if (f.type === 'check') {
            return (
              <DbpField key={f.key} full help={f.help}>
                <label className="dbp-check-inline" onClick={() => set(f.key, !vals[f.key])}>
                  <span className={`dbp-cbx ${vals[f.key] ? 'on' : ''}`}><IcCheck size={11} /></span>
                  <span className="t">{f.label}</span>
                </label>
              </DbpField>
            );
          }
          return (
            <DbpField key={f.key} label={f.label} required={f.required} full={f.full} help={f.help}>
              {f.area
                ? <textarea className={`textarea ${f.mono ? 'mono-in' : ''}`} style={{ minHeight: 72 }} value={vals[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} autoFocus={i === 0} />
                : <input className={`input ${f.mono ? 'mono-in' : ''}`} value={vals[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} autoFocus={i === 0} />}
            </DbpField>
          );
        })}
      </div>
    </DbpModal>
  );
}

// =============================================================
// Dispatcher
// =============================================================
function DbpEditor({ editor, onClose, onSave }) {
  if (!editor) return null;
  const { cat, row } = editor;
  const common = { row, onClose, onSave };
  if (cat === 'connections') return <DbpConnectionEditor {...common} />;
  if (cat === 'queues') return <DbpQueueEditorRich {...common} />;
  if (cat === 'xmlschemas') return <DbpXmlSchemaEditor {...common} />;
  return <DbpRecordEditor cat={cat} {...common} />;
}

window.DbpEditor = DbpEditor;
window.DBP_RECORD_CATS = Object.keys(RECORD_SCHEMAS);
window.DBP_EDITOR_CATS = ['connections', 'queues', 'xmlschemas', ...Object.keys(RECORD_SCHEMAS)];

// Shared helpers used by the type-driven Message Queue editor (separate file).
// Exporting to window makes them resolvable as bare identifiers there.
window.DbpModal = DbpModal;
window.DbpField = DbpField;
window.useTest = useTest;
window.TestState = TestState;
window.IcRefresh2 = IcRefresh2;
