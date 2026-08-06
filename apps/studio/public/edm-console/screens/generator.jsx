// ============================================================
// Data Generator — workbench modeled on the EDM Data Generator docs
//   A Generator Function (config) + Inbox (display/edit grid).
//   Tabs: Function Attributes · Function Fields · Validation ·
//         Filters & Search · Inbox Preview
//   AI: configure fields, NL→validation rule, quick-search ideas,
//   inbox exception triage + bulk-fix suggestions.
// Seeded from real DG.xml examples (Exception Security, etc.).
// ============================================================

const DG_GENERATORS = {
  'Exception Security': {
    name: 'Exception Security', view: 'CADIS.VW_Exception_Security', version: '20.1.15.0',
    attrs: { canAdd: false, canEdit: true, canDelete: false, audit: true, rowVersion: true,
             displayNull: true, startSearch: false, itemsPerPage: 100, timeout: 60,
             setDate: 'CADIS_SYSTEM_UPDATED', setUser: 'CADIS_SYSTEM_CHANGEDBY', rowColoring: true },
    fields: [
      { name: 'EDM_ENTITY_ID', type: 'INT', visible: true, editable: false, required: false, pk: false, group: 'Key', fmt: 'Number' },
      { name: 'EXCEPTION_NAME', type: 'VARCHAR(150)', visible: true, editable: false, required: false, pk: false, group: 'Detail', fmt: 'Text' },
      { name: 'SOURCE_COLUMN', type: 'VARCHAR(50)', visible: true, editable: false, required: true, pk: true, group: 'Key', fmt: 'Text' },
      { name: 'STATUS', type: 'VARCHAR(20)', visible: true, editable: true, required: true, pk: false, group: 'Workflow', fmt: 'Text' },
      { name: 'OWNER', type: 'VARCHAR(50)', visible: true, editable: true, required: false, pk: false, group: 'Workflow', fmt: 'Text' },
      { name: 'PRIORITY', type: 'VARCHAR(10)', visible: true, editable: true, required: false, pk: false, group: 'Workflow', fmt: 'Text' },
      { name: 'SOURCE_VALUE', type: 'VARCHAR(500)', visible: true, editable: false, required: false, pk: false, group: 'Detail', fmt: 'Text' },
      { name: 'COMMENT', type: 'VARCHAR(500)', visible: true, editable: true, required: false, pk: false, group: 'Workflow', fmt: 'Text' },
      { name: 'CADIS_SYSTEM_UPDATED', type: 'DATETIME', visible: true, editable: false, required: false, pk: false, group: 'Audit', fmt: 'DateTime' },
    ],
    validation: [
      { id: 'v1', desc: 'Owner required to resolve', enabled: true, override: false, type: 'Record' },
      { id: 'v2', desc: 'Comment mandatory when status = Rejected', enabled: true, override: true, type: 'Field' },
    ],
    searches: ['Exception Name', 'Priority', 'Entity'],
    inbox: [
      { id: 1, entity: 700014882, exc: 'ISIN missing', col: 'ISIN', status: 'New', owner: '', prio: 'High', val: '<NULL>' },
      { id: 2, entity: 700031245, exc: 'Maturity mismatch', col: 'MATURITY', status: 'In progress', owner: 'kim.wexler', prio: 'Medium', val: '2027-06-14' },
      { id: 3, entity: 700044190, exc: 'Currency invalid', col: 'CCY', status: 'New', owner: '', prio: 'High', val: 'XYZ' },
      { id: 4, entity: 700052201, exc: 'Duplicate SEDOL', col: 'SEDOL', status: 'New', owner: '', prio: 'Medium', val: '2046251' },
      { id: 5, entity: 700061120, exc: 'Price stale > 5d', col: 'PX_LAST', status: 'Resolved', owner: 'saul.goodman', prio: 'Low', val: '98.21' },
    ],
  },
  'Master Security Display': {
    name: 'Master Security Display', view: 'CADIS.VW_Master_Security_Display', version: '20.1.15.0',
    attrs: { canAdd: false, canEdit: false, canDelete: false, audit: true, rowVersion: false,
             displayNull: false, startSearch: true, itemsPerPage: 100, timeout: 60,
             setDate: '', setUser: '', rowColoring: false },
    fields: [
      { name: 'EDM_SEC_ID', type: 'INT', visible: true, editable: false, required: false, pk: true, group: 'Key', fmt: 'Number' },
      { name: 'SECURITY_NAME', type: 'VARCHAR(200)', visible: true, editable: false, required: false, pk: false, group: 'Detail', fmt: 'Text' },
      { name: 'ISIN', type: 'CHAR(12)', visible: true, editable: false, required: false, pk: false, group: 'Identifiers', fmt: 'Text' },
      { name: 'CUSIP', type: 'CHAR(9)', visible: true, editable: false, required: false, pk: false, group: 'Identifiers', fmt: 'Text' },
      { name: 'ASSET_TYPE', type: 'VARCHAR(20)', visible: true, editable: false, required: false, pk: false, group: 'Detail', fmt: 'Text' },
      { name: 'CURRENCY', type: 'CHAR(3)', visible: true, editable: false, required: false, pk: false, group: 'Detail', fmt: 'Text' },
    ],
    validation: [],
    searches: ['ISIN', 'CUSIP', 'Security Name'],
    inbox: [
      { id: 1, entity: 700014882, exc: 'APPLE INC 4.65% 2046', col: 'US037833AL42', status: 'Active', owner: 'USD', prio: 'Low', val: 'FI' },
    ],
  },
  'Manual Security Create': {
    name: 'Manual Security Create', view: 'CADIS.VW_Manual_Security_Create', version: '20.1.15.0',
    attrs: { canAdd: true, canEdit: true, canDelete: true, audit: true, rowVersion: true,
             displayNull: true, startSearch: false, itemsPerPage: 50, timeout: 60,
             setDate: 'CADIS_SYSTEM_UPDATED', setUser: 'CADIS_SYSTEM_CHANGEDBY', rowColoring: false },
    fields: [
      { name: 'MAN_SEC_ID', type: 'INT', visible: true, editable: false, required: false, pk: true, group: 'Key', fmt: 'Number' },
      { name: 'SECURITY_NAME', type: 'VARCHAR(200)', visible: true, editable: true, required: true, pk: false, group: 'Detail', fmt: 'Text' },
      { name: 'ISIN', type: 'CHAR(12)', visible: true, editable: true, required: false, pk: false, group: 'Identifiers', fmt: 'Text' },
      { name: 'ASSET_TYPE', type: 'VARCHAR(20)', visible: true, editable: true, required: true, pk: false, group: 'Detail', fmt: 'Text' },
      { name: 'CURRENCY', type: 'CHAR(3)', visible: true, editable: true, required: true, pk: false, group: 'Detail', fmt: 'Text' },
      { name: 'MATURITY_DATE', type: 'DATE', visible: true, editable: true, required: false, pk: false, group: 'Terms', fmt: 'Date' },
    ],
    validation: [
      { id: 'v1', desc: 'ISIN check-digit valid', enabled: true, override: false, type: 'Field' },
      { id: 'v2', desc: 'Currency in ISO 4217 list', enabled: true, override: false, type: 'Field' },
    ],
    searches: ['ISIN', 'Security Name'],
    inbox: [
      { id: 1, entity: 900001, exc: 'ACME 5% 2030', col: 'XS9988776655', status: 'Draft', owner: 'USD', prio: 'Medium', val: 'FI' },
    ],
  },
};

const DG_TABS = [
  { id: 'attrs', label: 'Function Attributes' },
  { id: 'fields', label: 'Function Fields' },
  { id: 'valid', label: 'Validation Rules' },
  { id: 'filters', label: 'Filters & Search' },
  { id: 'inbox', label: 'Inbox Preview' },
];

const DG_PRIO = { High: 'gen-prio-high', Medium: 'gen-prio-med', Low: 'gen-prio-low' };

function useAiRunG() {
  const [busy, setBusy] = React.useState(false);
  const run = (fn, ms = 850) => { setBusy(true); setTimeout(() => { fn(); setBusy(false); }, ms); };
  return [busy, run];
}
function AiSpin({ label }) {
  return <span className="ai-thinking" style={{ color: '#fff' }}>
    <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.4)" strokeWidth="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg> {label}
  </span>;
}

// ---- Function Attributes tab ----
function DgAttributes({ g, onChange }) {
  const a = g.attrs;
  const set = (k, v) => onChange({ ...g, attrs: { ...a, [k]: v } });
  const Toggle = ({ k, label, help }) => (
    <div className="hstack" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <div><div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>{help && <div className="muted" style={{ fontSize: 12 }}>{help}</div>}</div>
      <label className="toggle"><input type="checkbox" checked={a[k]} onChange={e => set(k, e.target.checked)} /><span className="track" /></label>
    </div>
  );
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 760 }}>
      <div className="kv-sec-label">Data modification</div>
      <Toggle k="canAdd" label="Can add new items" />
      <Toggle k="canEdit" label="Can edit existing items" />
      <Toggle k="canDelete" label="Can delete existing items" />
      <div className="kv-sec-label" style={{ marginTop: 18 }}>Audit & concurrency</div>
      <Toggle k="audit" label="Audit data updates" help="Records a searchable history of all changes (Report Explorer)." />
      <Toggle k="rowVersion" label="Row version check" help="Optimistic locking — requires Cadis_System_Timestamp on the table." />
      <div className="hstack" style={{ gap: 16, marginTop: 12 }}>
        <div className="field" style={{ flex: 1, margin: 0 }}><label className="field-label">Set control date on update</label><input className="input" value={a.setDate} onChange={e => set('setDate', e.target.value)} placeholder="(none)" /></div>
        <div className="field" style={{ flex: 1, margin: 0 }}><label className="field-label">Set control field with user</label><input className="input" value={a.setUser} onChange={e => set('setUser', e.target.value)} placeholder="(none)" /></div>
      </div>
      <div className="kv-sec-label" style={{ marginTop: 18 }}>Display & limits</div>
      <Toggle k="displayNull" label="Display null values as <NULL>" />
      <Toggle k="startSearch" label="Start on Search tab" />
      <Toggle k="rowColoring" label="Colour rows based on data" />
      <div className="hstack" style={{ gap: 16, marginTop: 12 }}>
        <div className="field" style={{ flex: 1, margin: 0 }}><label className="field-label">Default items per page</label><input className="input" type="number" value={a.itemsPerPage} onChange={e => set('itemsPerPage', +e.target.value)} /></div>
        <div className="field" style={{ flex: 1, margin: 0 }}><label className="field-label">Inbox query timeout (s)</label><input className="input" type="number" value={a.timeout} onChange={e => set('timeout', +e.target.value)} /></div>
      </div>
      {(!a.audit || !a.rowVersion || !a.setDate) && a.canEdit && (
        <div className="setup-banner warn" style={{ marginTop: 18 }}>
          <IcInfo size={15} />
          <span><strong>Best practice:</strong> for an editable inbox, enable Audit Data Updates, set control date to <code>CADIS_SYSTEM_UPDATED</code> + user to <code>CADIS_SYSTEM_CHANGEDBY</code>, and turn on Row Version Check.</span>
        </div>
      )}
    </div>
  );
}

// ---- Function Fields tab ----
function DgFields({ g, onChange }) {
  const [busy, run] = useAiRunG();
  const [ai, setAi] = React.useState(null);
  function toggle(i, k) { onChange({ ...g, fields: g.fields.map((f, j) => j === i ? { ...f, [k]: !f[k] } : f) }); }
  function suggest() {
    run(() => setAi([
      { t: <>Hide <strong>CADIS_SYSTEM_*</strong> audit columns by default — surface them only in the Audit field group.</> },
      { t: <>Mark <strong>STATUS</strong>, <strong>OWNER</strong>, <strong>PRIORITY</strong>, <strong>COMMENT</strong> editable; keep identifiers read-only.</> },
      { t: <>Group fields as <strong>Key · Detail · Workflow · Audit</strong> for a cleaner inbox layout.</> },
      { t: <><strong>SOURCE_COLUMN</strong> is the primary key — required is implied; good.</> },
    ]));
  }
  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="hstack" style={{ marginBottom: 12, gap: 8 }}>
        <span className="muted">Choose which fields the Inbox shows and how users can interact with them.</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={suggest} disabled={busy} style={{ background: '#6d28d9', borderColor: '#6d28d9', color: '#fff' }}>
          {busy ? <AiSpin label="Analyzing…" /> : <><IcSparkle size={13} /> AI configure fields</>}
        </button>
      </div>
      {ai && (
        <div className="ai-panel">
          <div className="ai-panel-head"><IcSparkle size={15} /> Field configuration suggestions <span className="ai-badge">AI</span></div>
          <div className="ai-panel-body">
            {ai.map((s, i) => <div key={i} className="ai-suggestion"><IcSparkle size={15} className="ai-ic" /><span className="ai-txt">{s.t}</span></div>)}
            <button className="btn" onClick={() => setAi(null)}>Dismiss</button>
          </div>
        </div>
      )}
      <div className="gen-field-grid">
        <div className="gen-field-head">
          <span>#</span><span>Field</span><span>Type</span><span>Visible</span><span>Editable</span><span>Required</span><span>PK</span><span>Group</span>
        </div>
        {g.fields.map((f, i) => (
          <div key={i} className="gen-field-row">
            <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{i + 1}</span>
            <span className="gen-field-name">{f.name}{f.pk && <span className="pk-tag">PK</span>}</span>
            <span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 11.5, color: 'var(--ink-3)' }}>{f.type}</span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={f.visible} onChange={() => toggle(i, 'visible')} /><span className="box"><IcCheck size={12} /></span></label></span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={f.editable} onChange={() => toggle(i, 'editable')} /><span className="box"><IcCheck size={12} /></span></label></span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={f.required} onChange={() => toggle(i, 'required')} /><span className="box"><IcCheck size={12} /></span></label></span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={f.pk} onChange={() => toggle(i, 'pk')} /><span className="box"><IcCheck size={12} /></span></label></span>
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{f.group}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Validation Rules tab ----
function DgValidation({ g, onChange }) {
  const [nl, setNl] = React.useState('');
  const [busy, run] = useAiRunG();
  const [proposed, setProposed] = React.useState(null);
  function generate() {
    if (!nl.trim()) return;
    run(() => setProposed({ desc: nl.length > 40 ? nl.slice(0, 40) + '…' : nl, enabled: true, override: /override/i.test(nl), type: /field/i.test(nl) ? 'Field' : /inbox/i.test(nl) ? 'Inbox' : 'Record' }));
  }
  function accept() {
    onChange({ ...g, validation: [...g.validation, { id: 'v' + Date.now(), ...proposed }] });
    setProposed(null); setNl(''); ruleToast('Validation rule added', 'success');
  }
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 920 }}>
      <div className="ai-panel">
        <div className="ai-panel-head"><IcSparkle size={15} /> Describe a validation rule <span className="ai-badge">AI</span></div>
        <div className="ai-panel-body">
          <div className="ai-input-row">
            <input className="input" placeholder="e.g. comment required when status is Rejected, allow override"
                   value={nl} onChange={e => setNl(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()} />
            <button className="btn primary" onClick={generate} disabled={busy || !nl.trim()}>{busy ? 'Building…' : 'Generate'}</button>
          </div>
          {proposed && (
            <div style={{ marginTop: 10 }}>
              <div className="ai-suggestion"><IcCircleCheck size={15} className="ai-ic" /><span className="ai-txt">Proposed <strong>{proposed.desc}</strong> · Rule type <strong>{proposed.type}</strong>{proposed.override ? ' · override allowed' : ''}</span></div>
              <div className="hstack" style={{ gap: 8 }}><button className="btn primary" onClick={accept}>Add rule</button><button className="btn" onClick={() => setProposed(null)}>Discard</button></div>
            </div>
          )}
        </div>
      </div>
      <div className="kv-table">
        <div className="kv-head" style={{ gridTemplateColumns: '2fr 90px 110px 90px' }}><span>Description</span><span>Enabled</span><span>Rule type</span><span>Override</span></div>
        {g.validation.map((v, i) => (
          <div key={v.id} className="kv-row" style={{ gridTemplateColumns: '2fr 90px 110px 90px' }}>
            <span style={{ fontWeight: 500 }}>{v.desc}</span>
            <span>{v.enabled ? <span className="test-result pass"><IcCheck size={12} /> On</span> : <span className="muted">Off</span>}</span>
            <span><span className="mp-tag">{v.type}</span></span>
            <span>{v.override ? 'Yes' : 'No'}</span>
          </div>
        ))}
        {g.validation.length === 0 && <div className="dtable-empty">No validation rules. Describe one above to add it.</div>}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <IcInfo size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        Rule types: <strong>Field</strong> validates on field exit · <strong>Record</strong> on row exit · <strong>Inbox</strong> on save. Validation applies only to data changed this session.
      </div>
    </div>
  );
}

// ---- Filters & Search tab ----
function DgFilters({ g, onChange }) {
  const [busy, run] = useAiRunG();
  const [ai, setAi] = React.useState(null);
  function suggest() {
    run(() => setAi(['Cadis ID equals…', 'Security Name like…', 'Status in (New, In progress)', 'Priority equals High AND Owner is empty']));
  }
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 920 }}>
      <div className="kv-sec-label">Username filter</div>
      <div className="field" style={{ maxWidth: 560 }}>
        <label className="checkbox" style={{ marginBottom: 8 }}><input type="checkbox" defaultChecked /><span className="box"><IcCheck size={12} /></span> Filter data to current user</label>
        <input className="input" defaultValue={'"CADIS_SYSTEM_CHANGEDBY" = {RUNTIME VARIABLE}.[Current User]'} style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }} />
      </div>
      <div className="kv-sec-label" style={{ marginTop: 18 }}>Quick searches</div>
      <div className="hstack" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {g.searches.map(s => <span key={s} className="mp-tag" style={{ fontSize: 12, padding: '4px 10px' }}>{s}</span>)}
        <button className="btn ghost" style={{ fontSize: 12 }} onClick={suggest} disabled={busy}>
          {busy ? <span className="ai-thinking">Thinking…</span> : <><IcSparkle size={13} style={{ color: '#6d28d9' }} /> AI suggest searches</>}
        </button>
      </div>
      {ai && (
        <div className="ai-panel">
          <div className="ai-panel-head"><IcSparkle size={15} /> Suggested quick searches <span className="ai-badge">AI</span></div>
          <div className="ai-panel-body">
            {ai.map((s, i) => (
              <div key={i} className="ai-suggestion"><IcSearch size={14} className="ai-ic" /><span className="ai-txt">{s}</span>
                <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => { onChange({ ...g, searches: [...g.searches, s.replace(/[….]/g, '').trim()] }); ruleToast('Quick search added', 'success'); }}>Add</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="kv-sec-label" style={{ marginTop: 18 }}>Constraint / filter</div>
      <textarea className="code-editor" style={{ minHeight: 80 }} spellCheck={false}
                defaultValue={'-- key field must intersect with reference list\n"EDM_SEC_ID" IN (SELECT EDM_SEC_ID FROM dbo.WatchList)'} />
    </div>
  );
}

// ---- Inbox Preview tab (live editable grid) ----
function DgInbox({ g, onChange }) {
  const [busy, run] = useAiRunG();
  const [ai, setAi] = React.useState(false);
  const editable = g.attrs.canEdit;
  const isException = g.name === 'Exception Security';

  function setCell(id, key, value) {
    onChange({ ...g, inbox: g.inbox.map(r => r.id === id ? { ...r, [key]: value } : r) });
  }
  function aiTriage() {
    run(() => { setAi(true); }, 1000);
  }
  function applyAll() {
    onChange({ ...g, inbox: g.inbox.map(r => {
      if (r.status === 'New' && r.prio === 'High') return { ...r, owner: 'kim.wexler', status: 'In progress' };
      return r;
    }) });
    setAi(false);
    ruleToast('Applied AI triage to 2 high-priority exceptions', 'success');
  }

  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="hstack" style={{ marginBottom: 12, gap: 8 }}>
        <span className="muted">{editable ? 'Editable inbox — edit cells inline; changes validate on save.' : 'Read-only inbox (enquiry).'} {g.attrs.itemsPerPage}/page.</span>
        <span className="spacer" style={{ flex: 1 }} />
        {isException && (
          <button className="btn" onClick={aiTriage} disabled={busy} style={{ background: '#6d28d9', borderColor: '#6d28d9', color: '#fff' }}>
            {busy ? <AiSpin label="Triaging…" /> : <><IcSparkle size={13} /> AI triage exceptions</>}
          </button>
        )}
        <button className="btn ghost" style={{ fontSize: 12 }}><IcExport size={13} /> Export to Excel</button>
      </div>

      {ai && isException && (
        <div className="ai-panel">
          <div className="ai-panel-head"><IcSparkle size={15} /> Exception triage <span className="ai-badge">AI</span></div>
          <div className="ai-panel-body">
            <div className="ai-suggestion"><IcWarn size={15} className="ai-ic" /><span className="ai-txt"><strong>2 High-priority, unassigned</strong> (ISIN missing, Currency invalid). Suggest assigning to <strong>kim.wexler</strong> and moving to <em>In progress</em>. The "Currency invalid" value <code>XYZ</code> isn't ISO 4217 — likely a feed mapping error.</span></div>
            <div className="ai-suggestion"><IcInfo size={15} className="ai-ic" /><span className="ai-txt"><strong>Duplicate SEDOL</strong> matches an existing master — recommend linking rather than creating a new record.</span></div>
            <div className="hstack" style={{ gap: 8 }}><button className="btn primary" onClick={applyAll}>Apply suggestions</button><button className="btn" onClick={() => setAi(false)}>Dismiss</button></div>
          </div>
        </div>
      )}

      <div className="gen-inbox">
        <table>
          <thead>
            <tr>
              {isException
                ? <>{['Entity Id', 'Exception', 'Source Col', 'Status', 'Owner', 'Priority', 'Source Value', 'Comment'].map(h => <th key={h}>{h}</th>)}</>
                : <>{g.fields.filter(f => f.visible).map(f => <th key={f.name}>{f.name}</th>)}</>}
            </tr>
          </thead>
          <tbody>
            {g.inbox.map(r => {
              const bg = g.attrs.rowColoring && r.prio === 'High' ? '#fff5f5' : g.attrs.rowColoring && r.prio === 'Medium' ? '#fffbeb' : undefined;
              if (!isException) {
                return (
                  <tr key={r.id}>
                    <td>{r.entity}</td><td>{r.exc}</td><td>{r.col}</td><td>{r.status}</td><td>{r.owner}</td><td>{r.val}</td>
                  </tr>
                );
              }
              return (
                <tr key={r.id} style={{ background: bg }}>
                  <td style={{ fontFamily: 'Menlo,Consolas,monospace' }}>{r.entity}</td>
                  <td>{r.exc}</td>
                  <td style={{ fontFamily: 'Menlo,Consolas,monospace' }}>{r.col}</td>
                  <td>
                    {editable
                      ? <select className="cell-input" value={r.status} onChange={e => setCell(r.id, 'status', e.target.value)}>
                          <option>New</option><option>In progress</option><option>Resolved</option><option>Rejected</option>
                        </select>
                      : r.status}
                  </td>
                  <td>{editable ? <input className="cell-input" value={r.owner} placeholder="—" onChange={e => setCell(r.id, 'owner', e.target.value)} /> : r.owner}</td>
                  <td><span className={`gen-prio ${DG_PRIO[r.prio]}`}>{r.prio}</span></td>
                  <td style={{ fontFamily: 'Menlo,Consolas,monospace', color: r.val === '<NULL>' ? 'var(--ink-5)' : 'var(--ink)' }}>{r.val}</td>
                  <td>{editable ? <input className="cell-input" placeholder="add comment…" defaultValue="" /> : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Main Generator screen
// ============================================================
function Generator() {
  const [gens, setGens] = React.useState(DG_GENERATORS);
  const [selected, setSelected] = React.useState('Exception Security');
  const [tab, setTab] = React.useState('inbox');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);

  const g = gens[selected];
  const compKey = 'generator:' + selected;
  const collab = useCollab();
  const compState = collab.components[compKey];
  const locked = !compState || compState.status !== 'me';
  function update(next) { setGens({ ...gens, [selected]: next }); }
  const names = Object.keys(gens).filter(n => n.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">Data Generator</span>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}><IcChevDoubleLeft size={16} /></button>
          </div>
          <div className="wb-list-search">
            <div className="wb-list-search-wrap"><IcSearch size={14} />
              <input className="input" placeholder="Filter functions…" value={filter} onChange={e => setFilter(e.target.value)} /></div>
          </div>
          <div className="wb-list-items">
            {names.map(n => (
              <div key={n} className={`wb-list-item ${n === selected ? 'active' : ''}`} onClick={() => setSelected(n)} style={{ gap: 10 }}>
                <IcGenerator size={15} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{n}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{gens[n].fields.length} fields · {gens[n].attrs.canEdit ? 'editable' : 'read-only'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="wb-body">
        <div className="wb-body-head">
          {!sidebarOpen && <button className="icon-btn" style={{ float: 'left', marginRight: 12 }} onClick={() => setSidebarOpen(true)}><IcChevDoubleRight size={16} /></button>}
          <div className="title-row">
            <span className="head-icon"><IcGenerator size={18} /></span>
            <h1>{g.name} <span className="ver-pill">EDM {g.version} <IcChevDown size={10} /></span></h1>
            <div className="right hstack" style={{ gap: 6 }}>
              {g.attrs.canEdit && <span className="env-pill" style={{ background: '#d1fae5', color: '#065f46' }}><IcEdit size={11} /> Editable</span>}
              <button className="ai-star" title="AI Assist"><IcSparkle size={16} /></button>
            </div>
          </div>
          <div className="desc">Maintenance & inquiry inbox over <code style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }}>{g.view}</code>.</div>
        </div>

        <CheckoutBar componentKey={compKey} label={g.name} type="Generator" onOpenHistory={() => setShowHistory(true)} />
        {showHistory && <HistoryModal componentKey={compKey} label={g.name} onClose={() => setShowHistory(false)} />}

        <div className="wb-body-toolbar">
          <button className="btn ghost" onClick={() => ruleToast('Saved', 'success')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save
          </button>
          <button className="icon-btn" title="Refresh inbox" onClick={() => ruleToast('Inbox refreshed', 'info')}><IcRedo size={15} /></button>
          <div className="spacer" />
          <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                  onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from Generator')}>
            <IcShield size={16} />
          </button>
        </div>

        <div className="tabs" style={{ padding: '0 24px', margin: 0, borderBottom: '1px solid var(--line)' }}>
          {DG_TABS.map(tb => <button key={tb.id} className={`tab ${tab === tb.id ? 'active' : ''}`} onClick={() => setTab(tb.id)}>{tb.label}</button>)}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {tab === 'attrs' && <DgAttributes g={g} onChange={update} />}
          {tab === 'fields' && <DgFields g={g} onChange={update} />}
          {tab === 'valid' && <DgValidation g={g} onChange={update} />}
          {tab === 'filters' && <DgFilters g={g} onChange={update} />}
          {tab === 'inbox' && <DgInbox g={g} onChange={update} />}
        </div>
      </div>
    </div>
  );
}

window.Generator = Generator;
