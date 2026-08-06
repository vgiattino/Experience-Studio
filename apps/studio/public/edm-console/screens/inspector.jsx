// ============================================================
// Data Inspector — assesses & validates data quality.
//   An Inspection (Code) has Inputs; the process designer steps are:
//   Inspection Properties (Tests + Keys) · Inputs (Raw Source + Row
//   Filter + Source Monitor + Column Filter + Key Mappings) ·
//   Inspection Rules · Results (DI_<CODE>_<INPUT>_RSLT).
//   Tests are Pass/Fail or Percentage Grade; "All Tests Passed" AND's
//   the boolean tests. Output feeds Matcher / Constructor.
//   AI: generate tests from a data profile, NL→test rule, suggest
//   rows-to-ignore, and explain failures + remediation.
// Seeded from real .DI.xml (Vertical Master Security Fixed Income, etc.)
// ============================================================

const DI_INSPECTIONS = {
  'Vertical Master Security Fixed Income': {
    name: 'Vertical Master Security Fixed Income', code: 'VTMASSECFI', version: '20.1.15.0',
    inputs: [
      { name: 'MASTER', code: 'MASTER', desc: 'Master fixed-income securities',
        table: 'dbo.T_MASTER_SEC_FIXED', monitor: 'ProcessAll', keys: ['EDM_SEC_ID'],
        sql: "SELECT 'Vertical Master Security Fixed Income' as SOURCE_COMPONENT, FIXED.*,\n  SEC.SECURITY_NAME, SEC.ASSET_TYPE_CODE, SEC.ISSUE_DATE, SEC.COUPON_TYPE, SEC.IS_PRIVATE\nFROM dbo.T_MASTER_SEC_FIXED FIXED\nJOIN dbo.T_MASTER_SEC SEC ON FIXED.EDM_SEC_ID = SEC.EDM_SEC_ID\nWHERE SEC.ASSET_TYPE_CODE = 'FI'" },
    ],
    keys: [{ name: 'EDM_SEC_ID', type: 'INT', pk: true }],
    resultsTable: 'DI_VTMASSECFI_RESULTS',
    allTestsPassed: true,
    tests: [
      { id: 't1', name: 'Maturity Date present', type: 'passfail', defaultVal: 'False', useExpr: false,
        result: { pass: 94, fail: 6 },
        rules: [
          { id: 'ri1', kind: 'ignore', desc: 'Rows to ignore', enabled: true, code: '{INPUT}.[COUPON_TYPE] = \'PERPETUAL\'', eng: 'Ignore where Coupon Type is PERPETUAL (no maturity).' },
          { id: 'rc1', kind: 'criteria', desc: 'Maturity not null & future', enabled: true, code: '{INPUT}.[MATURITY_DATE] IS NOT NULL AND {INPUT}.[MATURITY_DATE] > GETDATE()', eng: 'Passes when Maturity Date is set and in the future.' },
        ] },
      { id: 't2', name: 'Coupon in valid range', type: 'passfail', defaultVal: 'False', useExpr: false,
        result: { pass: 99, fail: 1 },
        rules: [
          { id: 'rc2', kind: 'criteria', desc: 'Coupon 0–30%', enabled: true, code: '{INPUT}.[COUPON] BETWEEN 0 AND 30', eng: 'Passes when Coupon is between 0 and 30 percent.' },
        ] },
      { id: 't3', name: 'Identifier completeness', type: 'grade', defaultVal: '0', useExpr: true,
        result: { grade: 88 },
        rules: [
          { id: 'rc3', kind: 'criteria', desc: 'Weighted ID coverage', enabled: true,
            code: '(CASE WHEN {INPUT}.[ISIN] IS NOT NULL THEN 50 ELSE 0 END)\n+ (CASE WHEN {INPUT}.[CUSIP] IS NOT NULL THEN 30 ELSE 0 END)\n+ (CASE WHEN {INPUT}.[SEDOL] IS NOT NULL THEN 20 ELSE 0 END)',
            eng: 'Grade = 50 (ISIN) + 30 (CUSIP) + 20 (SEDOL) when present.' },
        ] },
      { id: 't4', name: 'Issue date ≤ Maturity date', type: 'passfail', defaultVal: 'False', useExpr: false,
        result: { pass: 100, fail: 0 },
        rules: [
          { id: 'rc4', kind: 'criteria', desc: 'Issue before maturity', enabled: true, code: '{INPUT}.[ISSUE_DATE] <= {INPUT}.[MATURITY_DATE]', eng: 'Passes when Issue Date is on or before Maturity Date.' },
        ] },
    ],
  },
  'Vertical Master Security Equity': {
    name: 'Vertical Master Security Equity', code: 'VTMASSECEQ', version: '20.1.15.0',
    inputs: [{ name: 'MASTER', code: 'MASTER', desc: 'Master equities', table: 'dbo.T_MASTER_SEC_EQUITY', monitor: 'UseColumnMonitor', keys: ['EDM_SEC_ID'],
      sql: "SELECT EQ.*, SEC.SECURITY_NAME, SEC.ASSET_TYPE_CODE\nFROM dbo.T_MASTER_SEC_EQUITY EQ\nJOIN dbo.T_MASTER_SEC SEC ON EQ.EDM_SEC_ID = SEC.EDM_SEC_ID\nWHERE SEC.ASSET_TYPE_CODE = 'EQ'" }],
    keys: [{ name: 'EDM_SEC_ID', type: 'INT', pk: true }],
    resultsTable: 'DI_VTMASSECEQ_RESULTS', allTestsPassed: true,
    tests: [
      { id: 'e1', name: 'Exchange MIC valid', type: 'passfail', defaultVal: 'False', useExpr: false, result: { pass: 97, fail: 3 },
        rules: [{ id: 'er1', kind: 'criteria', desc: 'MIC in reference list', enabled: true, code: '{INPUT}.[EXCHANGE_MIC] IN (SELECT MIC FROM dbo.REF_MIC)', eng: 'Passes when Exchange MIC exists in the reference list.' }] },
      { id: 'e2', name: 'Currency present', type: 'passfail', defaultVal: 'False', useExpr: false, result: { pass: 100, fail: 0 },
        rules: [{ id: 'er2', kind: 'criteria', desc: 'Currency not null', enabled: true, code: '{INPUT}.[CURRENCY] IS NOT NULL', eng: 'Passes when Currency is populated.' }] },
    ],
  },
  'Vertical Master Party': {
    name: 'Vertical Master Party', code: 'VTMASPARTY', version: '20.1.15.0',
    inputs: [{ name: 'MASTER', code: 'MASTER', desc: 'Master parties', table: 'dbo.T_MASTER_PARTY', monitor: 'ProcessAll', keys: ['EDM_PARTY_ID'],
      sql: "SELECT * FROM dbo.T_MASTER_PARTY" }],
    keys: [{ name: 'EDM_PARTY_ID', type: 'INT', pk: true }],
    resultsTable: 'DI_VTMASPARTY_RESULTS', allTestsPassed: true,
    tests: [
      { id: 'pp1', name: 'LEI present & 20 chars', type: 'passfail', defaultVal: 'False', useExpr: false, result: { pass: 82, fail: 18 },
        rules: [{ id: 'pr1', kind: 'criteria', desc: 'LEI length 20', enabled: true, code: 'LEN({INPUT}.[LEI]) = 20', eng: 'Passes when LEI is exactly 20 characters.' }] },
      { id: 'pp2', name: 'Country ISO valid', type: 'passfail', defaultVal: 'False', useExpr: false, result: { pass: 96, fail: 4 },
        rules: [{ id: 'pr2', kind: 'criteria', desc: 'Country in ISO list', enabled: true, code: '{INPUT}.[COUNTRY] IN (SELECT CODE FROM dbo.REF_COUNTRY)', eng: 'Passes when Country is a valid ISO 3166 code.' }] },
    ],
  },
  'Vertical Master Price Missing Validation': {
    name: 'Vertical Master Price Missing Validation', code: 'VTMASPXMIS', version: '20.1.15.0',
    inputs: [{ name: 'PRICE', code: 'PRICE', desc: 'Master price', table: 'dbo.T_MASTER_PRICE', monitor: 'UseLastUpdateDate', keys: ['EDM_SEC_ID', 'PRICE_DATE'],
      sql: "SELECT * FROM dbo.T_MASTER_PRICE WHERE PRICE_DATE = {CONFIGURABLE PARAMETER}.[VALUATION_DATE]" }],
    keys: [{ name: 'EDM_SEC_ID', type: 'INT', pk: true }, { name: 'PRICE_DATE', type: 'DATE', pk: true }],
    resultsTable: 'DI_VTMASPXMIS_RESULTS', allTestsPassed: true,
    tests: [
      { id: 'x1', name: 'Price present', type: 'passfail', defaultVal: 'False', useExpr: false, result: { pass: 91, fail: 9 },
        rules: [{ id: 'xr1', kind: 'criteria', desc: 'Price not null & > 0', enabled: true, code: '{INPUT}.[PRICE] IS NOT NULL AND {INPUT}.[PRICE] > 0', eng: 'Passes when Price is set and positive.' }] },
      { id: 'x2', name: 'Price freshness', type: 'grade', defaultVal: '0', useExpr: true, result: { grade: 76 },
        rules: [{ id: 'xr2', kind: 'criteria', desc: 'Freshness by age', enabled: true, code: 'CASE WHEN DATEDIFF(day,{INPUT}.[PRICE_DATE],GETDATE())<=1 THEN 100\n     WHEN DATEDIFF(day,{INPUT}.[PRICE_DATE],GETDATE())<=5 THEN 60 ELSE 20 END', eng: 'Grade 100 if priced today/yesterday, 60 within 5 days, else 20.' }] },
    ],
  },
};

const DI_TABS = [
  { id: 'props', label: 'Inspection Properties' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'rules', label: 'Inspection Rules' },
  { id: 'results', label: 'Results' },
];

function useAiRunI() {
  const [busy, setBusy] = React.useState(false);
  const run = (fn, ms = 900) => { setBusy(true); setTimeout(() => { fn(); setBusy(false); }, ms); };
  return [busy, run];
}
function AiSpinI({ label }) {
  return <span className="ai-thinking" style={{ color: '#fff' }}>
    <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.4)" strokeWidth="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg> {label}
  </span>;
}
function testResultPct(t) {
  if (t.type === 'grade') return t.result.grade;
  return t.result.pass;
}
function resultClass(pct) { return pct >= 95 ? 'mx-q-good' : pct >= 80 ? 'mx-q-low' : 'mx-q-no'; }

// ---- Inspection Properties tab (tests + keys) ----
function DiProperties({ insp, onChange }) {
  const [busy, run] = useAiRunI();
  const [ai, setAi] = React.useState(null);
  const [showNew, setShowNew] = React.useState(false);
  function genTests() {
    run(() => setAi([
      { t: <>Add <strong>"Rating present for FI"</strong> (Pass/Fail) — 12% of fixed-income rows have a null rating, which the Constructor needs.</> },
      { t: <>Add <strong>"Day Count basis valid"</strong> (Pass/Fail) against <code>REF_DAYCOUNT</code> — 4% currently fall outside the reference set.</> },
      { t: <>Convert <strong>Identifier completeness</strong> to weight <strong>ISIN heaviest</strong> — matches your Matcher attribute weights (SEDOL 100/CUSIP 80/ISIN 60 inverts here).</> },
    ]), 1100);
  }
  function addTest(name, type) {
    const t = { id: 'n' + Date.now(), name, type, defaultVal: type === 'grade' ? '0' : 'False', useExpr: type === 'grade',
      result: type === 'grade' ? { grade: 0 } : { pass: 0, fail: 0 },
      rules: [{ id: 'r' + Date.now(), kind: 'criteria', desc: 'New criteria', enabled: true, code: '', eng: '' }] };
    onChange({ ...insp, tests: [...insp.tests, t] });
    setShowNew(false);
    ruleToast('Inspection test added', 'success');
  }
  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="hstack" style={{ marginBottom: 12, gap: 8 }}>
        <span className="muted">Tests assess each row; results are appended to the dataset and exposed via <code style={{ fontSize: 11 }}>{insp.resultsTable}</code>.</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={genTests} disabled={busy} style={{ background: '#6d28d9', borderColor: '#6d28d9', color: '#fff' }}>
          {busy ? <AiSpinI label="Profiling data…" /> : <><IcSparkle size={13} /> AI suggest tests</>}
        </button>
        <button className="btn primary" onClick={() => setShowNew(true)}><IcPlus size={14} /> Add test</button>
      </div>
      {ai && (
        <div className="ai-panel">
          <div className="ai-panel-head"><IcSparkle size={15} /> Suggested tests (from data profile) <span className="ai-badge">AI</span></div>
          <div className="ai-panel-body">
            {ai.map((s, i) => <div key={i} className="ai-suggestion"><IcSparkle size={15} className="ai-ic" /><span className="ai-txt">{s.t}</span></div>)}
            <div className="hstack" style={{ gap: 8 }}>
              <button className="btn primary" onClick={() => { addTest('Rating present for FI', 'passfail'); setAi(null); }}>Add first suggestion</button>
              <button className="btn" onClick={() => setAi(null)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {insp.tests.map(t => {
        const pct = testResultPct(t);
        return (
          <div key={t.id} className="insp-test" style={{ cursor: 'default' }}>
            <span className="it-icon" style={{ background: t.type === 'grade' ? '#ede9fe' : '#dbeafe', color: t.type === 'grade' ? '#5b21b6' : '#1e40af' }}>
              {t.type === 'grade' ? <IcSliders size={15} /> : <IcCircleCheck size={15} />}
            </span>
            <div className="it-meta">
              <div className="it-name">{t.name}</div>
              <div className="it-sub">Default: {t.defaultVal}{t.useExpr ? ' · Use Expression Result' : ''} · {t.rules.length} rule{t.rules.length === 1 ? '' : 's'}</div>
            </div>
            <span className={`tt-pill ${t.type === 'grade' ? 'tt-grade' : 'tt-passfail'}`}>{t.type === 'grade' ? 'Percentage Grade' : 'Pass / Fail'}</span>
            <span className="insp-result-bar">
              <span className={`bar ${resultClass(pct)}`}><i style={{ width: pct + '%' }} /></span>
              <strong style={{ fontSize: 12, width: 34 }}>{pct}%</strong>
            </span>
            <button className="icon-btn" title="Remove test" onClick={() => onChange({ ...insp, tests: insp.tests.filter(x => x.id !== t.id) })}><IcTrash size={14} /></button>
          </div>
        );
      })}
      {insp.allTestsPassed && (
        <div className="insp-test alltests">
          <span className="it-icon" style={{ background: '#d1fae5', color: '#065f46' }}><IcCircleCheck size={15} /></span>
          <div className="it-meta">
            <div className="it-name">All Tests Passed</div>
            <div className="it-sub">Auto-generated · AND of all Pass/Fail tests · read-only · consumed downstream</div>
          </div>
          <span className="tt-pill tt-passfail">Pass / Fail</span>
        </div>
      )}

      <div className="kv-sec-label" style={{ marginTop: 22 }}>Result keys</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Unique row identifier for the inspection results (Copy Keys from the source table, or add manually).</div>
      <div className="kv-table" style={{ maxWidth: 520 }}>
        <div className="kv-head" style={{ gridTemplateColumns: '1.4fr 1fr 70px' }}><span>Key field</span><span>Type</span><span>PK</span></div>
        {insp.keys.map((k, i) => (
          <div key={i} className="kv-row" style={{ gridTemplateColumns: '1.4fr 1fr 70px' }}>
            <span style={{ fontWeight: 500, fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }}>{k.name}</span>
            <span style={{ color: 'var(--ink-3)' }}>{k.type}</span>
            <span>{k.pk ? <IcCheck size={14} style={{ color: 'var(--magenta)' }} /> : '—'}</span>
          </div>
        ))}
      </div>
      <div className="hstack" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn ghost" style={{ fontSize: 12 }}><IcImport size={13} /> Copy Keys from table…</button>
        <button className="btn ghost" style={{ fontSize: 12 }}><IcPlus size={13} /> Add key</button>
      </div>

      {showNew && <DiNewTest onAdd={addTest} onCancel={() => setShowNew(false)} />}
    </div>
  );
}

function DiNewTest({ onAdd, onCancel }) {
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('passfail');
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head"><h3>New Inspection Test</h3></div>
        <div className="modal-body">
          <div className="field"><label className="field-label">Test name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Maturity Date present" /></div>
          <div className="field" style={{ marginBottom: 0 }}><label className="field-label">Test type</label>
            <div className="vstack" style={{ gap: 8, marginTop: 4 }}>
              <label className="radio"><input type="radio" checked={type === 'passfail'} onChange={() => setType('passfail')} /><span className="rdot" /> Pass / Fail (boolean)</label>
              <label className="radio"><input type="radio" checked={type === 'grade'} onChange={() => setType('grade')} /><span className="rdot" /> Percentage Grade (0–100)</label>
            </div>
          </div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => onAdd(name.trim(), type)}>Add test</button></div>
      </div>
    </div>
  );
}

// ---- Inputs tab ----
function DiInputs({ insp, onChange }) {
  const [sel, setSel] = React.useState(0);
  const inp = insp.inputs[sel];
  const [step, setStep] = React.useState('source');
  const steps = [['source', 'Raw Source'], ['rowfilter', 'Row Filter'], ['monitor', 'Source Monitor'], ['colfilter', 'Column Filter'], ['keymap', 'Key Mappings']];
  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="hstack" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {insp.inputs.map((x, i) => (
          <button key={i} className={`mp-chip ${sel === i ? 'active' : ''}`} onClick={() => setSel(i)}>{x.name}</button>
        ))}
        <button className="mp-chip" onClick={() => ruleToast('New input', 'info')}><IcPlus size={12} /> New input</button>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12 }}>Results view: <code style={{ fontSize: 11 }}>DI_{insp.code}_{inp.code}_RSLT</code></span>
      </div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {steps.map(([id, label]) => <button key={id} className={`tab ${step === id ? 'active' : ''}`} onClick={() => setStep(id)}>{label}</button>)}
      </div>
      {step === 'source' && (
        <>
          <div className="props-grid" style={{ marginBottom: 12 }}>
            <div className="field" style={{ margin: 0 }}><label className="field-label">Input name</label><input className="input" value={inp.name} disabled /></div>
            <div className="field" style={{ margin: 0 }}><label className="field-label">Code</label><input className="input" value={inp.code} disabled /></div>
            <div className="field" style={{ margin: 0 }}><label className="field-label">Source table / view</label><input className="input" value={inp.table} disabled style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }} /></div>
          </div>
          <div className="field" style={{ margin: 0 }}><label className="field-label">Raw source SQL</label>
            <textarea className="code-editor" value={inp.sql} spellCheck={false} style={{ minHeight: 160 }}
                      onChange={e => onChange({ ...insp, inputs: insp.inputs.map((x, i) => i === sel ? { ...x, sql: e.target.value } : x) })} /></div>
        </>
      )}
      {step === 'rowfilter' && (
        <div className="field" style={{ margin: 0 }}><label className="field-label">Row filter <span className="muted" style={{ fontWeight: 400 }}>· restricts rows for all tests</span></label>
          <textarea className="code-editor" defaultValue={"-- e.g. exclude private placements\n{INPUT}.[IS_PRIVATE] = 0"} spellCheck={false} style={{ minHeight: 90 }} /></div>
      )}
      {step === 'monitor' && (
        <div style={{ maxWidth: 620 }}>
          <div className="field"><label className="field-label">Change monitor mode</label>
            <div className="select-wrap"><select className="select" value={inp.monitor}
                  onChange={e => onChange({ ...insp, inputs: insp.inputs.map((x, i) => i === sel ? { ...x, monitor: e.target.value } : x) })}>
              <option>ProcessAll</option><option>UseLastUpdateDate</option><option>UseControlBuffer</option><option>UseColumnMonitor</option><option>UseControlAllInputsBuffer</option>
            </select></div>
            <div className="field-help">Tells the Inspector which rows/columns to watch for changes that require re-inspection.</div>
          </div>
          <div className="kv-sec-label">Key fields watched</div>
          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>{inp.keys.map(k => <span key={k} className="mp-tag" style={{ fontFamily: 'Menlo,Consolas,monospace' }}>{k}</span>)}</div>
        </div>
      )}
      {step === 'colfilter' && (
        <div className="muted" style={{ fontSize: 13 }}>Restrict the columns available to the Inspection rules. Useful for wide datasets — all unselected columns are hidden from every test. (Reading from <code>{inp.table}</code>.)</div>
      )}
      {step === 'keymap' && (
        <div style={{ maxWidth: 520 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Align the input source keys with the Results keys (set in Inspection Properties).</div>
          <div className="kv-table">
            <div className="kv-head"><span>Source key</span><span>Result key</span></div>
            {insp.keys.map((k, i) => (
              <div key={i} className="kv-row"><span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }}>{inp.keys[i] || k.name}</span><span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }}>{k.name}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Inspection Rules tab ----
function DiRules({ insp, onChange }) {
  const [selId, setSelId] = React.useState(insp.tests[0]?.id);
  const [nl, setNl] = React.useState('');
  const [busy, run] = useAiRunI();
  const [proposed, setProposed] = React.useState(null);
  React.useEffect(() => { if (!insp.tests.find(t => t.id === selId)) setSelId(insp.tests[0]?.id); }, [insp.tests.length]);
  const test = insp.tests.find(t => t.id === selId);

  function updateRule(rid, patch) {
    onChange({ ...insp, tests: insp.tests.map(t => t.id !== selId ? t : { ...t, rules: t.rules.map(r => r.id === rid ? { ...r, ...patch } : r) }) });
  }
  function generate() {
    if (!nl.trim() || !test) return;
    run(() => {
      // crude NL → criteria
      const text = nl.toLowerCase();
      let code = '{INPUT}.[FIELD] IS NOT NULL', eng = nl;
      if (text.includes('not null') || text.includes('present') || text.includes('populated')) { code = '{INPUT}.[' + guessField(text) + '] IS NOT NULL'; eng = 'Passes when ' + guessField(text) + ' is populated.'; }
      else if (text.includes('between') || text.includes('range')) { code = '{INPUT}.[' + guessField(text) + '] BETWEEN 0 AND 100'; eng = guessField(text) + ' within range 0–100.'; }
      else if (text.includes('in (') || text.includes('reference') || text.includes('valid')) { code = '{INPUT}.[' + guessField(text) + '] IN (SELECT CODE FROM dbo.REF_LIST)'; eng = guessField(text) + ' exists in the reference list.'; }
      setProposed({ code, eng });
    });
  }
  function guessField(t) {
    for (const f of ['isin', 'cusip', 'sedol', 'lei', 'currency', 'coupon', 'maturity', 'price', 'rating', 'country', 'exchange']) if (t.includes(f)) return f.toUpperCase();
    return 'FIELD';
  }
  function acceptProposed() {
    onChange({ ...insp, tests: insp.tests.map(t => t.id !== selId ? t : { ...t, rules: [...t.rules, { id: 'r' + Date.now(), kind: 'criteria', desc: 'AI rule', enabled: true, code: proposed.code, eng: proposed.eng }] }) });
    setProposed(null); setNl(''); ruleToast('Rule added to test', 'success');
  }

  return (
    <div style={{ padding: '16px 24px 32px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <div className="kv-sec-label">Inspection test</div>
        {insp.tests.map(t => (
          <div key={t.id} className={`insp-test ${selId === t.id ? 'active' : ''}`} onClick={() => setSelId(t.id)} style={{ marginBottom: 6 }}>
            <span className="it-icon" style={{ width: 26, height: 26, background: t.type === 'grade' ? '#ede9fe' : '#dbeafe', color: t.type === 'grade' ? '#5b21b6' : '#1e40af' }}>
              {t.type === 'grade' ? <IcSliders size={13} /> : <IcCircleCheck size={13} />}</span>
            <div className="it-meta"><div className="it-name" style={{ fontSize: 12.5 }}>{t.name}</div><div className="it-sub">{t.rules.length} rule{t.rules.length === 1 ? '' : 's'}</div></div>
          </div>
        ))}
      </div>
      <div>
        {test && (
          <>
            <div className="ai-panel">
              <div className="ai-panel-head"><IcSparkle size={15} /> Describe a rule for "{test.name}" <span className="ai-badge">AI</span></div>
              <div className="ai-panel-body">
                <div className="ai-input-row">
                  <input className="input" placeholder="e.g. ISIN must be present, or coupon between 0 and 30" value={nl} onChange={e => setNl(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()} />
                  <button className="btn primary" onClick={generate} disabled={busy || !nl.trim()}>{busy ? 'Building…' : 'Generate'}</button>
                </div>
                {proposed && (
                  <div style={{ marginTop: 10 }}>
                    <div className="ai-suggestion"><IcCircleCheck size={15} className="ai-ic" /><span className="ai-txt"><code style={{ fontSize: 11 }}>{proposed.code}</code><br /><span style={{ fontStyle: 'italic' }}>{proposed.eng}</span></span></div>
                    <div className="hstack" style={{ gap: 8 }}><button className="btn primary" onClick={acceptProposed}>Add rule</button><button className="btn" onClick={() => setProposed(null)}>Discard</button></div>
                  </div>
                )}
              </div>
            </div>

            <div className="hstack" style={{ marginBottom: 8 }}>
              <span className="kv-sec-label" style={{ margin: 0 }}>Associated rules <span style={{ fontWeight: 400, textTransform: 'none' }}>· descending priority</span></span>
              <span className="spacer" style={{ flex: 1 }} />
              <span className="muted" style={{ fontSize: 12 }}>Default if no rule matches: <strong>{test.defaultVal}</strong></span>
            </div>
            {test.rules.map(r => (
              <div key={r.id} className="rule-card">
                <div className="rule-card-head">
                  <label className="checkbox"><input type="checkbox" checked={r.enabled} onChange={() => updateRule(r.id, { enabled: !r.enabled })} /><span className="box"><IcCheck size={12} /></span></label>
                  <span className="rc-type" style={r.kind === 'ignore' ? { background: '#fef3c7', color: '#92400e' } : {}}>{r.kind === 'ignore' ? 'Rows to ignore' : 'Criteria'}</span>
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{r.desc}</span>
                  <span className="spacer" style={{ flex: 1 }} />
                  <span className="muted" style={{ fontSize: 11 }}>Result: {r.kind === 'ignore' ? '<NULL> (ignored)' : (test.type === 'grade' ? 'graded' : (test.defaultVal === 'False' ? 'True' : 'False'))}</span>
                  <button className="icon-btn" title="Remove rule" onClick={() => onChange({ ...insp, tests: insp.tests.map(t => t.id !== selId ? t : { ...t, rules: t.rules.filter(x => x.id !== r.id) }) })}><IcTrash size={13} /></button>
                </div>
                <div className="rule-card-body">
                  <textarea className="insp-codebox" value={r.code} spellCheck={false} onChange={e => updateRule(r.id, { code: e.target.value })} />
                  {r.eng && <div className="insp-eng"><IcInfo size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} />{r.eng}</div>}
                </div>
              </div>
            ))}
            <div className="hstack" style={{ gap: 8, marginTop: 4 }}>
              <button className="btn" onClick={() => onChange({ ...insp, tests: insp.tests.map(t => t.id !== selId ? t : { ...t, rules: [...t.rules, { id: 'r' + Date.now(), kind: 'criteria', desc: 'New rule', enabled: true, code: '', eng: '' }] }) })}><IcPlus size={14} /> Add rule</button>
              {test.type === 'passfail' && !test.rules.some(r => r.kind === 'ignore') && (
                <button className="btn ghost" onClick={() => onChange({ ...insp, tests: insp.tests.map(t => t.id !== selId ? t : { ...t, rules: [{ id: 'ig' + Date.now(), kind: 'ignore', desc: 'Rows to ignore', enabled: true, code: '', eng: '' }, ...t.rules] }) })}><IcPlus size={13} /> Add Rows-to-Ignore</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- Results tab ----
function DiResults({ insp }) {
  const [busy, run] = useAiRunI();
  const [explain, setExplain] = React.useState(null);
  const rows = [
    { id: 700014882, name: 'APPLE INC 4.65% 2046', fails: [], grade: 100 },
    { id: 700031245, name: 'MSFT 3.30% 2027', fails: ['Maturity Date present'], grade: 75 },
    { id: 700044190, name: 'VODAFONE GRP 2.20%', fails: ['Coupon in valid range'], grade: 60 },
    { id: 700052201, name: 'GS FRN 2029', fails: ['Maturity Date present', 'Identifier completeness'], grade: 40 },
  ];
  function doExplain(r) {
    run(() => setExplain({ id: r.id, text: r.fails.length === 0
      ? <>All tests passed. Identifier completeness graded <strong>100</strong>. Row is clean for downstream Matcher/Constructor.</>
      : <>Failed <strong>{r.fails.join(', ')}</strong>. {r.fails.includes('Maturity Date present') ? 'Maturity Date is NULL — but Coupon Type isn\'t PERPETUAL, so it isn\'t an ignored row. ' : ''}{r.fails.includes('Coupon in valid range') ? 'Coupon is outside 0–30% (likely a feed scaling error — value may be in bps). ' : ''}Recommend routing to the Exception Security inbox for {r.fails.includes('Maturity Date present') ? 'maturity backfill' : 'review'}.</> }));
  }
  const summary = insp.tests.map(t => ({ name: t.name, pct: testResultPct(t), type: t.type }));
  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="muted" style={{ marginBottom: 12 }}>Results appended to <code style={{ fontSize: 11 }}>{insp.resultsTable}</code> and exposed per-input as <code style={{ fontSize: 11 }}>DI_{insp.code}_&lt;INPUT&gt;_RSLT</code>. Consumed by Matcher & Constructor.</div>
      <div className="kv-sec-label">Test pass rates</div>
      <div style={{ marginBottom: 18 }}>
        {summary.map((s, i) => (
          <div key={i} className="hstack" style={{ gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{s.name}</span>
            <span className={`tt-pill ${s.type === 'grade' ? 'tt-grade' : 'tt-passfail'}`}>{s.type === 'grade' ? 'Grade' : 'Pass/Fail'}</span>
            <span className="insp-result-bar"><span className={`bar ${resultClass(s.pct)}`}><i style={{ width: s.pct + '%' }} /></span><strong style={{ fontSize: 12, width: 34 }}>{s.pct}%</strong></span>
          </div>
        ))}
      </div>
      <div className="kv-sec-label">Inspected rows (sample)</div>
      <div className="gen-inbox">
        <table>
          <thead><tr><th>{insp.keys[0].name}</th><th>Name</th><th>All Tests Passed</th><th>Failed tests</th><th>Quality</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <React.Fragment key={r.id}>
                <tr style={{ background: r.fails.length ? '#fff7f7' : undefined }}>
                  <td style={{ fontFamily: 'Menlo,Consolas,monospace' }}>{r.id}</td>
                  <td>{r.name}</td>
                  <td>{r.fails.length === 0 ? <span className="test-result pass"><IcCircleCheck size={13} /> True</span> : <span className="test-result fail"><IcCircleX size={13} /> False</span>}</td>
                  <td>{r.fails.length ? r.fails.map(f => <span key={f} className="mp-tag" style={{ background: '#fee2e2', color: '#991b1b', marginRight: 4 }}>{f}</span>) : <span className="muted">—</span>}</td>
                  <td><span className="insp-result-bar"><span className={`bar ${resultClass(r.grade)}`} style={{ width: 70 }}><i style={{ width: r.grade + '%' }} /></span> {r.grade}</span></td>
                  <td><button className="btn ghost" style={{ fontSize: 11, color: '#6d28d9' }} onClick={() => doExplain(r)} disabled={busy}><IcSparkle size={12} /> Explain</button></td>
                </tr>
                {explain && explain.id === r.id && (
                  <tr><td colSpan={6} style={{ padding: 0 }}>
                    <div className="ai-panel" style={{ margin: 10 }}>
                      <div className="ai-panel-head"><IcSparkle size={15} /> Quality explanation <span className="ai-badge">AI</span></div>
                      <div className="ai-panel-body"><div className="ai-suggestion"><IcInfo size={15} className="ai-ic" /><span className="ai-txt">{explain.text}</span></div></div>
                    </div>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Main Inspector screen
// ============================================================
function Inspector() {
  const [insps, setInsps] = React.useState(DI_INSPECTIONS);
  const [selected, setSelected] = React.useState('Vertical Master Security Fixed Income');
  const [tab, setTab] = React.useState('props');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);

  const insp = insps[selected];
  const compKey = 'inspector:' + selected;
  const collab = useCollab();
  const compState = collab.components[compKey];
  const locked = !compState || compState.status !== 'me';
  function update(next) { setInsps({ ...insps, [selected]: next }); }
  const names = Object.keys(insps).filter(n => n.toLowerCase().includes(filter.toLowerCase()));

  const avgQuality = Math.round(insp.tests.reduce((s, t) => s + testResultPct(t), 0) / Math.max(insp.tests.length, 1));

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">Data Inspector</span>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}><IcChevDoubleLeft size={16} /></button>
          </div>
          <div className="wb-list-search">
            <div className="wb-list-search-wrap"><IcSearch size={14} />
              <input className="input" placeholder="Filter inspections…" value={filter} onChange={e => setFilter(e.target.value)} /></div>
          </div>
          <div className="wb-list-items">
            {names.map(n => (
              <div key={n} className={`wb-list-item ${n === selected ? 'active' : ''}`} onClick={() => setSelected(n)} style={{ gap: 10 }}>
                <IcInspector size={15} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{insps[n].code} · {insps[n].tests.length} tests</span>
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
            <span className="head-icon"><IcInspector size={18} /></span>
            <h1>{insp.name} <span style={{ color: 'var(--ink-4)', fontWeight: 400, fontSize: 14 }}>· {insp.code}</span>
              <span className="ver-pill">EDM {insp.version} <IcChevDown size={10} /></span></h1>
            <div className="right hstack" style={{ gap: 6 }}>
              <span className="env-pill" style={{ background: avgQuality >= 90 ? '#d1fae5' : '#fef3c7', color: avgQuality >= 90 ? '#065f46' : '#92400e' }}>
                <IcCircleCheck size={11} /> {avgQuality}% avg quality
              </span>
              <button className="ai-star" title="AI Assist"><IcSparkle size={16} /></button>
            </div>
          </div>
          <div className="desc">Assesses data quality across {insp.inputs.length} input{insp.inputs.length === 1 ? '' : 's'}; results feed the Matcher & Constructor.</div>
        </div>

        <CheckoutBar componentKey={compKey} label={insp.name} type="Inspector" onOpenHistory={() => setShowHistory(true)} />
        {showHistory && <HistoryModal componentKey={compKey} label={insp.name} onClose={() => setShowHistory(false)} />}

        <div className="wb-body-toolbar">
          <button className="btn ghost" onClick={() => ruleToast('Saved', 'success')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save
          </button>
          <button className="btn primary" onClick={() => ruleToast('Verifying & creating result objects…', 'info')}><IcCheck size={14} /> Verify & Create</button>
          <div className="tool-sep" />
          <button className="icon-btn" title="Run inspection" onClick={() => ruleToast('Inspection run queued', 'info')}><IcPlay size={14} /></button>
          <div className="spacer" />
          <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                  onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from Inspector')}><IcShield size={16} /></button>
        </div>

        <div className="tabs" style={{ padding: '0 24px', margin: 0, borderBottom: '1px solid var(--line)' }}>
          {DI_TABS.map(tb => <button key={tb.id} className={`tab ${tab === tb.id ? 'active' : ''}`} onClick={() => setTab(tb.id)}>{tb.label}</button>)}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {tab === 'props' && <DiProperties insp={insp} onChange={update} />}
          {tab === 'inputs' && <DiInputs insp={insp} onChange={update} />}
          {tab === 'rules' && <DiRules insp={insp} onChange={update} />}
          {tab === 'results' && <DiResults insp={insp} />}
        </div>
      </div>
    </div>
  );
}

window.Inspector = Inspector;
