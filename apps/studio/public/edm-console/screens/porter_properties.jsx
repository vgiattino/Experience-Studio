// ============================================================
// Data Porter Properties dialog + Execution run sheet
// Modeled on the EDM "Data Porter Properties" help docs:
//   Inputs · Process Variables · Process SQL Variables ·
//   Configurable Parameters · Process Connections ·
//   Process File Locations · Options · Comments
// ============================================================

const DPP_TABS = [
  { id: 'inputs',   label: 'Inputs',                icon: 'IcPorter' },
  { id: 'pvars',    label: 'Process Variables',     icon: 'IcVariables' },
  { id: 'sqlvars',  label: 'Process SQL Variables', icon: 'IcManager' },
  { id: 'params',   label: 'Configurable Parameters', icon: 'IcSliders' },
  { id: 'conns',    label: 'Process Connections',   icon: 'IcConnect' },
  { id: 'files',    label: 'Process File Locations', icon: 'IcFile' },
  { id: 'options',  label: 'Options',               icon: 'IcCog' },
  { id: 'comments', label: 'Comments',              icon: 'IcInfo' },
];

// Default seed data
function defaultDppData(porterName, processes) {
  return {
    name: porterName,
    pvars: [
      { id: 'pv1', name: 'ENTITY',     value: 'SECURITY' },
      { id: 'pv2', name: 'FEED',       value: 'BBG_BO' },
      { id: 'pv3', name: 'RUN_REGION', value: 'EMEA' },
    ],
    sqlvars: [
      { id: 'sv1', name: 'AS_OF_DATE', sql: "SELECT dbo.fn_BusinessDate(GETDATE())" },
      { id: 'sv2', name: 'CHECK_DIGIT', sql: "SELECT [Rule].[Calculate Cusip Check Digit]({INPUT}.[CUSIP])" },
    ],
    params: [
      { id: 'cp1', name: 'SourceFileName', value: 'bbg_corp_pfd_{yyyyMMdd}.csv', isNull: true },
      { id: 'cp2', name: 'BatchId',        value: '',                            isNull: true },
      { id: 'cp3', name: 'ArchivePath',    value: '\\\\EC2AMAZ-6GSNBAI\\Archive', isNull: false },
    ],
    conns: [
      { id: 'cn1', name: 'EDM Master DB',  provider: 'SQLOLEDB', server: '10.187.92.51', db: 'implementationdb_adv' },
      { id: 'cn2', name: 'Staging DB',     provider: 'SQLOLEDB', server: '10.187.92.51', db: 'staging_adv' },
    ],
    files: [
      { id: 'fl1', name: 'EDM Inbox',  path: '\\\\EC2AMAZ-6GSNBAI\\C$\\Inbox' },
      { id: 'fl2', name: 'EDM Archive', path: '\\\\EC2AMAZ-6GSNBAI\\C$\\Archive' },
    ],
    options: {
      concurrency: false,
      schema: 'Default',     // Default | Fast | Compatibility
      keyHeader: false,
      timeout: 60,
      updateMonitor: true,
    },
    comments: {
      version: 'v4.2.1',
      createdBy: 'saul.goodman@hhm.com',
      createdOn: '12 Aug 2025 09:14 AM',
      modifiedBy: 'jimmy.brown@hhm.com',
      modifiedOn: '28 May 2026 11:55 AM',
      note: 'Archives processed Moody success files from the Bloomberg Back Office Corp Pfd feed and updates the target deduplication table.',
    },
  };
}

// process-type label per input-step (best-effort from the chip type)
function inputProcessType(node) {
  const cfg = (window.CHIP_TYPES || {})[node.type];
  return cfg?.pt || 'Port_Data';
}

// ============================================================
// Properties dialog
// ============================================================
function DataPorterProperties({ porterName, processes, locked, onClose }) {
  const [tab, setTab] = React.useState('inputs');
  const [data, setData] = React.useState(() => defaultDppData(porterName, processes));

  // Flatten all input steps for the Inputs tab
  const inputs = [];
  processes.forEach(p => p.nodes.forEach((n, i) => {
    inputs.push({
      procId: p.id,
      name: n.name || n.type,
      type: n.type,
      pt: inputProcessType(n),
      desc: n.props?.desc || `${n.type} step in ${p.id}`,
      enabled: n.props?.enabled !== false,
      prec: i === 0 ? 'Always' : 'Previous_Step_Completed_OK',
    });
  }));

  function setOpt(patch) { setData({ ...data, options: { ...data.options, ...patch } }); }

  // generic list helpers
  function addRow(key, row) { setData({ ...data, [key]: [...data[key], row] }); }
  function delRow(key, id) { setData({ ...data, [key]: data[key].filter(r => r.id !== id) }); }
  function updRow(key, id, patch) {
    setData({ ...data, [key]: data[key].map(r => r.id === id ? { ...r, ...patch } : r) });
  }

  const counts = {
    inputs: inputs.length,
    pvars: data.pvars.length,
    sqlvars: data.sqlvars.length,
    params: data.params.length,
    conns: data.conns.length,
    files: data.files.length,
  };

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dpp">
        <div className="dpp-head">
          <span className="ic"><IcPorter size={18} /></span>
          <div>
            <h2>Data Porter Properties</h2>
            <div className="sub">Settings here apply only to this Data Porter, not across EDM.</div>
          </div>
          <div className="right">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={() => { ruleToast('Properties saved', 'success'); onClose(); }}>
              <IcCheck size={14} /> OK
            </button>
          </div>
        </div>

        <div className="dpp-body">
          <div className="dpp-rail">
            {/* Rename field at top */}
            <div style={{ padding: '4px 8px 12px' }}>
              <label className="field-label" style={{ fontSize: 11 }}>Data Porter name</label>
              <input className="input" value={data.name} disabled={locked}
                     onChange={e => setData({ ...data, name: e.target.value })}
                     style={{ padding: '6px 8px' }} />
            </div>
            {DPP_TABS.map(t => {
              const Icon = window[t.icon] || IcInfo;
              return (
                <button key={t.id} className={tab === t.id ? 'active' : ''}
                        onClick={() => setTab(t.id)}>
                  <span className="rail-ic"><Icon size={15} /></span>
                  {t.label}
                  {counts[t.id] != null && <span className="rail-count">{counts[t.id]}</span>}
                </button>
              );
            })}
          </div>

          <div className="dpp-content">
            {tab === 'inputs' && (
              <>
                <h3>Inputs</h3>
                <p className="lead">Manage how each input step is processed. Only the name and description can be edited here — type and precedence are defined on the step itself.</p>
                <div className="kv-table">
                  <div className="kv-head" style={{ gridTemplateColumns: '50px 1.3fr 1.6fr 90px 1fr 90px' }}>
                    <span>Step</span><span>Input name</span><span>Description</span>
                    <span>Enabled</span><span>Process type</span><span>Precedence</span>
                  </div>
                  {inputs.map((inp, i) => (
                    <div key={i} className="kv-row"
                         style={{ gridTemplateColumns: '50px 1.3fr 1.6fr 90px 1fr 90px' }}>
                      <span className="pill-prec">{inp.procId}</span>
                      <input defaultValue={inp.name} disabled={locked} />
                      <input defaultValue={inp.desc} disabled={locked} />
                      <span>
                        <label className="toggle">
                          <input type="checkbox" defaultChecked={inp.enabled} disabled={locked} />
                          <span className="track" />
                        </label>
                      </span>
                      <span className="pill-type">{inp.pt}</span>
                      <span className="pill-prec" title={inp.prec}>
                        {inp.prec === 'Always' ? 'Always' : 'Prev OK'}
                      </span>
                    </div>
                  ))}
                  {inputs.length === 0 && <div className="dtable-empty">No inputs defined.</div>}
                </div>
                <div className="setup-banner info" style={{ marginTop: 14 }}>
                  <IcInfo size={14} />
                  <span>Best practice: keep a Data Porter to <strong>~10 inputs</strong>. Split larger pipelines across multiple Porters for a manageable footprint.</span>
                </div>
              </>
            )}

            {tab === 'pvars' && (
              <ListEditor
                title="Process Variables"
                lead="Reused across field mappings of multiple input steps. e.g. ENTITY = SECURITY can be referenced from every input in this Porter."
                rows={data.pvars} locked={locked}
                cols={[
                  { k: 'name',  label: 'Variable', placeholder: 'VARIABLE_NAME' },
                  { k: 'value', label: 'Value',    placeholder: 'value' },
                ]}
                onAdd={() => addRow('pvars', { id: 'pv-' + Date.now(), name: '', value: '' })}
                onDel={id => delRow('pvars', id)}
                onUpd={(id, patch) => updRow('pvars', id, patch)} />
            )}

            {tab === 'sqlvars' && (
              <ListEditor
                title="Process SQL Variables"
                lead="Like Process Variables, but built with SQL syntax — so you can call Rule Builder rules and functions. e.g. SELECT [Rule].[Calculate Cusip Check Digit](…)"
                rows={data.sqlvars} locked={locked}
                cols={[
                  { k: 'name', label: 'Variable', placeholder: 'VARIABLE_NAME' },
                  { k: 'sql',  label: 'SQL expression', mono: true, placeholder: 'SELECT …' },
                ]}
                onAdd={() => addRow('sqlvars', { id: 'sv-' + Date.now(), name: '', sql: '' })}
                onDel={id => delRow('sqlvars', id)}
                onUpd={(id, patch) => updRow('sqlvars', id, patch)} />
            )}

            {tab === 'params' && (
              <>
                <h3>Configurable Parameters</h3>
                <p className="lead">Feed a value (e.g. a CSV file name) from another source such as the scheduler or Event Watcher. Tick <strong>Null?</strong> to receive the value at runtime; untick and enter a fixed value for testing.</p>
                <div className="kv-table">
                  <div className="kv-head" style={{ gridTemplateColumns: '1.2fr 2fr 70px 40px' }}>
                    <span>Parameter</span><span>Value</span><span>Null?</span><span />
                  </div>
                  {data.params.map(p => (
                    <div key={p.id} className="kv-row" style={{ gridTemplateColumns: '1.2fr 2fr 70px 40px' }}>
                      <input value={p.name} disabled={locked}
                             onChange={e => updRow('params', p.id, { name: e.target.value })}
                             placeholder="ParameterName" />
                      <input value={p.isNull ? '' : p.value} disabled={locked || p.isNull}
                             className="mono"
                             onChange={e => updRow('params', p.id, { value: e.target.value })}
                             placeholder={p.isNull ? '⟵ supplied at runtime' : 'fixed test value'} />
                      <span style={{ textAlign: 'center' }}>
                        <label className="checkbox" style={{ justifyContent: 'center' }}>
                          <input type="checkbox" checked={p.isNull} disabled={locked}
                                 onChange={e => updRow('params', p.id, { isNull: e.target.checked })} />
                          <span className="box"><IcCheck size={12} /></span>
                        </label>
                      </span>
                      <button className="icon-btn" disabled={locked} onClick={() => delRow('params', p.id)}>
                        <IcTrash size={13} />
                      </button>
                    </div>
                  ))}
                  {data.params.length === 0 && <div className="dtable-empty">No configurable parameters.</div>}
                </div>
                <button className="btn" disabled={locked} style={{ marginTop: 12 }}
                        onClick={() => addRow('params', { id: 'cp-' + Date.now(), name: '', value: '', isNull: true })}>
                  <IcPlus size={14} /> Add parameter
                </button>
              </>
            )}

            {tab === 'conns' && (
              <>
                <h3>Process Connections</h3>
                <p className="lead">Define a database connection once and select it from any input step, rather than re-specifying it each time.</p>
                <div className="kv-table">
                  <div className="kv-head" style={{ gridTemplateColumns: '1fr 120px 1fr 1fr 40px' }}>
                    <span>Name</span><span>Provider</span><span>Server</span><span>Database</span><span />
                  </div>
                  {data.conns.map(c => (
                    <div key={c.id} className="kv-row" style={{ gridTemplateColumns: '1fr 120px 1fr 1fr 40px' }}>
                      <input value={c.name} disabled={locked}
                             onChange={e => updRow('conns', c.id, { name: e.target.value })} />
                      <span className="pill-type">{c.provider}</span>
                      <input className="mono" value={c.server} disabled={locked}
                             onChange={e => updRow('conns', c.id, { server: e.target.value })} />
                      <input className="mono" value={c.db} disabled={locked}
                             onChange={e => updRow('conns', c.id, { db: e.target.value })} />
                      <button className="icon-btn" disabled={locked} onClick={() => delRow('conns', c.id)}>
                        <IcTrash size={13} />
                      </button>
                    </div>
                  ))}
                  {data.conns.length === 0 && <div className="dtable-empty">No process connections.</div>}
                </div>
                <div className="hstack" style={{ gap: 8, marginTop: 12 }}>
                  <button className="btn" disabled={locked}
                          onClick={() => addRow('conns', { id: 'cn-' + Date.now(), name: 'New connection', provider: 'SQLOLEDB', server: '', db: '' })}>
                    <IcPlus size={14} /> Add connection
                  </button>
                  <button className="btn" disabled={locked}
                          onClick={() => ruleToast('Connection test succeeded', 'success')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
                    Test connection
                  </button>
                </div>
              </>
            )}

            {tab === 'files' && (
              <ListEditor
                title="Process File Locations"
                lead="Define a file location once and reference it from multiple input steps — same idea as Process Connections, but for files."
                rows={data.files} locked={locked}
                cols={[
                  { k: 'name', label: 'Name', placeholder: 'EDM Inbox' },
                  { k: 'path', label: 'Path', mono: true, placeholder: '\\\\server\\share\\folder' },
                ]}
                onAdd={() => addRow('files', { id: 'fl-' + Date.now(), name: '', path: '' })}
                onDel={id => delRow('files', id)}
                onUpd={(id, patch) => updRow('files', id, patch)} />
            )}

            {tab === 'options' && (
              <>
                <h3>Options</h3>
                <p className="lead">Advanced execution options for this Data Porter.</p>

                <div className="card" style={{ padding: 16, marginBottom: 14 }}>
                  <label className="checkbox" style={{ marginBottom: 4 }}>
                    <input type="checkbox" checked={data.options.concurrency} disabled={locked}
                           onChange={e => setOpt({ concurrency: e.target.checked })} />
                    <span className="box"><IcCheck size={12} /></span>
                    <strong>Enable Concurrency</strong>
                  </label>
                  <div className="field-help" style={{ marginLeft: 24 }}>
                    Allows concurrent running of multiple Data Porters. Requires a specific licence —
                    see the EDM DBA's Guide to Managing Concurrency.
                  </div>
                </div>

                <div className="field">
                  <label className="field-label">Schema (column / datatype) detection</label>
                  <div className="vstack" style={{ gap: 8 }}>
                    {[
                      { v: 'Default', d: 'ConnectionSchemaMethod flag — works for stored procedures and table-valued functions across all SQL Server versions.' },
                      { v: 'Fast', d: 'SET FMTONLY ON — fastest, as used historically (deprecated by SQL Server).' },
                      { v: 'Compatibility', d: 'SET ROWCOUNT 1 — slower for complex SQL, but compatible with temp tables / TVFs in SQL 2017.' },
                    ].map(o => (
                      <label key={o.v} className="radio" style={{ alignItems: 'flex-start' }}>
                        <input type="radio" name="schema" checked={data.options.schema === o.v}
                               disabled={locked} onChange={() => setOpt({ schema: o.v })} />
                        <span className="rdot" style={{ marginTop: 3 }} />
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: 13 }}>{o.v}</strong>
                          <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>{o.d}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ padding: 16, margin: '14px 0' }}>
                  <label className="checkbox" style={{ marginBottom: 4 }}>
                    <input type="checkbox" checked={data.options.keyHeader} disabled={locked}
                           onChange={e => setOpt({ keyHeader: e.target.checked })} />
                    <span className="box"><IcCheck size={12} /></span>
                    <strong>Enable Key / Header</strong>
                    <span className="pill-type" style={{ marginLeft: 6 }}>Kafka / DB queue only</span>
                  </label>
                  <div className="field-help" style={{ marginLeft: 24 }}>
                    Adds Key + Headers target columns to the field-mapping step for message-based sources / targets.
                  </div>
                </div>

                <div className="form2">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Timeout (seconds)</label>
                    <div className="select-wrap">
                      <select className="select" value={data.options.timeout} disabled={locked}
                              onChange={e => setOpt({ timeout: +e.target.value })}>
                        <option value={60}>60 — default</option>
                        <option value={300}>300 — long operations (read all tables)</option>
                        <option value={3600}>3600 — large procs / complex inbox queries</option>
                      </select>
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 0, alignSelf: 'end' }}>
                    <label className="checkbox">
                      <input type="checkbox" checked={data.options.updateMonitor} disabled={locked}
                             onChange={e => setOpt({ updateMonitor: e.target.checked })} />
                      <span className="box"><IcCheck size={12} /></span>
                      Update the Process Monitor on run
                    </label>
                  </div>
                </div>
              </>
            )}

            {tab === 'comments' && (
              <>
                <h3>Comments</h3>
                <p className="lead">Version and audit information for this Data Porter.</p>
                <div className="prop-grid" style={{ marginBottom: 16 }}>
                  <div className="prop-grid-row"><div className="pg-k">Version</div><div className="pg-v readonly">{data.comments.version}</div></div>
                  <div className="prop-grid-row"><div className="pg-k">Created by</div><div className="pg-v readonly">{data.comments.createdBy}</div></div>
                  <div className="prop-grid-row"><div className="pg-k">Created on</div><div className="pg-v readonly">{data.comments.createdOn}</div></div>
                  <div className="prop-grid-row"><div className="pg-k">Last modified by</div><div className="pg-v readonly">{data.comments.modifiedBy}</div></div>
                  <div className="prop-grid-row"><div className="pg-k">Last modified on</div><div className="pg-v readonly">{data.comments.modifiedOn}</div></div>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Comment</label>
                  <textarea className="textarea" disabled={locked} value={data.comments.note}
                            onChange={e => setData({ ...data, comments: { ...data.comments, note: e.target.value } })}
                            style={{ minHeight: 100 }} />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="dpp-foot">
          <span className="muted" style={{ fontSize: 12 }}>
            <IcInfo size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Changes apply to <strong>{data.name}</strong> only.
          </span>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { ruleToast('Properties saved', 'success'); onClose(); }}>
            <IcCheck size={14} /> OK
          </button>
        </div>
      </div>
    </div>
  );
}

// Small reusable 2-col list editor
function ListEditor({ title, lead, rows, cols, locked, onAdd, onDel, onUpd }) {
  const tmpl = cols.map(() => '1fr').join(' ') + ' 40px';
  return (
    <>
      <h3>{title}</h3>
      <p className="lead">{lead}</p>
      <div className="kv-table">
        <div className="kv-head" style={{ gridTemplateColumns: tmpl }}>
          {cols.map(c => <span key={c.k}>{c.label}</span>)}
          <span />
        </div>
        {rows.map(r => (
          <div key={r.id} className="kv-row" style={{ gridTemplateColumns: tmpl }}>
            {cols.map(c => (
              <input key={c.k} value={r[c.k]} disabled={locked}
                     className={c.mono ? 'mono' : ''}
                     placeholder={c.placeholder}
                     onChange={e => onUpd(r.id, { [c.k]: e.target.value })} />
            ))}
            <button className="icon-btn" disabled={locked} onClick={() => onDel(r.id)}>
              <IcTrash size={13} />
            </button>
          </div>
        ))}
        {rows.length === 0 && <div className="dtable-empty">Nothing defined yet.</div>}
      </div>
      <button className="btn" disabled={locked} style={{ marginTop: 12 }} onClick={onAdd}>
        <IcPlus size={14} /> Add
      </button>
    </>
  );
}

// ============================================================
// Execution run sheet — Save → Execute → Start → progress log
// ============================================================
function PorterRunSheet({ porterName, processes, onClose }) {
  // Build a flat list of steps from all processes
  const steps = [];
  processes.forEach(p => p.nodes.forEach(n => {
    steps.push({ label: `${p.id} · ${n.type}`, type: n.type });
  }));

  const [phase, setPhase] = React.useState('ready');  // ready | running | done | error
  const [stepIdx, setStepIdx] = React.useState(-1);
  const [logs, setLogs] = React.useState([]);
  const logRef = React.useRef(null);
  const tRef = React.useRef(null);

  function pushLog(entry) { setLogs(l => [...l, entry]); }

  function start() {
    setPhase('running');
    setStepIdx(0);
    setLogs([{ cls: 'l-info', text: `▶ Executing Data Port: ${porterName}` }]);
  }

  React.useEffect(() => {
    if (phase !== 'running') return;
    if (stepIdx >= steps.length) {
      // finish
      tRef.current = setTimeout(() => {
        pushLog({ cls: 'l-done', text: `------ Data Port: ${porterName} - Process Completed ------` });
        setPhase('done');
      }, 400);
      return () => clearTimeout(tRef.current);
    }
    const s = steps[stepIdx];
    pushLog({ cls: 'l-info', text: `  → ${s.label}…` });
    const dur = 450 + Math.random() * 550;
    tRef.current = setTimeout(() => {
      // occasional warn for flavor
      if (s.type === 'Change Tolerance') {
        pushLog({ cls: 'l-warn', text: `    ⚠ 1 new column detected; captured to NEWCOLUMN table` });
      }
      const rows = Math.floor(200 + Math.random() * 8000);
      pushLog({ cls: 'l-ok', text: `    ✓ ${rows.toLocaleString()} rows processed` });
      setStepIdx(i => i + 1);
    }, dur);
    return () => clearTimeout(tRef.current);
  }, [phase, stepIdx]);

  React.useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  return (
    <div className="run-sheet">
      <div className="run-sheet-head">
        <span className={`dot ${phase === 'running' ? 'running' : phase === 'done' ? 'done' : ''}`} />
        Execution — {porterName}
        <span className="right">
          {phase === 'running' && (
            <button className="icon-btn" title="Stop" onClick={() => { clearTimeout(tRef.current); setPhase('error'); pushLog({ cls: 'l-warn', text: '■ Execution stopped by user' }); }}>
              <IcStop size={12} />
            </button>
          )}
          <button className="icon-btn" title="Close" onClick={onClose}><IcX size={14} /></button>
        </span>
      </div>

      <div className="run-steps">
        {steps.map((s, i) => (
          <div key={i} className={`run-step ${i < stepIdx ? 'done' : i === stepIdx && phase === 'running' ? 'active' : ''}`}>
            <span className="rs-stat">
              {i < stepIdx ? <IcCheck size={11} />
                : (i === stepIdx && phase === 'running')
                  ? <svg className="spin" width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(167,139,250,.35)" strokeWidth="3"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round"/></svg>
                  : null}
            </span>
            {s.label}
          </div>
        ))}
      </div>

      <div className="run-log" ref={logRef}>
        {logs.length === 0 && <div className="muted-d">Press Start to execute this Data Porter.</div>}
        {logs.map((l, i) => (
          <div key={i}>
            <span className="l-time">{String(i).padStart(2, '0')}</span>
            <span className={l.cls}>{l.text}</span>
          </div>
        ))}
      </div>

      <div className="run-sheet-foot">
        {phase === 'ready' && (
          <>
            <button className="btn primary" onClick={start}>
              <IcPlay size={13} /> Start
            </button>
            <span className="muted-d">Saved · ready to execute {steps.length} steps</span>
          </>
        )}
        {phase === 'running' && (
          <span className="muted-d">Running step {Math.min(stepIdx + 1, steps.length)} of {steps.length}…</span>
        )}
        {phase === 'done' && (
          <>
            <button className="btn primary" onClick={() => { setPhase('ready'); setStepIdx(-1); setLogs([]); }}>
              <IcRedo size={13} /> Run again
            </button>
            <button className="btn" onClick={onClose} style={{ background: '#26282f', color: '#fff', borderColor: '#3f3f46' }}>Close</button>
            <span className="muted-d" style={{ color: '#34d399' }}>✓ Process completed</span>
          </>
        )}
        {phase === 'error' && (
          <>
            <button className="btn primary" onClick={() => { setPhase('ready'); setStepIdx(-1); setLogs([]); }}>
              <IcRedo size={13} /> Reset
            </button>
            <span className="muted-d" style={{ color: '#fbbf24' }}>■ Stopped</span>
          </>
        )}
      </div>
    </div>
  );
}

window.DataPorterProperties = DataPorterProperties;
window.PorterRunSheet = PorterRunSheet;
