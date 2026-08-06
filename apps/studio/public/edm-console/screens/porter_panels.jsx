// ============================================================
// Porter step-specific property panels
// One component per step type — picked by the main Porter screen
// ============================================================

// ------------------------------------------------------------
// Generic / Archive File / File Action / Target File / etc.
// ------------------------------------------------------------
function GenericStepPanel({ step, locked, onUpdate }) {
  const p = step.props || {};
  function set(k, v) { onUpdate({ ...p, [k]: v }); }
  return (
    <div style={{ padding: '18px 24px 28px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>
        {step.name} — Input properties
      </h2>
      <div className="props-desc" style={{ marginBottom: 16, color: 'var(--ink-3)', fontSize: 13 }}>
        Specify the properties for this input
      </div>
      <div className="props-grid">
        <div className="field">
          <label className="field-label">Input name <IcInfo size={13} style={{ verticalAlign: 'middle', color: 'var(--ink-4)' }} /></label>
          <input className="input" disabled={locked}
                 value={p.name ?? step.name}
                 onChange={e => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Process Type</label>
          <div className="select-wrap">
            <select className="select" disabled={locked}
                    value={p.processType || step.type}
                    onChange={e => set('processType', e.target.value)}>
              <option>File_Function</option>
              <option>Variable_Assignment</option>
              <option>File_Source</option>
              <option>Action</option>
              <option>File_Target</option>
              <option>Port_Data</option>
              <option>Monitor</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Input Description</label>
          <textarea className="textarea" disabled={locked}
                    value={p.desc ?? `Used to ${step.type.toLowerCase()}.`}
                    onChange={e => set('desc', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Precedence</label>
          <div className="select-wrap">
            <select className="select" disabled={locked}
                    value={p.prec || 'Previous_Step_Completed_OK'}
                    onChange={e => set('prec', e.target.value)}>
              <option>Previous_Step_Completed_OK</option>
              <option>Previous_Step_Completed_FAIL</option>
              <option>Always</option>
              <option>Manual_Trigger</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Source File — file location + preview/properties tabs
// ------------------------------------------------------------
function SourceFilePanel({ step, locked, onUpdate }) {
  const p = step.props || {};
  const [tab, setTab] = React.useState('preview');
  const [mode, setMode] = React.useState(p.mode || 'manual');
  const [useUNC, setUseUNC] = React.useState(p.useUNC ?? true);
  function set(patch) { onUpdate({ ...p, ...patch }); }
  return (
    <div style={{ padding: '18px 24px 28px' }}>
      <div className="hstack" style={{ marginBottom: 12, gap: 8 }}>
        <span style={{ color: 'var(--ink-3)' }}>
          <IcSourceCard size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        </span>
        <input className="input" value={p.uncPath || '\\\\EC2AMAZ-6GSNBAI\\C$'}
               style={{ width: 320 }} disabled={locked}
               onChange={e => set({ uncPath: e.target.value })} />
        <div className="spacer" style={{ flex: 1 }} />
        <label className="checkbox" style={{ fontSize: 13 }}>
          <input type="checkbox" disabled={locked}
                 checked={useUNC} onChange={e => setUseUNC(e.target.checked)} />
          <span className="box"><IcCheck size={12} /></span>
          Use UNC
        </label>
      </div>

      <div className="hstack" style={{ gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
        <label className="radio">
          <input type="radio" checked={mode === 'manual'} disabled={locked}
                 onChange={() => setMode('manual')} />
          <span className="rdot" /> Manually Specified Location
        </label>
        <button className="btn" disabled={locked}>
          <IcSourceCard size={14} /> Browse…
        </button>
        <label className="radio">
          <input type="radio" checked={mode === 'selected'} disabled={locked}
                 onChange={() => setMode('selected')} />
          <span className="rdot" /> Use Selected Location
        </label>
        <div className="select-wrap" style={{ flex: 1, minWidth: 200 }}>
          <select className="select" disabled={locked || mode !== 'selected'}>
            <option>—</option>
            <option>EDM Inbox</option>
            <option>EDM Outbox</option>
          </select>
        </div>
        <div className="hstack" style={{ gap: 6 }}>
          <label className="field-label" style={{ margin: 0 }}>Encoding</label>
          <div className="select-wrap" style={{ width: 120 }}>
            <select className="select" disabled={locked}
                    value={p.encoding || 'Default'}
                    onChange={e => set({ encoding: e.target.value })}>
              <option>Default</option>
              <option>UTF-8</option>
              <option>UTF-16</option>
              <option>ASCII</option>
            </select>
          </div>
        </div>
      </div>

      <div className="hstack" style={{ gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 280, margin: 0 }}>
          <label className="field-label">File Name</label>
          <input className="input" disabled={locked}
                 value={p.fileName || ''} placeholder="e.g. orders_{yyyyMMdd}.csv"
                 onChange={e => set({ fileName: e.target.value })} />
        </div>
        <div className="field" style={{ width: 160, margin: 0 }}>
          <label className="field-label">Date Format</label>
          <input className="input" disabled={locked}
                 value={p.dateFormat || 'yyyyMMdd'}
                 onChange={e => set({ dateFormat: e.target.value })} />
        </div>
        <div className="field" style={{ width: 100, margin: 0 }}>
          <label className="field-label">Offset By</label>
          <input className="input" type="number" disabled={locked}
                 value={p.offset || 0}
                 onChange={e => set({ offset: +e.target.value })} />
        </div>
        <div className="field" style={{ width: 100, margin: 0 }}>
          <label className="field-label">&nbsp;</label>
          <div className="select-wrap">
            <select className="select" disabled={locked}
                    value={p.offsetUnit || 'Day(s)'}
                    onChange={e => set({ offsetUnit: e.target.value })}>
              <option>Day(s)</option>
              <option>Hour(s)</option>
              <option>Minute(s)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'preview' ? 'active' : ''}`}
                onClick={() => setTab('preview')}>Preview</button>
        <button className={`tab ${tab === 'props' ? 'active' : ''}`}
                onClick={() => setTab('props')}>Properties</button>
      </div>

      {tab === 'preview' && (
        <div>
          <div className="hstack" style={{ gap: 14, marginBottom: 8, fontSize: 12, color: 'var(--ink-3)' }}>
            <span>Max preview rows</span>
            <input className="input" type="number" value={p.previewRows || 10}
                   onChange={e => set({ previewRows: +e.target.value })}
                   style={{ width: 60 }} disabled={locked} />
            <span>Timeout (seconds)</span>
            <input className="input" type="number" value={p.timeout || 10}
                   onChange={e => set({ timeout: +e.target.value })}
                   style={{ width: 60 }} disabled={locked} />
            <button className="btn ghost" disabled={locked}>
              <IcRedo size={14} /> Refresh
            </button>
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 6,
                        background: '#fafafa', padding: '64px 14px', textAlign: 'center',
                        color: '#dc2626', fontSize: 13 }}>
            No preview available — no file is specified.
          </div>
        </div>
      )}
      {tab === 'props' && (
        <div className="prop-grid">
          <div className="prop-grid-row">
            <div className="pg-k">File mask</div>
            <div className="pg-v"><input disabled={locked} defaultValue="*.csv" /></div>
          </div>
          <div className="prop-grid-row">
            <div className="pg-k">Archive after read</div>
            <div className="pg-v"><input disabled={locked} defaultValue="True" /></div>
          </div>
          <div className="prop-grid-row">
            <div className="pg-k">Move-to path</div>
            <div className="pg-v"><input disabled={locked} defaultValue="\\EC2AMAZ-6GSNBAI\C$\Archive" /></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Source Attributes — column delimiter, columns table, footer rows
// ------------------------------------------------------------
function SourceAttributesPanel({ step, locked, onUpdate }) {
  const p = step.props || {};
  const [tab, setTab] = React.useState('props');
  const [columns, setColumns] = React.useState(p.columns || []);
  const [delim, setDelim] = React.useState(p.delim || 'Comma (,)');
  const [colsBy, setColsBy] = React.useState(p.colsBy || 'delimited');

  function addCol() {
    const c = { id: 'c-' + Date.now(), name: `Column ${columns.length + 1}`, dataType: 'VARCHAR', useDefault: true, format: '', trim: 'BOTH', errorAction: 'Fail' };
    const next = [...columns, c];
    setColumns(next);
    onUpdate({ ...p, columns: next });
  }
  function removeCol(id) {
    const next = columns.filter(c => c.id !== id);
    setColumns(next);
    onUpdate({ ...p, columns: next });
  }
  function generate() {
    const cols = ['Id', 'Name', 'Date', 'Amount', 'Currency'].map((n, i) => ({
      id: 'g-' + i, name: n,
      dataType: i === 0 ? 'INT' : i === 2 ? 'DATETIME' : i === 3 ? 'DECIMAL' : 'VARCHAR',
      useDefault: true, format: '', trim: 'BOTH', errorAction: 'Fail',
    }));
    setColumns(cols);
    onUpdate({ ...p, columns: cols });
  }

  return (
    <div style={{ padding: '14px 24px 28px' }}>
      <div className="tabs">
        <button className={`tab ${tab === 'props' ? 'active' : ''}`}
                onClick={() => setTab('props')}>Properties</button>
        <button className={`tab ${tab === 'preview' ? 'active' : ''}`}
                onClick={() => setTab('preview')}>Preview</button>
      </div>

      {tab === 'props' && (
        <>
          <div style={{ background: 'var(--bg-1)', padding: '8px 12px', borderRadius: 4,
                        marginBottom: 14, fontSize: 11, fontWeight: 600,
                        letterSpacing: '.06em', color: 'var(--ink-3)' }}>
            COLUMNS
          </div>
          <div className="hstack" style={{ gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
            <label className="radio">
              <input type="radio" checked={colsBy === 'delimited'} disabled={locked}
                     onChange={() => setColsBy('delimited')} />
              <span className="rdot" /> Columns Delimited By
            </label>
            <div className="select-wrap" style={{ width: 140 }}>
              <select className="select" disabled={locked || colsBy !== 'delimited'}
                      value={delim} onChange={e => setDelim(e.target.value)}>
                <option>Comma (,)</option>
                <option>Tab (\t)</option>
                <option>Pipe (|)</option>
                <option>Semicolon (;)</option>
              </select>
            </div>
            <label className="radio">
              <input type="radio" checked={colsBy === 'fixed'} disabled={locked}
                     onChange={() => setColsBy('fixed')} />
              <span className="rdot" /> Fixed Width
            </label>
            <div className="hstack" style={{ gap: 6 }}>
              <label className="field-label" style={{ margin: 0 }}>Column Name Source</label>
              <div className="select-wrap" style={{ width: 140 }}>
                <select className="select" disabled={locked} defaultValue="User Defined">
                  <option>User Defined</option>
                  <option>Header Row</option>
                  <option>None</option>
                </select>
              </div>
            </div>
            <div className="hstack" style={{ gap: 6 }}>
              <label className="field-label" style={{ margin: 0 }}>Column Count</label>
              <input className="input" type="number" disabled={locked}
                     value={columns.length} readOnly style={{ width: 64 }} />
            </div>
          </div>

          <div className="hstack" style={{ gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>User Specified Column Names</span>
            <button className="btn" disabled={locked} onClick={generate}>
              <IcSparkle size={14} /> Generate
            </button>
            <button className="btn" disabled={locked}>
              <IcImport size={14} /> Load…
            </button>
            <div className="spacer" style={{ flex: 1 }} />
            <label className="checkbox" style={{ fontSize: 12 }}>
              <input type="checkbox" disabled={locked} />
              <span className="box"><IcCheck size={12} /></span>
              Text Qualified By
            </label>
            <div className="select-wrap" style={{ width: 80 }}>
              <select className="select" disabled={locked}>
                <option>"</option><option>'</option><option>none</option>
              </select>
            </div>
            <button className="btn ghost" disabled={locked}>Trim All</button>
            <button className="btn ghost" disabled={locked}>Untrim All</button>
            <button className="btn ghost" disabled={locked}>Save Columns</button>
          </div>

          <div className="hstack" style={{ alignItems: 'flex-start', gap: 6 }}>
            <div className="action-rail">
              <button className="icon-btn plus" disabled={locked} onClick={addCol} title="Add column">
                <IcPlus size={14} />
              </button>
              <button className="icon-btn minus" disabled={locked} title="Remove">
                <span style={{ fontSize: 14, lineHeight: 1 }}>−</span>
              </button>
              <button className="icon-btn" disabled={locked} title="Move up">↑</button>
              <button className="icon-btn" disabled={locked} title="Move down">↓</button>
            </div>
            <div className="dtable" style={{ flex: 1 }}>
              <div className="dtable-head" style={{ gridTemplateColumns: '1fr 120px 120px 1fr 80px 140px 40px' }}>
                <span>Column Name</span><span>Data Type</span><span>Use Default Format</span>
                <span>Format</span><span>Trim</span><span>Data Error Action</span><span />
              </div>
              {columns.length === 0 && (
                <div className="dtable-empty">
                  No columns defined. Click <strong>Generate</strong> or use the + button to add one.
                </div>
              )}
              {columns.map(c => (
                <div key={c.id} className="dtable-row"
                     style={{ gridTemplateColumns: '1fr 120px 120px 1fr 80px 140px 40px' }}>
                  <span><input className="input" disabled={locked} defaultValue={c.name}
                               style={{ border: 0, background: 'transparent', padding: '4px 0' }} /></span>
                  <span>
                    <div className="select-wrap">
                      <select className="select" disabled={locked} defaultValue={c.dataType}
                              style={{ border: 0, background: 'transparent', padding: '4px 18px 4px 0' }}>
                        <option>VARCHAR</option><option>INT</option><option>DECIMAL</option>
                        <option>DATETIME</option><option>BIT</option>
                      </select>
                    </div>
                  </span>
                  <span>
                    <label className="checkbox" style={{ fontSize: 12 }}>
                      <input type="checkbox" disabled={locked} defaultChecked={c.useDefault} />
                      <span className="box"><IcCheck size={12} /></span>
                    </label>
                  </span>
                  <span><input className="input" disabled={locked} defaultValue={c.format}
                               placeholder="default"
                               style={{ border: 0, background: 'transparent', padding: '4px 0' }} /></span>
                  <span>
                    <div className="select-wrap">
                      <select className="select" disabled={locked} defaultValue={c.trim}
                              style={{ border: 0, background: 'transparent', padding: '4px 18px 4px 0' }}>
                        <option>BOTH</option><option>LEFT</option><option>RIGHT</option><option>NONE</option>
                      </select>
                    </div>
                  </span>
                  <span>
                    <div className="select-wrap">
                      <select className="select" disabled={locked} defaultValue={c.errorAction}
                              style={{ border: 0, background: 'transparent', padding: '4px 18px 4px 0' }}>
                        <option>Fail</option><option>Skip row</option><option>Set null</option>
                      </select>
                    </div>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <button className="icon-btn" disabled={locked} onClick={() => removeCol(c.id)}>
                      <IcTrash size={13} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--bg-1)', padding: '8px 12px', borderRadius: 4,
                        margin: '18px 0 12px', fontSize: 11, fontWeight: 600,
                        letterSpacing: '.06em', color: 'var(--ink-3)' }}>
            ROWS
          </div>
          <div className="hstack" style={{ gap: 24, flexWrap: 'wrap' }}>
            <div className="hstack" style={{ gap: 6 }}>
              <label className="radio">
                <input type="radio" defaultChecked disabled={locked} />
                <span className="rdot" /> Header Rows To Ignore
              </label>
              <input className="input" type="number" defaultValue={0}
                     style={{ width: 60 }} disabled={locked} />
            </div>
            <div className="hstack" style={{ gap: 6 }}>
              <label className="radio">
                <input type="radio" disabled={locked} />
                <span className="rdot" /> Start Of Data Tag
              </label>
              <input className="input" disabled={locked} style={{ width: 160 }} />
            </div>
            <div className="hstack" style={{ gap: 6 }}>
              <label className="field-label" style={{ margin: 0 }}>Default Date Format</label>
              <input className="input" defaultValue="yyyy-MM-dd HH:mm:ss"
                     style={{ width: 200 }} disabled={locked} />
            </div>
          </div>
          <div className="hstack" style={{ gap: 24, marginTop: 10, flexWrap: 'wrap' }}>
            <div className="hstack" style={{ gap: 6 }}>
              <label className="radio">
                <input type="radio" defaultChecked disabled={locked} />
                <span className="rdot" /> Footer Rows To Ignore
              </label>
              <input className="input" type="number" defaultValue={0}
                     style={{ width: 60 }} disabled={locked} />
            </div>
            <div className="hstack" style={{ gap: 6 }}>
              <label className="radio">
                <input type="radio" disabled={locked} />
                <span className="rdot" /> End Of Data Tag
              </label>
              <input className="input" disabled={locked} style={{ width: 160 }} />
            </div>
            <div className="hstack" style={{ gap: 6 }}>
              <label className="field-label" style={{ margin: 0 }}>Row Delimiter</label>
              <div className="select-wrap" style={{ width: 120 }}>
                <select className="select" disabled={locked} defaultValue="{CR} or {LF}">
                  <option>{'{CR} or {LF}'}</option>
                  <option>{'{CR}{LF}'}</option>
                  <option>{'{CR}'}</option>
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'preview' && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
          Preview will appear here once a source file is specified.
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Change Tolerance
// ------------------------------------------------------------
function ChangeTolerancePanel({ step, locked }) {
  const [tab, setTab] = React.useState('mandatory');
  return (
    <div style={{ padding: '14px 24px 28px' }}>
      <div style={{ background: 'var(--bg-1)', padding: '8px 12px', borderRadius: 4,
                    marginBottom: 14, fontSize: 11, fontWeight: 600,
                    letterSpacing: '.06em', color: 'var(--ink-3)' }}>
        SOURCE CHANGE TOLERANCE
      </div>
      <div className="hstack" style={{ gap: 18, marginBottom: 14 }}>
        <label className="checkbox" style={{ fontSize: 13 }}>
          <input type="checkbox" disabled={locked} />
          <span className="box"><IcCheck size={12} /></span>
          Monitor Source Column Changes
        </label>
        <div style={{ background: '#fffbe8', border: '1px solid #f0d28a',
                      borderRadius: 4, padding: '6px 12px', fontSize: 12, color: '#92400e' }}>
          <strong>NOTE:</strong> It is not possible to monitor source column changes when using user defined columns
        </div>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'mandatory' ? 'active' : ''}`}
                onClick={() => setTab('mandatory')}>Mandatory Columns</button>
        <button className={`tab ${tab === 'new' ? 'active' : ''}`}
                onClick={() => setTab('new')}>New Columns</button>
      </div>

      <label className="checkbox" style={{ fontSize: 13, marginBottom: 10 }}>
        <input type="checkbox" disabled={locked} />
        <span className="box"><IcCheck size={12} /></span>
        Fail If Mandatory Columns Missing From Source
      </label>

      <div className="dtable">
        <div className="dtable-head" style={{ gridTemplateColumns: '1fr 200px 140px' }}>
          <span>Column Name</span><span>Data Type</span><span>Mandatory</span>
        </div>
        <div className="dtable-empty">
          {tab === 'mandatory'
            ? 'No mandatory columns defined yet.'
            : 'No new columns detected.'}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Variables
// ------------------------------------------------------------
function VariablesPanel({ step, locked, onUpdate }) {
  const p = step.props || {};
  const [tab, setTab] = React.useState('input');
  const [vars, setVars] = React.useState(p.vars || { input: [], file: [], fileName: [], sql: [] });
  function add() {
    const v = { id: 'v-' + Date.now(), name: `Variable ${vars[tab].length + 1}`, value: '' };
    const next = { ...vars, [tab]: [...vars[tab], v] };
    setVars(next); onUpdate({ ...p, vars: next });
  }
  function remove(id) {
    const next = { ...vars, [tab]: vars[tab].filter(v => v.id !== id) };
    setVars(next); onUpdate({ ...p, vars: next });
  }
  function update(id, patch) {
    const next = { ...vars, [tab]: vars[tab].map(v => v.id === id ? { ...v, ...patch } : v) };
    setVars(next); onUpdate({ ...p, vars: next });
  }
  return (
    <div style={{ padding: '14px 24px 28px' }}>
      <div className="tabs">
        {[
          { id: 'input', label: 'Input Variables', icon: 'IcVariables' },
          { id: 'file', label: 'File Variables', icon: 'IcFile' },
          { id: 'fileName', label: 'File Name Variables', icon: 'IcFile' },
          { id: 'sql', label: 'SQL Variables', icon: 'IcManager' },
        ].map(t => {
          const I = window[t.icon];
          return (
            <button key={t.id}
                    className={`tab ${tab === t.id ? 'active' : ''}`}
                    onClick={() => setTab(t.id)}>
              <I size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="hstack" style={{ alignItems: 'flex-start', gap: 6 }}>
        <div className="action-rail">
          <button className="icon-btn plus" disabled={locked} onClick={add} title="Add variable">
            <IcPlus size={14} />
          </button>
          <button className="icon-btn minus" disabled={locked} title="Remove">
            <span style={{ fontSize: 14, lineHeight: 1 }}>−</span>
          </button>
          <button className="icon-btn" disabled={locked}>↑</button>
          <button className="icon-btn" disabled={locked}>↓</button>
        </div>
        <div className="dtable" style={{ flex: 1, minHeight: 200 }}>
          <div className="dtable-head" style={{ gridTemplateColumns: '1fr 2fr 40px' }}>
            <span>{tab === 'sql' ? 'SQL Variable' : tab === 'fileName' ? 'File Name Variable' : tab === 'file' ? 'File Variable' : 'Input Variable'}</span>
            <span>Value</span><span />
          </div>
          {vars[tab].length === 0 && (
            <div className="dtable-empty">
              No variables defined. Click the green <strong>+</strong> to add one.
            </div>
          )}
          {vars[tab].map(v => (
            <div key={v.id} className="dtable-row"
                 style={{ gridTemplateColumns: '1fr 2fr 40px' }}>
              <input className="input" disabled={locked} value={v.name}
                     onChange={e => update(v.id, { name: e.target.value })}
                     style={{ border: 0, background: 'transparent', padding: '4px 0' }} />
              <input className="input" disabled={locked} value={v.value}
                     placeholder="value or {EXPR}"
                     onChange={e => update(v.id, { value: e.target.value })}
                     style={{ border: 0, background: 'transparent', padding: '4px 0' }} />
              <button className="icon-btn" disabled={locked} onClick={() => remove(v.id)}>
                <IcTrash size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Source Deduplication
// ------------------------------------------------------------
function SourceDedupPanel({ step, locked }) {
  const [tab, setTab] = React.useState('keys');
  const [dedup, setDedup] = React.useState(false);
  return (
    <div style={{ padding: '14px 24px 28px' }}>
      <div style={{ background: 'var(--bg-1)', padding: '8px 12px', borderRadius: 4,
                    marginBottom: 12, fontSize: 11, fontWeight: 600,
                    letterSpacing: '.06em', color: 'var(--ink-3)' }}>
        SOURCE DEDUPLICATION
      </div>
      <label className="checkbox" style={{ fontSize: 13, marginBottom: 14 }}>
        <input type="checkbox" disabled={locked}
               checked={dedup} onChange={e => setDedup(e.target.checked)} />
        <span className="box"><IcCheck size={12} /></span>
        Deduplicate Source
      </label>
      <div className="tabs">
        <button className={`tab ${tab === 'keys' ? 'active' : ''}`}
                onClick={() => setTab('keys')}>
          <IcSparkle size={14} /> Deduplication Keys
        </button>
        <button className={`tab ${tab === 'fns' ? 'active' : ''}`}
                onClick={() => setTab('fns')}>
          <IcLightning size={14} /> Deduplication Functions
        </button>
      </div>

      <div className="hstack" style={{ gap: 4, marginBottom: 10 }}>
        <button className="btn ghost" disabled={locked || !dedup}>Select All</button>
        <button className="btn ghost" disabled={locked || !dedup}>Clear All</button>
        <label className="checkbox" style={{ fontSize: 12, marginLeft: 8 }}>
          <input type="checkbox" disabled={locked || !dedup} />
          <span className="box"><IcCheck size={12} /></span>
          Sort Fields
        </label>
        <label className="checkbox" style={{ fontSize: 12 }}>
          <input type="checkbox" disabled={locked || !dedup} />
          <span className="box"><IcCheck size={12} /></span>
          Show Only Selected Fields
        </label>
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 6,
                    minHeight: 200, background: dedup ? '#fff' : 'var(--bg-1)',
                    padding: 16, fontSize: 13, color: 'var(--ink-4)' }}>
        {dedup
          ? <span>{tab === 'keys' ? 'Pick the columns that uniquely identify a record.' : 'Pick aggregation functions to apply on duplicates.'}</span>
          : <span>Enable <strong>Deduplicate Source</strong> to configure {tab === 'keys' ? 'keys' : 'functions'}.</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Target Connection
// ------------------------------------------------------------
function TargetConnectionPanel({ step, locked, onUpdate }) {
  const p = step.props || {};
  const [mode, setMode] = React.useState(p.mode || 'edm');
  const [provider, setProvider] = React.useState(p.provider || 'sqlserver');
  const initial = p.config || {
    DataSource: '10.187.92.51',
    DB: 'implementationdb_adv',
    Description: 'Advanced',
    IntegratedSecurity: 'True',
    Password: '',
    Provider: 'SQLOLEDB',
    ServiceUrl: '',
    UserId: '',
  };
  const [cfg, setCfg] = React.useState(initial);
  function set(k, v) { const next = { ...cfg, [k]: v }; setCfg(next); onUpdate({ ...p, config: next }); }
  return (
    <div style={{ padding: '14px 24px 28px' }}>
      <div style={{ background: 'var(--bg-1)', padding: '8px 12px', borderRadius: 4,
                    marginBottom: 14, fontSize: 11, fontWeight: 600,
                    letterSpacing: '.06em', color: 'var(--ink-3)',
                    display: 'flex', alignItems: 'center', gap: 6 }}>
        <IcConnect size={14} /> CONNECTION PROPERTIES
      </div>

      <div className="hstack" style={{ gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
        <label className="radio">
          <input type="radio" checked={mode === 'manual'} disabled={locked}
                 onChange={() => setMode('manual')} />
          <span className="rdot" /> Manually Specified Connection
        </label>
        <button className="btn" disabled={locked || mode !== 'manual'}>Specify…</button>
        <label className="radio">
          <input type="radio" checked={provider === 'sqlserver'} disabled={locked || mode !== 'manual'}
                 onChange={() => setProvider('sqlserver')} />
          <span className="rdot" /> SQL Server / Oracle / Sybase
        </label>
        <label className="radio">
          <input type="radio" checked={provider === 'oledb'} disabled={locked || mode !== 'manual'}
                 onChange={() => setProvider('oledb')} />
          <span className="rdot" /> OLEDB / ODBC
        </label>
      </div>

      <div className="hstack" style={{ gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
        <label className="radio">
          <input type="radio" checked={mode === 'selected'} disabled={locked}
                 onChange={() => setMode('selected')} />
          <span className="rdot" /> Use Selected Connection
        </label>
        <div className="select-wrap" style={{ flex: 1, minWidth: 240 }}>
          <select className="select" disabled={locked || mode !== 'selected'}>
            <option>—</option>
            <option>EDM Master DB</option>
            <option>Reporting DB</option>
          </select>
        </div>
      </div>

      <div className="hstack" style={{ marginBottom: 14 }}>
        <label className="radio">
          <input type="radio" checked={mode === 'edm'} disabled={locked}
                 onChange={() => setMode('edm')} />
          <span className="rdot" /> Use EDM Database Connection
        </label>
      </div>

      <div className="prop-grid">
        {Object.keys(cfg).map(k => (
          <div key={k} className="prop-grid-row">
            <div className="pg-k">{k}</div>
            <div className="pg-v">
              {k === 'Password'
                ? <input type="password" disabled={locked} value={cfg[k]}
                         onChange={e => set(k, e.target.value)} placeholder="●●●●●" />
                : <input disabled={locked} value={cfg[k]}
                         onChange={e => set(k, e.target.value)} />
              }
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-4)' }}>
        <strong>DataSource:</strong> the server hostname or IP of the target database
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Target Table
// ------------------------------------------------------------
function TargetTablePanel({ step, locked, onUpdate }) {
  const p = step.props || {};
  const [table, setTable] = React.useState(p.table || '');
  const [browseOpen, setBrowseOpen] = React.useState(false);
  const tables = ['dbo.tbl_BBG_SecurityCorp_Pfd', 'dbo.tbl_Master_Security',
                  'dbo.tbl_Master_Party', 'dbo.tbl_Inbox_Bloomberg',
                  'dbo.tbl_Inbox_LSEG', 'dbo.tbl_Audit_Log'];
  function pick(t) { setTable(t); onUpdate({ ...p, table: t }); setBrowseOpen(false); }
  return (
    <div style={{ padding: '14px 24px 28px' }}>
      <div className="hstack" style={{ gap: 8, marginBottom: 14 }}>
        <button className="btn" disabled={locked} onClick={() => setBrowseOpen(v => !v)}>
          <IcSearch size={14} /> Browse… <IcChevDown size={12} />
        </button>
        <button className="btn" disabled={locked} onClick={() => pick(`dbo.tbl_new_${Date.now().toString(36)}`)}>
          <IcPlus size={14} /> New…
        </button>
        <button className="btn" disabled={locked || !table}>
          <IcEdit size={14} /> Edit…
        </button>
        <div className="spacer" style={{ flex: 1 }} />
        <input className="input"
               value={table || '<No Table Selected>'}
               readOnly
               style={{ width: 320,
                        color: table ? 'var(--ink)' : '#dc2626',
                        fontFamily: table ? 'inherit' : 'inherit',
                        fontWeight: table ? 500 : 400 }} />
      </div>
      {browseOpen && (
        <div className="card fade-in" style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}>
          {tables.map(t => (
            <div key={t}
                 className={`menu-item ${t === table ? 'selected' : ''}`}
                 style={{ borderBottom: '1px solid var(--line)' }}
                 onClick={() => pick(t)}>
              <IcManager size={14} /> {t}
            </div>
          ))}
        </div>
      )}
      {!table ? (
        <div style={{ border: '1px dashed var(--line-2)', borderRadius: 6,
                      padding: '64px 14px', textAlign: 'center',
                      color: '#dc2626', fontSize: 13 }}>
          &lt;No Table Selected&gt;
        </div>
      ) : (
        <div className="card" style={{ padding: 14 }}>
          <div className="h3" style={{ marginBottom: 8 }}>{table}</div>
          <div className="dtable">
            <div className="dtable-head" style={{ gridTemplateColumns: '1fr 140px 80px 80px' }}>
              <span>Column</span><span>Data Type</span><span>Nullable</span><span>PK</span>
            </div>
            {[
              { c: 'Id', t: 'INT', n: 'No',  k: 'Yes' },
              { c: 'Name', t: 'VARCHAR(200)', n: 'No', k: 'No' },
              { c: 'CreatedAt', t: 'DATETIME', n: 'Yes', k: 'No' },
            ].map((r, i) => (
              <div key={i} className="dtable-row" style={{ gridTemplateColumns: '1fr 140px 80px 80px', cursor: 'default' }}>
                <span style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12.5 }}>{r.c}</span>
                <span style={{ color: 'var(--ink-3)' }}>{r.t}</span>
                <span style={{ color: 'var(--ink-3)' }}>{r.n}</span>
                <span style={{ color: r.k === 'Yes' ? 'var(--magenta)' : 'var(--ink-3)', fontWeight: r.k === 'Yes' ? 600 : 400 }}>{r.k}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Update Control
// ------------------------------------------------------------
function UpdateControlPanel({ step, locked, onUpdate }) {
  const p = step.props || {};
  const [mode, setMode] = React.useState(p.mode || 'overwrite');
  const [truncate, setTruncate] = React.useState(p.truncate ?? true);
  const [convert, setConvert] = React.useState(p.convert ?? false);
  function set(patch) { onUpdate({ ...p, ...patch }); }
  return (
    <div style={{ padding: '14px 24px 28px' }}>
      <div className="vstack" style={{ gap: 14, marginBottom: 18 }}>
        <label className="radio">
          <input type="radio" checked={mode === 'overwrite'} disabled={locked}
                 onChange={() => { setMode('overwrite'); set({ mode: 'overwrite' }); }} />
          <span className="rdot" /> <span style={{ fontSize: 13 }}>Overwrite (clear existing data)</span>
        </label>
        <label className="checkbox" style={{ marginLeft: 24, fontSize: 13 }}>
          <input type="checkbox" disabled={locked || mode !== 'overwrite'}
                 checked={truncate} onChange={e => { setTruncate(e.target.checked); set({ truncate: e.target.checked }); }} />
          <span className="box"><IcCheck size={12} /></span>
          Truncate
        </label>
        <label className="radio">
          <input type="radio" checked={mode === 'append'} disabled={locked}
                 onChange={() => { setMode('append'); set({ mode: 'append' }); }} />
          <span className="rdot" /> <span style={{ fontSize: 13 }}>Append (add to existing data)</span>
        </label>
        <label className="radio">
          <input type="radio" checked={mode === 'controlled'} disabled={locked}
                 onChange={() => { setMode('controlled'); set({ mode: 'controlled' }); }} />
          <span className="rdot" /> <span style={{ fontSize: 13 }}>Controlled Update (existing data will be updated, new data will be added)</span>
        </label>
        <label className="checkbox" style={{ marginLeft: 24, fontSize: 13 }}>
          <input type="checkbox" disabled={locked || mode !== 'controlled'}
                 checked={convert} onChange={e => { setConvert(e.target.checked); set({ convert: e.target.checked }); }} />
          <span className="box"><IcCheck size={12} /></span>
          Explicitly convert text key fields on controlled update key matching
        </label>
      </div>

      <div style={{ background: 'var(--bg-1)', padding: '8px 12px', borderRadius: 4,
                    marginBottom: 12, fontSize: 11, fontWeight: 600,
                    letterSpacing: '.06em', color: 'var(--ink-3)' }}>
        <IcSparkle size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        CONTROLLED UPDATE KEYS
      </div>
      <div className="hstack" style={{ gap: 4, marginBottom: 10 }}>
        <button className="btn ghost" disabled={locked || mode !== 'controlled'}>Select All</button>
        <button className="btn ghost" disabled={locked || mode !== 'controlled'}>Clear All</button>
        <label className="checkbox" style={{ fontSize: 12, marginLeft: 8 }}>
          <input type="checkbox" disabled={locked || mode !== 'controlled'} />
          <span className="box"><IcCheck size={12} /></span>
          Sort Fields
        </label>
        <label className="checkbox" style={{ fontSize: 12 }}>
          <input type="checkbox" disabled={locked || mode !== 'controlled'} />
          <span className="box"><IcCheck size={12} /></span>
          Show Only Selected Fields
        </label>
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 6,
                    minHeight: 200, background: mode === 'controlled' ? '#fff' : 'var(--bg-1)',
                    padding: 16, fontSize: 13, color: 'var(--ink-4)' }}>
        {mode === 'controlled'
          ? 'Select target table columns to use as update keys.'
          : 'Switch to Controlled Update to configure keys.'}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Field Mapping
// ------------------------------------------------------------
const FM_TREE = [
  { id: 'config', label: 'CONFIGURABLE PARAMETER', cls: 'tn-tag-config',
    children: [{ id: 'config-batch', label: 'BatchId' }, { id: 'config-env', label: 'Environment' }] },
  { id: 'loc', label: 'DATABASE LOCATION', cls: 'tn-tag-loc',
    children: [{ id: 'loc-server', label: 'ServerName' }, { id: 'loc-db', label: 'Database' }] },
  { id: 'var', label: 'DATABASE VARIABLE', cls: 'tn-tag-var',
    children: [{ id: 'var-now', label: '@@SYSDATE' }, { id: 'var-user', label: '@@CURRENT_USER' }] },
  { id: 'default', label: 'DEFAULT', cls: 'tn-tag-default',
    children: [{ id: 'default-null', label: 'NULL' }, { id: 'default-sql', label: 'SQLDefault' }] },
  { id: 'runtime', label: 'RUNTIME VARIABLE', cls: 'tn-tag-runtime',
    children: [{ id: 'rt-row', label: 'rowId' }, { id: 'rt-ts', label: 'runTimestamp' }] },
];

function FieldMappingPanel({ step, locked, onUpdate }) {
  const p = step.props || {};
  const [open, setOpen] = React.useState({ config: false, loc: false, var: false, default: true, runtime: false });
  const [selected, setSelected] = React.useState('default-null');
  const [mappings, setMappings] = React.useState(p.mappings || [
    { id: 'm1', source: 'Id', sourceType: 'INT',         target: 'Id',         targetType: 'INT' },
    { id: 'm2', source: 'Name', sourceType: 'VARCHAR(200)', target: 'Name',    targetType: 'VARCHAR(200)' },
    { id: 'm3', source: 'NULL', sourceType: 'DEFAULT',   target: 'CreatedAt',  targetType: 'DATETIME' },
  ]);

  const [byLogical, setByLogical] = React.useState(false);

  function autoAlign() {
    onUpdate({ ...p, mappings });
    ruleToast && ruleToast('Auto-aligned 3 mappings', 'success');
  }
  function clearAll() {
    setMappings([]); onUpdate({ ...p, mappings: [] });
  }
  function autoMapFromModel() {
    // Pull Security Master logical attributes that have a Bloomberg mapping
    const ents = window.MD_ENTITIES || [];
    const sec = ents.find(e => e.id === 'security') || ents[0];
    if (!sec) { ruleToast && ruleToast('No logical model available', 'info'); return; }
    const next = sec.attrs
      .filter(a => a.maps && a.maps.bbg)
      .map(a => ({
        id: 'lm-' + a.id,
        source: a.maps.bbg.column,
        sourceType: a.maps.bbg.transform ? `ƒ ${a.maps.bbg.transform.replace(/^.*→\s*/, '')}` : 'direct',
        target: a.name,                       // logical attribute name
        targetType: a.type,
        logical: true,
        physTarget: a.target,
      }));
    setMappings(next);
    onUpdate({ ...p, mappings: next, byLogical: true });
    ruleToast && ruleToast(`Mapped ${next.length} columns from the Security Master logical model`, 'success');
  }

  return (
    <div style={{ padding: '14px 24px 28px' }}>
      <div className="assist-banner">
        <IcLayers size={16} />
        <span>
          <strong>Map by logical attribute.</strong> Pull targets from the Security Master logical model instead of
          hand-typing physical columns — mappings and transforms come pre-resolved from Metadata Studio.
        </span>
        <span className="ab-toggle hstack" style={{ gap: 8 }}>
          <button className="btn" disabled={locked} onClick={autoMapFromModel}
                  style={{ background: '#6d28d9', borderColor: '#6d28d9', color: '#fff' }}>
            <IcSparkle size={13} /> Auto-map from model
          </button>
          <label className="toggle">
            <input type="checkbox" checked={byLogical} disabled={locked}
                   onChange={e => setByLogical(e.target.checked)} />
            <span className="track" />
          </label>
        </span>
      </div>
    <div style={{ display: 'grid',
                  gridTemplateColumns: '260px 1fr', gap: 16, minHeight: 340 }}>
      <div style={{ borderRight: '1px solid var(--line)', paddingRight: 12 }}>
        <div className="h3" style={{ marginBottom: 6 }}>
          Available Source Columns <IcInfo size={12} style={{ color: 'var(--ink-4)', verticalAlign: 'middle' }} />
        </div>
        <div className="tree">
          {FM_TREE.map(grp => (
            <div key={grp.id}>
              <div className={`tree-node ${selected === grp.id ? 'selected' : ''}`}
                   onClick={() => setOpen({ ...open, [grp.id]: !open[grp.id] })}>
                <span className="tn-toggle">{open[grp.id] ? '▾' : '▸'}</span>
                <span className={grp.cls}>{grp.label}</span>
              </div>
              {open[grp.id] && (
                <div className="tree-children">
                  {grp.children.map(c => (
                    <div key={c.id}
                         className={`tree-node ${selected === c.id ? 'selected' : ''}`}
                         onClick={() => setSelected(c.id)}>
                      <span className="tn-toggle">·</span>
                      <span>{c.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="hstack" style={{ marginBottom: 10, gap: 6 }}>
          <span className="h3" style={{ margin: 0 }}>Assigned Column Mapping</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn" disabled={locked} onClick={autoAlign}>
            <IcRealign size={14} /> Auto Align
          </button>
          <button className="btn" disabled={locked} onClick={clearAll}>
            <IcReset size={14} /> Clear Mappings
          </button>
          <label className="checkbox" style={{ fontSize: 12 }}>
            <input type="checkbox" disabled={locked} defaultChecked />
            <span className="box"><IcCheck size={12} /></span>
            Auto Resize To Fit Contents
          </label>
        </div>
        <div className="dtable">
          <div className="dtable-head" style={{ gridTemplateColumns: '1fr 140px 1fr 140px 40px' }}>
            <span>Source</span><span>Field Type</span><span>Target</span><span>Field Type</span><span />
          </div>
          {mappings.length === 0 && (
            <div className="dtable-empty">
              No mappings yet. Click <strong>Auto Align</strong> or drag a column from the tree.
            </div>
          )}
          {mappings.map(m => (
            <div key={m.id} className="dtable-row"
                 style={{ gridTemplateColumns: '1fr 140px 1fr 140px 40px', cursor: 'default' }}>
              <span style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12.5 }}>{m.source}</span>
              <span style={{ color: m.sourceType?.startsWith('ƒ') ? 'var(--magenta)' : 'var(--ink-3)' }}>{m.sourceType}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontFamily: m.logical ? 'inherit' : 'Menlo, Consolas, monospace',
                               fontSize: 12.5, fontWeight: m.logical ? 600 : 400,
                               display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {m.logical && <IcLayers size={12} style={{ color: '#6d28d9' }} />}
                  {m.target}
                </span>
                {m.logical && m.physTarget && (
                  <span style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'Menlo, Consolas, monospace' }}>
                    → {m.physTarget.split('.').slice(-1)[0]}
                  </span>
                )}
              </span>
              <span style={{ color: 'var(--ink-3)' }}>{m.targetType}</span>
              <button className="icon-btn" disabled={locked}
                      onClick={() => setMappings(mappings.filter(x => x.id !== m.id))}>
                <IcTrash size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}

// ------------------------------------------------------------
// Source SQL panel (live XML) — editable, round-trips
// ------------------------------------------------------------
function SourceSqlPanel({ step, locked }) {
  const p = step.props || {};
  const [sql, setSql] = React.useState(p.sql || '');
  React.useEffect(() => { setSql(p.sql || ''); }, [step]);
  function change(v) { setSql(v); if (p._setSql) p._setSql(v); }
  return (
    <div style={{ padding: '14px 24px 28px' }}>
      <div className="tabs"><button className="tab active">Source SQL</button></div>
      <textarea className="code-editor" disabled={locked} value={sql} spellCheck={false}
                style={{ minHeight: 240 }} onChange={e => change(e.target.value)} />
      <div className="field-help" style={{ marginTop: 8 }}>
        Editable — changes round-trip to the exported XML.
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Plug-In panel (live XML)
// ------------------------------------------------------------
function PluginPanel({ step }) {
  const p = step.props || {};
  return (
    <div style={{ padding: '14px 24px 28px' }}>
      <div className="prop-grid" style={{ marginBottom: 12 }}>
        <div className="prop-grid-row"><div className="pg-k">Assembly</div><div className="pg-v readonly">{p.assembly || '—'}</div></div>
        <div className="prop-grid-row"><div className="pg-k">Type name</div><div className="pg-v readonly">{p.typeName || '—'}</div></div>
      </div>
      {p.params && p.params.length > 0 && (
        <>
          <div className="kv-sec-label">Input parameter mappings ({p.params.length})</div>
          <div className="kv-table">
            <div className="kv-head" style={{ gridTemplateColumns: '1fr 1.4fr' }}><span>Parameter</span><span>Value</span></div>
            {p.params.map((pp, i) => (
              <div key={i} className="kv-row" style={{ gridTemplateColumns: '1fr 1.4fr' }} title={pp.tag}>
                <span style={{ fontWeight: 500 }}>{pp.name}</span>
                <span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }}>{pp.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Panel registry — picks the right panel for a step type
// ------------------------------------------------------------
function StepPanel({ step, locked, onUpdate }) {
  const m = {
    'Source File':           SourceFilePanel,
    'Source SQL':            SourceSqlPanel,
    'Plug-In':               PluginPanel,
    'Source Attributes':     SourceAttributesPanel,
    'Change Tolerance':      ChangeTolerancePanel,
    'Variables':             VariablesPanel,
    'Source Deduplication':  SourceDedupPanel,
    'Target Connection':     TargetConnectionPanel,
    'Target Table':          TargetTablePanel,
    'Update Control':        UpdateControlPanel,
    'Field Mapping':         FieldMappingPanel,
  };
  const C = m[step.type] || GenericStepPanel;
  return <C step={step} locked={locked} onUpdate={onUpdate} />;
}

window.StepPanel = StepPanel;
window.GenericStepPanel = GenericStepPanel;
window.SourceSqlPanel = SourceSqlPanel;
window.PluginPanel = PluginPanel;
