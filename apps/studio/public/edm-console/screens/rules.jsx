// ============================================================
// Rules — Rule Builder, 4-step wizard with CRUD
// Steps: Properties → Parameters → Rules → Preview Results
// ============================================================

const INITIAL_RULES_LIBRARY = [
  { id: 'r-any-price',  name: 'Any Price Bulk Load Exception Raise', resultType: 'single', dataType: 'INT' },
  { id: 'r-any-record', name: 'Any Record to Proceed?',              resultType: 'single', dataType: 'BIT' },
  { id: 'r-batch',      name: 'Batch Page Check',                    resultType: 'single', dataType: 'BIT' },
  { id: 'r-cusip',      name: 'Calculate Cusip Check Digit',         resultType: 'single', dataType: 'INT' },
  { id: 'r-ilevel-id',  name: 'Calculate iLevel Dataitem ID for Value', resultType: 'single', dataType: 'INT' },
  { id: 'r-ilevel-per', name: 'Calculate iLevel Periodic Value for GP Field', resultType: 'single', dataType: 'DECIMAL' },
  { id: 'r-calc-v1',    name: 'Calculate Value + 1',                 resultType: 'single', dataType: 'INT' },
  { id: 'r-cast-date',  name: 'Cast As Date',                        resultType: 'table',  dataType: 'DATE',
    description: '',
    notes: 'The Rule Builder returns a list of values. When used by the Decode functionality in the Data Generator/Data Manager, the Source SQL statement should either return a single column if the store value is to be the same as the display value, or two columns in order to use a different store/display value. In the latter case, the first column will be used as the store value and the second column as the display value.',
    defaultVal: "'01/01/1900'",
    parameters: [
      { id: 'p1', name: 'DateTime',   type: 'DATETIME',  basic: true,  length: null, precision: 0, scale: 0 },
      { id: 'p2', name: 'Parameter2', type: 'VARCHAR',   basic: false, length: 20,   precision: 0, scale: 0 },
    ],
    mode: 'OR',
    functionRules: [
      { id: 'fr1', description: 'Cast As Date', detail: 'CAST({INPUT}.[DateTime] AS DATE)',
        enabled: true,
        ifMode: 'sql', ifCode: '',
        thenMode: 'sql', thenCode: 'CAST({INPUT}.[DateTime] AS DATE)' },
    ],
  },
  { id: 'r-audit-tab', name: 'Chart Audit By Tables', resultType: 'table', dataType: 'VARCHAR' },
  { id: 'r-audit-act', name: 'Chart Audit User Action', resultType: 'table', dataType: 'VARCHAR' },
  { id: 'r-audit-sum', name: 'Chart Audit User Summary', resultType: 'table', dataType: 'VARCHAR' },
  { id: 'r-audit-inf', name: 'Chart Audit Users Information', resultType: 'table', dataType: 'VARCHAR' },
  { id: 'r-avg-exc-p', name: 'Chart Average Exceptions Age Records Party', resultType: 'table', dataType: 'INT' },
  { id: 'r-avg-exc',   name: 'Chart Average Exceptions Age Records', resultType: 'table', dataType: 'INT' },
  { id: 'r-dash-mp',   name: 'Chart Dashboard Master Party by Party Type', resultType: 'table', dataType: 'INT' },
  { id: 'r-exc-mgmt',  name: 'Chart Exception Management Summary', resultType: 'table', dataType: 'INT' },
  { id: 'r-exc-ent',   name: 'Chart Exception Open by Entity', resultType: 'table', dataType: 'INT' },
  { id: 'r-exc-pri',   name: 'Chart Exception Open by Priority and Channel', resultType: 'table', dataType: 'INT' },
  { id: 'r-exc-pri2',  name: 'Chart Exception Open by Priority', resultType: 'table', dataType: 'INT' },
  { id: 'r-exc-team',  name: 'Chart Exception Open by Team', resultType: 'table', dataType: 'INT' },
  { id: 'r-exc-asset', name: 'Chart Exceptions by Asset Type', resultType: 'table', dataType: 'INT' },
  { id: 'r-exc-pst',   name: 'Chart Exceptions by Party SubType', resultType: 'table', dataType: 'INT' },
  { id: 'r-gear-avs',  name: 'Chart Gearbox Entity Available Source', resultType: 'table', dataType: 'VARCHAR' },
  { id: 'r-gear-hqm',  name: 'Chart Gearbox Entity High Quality Match', resultType: 'table', dataType: 'INT' },
];

// Add default empty fields to all rules
function fillRule(r) {
  return {
    description: '',
    notes: '',
    defaultVal: '',
    parameters: [],
    mode: 'AND',
    functionRules: [],
    ...r,
  };
}

const DATA_TYPES = ['VARCHAR', 'NVARCHAR', 'CHAR', 'INT', 'BIGINT', 'SMALLINT',
                    'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'BIT',
                    'DATE', 'DATETIME', 'DATETIME2', 'TIME', 'TIMESTAMP'];

const STEPS = [
  { id: 'props',  label: 'Properties',      icon: 'IcSliders' },
  { id: 'params', label: 'Parameters',      icon: 'IcVariables' },
  { id: 'rules',  label: 'Rules',           icon: 'IcRules' },
  { id: 'preview',label: 'Preview Results', icon: 'IcPlay' },
];

// ------------------------------------------------------------
// Toast host (global)
// ------------------------------------------------------------
let _toastSetter = null;
function toast(msg, kind = 'info') {
  if (_toastSetter) _toastSetter(t => [...t, { id: Date.now() + Math.random(), msg, kind }]);
}
function ToastHost() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => { _toastSetter = setItems; return () => { _toastSetter = null; }; }, []);
  React.useEffect(() => {
    if (!items.length) return;
    const last = items[items.length - 1];
    const t = setTimeout(() => setItems(arr => arr.filter(x => x.id !== last.id)), 2400);
    return () => clearTimeout(t);
  }, [items]);
  return (
    <div className="toast-host">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'success' && <IcCheck size={16} />}
          {t.kind === 'error' && <IcWarn size={16} />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// Confirm modal
// ------------------------------------------------------------
function ConfirmModal({ title, message, confirmLabel, confirmKind = 'primary', onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head"><h3>{title}</h3></div>
        <div className="modal-body" style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5 }}>
          {message}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className={`btn ${confirmKind === 'danger' ? '' : 'primary'}`}
                  onClick={onConfirm}
                  style={confirmKind === 'danger' ? { background: '#dc2626', borderColor: '#dc2626', color: '#fff' } : {}}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// New / Rename rule modal
// ------------------------------------------------------------
function RuleNameModal({ title, defaultName = '', defaultDesc = '', onSave, onCancel }) {
  const [name, setName] = React.useState(defaultName);
  const [desc, setDesc] = React.useState(defaultDesc);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head"><h3>{title}</h3></div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">Rule name</label>
            <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)}
                   placeholder="e.g. Validate ISIN check digit" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Description <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>(optional)</span></label>
            <textarea className="textarea" value={desc} onChange={e => setDesc(e.target.value)}
                      placeholder="What this rule does and when it should fire"
                      style={{ minHeight: 80 }} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()}
                  onClick={() => onSave({ name: name.trim(), description: desc.trim() })}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Parameter dialog
// ------------------------------------------------------------
function ParameterModal({ initial, onSave, onCancel }) {
  const [name, setName] = React.useState(initial?.name || '');
  const [advanced, setAdvanced] = React.useState(initial ? !initial.basic : false);
  const [type, setType] = React.useState(initial?.type?.replace(/\(.*\)/, '') || 'VARCHAR');
  const [length, setLength] = React.useState(initial?.length ?? 20);
  const [precision, setPrecision] = React.useState(initial?.precision ?? 0);
  const [scale, setScale] = React.useState(initial?.scale ?? 0);

  const hasLength = ['VARCHAR', 'NVARCHAR', 'CHAR'].includes(type);
  const hasPrecScale = ['DECIMAL', 'NUMERIC'].includes(type);

  function save() {
    const formatted = hasLength ? `${type}(${length})`
                    : hasPrecScale ? `${type}(${precision},${scale})`
                    : type;
    onSave({
      ...(initial || {}),
      id: initial?.id || ('p-' + Date.now()),
      name: name.trim(),
      type: formatted,
      basic: !advanced,
      length: hasLength ? length : null,
      precision: hasPrecScale ? precision : 0,
      scale: hasPrecScale ? scale : 0,
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head"><h3>Function Parameter</h3></div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">Name</label>
            <input className="input" autoFocus value={name}
                   onChange={e => setName(e.target.value)} placeholder="Parameter name" />
          </div>
          <div className="field">
            <label className="field-label">Data</label>
            <div className="hstack" style={{ gap: 16, marginBottom: 10 }}>
              <label className="radio">
                <input type="radio" checked={!advanced} onChange={() => setAdvanced(false)} />
                <span className="rdot" /> Basic
              </label>
              <label className="radio">
                <input type="radio" checked={advanced} onChange={() => setAdvanced(true)} />
                <span className="rdot" /> Advanced
              </label>
            </div>
            <div className="select-wrap">
              <select className="select" value={type} onChange={e => setType(e.target.value)}>
                {DATA_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {advanced && (
            <div className="props-grid">
              {hasLength && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Length</label>
                  <input className="input" type="number" min={1} value={length}
                         onChange={e => setLength(+e.target.value)} />
                </div>
              )}
              {hasPrecScale && (
                <>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Precision</label>
                    <input className="input" type="number" min={0} value={precision}
                           onChange={e => setPrecision(+e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Scale</label>
                    <input className="input" type="number" min={0} value={scale}
                           onChange={e => setScale(+e.target.value)} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()} onClick={save}>OK</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Step: Properties
// ------------------------------------------------------------
function StepProperties({ rule, locked, onUpdate }) {
  return (
    <div style={{ padding: '20px 24px 32px', maxWidth: 920 }}>
      <div className="field">
        <label className="field-label">Name</label>
        <input className="input" value={rule.name} disabled={locked}
               onChange={e => onUpdate({ name: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label">Description</label>
        <textarea className="textarea" value={rule.description || ''} disabled={locked}
                  onChange={e => onUpdate({ description: e.target.value })}
                  placeholder="Describe what this rule does, when it should fire, and any caveats."
                  style={{ minHeight: 140 }} />
      </div>
      <div className="props-grid">
        <div className="field">
          <label className="field-label">Result</label>
          <div className="hstack" style={{ gap: 18, marginTop: 4 }}>
            <label className="radio">
              <input type="radio" checked={rule.resultType === 'single'} disabled={locked}
                     onChange={() => onUpdate({ resultType: 'single' })} />
              <span className="rdot" /> Single value
            </label>
            <label className="radio">
              <input type="radio" checked={rule.resultType === 'table'} disabled={locked}
                     onChange={() => onUpdate({ resultType: 'table' })} />
              <span className="rdot" /> Table (list of values)
            </label>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Default value</label>
          <input className="input" value={`${rule.dataType || 'VARCHAR'}, Default = ${rule.defaultVal || "''"}`}
                 disabled />
        </div>
      </div>
      <div className="field">
        <label className="field-label">Notes</label>
        <textarea className="textarea" value={rule.notes || ''} disabled={locked}
                  onChange={e => onUpdate({ notes: e.target.value })}
                  placeholder="Add usage notes for other developers."
                  style={{ minHeight: 120, background: '#fffbe8' }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Step: Parameters
// ------------------------------------------------------------
function StepParameters({ rule, locked, onUpdate }) {
  const [editing, setEditing] = React.useState(null); // null | 'new' | param obj
  const [confirmDel, setConfirmDel] = React.useState(null);

  function saveParam(p) {
    const exists = rule.parameters.find(x => x.id === p.id);
    const next = exists
      ? rule.parameters.map(x => x.id === p.id ? p : x)
      : [...rule.parameters, p];
    onUpdate({ parameters: next });
    setEditing(null);
    toast(exists ? `Parameter "${p.name}" updated` : `Parameter "${p.name}" added`, 'success');
  }
  function deleteParam(p) {
    onUpdate({ parameters: rule.parameters.filter(x => x.id !== p.id) });
    setConfirmDel(null);
    toast(`Parameter "${p.name}" removed`, 'info');
  }
  function move(idx, dir) {
    const next = [...rule.parameters];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onUpdate({ parameters: next });
  }

  return (
    <div style={{ padding: '20px 24px 32px' }}>
      <div className="hstack" style={{ marginBottom: 14, gap: 6 }}>
        <button className="btn primary" disabled={locked}
                onClick={() => setEditing('new')}>
          <IcPlus size={14} /> Add parameter
        </button>
        <span className="muted" style={{ marginLeft: 10 }}>
          {rule.parameters.length} parameter{rule.parameters.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="dtable">
        <div className="dtable-head" style={{ gridTemplateColumns: '40px 1fr 200px 120px' }}>
          <span>#</span><span>Name</span><span>Type</span><span style={{ textAlign: 'right' }}>Actions</span>
        </div>
        {rule.parameters.length === 0 && (
          <div className="dtable-empty">
            No parameters defined yet. Add one to make the rule accept inputs.
          </div>
        )}
        {rule.parameters.map((p, i) => (
          <div key={p.id} className="dtable-row"
               style={{ gridTemplateColumns: '40px 1fr 200px 120px' }}
               onClick={() => !locked && setEditing(p)}>
            <span style={{ color: 'var(--ink-4)' }}>{i + 1}</span>
            <span style={{ fontWeight: 500 }}>{p.name}</span>
            <span style={{ color: 'var(--ink-3)' }}>{p.type}</span>
            <span style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
              <button className="icon-btn" title="Move up"
                      disabled={locked || i === 0}
                      onClick={() => move(i, -1)}>↑</button>
              <button className="icon-btn" title="Move down"
                      disabled={locked || i === rule.parameters.length - 1}
                      onClick={() => move(i, 1)}>↓</button>
              <button className="icon-btn" title="Edit"
                      disabled={locked} onClick={() => setEditing(p)}>
                <IcEdit size={14} />
              </button>
              <button className="icon-btn" title="Delete"
                      disabled={locked} onClick={() => setConfirmDel(p)}>
                <IcTrash size={14} />
              </button>
            </span>
          </div>
        ))}
      </div>

      {editing && (
        <ParameterModal
          initial={editing === 'new' ? null : editing}
          onSave={saveParam}
          onCancel={() => setEditing(null)} />
      )}

      {confirmDel && (
        <ConfirmModal
          title="Delete parameter?"
          message={<>Remove parameter <strong>{confirmDel.name}</strong>? Function rules that reference it may stop working.</>}
          confirmLabel="Delete"
          confirmKind="danger"
          onConfirm={() => deleteParam(confirmDel)}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Step: Rules (IF / THEN editor)
// ------------------------------------------------------------
function StepRules({ rule, locked, onUpdate }) {
  const [selectedId, setSelectedId] = React.useState(rule.functionRules[0]?.id || null);
  const [confirmDel, setConfirmDel] = React.useState(null);

  // when the rule changes externally, ensure selection stays valid
  React.useEffect(() => {
    if (!rule.functionRules.find(r => r.id === selectedId)) {
      setSelectedId(rule.functionRules[0]?.id || null);
    }
  }, [rule.id]);

  const selected = rule.functionRules.find(r => r.id === selectedId);

  function updateFR(id, patch) {
    onUpdate({
      functionRules: rule.functionRules.map(r => r.id === id ? { ...r, ...patch } : r)
    });
  }
  function addRule() {
    const fr = {
      id: 'fr-' + Date.now(),
      description: 'New rule',
      detail: '',
      enabled: true,
      ifMode: 'sql', ifCode: '',
      thenMode: 'sql', thenCode: '',
    };
    onUpdate({ functionRules: [...rule.functionRules, fr] });
    setSelectedId(fr.id);
    toast('Function rule added', 'success');
  }
  function deleteRule(fr) {
    onUpdate({ functionRules: rule.functionRules.filter(r => r.id !== fr.id) });
    setConfirmDel(null);
    toast('Function rule removed', 'info');
  }
  function move(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= rule.functionRules.length) return;
    const next = [...rule.functionRules];
    [next[idx], next[j]] = [next[j], next[idx]];
    onUpdate({ functionRules: next });
  }

  return (
    <div style={{ padding: '18px 24px 32px' }}>
      {/* Mode selector */}
      <div className="hstack" style={{ marginBottom: 14, fontSize: 13, color: 'var(--ink-2)', gap: 14 }}>
        <span>Combine all function rules using</span>
        <label className="radio" style={{ fontSize: 13 }}>
          <input type="radio" checked={rule.mode === 'AND'} disabled={locked}
                 onChange={() => onUpdate({ mode: 'AND' })} />
          <span className="rdot" /> AND mode
        </label>
        <label className="radio" style={{ fontSize: 13 }}>
          <input type="radio" checked={rule.mode === 'OR'} disabled={locked}
                 onChange={() => onUpdate({ mode: 'OR' })} />
          <span className="rdot" /> OR mode
        </label>
      </div>

      {/* Function Rules table */}
      <div className="hstack" style={{ marginBottom: 10, gap: 6 }}>
        <button className="btn primary" disabled={locked} onClick={addRule}>
          <IcPlus size={14} /> Add rule
        </button>
        <button className="btn" disabled={locked || !selected} onClick={() => setConfirmDel(selected)}>
          <IcTrash size={14} /> Delete selected
        </button>
        <div style={{ flex: 1 }} />
        <button className="icon-btn" title="Move up" disabled={locked || !selected}
                onClick={() => {
                  const i = rule.functionRules.findIndex(r => r.id === selectedId);
                  move(i, -1);
                }}>↑</button>
        <button className="icon-btn" title="Move down" disabled={locked || !selected}
                onClick={() => {
                  const i = rule.functionRules.findIndex(r => r.id === selectedId);
                  move(i, 1);
                }}>↓</button>
      </div>

      <div className="dtable" style={{ marginBottom: 18 }}>
        <div className="dtable-head" style={{ gridTemplateColumns: '1fr 2fr 80px 60px' }}>
          <span>Description</span><span>Detail</span><span>Enabled</span><span style={{ textAlign: 'right' }}>Actions</span>
        </div>
        {rule.functionRules.length === 0 && (
          <div className="dtable-empty">
            No function rules yet. Add one to define the IF / THEN logic.
          </div>
        )}
        {rule.functionRules.map(fr => (
          <div key={fr.id}
               className={`dtable-row ${fr.id === selectedId ? 'selected' : ''}`}
               style={{ gridTemplateColumns: '1fr 2fr 80px 60px' }}
               onClick={() => setSelectedId(fr.id)}>
            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fr.description}
            </span>
            <span style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12,
                           color: 'var(--ink-3)', overflow: 'hidden',
                           textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fr.detail || fr.thenCode || '—'}
            </span>
            <span onClick={e => e.stopPropagation()}>
              <label className="toggle">
                <input type="checkbox" checked={fr.enabled} disabled={locked}
                       onChange={e => updateFR(fr.id, { enabled: e.target.checked })} />
                <span className="track" />
              </label>
            </span>
            <span style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
              <button className="icon-btn" title="Delete"
                      disabled={locked} onClick={() => setConfirmDel(fr)}>
                <IcTrash size={14} />
              </button>
            </span>
          </div>
        ))}
      </div>

      {/* IF / THEN editor */}
      {selected && (
        <div className="if-then">
          <IfThenPane
            label="— IF —"
            mode={selected.ifMode}
            code={selected.ifCode}
            locked={locked}
            onModeChange={m => updateFR(selected.id, { ifMode: m })}
            onCodeChange={c => updateFR(selected.id, { ifCode: c })}
            placeholder="Leave blank to always fire (with current mode)" />
          <IfThenPane
            label="— THEN —"
            mode={selected.thenMode}
            code={selected.thenCode}
            locked={locked}
            isThen
            onModeChange={m => updateFR(selected.id, { thenMode: m })}
            onCodeChange={c => updateFR(selected.id, { thenCode: c, detail: c })}
            onBuild={() => toast('Build successful — query plan verified', 'success')}
            placeholder="The value to return when IF matches" />
        </div>
      )}

      {confirmDel && (
        <ConfirmModal
          title="Delete function rule?"
          message={<>Remove <strong>{confirmDel.description}</strong>? This can't be undone.</>}
          confirmLabel="Delete" confirmKind="danger"
          onConfirm={() => deleteRule(confirmDel)}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

function IfThenPane({ label, mode, code, locked, isThen, onModeChange, onCodeChange, onBuild, placeholder }) {
  return (
    <div className="if-then-pane">
      <div className="if-then-head">
        <span className="if-then-head-left">
          <input type="checkbox" disabled={locked} defaultChecked={isThen} />
          <span>{label}</span>
        </span>
        <div className="modes">
          <label className="radio">
            <input type="radio" checked={mode === 'sql'} disabled={locked}
                   onChange={() => onModeChange('sql')} />
            <span className="rdot" /> SQL Expression
          </label>
          <label className="radio">
            <input type="radio" checked={mode === 'rb'} disabled={locked}
                   onChange={() => onModeChange('rb')} />
            <span className="rdot" /> RuleBuilder Function
          </label>
        </div>
      </div>
      <div className="if-then-toolbar">
        <div className="select-wrap" style={{ width: 140 }}>
          <select className="select" disabled={locked} defaultValue="Code">
            <option>Code</option>
            <option>Snippet</option>
            <option>Template</option>
          </select>
        </div>
        {isThen && (
          <button className="btn" disabled={locked} onClick={onBuild}>
            <IcCheck size={14} /> Build
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className="icon-btn" title="Insert function" disabled={locked}>
          <IcSparkle size={14} />
        </button>
        <button className="icon-btn" title="Clear" disabled={locked} onClick={() => onCodeChange('')}>
          <IcTrash size={14} />
        </button>
      </div>
      <div className="if-then-body">
        <textarea className="code-editor" disabled={locked}
                  value={code} onChange={e => onCodeChange(e.target.value)}
                  placeholder={placeholder} spellCheck={false} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Step: Preview Results
// ------------------------------------------------------------
function StepPreview({ rule }) {
  const [values, setValues] = React.useState(() =>
    Object.fromEntries(rule.parameters.map(p => [p.id, ''])));
  const [result, setResult] = React.useState('<NULL>');
  const [running, setRunning] = React.useState(false);

  // reset values when the rule itself changes
  React.useEffect(() => {
    setValues(Object.fromEntries(rule.parameters.map(p => [p.id, ''])));
    setResult('<NULL>');
  }, [rule.id]);

  function runTest() {
    setRunning(true);
    setTimeout(() => {
      setRunning(false);
      // Simple simulator: if "Cast As Date" + datetime input, show DATE
      if (rule.name === 'Cast As Date' && values[rule.parameters[0]?.id]) {
        try {
          const d = new Date(values[rule.parameters[0].id]);
          setResult(isNaN(d) ? '<NULL>' : d.toISOString().slice(0, 10));
        } catch { setResult('<NULL>'); }
      } else if (rule.functionRules.some(fr => fr.enabled && fr.thenCode)) {
        const fr = rule.functionRules.find(fr => fr.enabled && fr.thenCode);
        // crude template substitution
        let r = fr.thenCode;
        rule.parameters.forEach(p => {
          const v = values[p.id];
          r = r.replace(new RegExp(`\\{INPUT\\}\\.\\[${p.name}\\]`, 'g'), v || '<NULL>');
        });
        setResult(r.length > 80 ? r.slice(0, 80) + '…' : r);
      } else {
        setResult('<NULL>');
      }
      toast('Test executed successfully', 'success');
    }, 600);
  }

  function generateArgs() {
    const next = { ...values };
    rule.parameters.forEach(p => {
      next[p.id] = p.type.startsWith('DATETIME') ? '2026-05-27T13:31:17'
                 : p.type.startsWith('DATE')     ? '2026-05-27'
                 : p.type.startsWith('VARCHAR')  ? 'Sample text'
                 : p.type.startsWith('INT') || p.type.startsWith('BIGINT') ? '42'
                 : p.type.startsWith('DECIMAL') || p.type.startsWith('FLOAT') ? '3.14'
                 : p.type.startsWith('BIT')      ? '1'
                 : '';
    });
    setValues(next);
    toast('Generated default test arguments', 'info');
  }

  return (
    <div style={{ padding: '20px 24px 32px' }}>
      <div style={{ marginBottom: 12, color: 'var(--ink-3)', fontSize: 13 }}>
        Please enter the values for the parameters: <span style={{ color: 'var(--ink-4)' }}>(leave blank for NULL)</span>
      </div>

      <div className="dtable" style={{ marginBottom: 18 }}>
        <div className="dtable-head" style={{ gridTemplateColumns: '1fr 1fr 2fr' }}>
          <span>Parameter</span><span>Type</span><span>Value</span>
        </div>
        {rule.parameters.length === 0 && (
          <div className="dtable-empty">
            This rule has no parameters. Click <strong>Test Rule</strong> to evaluate it directly.
          </div>
        )}
        {rule.parameters.map(p => (
          <div key={p.id} className="dtable-row"
               style={{ gridTemplateColumns: '1fr 1fr 2fr', cursor: 'default' }}>
            <span style={{ fontWeight: 500 }}>{p.name}</span>
            <span style={{ color: 'var(--ink-3)' }}>{p.type}</span>
            <input className="input" value={values[p.id] ?? ''} placeholder="<NULL>"
                   onChange={e => setValues({ ...values, [p.id]: e.target.value })} />
          </div>
        ))}
      </div>

      <div className="hstack" style={{ gap: 8, marginBottom: 18 }}>
        <button className="btn primary" onClick={runTest} disabled={running}>
          {running ? (
            <>
              <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.35)" strokeWidth="2.5" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
              </svg> Running…
            </>
          ) : (
            <><IcPlay size={12} /> Test Rule</>
          )}
        </button>
        <button className="btn" onClick={generateArgs}>
          <IcSparkle size={14} /> Generate Unit Test Arguments
        </button>
      </div>

      <div className="card" style={{ background: 'var(--bg-1)', padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
                      textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 6 }}>
          Returned Result
        </div>
        <div style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 13,
                      color: result === '<NULL>' ? 'var(--ink-4)' : 'var(--ink)',
                      fontStyle: result === '<NULL>' ? 'italic' : 'normal' }}>
          {result}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Main Rules screen
// ------------------------------------------------------------
function Rules() {
  const [library, setLibrary] = React.useState(
    INITIAL_RULES_LIBRARY.map(fillRule));
  const [selectedId, setSelectedId] = React.useState('r-cast-date');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [step, setStep] = React.useState('props');
  const [dirty, setDirty] = React.useState(false);
  const [showNewModal, setShowNewModal] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const collab = useCollab();

  const filtered = library.filter(r =>
    r.name.toLowerCase().includes(filter.toLowerCase()));
  const rule = library.find(r => r.id === selectedId);
  const compKey = rule ? 'rules:' + rule.name : null;
  const compState = compKey ? collab.components[compKey] : null;
  const locked = !compState || compState.status !== 'me';

  function updateRule(patch) {
    setLibrary(lib => lib.map(r => r.id === selectedId ? { ...r, ...patch } : r));
    setDirty(true);
  }

  function selectRule(id) {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setSelectedId(id);
    setDirty(false);
    setStep('props');
  }

  function createRule({ name, description }) {
    const id = 'r-' + Date.now();
    const fr = fillRule({ id, name, description, resultType: 'single', dataType: 'VARCHAR' });
    setLibrary([fr, ...library]);
    setSelectedId(id);
    setShowNewModal(false);
    setStep('props');
    // auto check-out the brand-new rule so the creator can edit immediately
    setTimeout(() => { ensureComponent('rules:' + name, name, 'Rule'); collabCheckout('rules:' + name); }, 0);
    toast(`Created "${name}"`, 'success');
  }

  function duplicateRule() {
    if (!rule) return;
    const id = 'r-' + Date.now();
    const copy = { ...rule, id, name: rule.name + ' (copy)' };
    const idx = library.findIndex(r => r.id === selectedId);
    const next = [...library];
    next.splice(idx + 1, 0, copy);
    setLibrary(next);
    setSelectedId(id);
    toast(`Duplicated "${rule.name}"`, 'success');
  }

  function deleteRule() {
    if (!rule) return;
    const idx = library.findIndex(r => r.id === selectedId);
    const next = library.filter(r => r.id !== selectedId);
    setLibrary(next);
    setSelectedId(next[Math.max(0, idx - 1)]?.id || null);
    setConfirmDel(null);
    toast(`Deleted "${rule.name}"`, 'info');
  }

  function save() {
    setDirty(false);
    toast(`Saved "${rule.name}"`, 'success');
  }

  // step navigation
  const stepIdx = STEPS.findIndex(s => s.id === step);
  function nextStep() { if (stepIdx < STEPS.length - 1) setStep(STEPS[stepIdx + 1].id); }
  function prevStep() { if (stepIdx > 0) setStep(STEPS[stepIdx - 1].id); }

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">
              Rule Builder
              <button className="icon-btn" title="New rule"
                      onClick={() => setShowNewModal(true)}>
                <IcPlus size={16} />
              </button>
            </span>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}>
              <IcChevDoubleLeft size={16} />
            </button>
          </div>
          <div className="wb-list-search">
            <div className="wb-list-search-wrap">
              <IcSearch size={14} />
              <input className="input" placeholder="Filter components…"
                     value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
          </div>
          <div className="wb-list-items">
            {filtered.map(r => (
              <div key={r.id}
                   className={`wb-list-item ${r.id === selectedId ? 'active' : ''}`}
                   title={r.name}
                   onClick={() => selectRule(r.id)}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                <span className="list-actions">
                  <button className="icon-btn" title="Duplicate"
                          onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); setTimeout(duplicateRule, 0); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="8" y="8" width="13" height="13" rx="2" />
                      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                    </svg>
                  </button>
                  <button className="icon-btn" title="Delete"
                          onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); setConfirmDel(r); }}>
                    <IcTrash size={13} />
                  </button>
                </span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '20px 16px', color: 'var(--ink-4)', fontSize: 12 }}>
                No rules match "{filter}"
              </div>
            )}
          </div>
        </div>
      )}

      <div className="wb-body">
        {!rule ? (
          <div className="coming-soon">
            <span className="cs-icon"><IcRules size={28} /></span>
            <h2>No rule selected</h2>
            <p>Pick a rule from the list, or create a new one to get started.</p>
            <button className="btn primary" onClick={() => setShowNewModal(true)}>
              <IcPlus size={14} /> New rule
            </button>
          </div>
        ) : (
          <>
            <div className="wb-body-head">
              {!sidebarOpen && (
                <button className="icon-btn" style={{ float: 'left', marginRight: 12 }}
                        onClick={() => setSidebarOpen(true)}>
                  <IcChevDoubleRight size={16} />
                </button>
              )}
              <div className="title-row">
                <span className="head-icon"><IcRules size={18} /></span>
                <h1>
                  {rule.name}
                  {dirty && <span style={{ color: 'var(--amber)', fontSize: 12, marginLeft: 8, fontWeight: 500 }}>● unsaved</span>}
                  <span className="ver-pill">v4.2.1 <IcChevDown size={10} /></span>
                </h1>
                <div className="right hstack" style={{ gap: 6 }}>
                  <button className="btn" onClick={duplicateRule} title="Duplicate">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="8" y="8" width="13" height="13" rx="2" />
                      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                    </svg>
                    Duplicate
                  </button>
                  <button className="btn" onClick={() => setConfirmDel(rule)} title="Delete">
                    <IcTrash size={14} /> Delete
                  </button>
                  <button className="btn primary" onClick={save} disabled={locked || !dirty}>
                    Save
                  </button>
                </div>
              </div>
              <div className="desc">
                {rule.description || <span style={{ fontStyle: 'italic', color: 'var(--ink-4)' }}>
                  No description provided. Add one on the Properties step.
                </span>}
              </div>
            </div>

            <CheckoutBar componentKey={compKey} label={rule.name} type="Rule"
                         onOpenHistory={() => setShowHistory(true)} />
            {showHistory && (
              <HistoryModal componentKey={compKey} label={rule.name}
                            onClose={() => setShowHistory(false)} />
            )}

            <div className="stepper">
              {STEPS.map((s, i) => {
                const Icon = window[s.icon];
                const active = step === s.id;
                const done = STEPS.findIndex(x => x.id === step) > i;
                return (
                  <React.Fragment key={s.id}>
                    <button className={`step ${active ? 'active' : ''} ${done ? 'done' : ''}`}
                            onClick={() => setStep(s.id)}>
                      <span className="step-bubble">
                        {done ? <IcCheck size={16} /> : <Icon size={16} />}
                      </span>
                      <span className="step-label">
                        <span className="step-n">STEP {i + 1}</span>
                        {s.label}
                      </span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <span className={`step-connector ${done ? 'done' : ''}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
              {step === 'props'   && <StepProperties rule={rule} locked={locked} onUpdate={updateRule} />}
              {step === 'params'  && <StepParameters rule={rule} locked={locked} onUpdate={updateRule} />}
              {step === 'rules'   && <StepRules      rule={rule} locked={locked} onUpdate={updateRule} />}
              {step === 'preview' && <StepPreview    rule={rule} />}
            </div>

            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--line)',
                          display: 'flex', justifyContent: 'space-between',
                          background: 'var(--bg-1)' }}>
              <button className="btn" onClick={prevStep} disabled={stepIdx === 0}>
                <IcChevLeft size={14} /> Back
              </button>
              <span className="muted">Step {stepIdx + 1} of {STEPS.length}</span>
              <button className="btn primary" onClick={nextStep} disabled={stepIdx === STEPS.length - 1}>
                Next <IcChevRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {showNewModal && (
        <RuleNameModal title="New rule" onSave={createRule} onCancel={() => setShowNewModal(false)} />
      )}
      {confirmDel && (
        <ConfirmModal
          title="Delete rule?"
          message={<>Delete <strong>{confirmDel.name}</strong> and all its parameters and function rules? This can't be undone.</>}
          confirmLabel="Delete rule"
          confirmKind="danger"
          onConfirm={deleteRule}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

window.Rules = Rules;
window.ToastHost = ToastHost;
window.ruleToast = toast;
