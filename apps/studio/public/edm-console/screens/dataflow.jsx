// ============================================================
// Data Flow — high-throughput, in-memory ETL.
//   Three linked component types (mode toggle):
//   • Process  — runnable: Source → Sequence → Target (+ parallelism)
//   • Sequence — reusable in-memory step pipeline (the hero)
//   • Rule     — Properties → Parameters → hierarchic rules
//   AI: suggest sequence steps/validations from source fields,
//   NL→transform rule, parallelism tuning, throughput explain.
// Seeded from real .DFP/.DFS exports (In GLEIF Party, etc.)
// ============================================================

const DF_STEP_META = {
  SourceFields: { label: 'Source Fields', cls: 'dst-source', ic: 'IcFile' },
  Validate:     { label: 'Validate',      cls: 'dst-validate', ic: 'IcCircleCheck' },
  Transform:    { label: 'Transform',     cls: 'dst-transform', ic: 'IcDiff' },
  Rule:         { label: 'Apply Rule',    cls: 'dst-rule', ic: 'IcRules' },
  Lookup:       { label: 'Reference Lookup', cls: 'dst-lookup', ic: 'IcSearch' },
  Store:        { label: 'Store',         cls: 'dst-store', ic: 'IcManager' },
  TargetFields: { label: 'Target Fields', cls: 'dst-target', ic: 'IcDataProducts' },
};

const DF_DATA = {
  'In GLEIF Party': {
    name: 'In GLEIF Party', version: '20.1.15.0',
    process: {
      sourceType: 'Single Delimited File', threads: 8, buffer: 5000, fileBuffer: 1000,
      file: 'GLEIF_{yyyyMMdd}_concat.csv', path: '\\\\EC2AMAZ\\Inbox\\GLEIF',
      sequence: 'In GLEIF Party', target: 'T_GLEIF_PTY_IN_STORE', targetType: 'Append',
    },
    sequenceName: 'In GLEIF Party',
    sourceFields: [
      { name: 'ROW_NUMBER', type: 'INT', pk: true }, { name: 'ID', type: 'VARCHAR(100)' },
      { name: 'LEI', type: 'VARCHAR(20)' }, { name: 'PUBLISH_DATE', type: 'DATETIME' },
      { name: 'ENTITY_LEGAL_NAME', type: 'VARCHAR(200)' }, { name: 'ENTITY_JURISDICTION', type: 'VARCHAR(10)' },
      { name: 'ENTITY_STATUS', type: 'VARCHAR(20)' }, { name: 'REGISTRATION_STATUS', type: 'VARCHAR(20)' },
      { name: 'IS_ULTIMATE_PARENT', type: 'BIT' }, { name: 'IS_PARENT', type: 'BIT' },
    ],
    steps: [
      { id: 's1', type: 'SourceFields', name: 'Source Fields', disabled: false },
      { id: 's2', type: 'Validate', name: 'LEI present & 20 chars', disabled: false, detail: 'LEN({DATA}.[LEI]) = 20', exc: true },
      { id: 's3', type: 'Transform', name: 'Trim legal name', disabled: false, detail: 'TRIM({DATA}.[ENTITY_LEGAL_NAME])' },
      { id: 's4', type: 'Rule', name: 'Derive entity status code', disabled: false, detail: 'Map ENTITY_STATUS → status code', rule: 'GLEIF Status Decode' },
      { id: 's5', type: 'Store', name: 'Store', disabled: false, detail: 'T_GLEIF_PTY_IN_STORE · Append' },
      { id: 's6', type: 'TargetFields', name: 'Target Fields', disabled: false },
    ],
  },
  'In Bloomberg Back Office Security Corp Pfd': {
    name: 'In Bloomberg Back Office Security Corp Pfd', version: '20.1.15.0',
    process: { sourceType: 'Single Delimited File', threads: 16, buffer: 10000, fileBuffer: 1000,
      file: 'BBG_BO_CORP_PFD_{yyyyMMdd}.csv', path: '\\\\EC2AMAZ\\Inbox\\BBG', sequence: 'In Bloomberg Back Office Security Corp Pfd', target: 'T_BBG_SEC_CORP_IN_STORE', targetType: 'Append' },
    sequenceName: 'In Bloomberg Back Office Security Corp Pfd',
    sourceFields: [
      { name: 'ROW_NUMBER', type: 'INT', pk: true }, { name: 'ID_BB_GLOBAL', type: 'VARCHAR(20)' },
      { name: 'ISIN', type: 'VARCHAR(12)' }, { name: 'CUSIP', type: 'VARCHAR(9)' },
      { name: 'MATURITY', type: 'VARCHAR(20)' }, { name: 'CPN', type: 'VARCHAR(20)' }, { name: 'CRNCY', type: 'VARCHAR(3)' },
    ],
    steps: [
      { id: 'b1', type: 'SourceFields', name: 'Source Fields', disabled: false },
      { id: 'b2', type: 'Transform', name: 'Cast Maturity to date', disabled: false, detail: 'TODATE({DATA}.[MATURITY], \'yyyyMMdd\')' },
      { id: 'b3', type: 'Transform', name: 'Cast Coupon to decimal', disabled: false, detail: 'TONUMBER({DATA}.[CPN])' },
      { id: 'b4', type: 'Validate', name: 'Currency in ISO list', disabled: false, detail: '{DATA}.[CRNCY] in REF_CURRENCY', exc: true },
      { id: 'b5', type: 'Lookup', name: 'Lookup issuer LEI', disabled: true, detail: 'REF_BBG_COMPANY → LEI' },
      { id: 'b6', type: 'Store', name: 'Store', disabled: false, detail: 'T_BBG_SEC_CORP_IN_STORE · Append' },
      { id: 'b7', type: 'TargetFields', name: 'Target Fields', disabled: false },
    ],
  },
  'In LSEG Price': {
    name: 'In LSEG Price', version: '20.1.15.0',
    process: { sourceType: 'Multiple Delimited Files', threads: 10, buffer: 5000, fileBuffer: 1000,
      file: 'LSEG_PRICE_*.csv (File Control)', path: '\\\\EC2AMAZ\\Inbox\\LSEG', sequence: 'In LSEG Price', target: 'T_LSEG_PX_IN_STORE', targetType: 'Append' },
    sequenceName: 'In LSEG Price',
    sourceFields: [
      { name: 'ROW_NUMBER', type: 'INT', pk: true }, { name: 'RIC', type: 'VARCHAR(20)' },
      { name: 'ISIN', type: 'VARCHAR(12)' }, { name: 'CLOSE_PRICE', type: 'VARCHAR(30)' }, { name: 'PRICE_DATE', type: 'VARCHAR(20)' },
    ],
    steps: [
      { id: 'l1', type: 'SourceFields', name: 'Source Fields', disabled: false },
      { id: 'l2', type: 'Transform', name: 'Cast price to decimal', disabled: false, detail: 'TONUMBER({DATA}.[CLOSE_PRICE])' },
      { id: 'l3', type: 'Validate', name: 'Price > 0', disabled: false, detail: '{DATA}.[CLOSE_PRICE] > 0', exc: true },
      { id: 'l4', type: 'Store', name: 'Store', disabled: false, detail: 'T_LSEG_PX_IN_STORE · Append' },
      { id: 'l5', type: 'TargetFields', name: 'Target Fields', disabled: false },
    ],
  },
};

const DF_RULES = {
  'GLEIF Status Decode': {
    name: 'GLEIF Status Decode', result: 'VARCHAR', version: '20.1.15.0',
    params: [{ name: 'status', type: 'VARCHAR' }],
    rules: [
      { id: 'r1', kind: 'Expression', if: "{status} = 'ACTIVE'", then: "'A'" },
      { id: 'r2', kind: 'Expression', if: "{status} = 'INACTIVE'", then: "'I'" },
      { id: 'r3', kind: 'Expression', if: '', then: "'U'", isElse: true },
    ],
  },
  'Premaster Price Source Rule ID': {
    name: 'Premaster Price Source Rule ID', result: 'INT', version: '20.1.15.0',
    params: [{ name: 'source', type: 'VARCHAR' }, { name: 'assetType', type: 'VARCHAR' }],
    rules: [
      { id: 'p1', kind: 'ReferenceLookup', if: 'lookup REF_PX_SOURCE_RULE', then: 'RULE_ID', table: 'REF_PX_SOURCE_RULE', map: 'source→SOURCE, assetType→ASSET_TYPE' },
      { id: 'p2', kind: 'Expression', if: '', then: '0', isElse: true },
    ],
  },
};

function useAiRunF() {
  const [busy, setBusy] = React.useState(false);
  const run = (fn, ms = 900) => { setBusy(true); setTimeout(() => { fn(); setBusy(false); }, ms); };
  return [busy, run];
}
function AiSpinF({ label }) {
  return <span className="ai-thinking" style={{ color: '#fff' }}>
    <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.4)" strokeWidth="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg> {label}
  </span>;
}

// ---- Process mode ----
function DfProcess({ df, onChange, onOpenSequence }) {
  const p = df.process;
  const [busy, run] = useAiRunF();
  const [ai, setAi] = React.useState(null);
  const [active, setActive] = React.useState('sequence');
  function tune() {
    run(() => setAi(`On a 16-core app server this feed is I/O-bound — ${p.threads} threads is near-optimal. Going beyond 16 wastes CPU; for the Multiple-Files pattern, switch to processes past 10 threads. Buffer ${p.buffer} is fine; lower it only if other threads starve.`), 1000);
  }
  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="df-pipe">
        <div className={`df-stage ${active === 'source' ? 'active' : ''}`} onClick={() => setActive('source')}>
          <div className="df-stage-head"><span className="si" style={{ background: '#dbeafe', color: '#1e40af' }}><IcImport size={15} /></span> Source</div>
          <div className="df-stage-sub">{p.sourceType}<br />{p.file}</div>
        </div>
        <div className={`df-stage ${active === 'sequence' ? 'active' : ''}`} onClick={() => setActive('sequence')}>
          <div className="df-stage-head"><span className="si" style={{ background: '#ede9fe', color: '#5b21b6' }}><IcFlow size={15} /></span> Sequence</div>
          <div className="df-stage-sub">{p.sequence}<br /><a href="#" onClick={e => { e.preventDefault(); onOpenSequence(); }} style={{ color: 'var(--blue)' }}>Open sequence →</a></div>
        </div>
        <div className={`df-stage ${active === 'target' ? 'active' : ''}`} onClick={() => setActive('target')}>
          <div className="df-stage-head"><span className="si" style={{ background: '#d1fae5', color: '#065f46' }}><IcManager size={15} /></span> Target</div>
          <div className="df-stage-sub">{p.target}<br />{p.targetType}</div>
        </div>
      </div>

      {active === 'source' && (
        <div style={{ maxWidth: 720 }}>
          <div className="kv-sec-label">Source · {p.sourceType}</div>
          <div className="props-grid" style={{ marginBottom: 14 }}>
            <div className="field" style={{ margin: 0 }}><label className="field-label">Source type</label>
              <div className="select-wrap"><select className="select" value={p.sourceType} onChange={e => onChange({ ...df, process: { ...p, sourceType: e.target.value } })}>
                <option>Single Delimited File</option><option>Multiple Delimited Files</option><option>Database Table</option><option>XML File</option>
              </select></div></div>
            <div className="field" style={{ margin: 0 }}><label className="field-label">File name</label><input className="input" value={p.file} disabled style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }} /></div>
          </div>
          <div className="kv-sec-label">Parallelism</div>
          <div className="hstack" style={{ gap: 8, marginBottom: 10 }}>
            <button className="btn" onClick={tune} disabled={busy} style={{ background: '#6d28d9', borderColor: '#6d28d9', color: '#fff' }}>
              {busy ? <AiSpinF label="Analyzing…" /> : <><IcSparkle size={13} /> AI tune parallelism</>}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>Threads split the file vertically by row across CPU cores — the key Data Flow speed-up over Porter.</span>
          </div>
          {ai && <div className="ai-panel"><div className="ai-panel-head"><IcSparkle size={15} /> Parallelism recommendation <span className="ai-badge">AI</span></div><div className="ai-panel-body"><div className="ai-suggestion"><IcInfo size={15} className="ai-ic" /><span className="ai-txt">{ai}</span></div></div></div>}
          <div className="props-grid" style={{ maxWidth: 520 }}>
            <div className="field" style={{ margin: 0 }}><label className="field-label">Number of threads — {p.threads}</label>
              <input type="range" min="1" max="32" value={p.threads} onChange={e => onChange({ ...df, process: { ...p, threads: +e.target.value } })} style={{ width: '100%', accentColor: 'var(--magenta)' }} /></div>
            <div className="field" style={{ margin: 0 }}><label className="field-label">Buffer size (rows)</label><input className="input" type="number" value={p.buffer} onChange={e => onChange({ ...df, process: { ...p, buffer: +e.target.value } })} /></div>
          </div>
        </div>
      )}
      {active === 'sequence' && (
        <div style={{ maxWidth: 720 }}>
          <div className="setup-banner info"><IcInfo size={15} /><span>The Sequence holds the transform & validation logic and is <strong>reusable</strong> across processes (e.g. overnight + intraday feeds). Only the Source and Target differ per Process.</span></div>
          <button className="btn primary" style={{ marginTop: 12 }} onClick={onOpenSequence}><IcFlow size={14} /> Edit "{p.sequence}" sequence</button>
        </div>
      )}
      {active === 'target' && (
        <div style={{ maxWidth: 720 }}>
          <div className="kv-sec-label">Target</div>
          <div className="props-grid">
            <div className="field" style={{ margin: 0 }}><label className="field-label">Target table</label><input className="input" value={p.target} disabled style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }} /></div>
            <div className="field" style={{ margin: 0 }}><label className="field-label">Update control</label>
              <div className="select-wrap"><select className="select" value={p.targetType} onChange={e => onChange({ ...df, process: { ...p, targetType: e.target.value } })}><option>Overwrite</option><option>Append</option><option>Update</option></select></div></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Sequence mode (the hero) ----
function DfSequence({ df, onChange }) {
  const [sel, setSel] = React.useState(df.steps[1]?.id || df.steps[0].id);
  const [nl, setNl] = React.useState('');
  const [busy, run] = useAiRunF();
  const [ai, setAi] = React.useState(null);
  const [proposed, setProposed] = React.useState(null);
  const step = df.steps.find(s => s.id === sel);

  function move(i, dir) {
    const j = i + dir; if (j <= 0 || j >= df.steps.length - 1) return; // keep SourceFields first, TargetFields last
    const arr = [...df.steps]; [arr[i], arr[j]] = [arr[j], arr[i]]; onChange({ ...df, steps: arr });
  }
  function toggleDisabled(id) { onChange({ ...df, steps: df.steps.map(s => s.id === id ? { ...s, disabled: !s.disabled } : s) }); }
  function remove(id) { onChange({ ...df, steps: df.steps.filter(s => s.id !== id) }); }
  function suggest() {
    run(() => setAi([
      { t: <>Add a <strong>Validate</strong> step: <code>PUBLISH_DATE</code> not null — 3% of GLEIF rows arrive without it.</> },
      { t: <>Add a <strong>Transform</strong>: upper-case <code>ENTITY_JURISDICTION</code> to match the ISO reference list casing.</> },
      { t: <>Move the <strong>Validate</strong> step before <strong>Store</strong> so invalid rows are only written to the untyped exception table — avoids storing data twice (best practice).</> },
    ]), 1000);
  }
  function generate() {
    if (!nl.trim()) return;
    run(() => {
      const t = nl.toLowerCase();
      let type = 'Transform', detail = nl;
      if (/valid|not null|present|must|>|<|in /.test(t)) { type = 'Validate'; detail = '{DATA}.[FIELD] check'; }
      else if (/lookup|reference|map/.test(t)) { type = 'Lookup'; detail = 'REF_TABLE → value'; }
      else if (/rule|decode|derive/.test(t)) { type = 'Rule'; detail = 'apply Data Flow Rule'; }
      else { detail = 'transform expression'; }
      setProposed({ type, name: nl.length > 32 ? nl.slice(0, 32) + '…' : nl, detail });
    });
  }
  function accept() {
    const newStep = { id: 'n' + Date.now(), type: proposed.type, name: proposed.name, disabled: false, detail: proposed.detail };
    const arr = [...df.steps]; arr.splice(df.steps.length - 1, 0, newStep); // before TargetFields
    onChange({ ...df, steps: arr }); setProposed(null); setNl(''); setSel(newStep.id);
    ruleToast('Step added to sequence', 'success');
  }

  return (
    <div style={{ padding: '16px 24px 32px', display: 'grid', gridTemplateColumns: '400px 1fr', gap: 24, alignItems: 'start' }}>
      <div>
        <div className="hstack" style={{ marginBottom: 10, gap: 8 }}>
          <span className="kv-sec-label" style={{ margin: 0 }}>In-memory steps</span>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn ghost" style={{ fontSize: 12 }} onClick={suggest} disabled={busy}>
            {busy ? <span className="ai-thinking">Thinking…</span> : <><IcSparkle size={12} style={{ color: '#6d28d9' }} /> AI suggest steps</>}
          </button>
        </div>
        {ai && (
          <div className="ai-panel"><div className="ai-panel-head"><IcSparkle size={15} /> Sequence suggestions <span className="ai-badge">AI</span></div>
            <div className="ai-panel-body">{ai.map((s, i) => <div key={i} className="ai-suggestion"><IcSparkle size={15} className="ai-ic" /><span className="ai-txt">{s.t}</span></div>)}<button className="btn" onClick={() => setAi(null)}>Dismiss</button></div></div>
        )}
        <div className="df-seq">
          {df.steps.map((s, i) => {
            const meta = DF_STEP_META[s.type]; const Icon = window[meta.ic] || IcFile;
            const fixed = s.type === 'SourceFields' || s.type === 'TargetFields';
            return (
              <React.Fragment key={s.id}>
                {i > 0 && <div className="df-step-conn" />}
                <div className={`df-step ${sel === s.id ? 'active' : ''} ${fixed ? 'fixed' : ''} ${s.disabled ? 'disabled' : ''}`} onClick={() => setSel(s.id)}>
                  <span className="ds-icon" style={{ background: 'var(--bg-1)' }}><Icon size={15} /></span>
                  <div className="ds-meta"><div className="ds-name">{s.name}</div><div className="ds-type"><span className={`df-steptype ${meta.cls}`}>{meta.label}</span></div></div>
                  {!fixed && (
                    <span className="hstack" style={{ gap: 2 }} onClick={e => e.stopPropagation()}>
                      <button className="icon-btn" style={{ width: 24, height: 24 }} title={s.disabled ? 'Enable' : 'Disable'} onClick={() => toggleDisabled(s.id)}><IcCircleDot size={13} /></button>
                      <button className="icon-btn" style={{ width: 24, height: 24 }} title="Up" onClick={() => move(i, -1)}>▲</button>
                      <button className="icon-btn" style={{ width: 24, height: 24 }} title="Down" onClick={() => move(i, 1)}>▼</button>
                      <button className="icon-btn" style={{ width: 24, height: 24 }} title="Remove" onClick={() => remove(s.id)}><IcTrash size={12} /></button>
                    </span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div>
        <div className="ai-panel">
          <div className="ai-panel-head"><IcSparkle size={15} /> Add a step from a description <span className="ai-badge">AI</span></div>
          <div className="ai-panel-body">
            <div className="ai-input-row"><input className="input" placeholder="e.g. validate LEI is 20 chars, or cast maturity to date" value={nl} onChange={e => setNl(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()} /><button className="btn primary" onClick={generate} disabled={busy || !nl.trim()}>{busy ? 'Building…' : 'Generate'}</button></div>
            {proposed && <div style={{ marginTop: 10 }}><div className="ai-suggestion"><IcCircleCheck size={15} className="ai-ic" /><span className="ai-txt"><span className={`df-steptype ${DF_STEP_META[proposed.type].cls}`}>{DF_STEP_META[proposed.type].label}</span> <strong>{proposed.name}</strong> — <code style={{ fontSize: 11 }}>{proposed.detail}</code></span></div><div className="hstack" style={{ gap: 8 }}><button className="btn primary" onClick={accept}>Add step</button><button className="btn" onClick={() => setProposed(null)}>Discard</button></div></div>}
          </div>
        </div>

        {step && (
          <>
            <div className="kv-sec-label">{step.name}</div>
            {step.type === 'SourceFields' || step.type === 'TargetFields' ? (
              <>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{step.type === 'SourceFields' ? 'Fields entering the sequence (untyped from file) and their target data types.' : 'Final typed fields emitted by the sequence.'}</div>
                <div className="kv-table">
                  <div className="kv-head" style={{ gridTemplateColumns: '1.6fr 1fr 60px' }}><span>Field</span><span>Data type</span><span>PK</span></div>
                  {df.sourceFields.map((f, i) => (
                    <div key={i} className="kv-row" style={{ gridTemplateColumns: '1.6fr 1fr 60px' }}>
                      <span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12, fontWeight: 500 }}>{f.name}</span>
                      <span style={{ color: 'var(--ink-3)' }}>{f.type}</span>
                      <span>{f.pk ? <IcCheck size={13} style={{ color: 'var(--magenta)' }} /> : '—'}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="props-grid" style={{ marginBottom: 12 }}>
                  <div className="field" style={{ margin: 0 }}><label className="field-label">Step name</label><input className="input" value={step.name} onChange={e => onChange({ ...df, steps: df.steps.map(s => s.id === sel ? { ...s, name: e.target.value } : s) })} /></div>
                  <div className="field" style={{ margin: 0 }}><label className="field-label">Step type</label><input className="input" value={DF_STEP_META[step.type].label} disabled /></div>
                </div>
                <div className="field" style={{ margin: 0 }}><label className="field-label">{step.type === 'Validate' ? 'Validation expression' : step.type === 'Lookup' ? 'Reference lookup' : step.type === 'Rule' ? 'Rule reference' : 'Transform expression'} <span className="muted" style={{ fontWeight: 400 }}>· in-memory, SQL-like</span></label>
                  <textarea className="insp-codebox" style={{ border: '1px solid var(--line)', borderRadius: 6 }} value={step.detail || ''} spellCheck={false}
                            onChange={e => onChange({ ...df, steps: df.steps.map(s => s.id === sel ? { ...s, detail: e.target.value } : s) })} /></div>
                {step.exc && <div className="setup-banner warn" style={{ marginTop: 10 }}><IcWarn size={15} /><span>Failing rows are routed to the untyped <strong>exception</strong> output rather than stored — best practice to avoid writing data twice.</span></div>}
                {step.disabled && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}><IcInfo size={12} style={{ verticalAlign: 'middle' }} /> Step is disabled — bypassed at run time.</div>}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Rule mode ----
function DfRule({ rule, onChange }) {
  const [step, setStep] = React.useState('rules');
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 920 }}>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {[['props', 'Properties'], ['params', 'Parameters'], ['rules', 'Rules']].map(([id, l]) => <button key={id} className={`tab ${step === id ? 'active' : ''}`} onClick={() => setStep(id)}>{l}</button>)}
      </div>
      {step === 'props' && (
        <div className="props-grid" style={{ maxWidth: 520 }}>
          <div className="field" style={{ margin: 0 }}><label className="field-label">Rule name</label><input className="input" value={rule.name} disabled /></div>
          <div className="field" style={{ margin: 0 }}><label className="field-label">Result type</label>
            <div className="select-wrap"><select className="select" value={rule.result} onChange={e => onChange({ ...rule, result: e.target.value })}>
              <option>VARCHAR</option><option>INT</option><option>DECIMAL</option><option>DATETIME</option><option>BIT</option></select></div>
            <div className="field-help">Restricted vs Rule Builder — Data Flow Rules run in memory. Used to filter rules in the Sequence.</div></div>
        </div>
      )}
      {step === 'params' && (
        <div className="kv-table" style={{ maxWidth: 520 }}>
          <div className="kv-head"><span>Parameter</span><span>Type</span></div>
          {rule.params.map((p, i) => <div key={i} className="kv-row"><span style={{ fontWeight: 500 }}>{p.name}</span><span style={{ color: 'var(--ink-3)' }}>{p.type}</span></div>)}
        </div>
      )}
      {step === 'rules' && (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}><IcInfo size={13} /> Hierarchic — evaluated top-down; first IF that is True returns its THEN. Last rule must have no IF (the ELSE).</div>
          {rule.rules.map((r, i) => (
            <div key={r.id} className="rule-card">
              <div className="rule-card-head">
                <span className="cond-ord">{i + 1}</span>
                <span className="rc-type" style={r.kind === 'ReferenceLookup' ? { background: '#e0f2fe', color: '#075985' } : {}}>{r.kind === 'ReferenceLookup' ? 'Reference Lookup' : 'Expression'}</span>
                <span style={{ fontWeight: 600, fontSize: 12.5 }}>{r.isElse ? 'ELSE (default)' : `Rule ${i + 1}`}</span>
                <span className="spacer" style={{ flex: 1 }} />
                {r.table && <span className="muted" style={{ fontSize: 11, fontFamily: 'Menlo,Consolas,monospace' }}>{r.table}</span>}
              </div>
              <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><div className="kv-sec-label" style={{ marginBottom: 4 }}>IF {r.isElse ? '(disabled — else)' : ''}</div>
                  <code style={{ fontSize: 11.5, fontFamily: 'Menlo,Consolas,monospace', color: r.isElse ? 'var(--ink-5)' : 'var(--ink)' }}>{r.if || '—'}</code>
                  {r.map && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>{r.map}</div>}</div>
                <div><div className="kv-sec-label" style={{ marginBottom: 4 }}>THEN return</div><code style={{ fontSize: 11.5, fontFamily: 'Menlo,Consolas,monospace', color: 'var(--magenta)' }}>{r.then}</code></div>
              </div>
            </div>
          ))}
          <button className="btn" style={{ marginTop: 4 }}><IcPlus size={14} /> Add rule</button>
        </>
      )}
    </div>
  );
}

// ============================================================
// Main Data Flow screen
// ============================================================
function DataFlow() {
  const [flows, setFlows] = React.useState(DF_DATA);
  const [rules, setRules] = React.useState(DF_RULES);
  const [mode, setMode] = React.useState('sequence');
  const [selected, setSelected] = React.useState('In GLEIF Party');
  const [selRule, setSelRule] = React.useState('GLEIF Status Decode');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);

  const df = flows[selected];
  const rule = rules[selRule];
  const compKey = 'flow:' + (mode === 'rule' ? selRule : selected);
  const collab = useCollab();
  const compState = collab.components[compKey];
  const locked = !compState || compState.status !== 'me';

  const listNames = mode === 'rule' ? Object.keys(rules) : Object.keys(flows);
  const names = listNames.filter(n => n.toLowerCase().includes(filter.toLowerCase()));
  const curName = mode === 'rule' ? selRule : selected;

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">Data Flow</span>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}><IcChevDoubleLeft size={16} /></button>
          </div>
          <div className="wb-list-search">
            <div className="wb-list-search-wrap"><IcSearch size={14} />
              <input className="input" placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} /></div>
          </div>
          <div className="wb-list-items">
            {names.map(n => (
              <div key={n} className={`wb-list-item ${n === curName ? 'active' : ''}`} onClick={() => mode === 'rule' ? setSelRule(n) : setSelected(n)} style={{ gap: 10 }}>
                {mode === 'rule' ? <IcRules size={15} /> : <IcFlow size={15} />}
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="wb-body">
        <div className="wb-body-head">
          {!sidebarOpen && <button className="icon-btn" style={{ float: 'left', marginRight: 12 }} onClick={() => setSidebarOpen(true)}><IcChevDoubleRight size={16} /></button>}
          <div className="title-row">
            <span className="head-icon"><IcFlow size={18} /></span>
            <h1>{curName} <span className="ver-pill">EDM {(mode === 'rule' ? rule.version : df.version)} <IcChevDown size={10} /></span></h1>
            <div className="right hstack" style={{ gap: 8 }}>
              <div className="df-mode">
                <button className={mode === 'process' ? 'active' : ''} onClick={() => setMode('process')}><IcDeploy size={13} /> Process</button>
                <button className={mode === 'sequence' ? 'active' : ''} onClick={() => setMode('sequence')}><IcFlow size={13} /> Sequence</button>
                <button className={mode === 'rule' ? 'active' : ''} onClick={() => setMode('rule')}><IcRules size={13} /> Rule</button>
              </div>
              <button className="ai-star" title="AI Assist"><IcSparkle size={16} /></button>
            </div>
          </div>
          <div className="desc">{mode === 'process' ? 'Runnable Source → Sequence → Target, parallelized in-memory.' : mode === 'sequence' ? 'Reusable in-memory transform & validation pipeline (faster than Porter/Inspector/Constructor).' : 'In-memory hierarchic rule used by Data Flow components.'}</div>
        </div>

        <CheckoutBar componentKey={compKey} label={curName} type="DataFlow" onOpenHistory={() => setShowHistory(true)} />
        {showHistory && <HistoryModal componentKey={compKey} label={curName} onClose={() => setShowHistory(false)} />}

        <div className="wb-body-toolbar">
          <button className="btn ghost" onClick={() => ruleToast('Saved', 'success')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save
          </button>
          {mode === 'process' && <button className="icon-btn" title="Run flow" onClick={() => ruleToast('Data Flow run queued (parallel)', 'info')}><IcPlay size={14} /></button>}
          <div className="spacer" />
          <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                  onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from Data Flow')}><IcShield size={16} /></button>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {mode === 'process' && <DfProcess df={df} onChange={n => setFlows({ ...flows, [selected]: n })} onOpenSequence={() => setMode('sequence')} />}
          {mode === 'sequence' && <DfSequence df={df} onChange={n => setFlows({ ...flows, [selected]: n })} />}
          {mode === 'rule' && <DfRule rule={rule} onChange={n => setRules({ ...rules, [selRule]: n })} />}
        </div>
      </div>
    </div>
  );
}

window.DataFlow = DataFlow;
