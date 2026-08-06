// ============================================================
// Core Matcher — workbench modeled on the EDM Core Matcher docs
//   Tabs: Sources · Options · Advanced · Matching Attributes ·
//         Match Conditions · Results
//   AI features: attribute/weight suggestions, NL→condition,
//   threshold tuning, match explanation + exception triage.
// Seeded from the real Security.CM.xml; Party/Fund included.
// ============================================================

const MX_RULE_TYPES = ['Equals', 'Like'];

// ---- worked example: Security (from Security.CM.xml) ----
const MX_SECURITY = {
  name: 'Security', code: 'SECURITY', illType: 'Security', version: '20.1.15.0',
  idCol: 'EDM_SEC_ID', idUi: 'EDM Security Id', inactive: 'Inactive', idStart: 700000000,
  options: { priority: 'Normal', batchSize: 1000, timeout: 120, runType: 'StandardRun',
             serviceUrl: 'localhost:1234', outputKeys: true, useSynonyms: true, useIgnores: true },
  advanced: { runMode: 'Waterfall', nullMultipliers: false, lowThreshold: 70, noThreshold: 30 },
  sources: [
    { name: 'Bloomberg', code: 'BBG', view: 'VW_Bloomberg_Security_Matcher', key: 'ID_BB_GLOBAL', createIds: true },
    { name: 'LSEG', code: 'LSG', view: 'VW_LSEG_Security_Matcher', key: 'ASSET_QUOTE_ID', createIds: true },
    { name: 'Manual', code: 'MANUAL', view: 'VW_Manual_Security_Matcher', key: 'MAN_SEC_ID', createIds: true },
  ],
  attributes: [
    { name: 'SEDOL', type: 'NVARCHAR', weight: 100, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: false, info: false },
    { name: 'CUSIP', type: 'NVARCHAR', weight: 80, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: false, info: false },
    { name: 'ISIN', type: 'NVARCHAR', weight: 60, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: false, info: false },
    { name: 'Issue Currency', type: 'NVARCHAR', weight: 30, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: true, info: false },
    { name: 'Exchange MIC', type: 'NVARCHAR', weight: 30, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: true, info: false },
    { name: 'Maturity Date', type: 'DATETIME2', weight: 30, rule: 'Equals', tol: 'Dates', primary: 'Bloomberg', weak: false, info: false },
    { name: 'Asset Type', type: 'NVARCHAR', weight: 5, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: true, info: false },
    { name: 'Security Type', type: 'NVARCHAR', weight: 5, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: true, info: false },
    { name: 'Security Name', type: 'NVARCHAR', weight: 0, rule: 'Like', tol: '', primary: '', weak: false, info: true },
  ],
  conditions: [
    { id: 'c1', name: 'Fixed Income', sources: ['Bloomberg', 'LSEG', 'Manual'],
      details: [
        { attr: 'Asset Type', op: '=', value: 'FI', mm: 'none' },
        { attr: 'ISIN', op: '', value: '', mm: 'oneof' },
        { attr: 'SEDOL', op: '', value: '', mm: 'oneof' },
        { attr: 'CUSIP', op: '', value: '', mm: 'oneof' },
        { attr: 'Issue Currency', op: '', value: '', mm: 'yes' },
      ] },
    { id: 'c2', name: 'Equity', sources: ['Bloomberg', 'LSEG'],
      details: [
        { attr: 'Asset Type', op: '=', value: 'EQ', mm: 'none' },
        { attr: 'SEDOL', op: '', value: '', mm: 'oneof' },
        { attr: 'ISIN', op: '', value: '', mm: 'oneof' },
        { attr: 'Exchange MIC', op: '', value: '', mm: 'yes' },
      ] },
    { id: 'c3', name: 'Manual override', sources: ['Manual'],
      details: [
        { attr: 'ISIN', op: '', value: '', mm: 'yes' },
      ] },
  ],
};

const MX_PARTY = {
  name: 'Party', code: 'PARTY', illType: 'Party', version: '20.1.15.0',
  idCol: 'EDM_PARTY_ID', idUi: 'EDM Party Id', inactive: 'Inactive', idStart: 500000000,
  options: { priority: 'Normal', batchSize: 1000, timeout: 120, runType: 'StandardRun',
             serviceUrl: 'localhost:1234', outputKeys: true, useSynonyms: true, useIgnores: true },
  advanced: { runMode: 'First Condition Pass', nullMultipliers: true, lowThreshold: 70, noThreshold: 30 },
  sources: [
    { name: 'GLEIF', code: 'GLEIF', view: 'VW_GLEIF_Party_Matcher', key: 'LEI', createIds: true },
    { name: 'Capital IQ', code: 'CIQ', view: 'VW_CIQ_Party_Matcher', key: 'CIQ_COMPANY_ID', createIds: true },
    { name: 'Manual', code: 'MANUAL', view: 'VW_Manual_Party_Matcher', key: 'MAN_PARTY_ID', createIds: true },
  ],
  attributes: [
    { name: 'LEI', type: 'NVARCHAR', weight: 100, rule: 'Equals', tol: '', primary: 'GLEIF', weak: false, info: false },
    { name: 'Legal Name', type: 'NVARCHAR', weight: 50, rule: 'Like', tol: '', primary: 'GLEIF', weak: false, info: false },
    { name: 'Country of Incorporation', type: 'NVARCHAR', weight: 20, rule: 'Equals', tol: '', primary: 'GLEIF', weak: true, info: false },
    { name: 'GICS Sector', type: 'NVARCHAR', weight: 10, rule: 'Equals', tol: '', primary: 'Capital IQ', weak: true, info: false },
    { name: 'Registered Address', type: 'NVARCHAR', weight: 0, rule: 'Like', tol: '', primary: '', weak: false, info: true },
  ],
  conditions: [
    { id: 'p1', name: 'LEI match', sources: ['GLEIF', 'Capital IQ', 'Manual'],
      details: [{ attr: 'LEI', op: '', value: '', mm: 'yes' }] },
    { id: 'p2', name: 'Name + Country', sources: ['Capital IQ', 'Manual'],
      details: [
        { attr: 'Legal Name', op: '', value: '', mm: 'yes' },
        { attr: 'Country of Incorporation', op: '', value: '', mm: 'yes' },
      ] },
  ],
};

const MX_FUND = {
  name: 'Fund', code: 'FUND', illType: 'Fund', version: '20.1.15.0',
  idCol: 'EDM_FUND_ID', idUi: 'EDM Fund Id', inactive: 'Inactive', idStart: 600000000,
  options: { priority: 'Normal', batchSize: 1000, timeout: 120, runType: 'StandardRun',
             serviceUrl: 'localhost:1234', outputKeys: true, useSynonyms: false, useIgnores: true },
  advanced: { runMode: 'Waterfall', nullMultipliers: false, lowThreshold: 70, noThreshold: 30 },
  sources: [
    { name: 'iLEVEL', code: 'ILV', view: 'VW_iLevel_Fund_Matcher', key: 'FUND_ID', createIds: true },
    { name: 'Manual', code: 'MANUAL', view: 'VW_Manual_Fund_Matcher', key: 'MAN_FUND_ID', createIds: true },
  ],
  attributes: [
    { name: 'Fund LEI', type: 'NVARCHAR', weight: 100, rule: 'Equals', tol: '', primary: 'iLEVEL', weak: false, info: false },
    { name: 'Fund Name', type: 'NVARCHAR', weight: 50, rule: 'Like', tol: '', primary: 'iLEVEL', weak: false, info: false },
    { name: 'Vintage Year', type: 'INT', weight: 20, rule: 'Equals', tol: '', primary: 'iLEVEL', weak: true, info: false },
    { name: 'Strategy', type: 'NVARCHAR', weight: 10, rule: 'Equals', tol: '', primary: 'iLEVEL', weak: true, info: false },
  ],
  conditions: [
    { id: 'f1', name: 'LEI match', sources: ['iLEVEL', 'Manual'],
      details: [{ attr: 'Fund LEI', op: '', value: '', mm: 'yes' }] },
  ],
};

// ---- Data Matcher seed data ----
const MX_PRICING = {
  name: 'Pricing Matcher', code: 'PRICING', illType: 'Pricing', version: '20.1.15.0', kind: 'data',
  idCol: 'EDM_PRICE_ID', idUi: 'EDM Price Id', inactive: 'Inactive', idStart: 900000000,
  options: { priority: 'Normal', batchSize: 5000, timeout: 60, runType: 'StandardRun', serviceUrl: 'localhost:1234', outputKeys: false, useSynonyms: false, useIgnores: false },
  advanced: { runMode: 'Waterfall', nullMultipliers: false, lowThreshold: 80, noThreshold: 50 },
  sources: [
    { name: 'Bloomberg', code: 'BBG', view: 'VW_Bloomberg_Price_Matcher', key: 'ID_BB_GLOBAL', createIds: false },
    { name: 'Markit',    code: 'MKT', view: 'VW_Markit_Price_Matcher',    key: 'MARKIT_ID',    createIds: false },
    { name: 'Reuters',   code: 'REU', view: 'VW_Reuters_Price_Matcher',   key: 'REUTERS_ID',   createIds: false },
  ],
  attributes: [
    { name: 'ISIN',       type: 'NVARCHAR', weight: 100, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: false, info: false },
    { name: 'Currency',   type: 'NCHAR',    weight:  40, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: true,  info: false },
    { name: 'Price Date', type: 'DATE',     weight:  60, rule: 'Equals', tol: 'Dates', primary: 'Bloomberg', weak: false, info: false },
    { name: 'Price Type', type: 'NVARCHAR', weight:  20, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: true,  info: false },
    { name: 'Security Name', type: 'NVARCHAR', weight: 0, rule: 'Like', tol: '', primary: '', weak: false, info: true },
  ],
  conditions: [
    { id: 'pc1', name: 'ISIN match', sources: ['Bloomberg', 'Markit', 'Reuters'],
      details: [{ attr: 'ISIN', op: '', value: '', mm: 'yes' }, { attr: 'Currency', op: '', value: '', mm: 'yes' }, { attr: 'Price Date', op: '', value: '', mm: 'yes' }] },
    { id: 'pc2', name: 'ISIN + type',  sources: ['Bloomberg', 'Markit'],
      details: [{ attr: 'ISIN', op: '', value: '', mm: 'yes' }, { attr: 'Price Type', op: '', value: '', mm: 'yes' }] },
  ],
};
const MX_REFERENCE = {
  name: 'Reference Matcher', code: 'REFERENCE', illType: 'Reference', version: '20.1.15.0', kind: 'data',
  idCol: 'EDM_REF_ID', idUi: 'EDM Reference Id', inactive: 'Inactive', idStart: 800000000,
  options: { priority: 'Low', batchSize: 2000, timeout: 120, runType: 'StandardRun', serviceUrl: 'localhost:1234', outputKeys: true, useSynonyms: true, useIgnores: true },
  advanced: { runMode: 'First Condition Pass', nullMultipliers: false, lowThreshold: 75, noThreshold: 40 },
  sources: [
    { name: 'Bloomberg', code: 'BBG', view: 'VW_Bloomberg_Ref_Matcher', key: 'ID_BB_GLOBAL', createIds: false },
    { name: 'LSEG',      code: 'LSG', view: 'VW_LSEG_Ref_Matcher',      key: 'ASSET_QUOTE_ID', createIds: false },
  ],
  attributes: [
    { name: 'ISIN',     type: 'NVARCHAR', weight: 100, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: false, info: false },
    { name: 'CUSIP',    type: 'NVARCHAR', weight:  80, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: false, info: false },
    { name: 'Ticker',   type: 'NVARCHAR', weight:  30, rule: 'Like',   tol: '', primary: 'Bloomberg', weak: true,  info: false },
    { name: 'Exchange', type: 'NVARCHAR', weight:  20, rule: 'Equals', tol: '', primary: 'Bloomberg', weak: true,  info: false },
  ],
  conditions: [
    { id: 'rc1', name: 'ISIN match', sources: ['Bloomberg', 'LSEG'],
      details: [{ attr: 'ISIN', op: '', value: '', mm: 'yes' }] },
    { id: 'rc2', name: 'CUSIP match', sources: ['Bloomberg'],
      details: [{ attr: 'CUSIP', op: '', value: '', mm: 'yes' }] },
  ],
};

const MX_MATCHERS = {
  'Pricing Matcher': MX_PRICING, 'Reference Matcher': MX_REFERENCE,
  Security: MX_SECURITY, Party: MX_PARTY, Fund: MX_FUND,
};

// ---- sample match results / exceptions for the Results tab ----
const MX_RESULTS = [
  { id: 'r1', core: 'EDM_SEC_ID 700014882 · APPLE INC 4.65% 2046', source: 'Bloomberg', srcKey: 'BBG000B9XRY4',
    score: 100, cond: 'Fixed Income', attrs: [['ISIN', true], ['CUSIP', true], ['Issue Currency', true], ['Asset Type', true]] },
  { id: 'r2', core: 'EDM_SEC_ID 700031245 · MSFT 3.30% 2027', source: 'LSEG', srcKey: '46625H100',
    score: 86, cond: 'Fixed Income', attrs: [['ISIN', true], ['SEDOL', true], ['Issue Currency', true], ['Maturity Date', false]] },
  { id: 'r3', core: 'EDM_SEC_ID 700044190 · VODAFONE GRP 2.20%', source: 'Manual', srcKey: 'MAN-2231',
    score: 58, cond: 'Default', attrs: [['ISIN', false], ['SEDOL', true], ['Security Name', true], ['Issue Currency', false]] },
  { id: 'r4', core: '(no core match)', source: 'Manual', srcKey: 'MAN-2240',
    score: 24, cond: 'Default', attrs: [['Security Name', true], ['Asset Type', false]] },
];
function qualityOf(score, adv) {
  if (score >= adv.lowThreshold) return 'good';
  if (score >= adv.noThreshold) return 'low';
  return 'no';
}

// ---- simulated AI helper (deterministic, with a small delay) ----
function useAiRun() {
  const [busy, setBusy] = React.useState(false);
  const run = (fn, ms = 900) => { setBusy(true); setTimeout(() => { fn(); setBusy(false); }, ms); };
  return [busy, run];
}

// ============================================================
// Tab panels
// ============================================================
function MxSources({ m }) {
  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="muted" style={{ marginBottom: 12 }}>
        Sources are illustrations over the aligned source tables (the 1000 loading solutions output). Each needs a Name and a short Code.
      </div>
      <div className="co-table">
        <div className="co-row head" style={{ gridTemplateColumns: '1.2fr 90px 1.6fr 1fr 110px' }}>
          <span>Source</span><span>Code</span><span>Row source view</span><span>Key field</span><span>Create new IDs</span>
        </div>
        {m.sources.map((s, i) => (
          <div key={i} className="co-row" style={{ gridTemplateColumns: '1.2fr 90px 1.6fr 1fr 110px' }}>
            <span className="co-comp"><span className="ci"><IcSource size={15} /></span>{s.name}</span>
            <span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }}>{s.code}</span>
            <span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 11.5, color: 'var(--ink-3)' }}>{s.view}</span>
            <span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 11.5 }}>{s.key}</span>
            <span>{s.createIds ? <span className="test-result pass"><IcCheck size={13} /> Yes</span> : <span className="muted">No</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MxOptions({ m }) {
  const o = m.options;
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 920 }}>
      <div className="kv-sec-label">Identity</div>
      <div className="props-grid" style={{ marginBottom: 18 }}>
        <div className="field" style={{ margin: 0 }}><label className="field-label">Matcher Id column name</label><input className="input" defaultValue={m.idCol} /></div>
        <div className="field" style={{ margin: 0 }}><label className="field-label">Matcher Id UI name</label><input className="input" defaultValue={m.idUi} /></div>
        <div className="field" style={{ margin: 0 }}><label className="field-label">InActive field</label><input className="input" defaultValue={m.inactive} /></div>
        <div className="field" style={{ margin: 0 }}><label className="field-label">Matcher Id sequence start</label><input className="input" defaultValue={m.idStart} /></div>
      </div>
      <div className="kv-sec-label">Processing</div>
      <div className="props-grid" style={{ marginBottom: 18 }}>
        <div className="field" style={{ margin: 0 }}><label className="field-label">Message priority</label>
          <div className="select-wrap"><select className="select" defaultValue={o.priority}><option>Low</option><option>Normal</option><option>High</option></select></div></div>
        <div className="field" style={{ margin: 0 }}><label className="field-label">Batch size</label><input className="input" type="number" defaultValue={o.batchSize} /></div>
        <div className="field" style={{ margin: 0 }}><label className="field-label">Timeout (seconds)</label><input className="input" type="number" defaultValue={o.timeout} /></div>
        <div className="field" style={{ margin: 0 }}><label className="field-label">Service URL</label><input className="input" defaultValue={o.serviceUrl} /></div>
        <div className="field" style={{ margin: 0 }}><label className="field-label">Run type</label>
          <div className="select-wrap"><select className="select" defaultValue={o.runType}><option>StandardRun</option><option>FullRefresh</option><option>SourceMonitorRefresh</option></select></div></div>
      </div>
      <label className="checkbox" style={{ marginBottom: 18 }}>
        <input type="checkbox" defaultChecked={o.outputKeys} /><span className="box"><IcCheck size={12} /></span>
        Populate output keys with updated record list
      </label>
      <div className="kv-sec-label">Fuzzy matching (Like rule type)</div>
      <div className="vstack" style={{ gap: 10 }}>
        <label className="checkbox"><input type="checkbox" defaultChecked={o.useSynonyms} /><span className="box"><IcCheck size={12} /></span> Use synonyms table (string abbreviations → primary value)</label>
        <label className="checkbox"><input type="checkbox" defaultChecked={o.useIgnores} /><span className="box"><IcCheck size={12} /></span> Use ignores table (punctuation & noise stripped before matching)</label>
      </div>
    </div>
  );
}

function MxAdvanced({ m, onChange }) {
  const a = m.advanced;
  const [busy, run] = useAiRun();
  const [aiOpen, setAiOpen] = React.useState(false);
  function recommend() {
    run(() => {
      onChange({ ...m, advanced: { ...a, lowThreshold: 75, noThreshold: 35 } });
      setAiOpen(true);
      ruleToast('AI tuned thresholds from the score distribution', 'success');
    });
  }
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 920 }}>
      <div className="kv-sec-label">Run mode</div>
      <div className="vstack" style={{ gap: 10, marginBottom: 18 }}>
        <label className="radio" style={{ alignItems: 'flex-start' }}>
          <input type="radio" checked={a.runMode === 'First Condition Pass'} onChange={() => onChange({ ...m, advanced: { ...a, runMode: 'First Condition Pass' } })} />
          <span className="rdot" style={{ marginTop: 3 }} />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ fontSize: 13 }}>First Condition Pass</strong>
            <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Uses source filter + attribute conditions only. Best for simple, small-scale matching.</span>
          </span>
        </label>
        <label className="radio" style={{ alignItems: 'flex-start' }}>
          <input type="radio" checked={a.runMode === 'Waterfall'} onChange={() => onChange({ ...m, advanced: { ...a, runMode: 'Waterfall' } })} />
          <span className="rdot" style={{ marginTop: 3 }} />
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ fontSize: 13 }}>Waterfall</strong>
            <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Adds the must-match (Yes / One-of) criteria when deciding if a condition applies — falls through to the next condition otherwise.</span>
          </span>
        </label>
      </div>

      <div className="kv-sec-label">Null scores</div>
      <label className="checkbox" style={{ marginBottom: 18 }}>
        <input type="checkbox" checked={a.nullMultipliers} onChange={e => onChange({ ...m, advanced: { ...a, nullMultipliers: e.target.checked } })} />
        <span className="box"><IcCheck size={12} /></span>
        Enable Null Match score multipliers (score null↔null & null-in-source by attribute weight)
      </label>

      <div className="kv-sec-label">Quality match thresholds</div>
      <div className="hstack" style={{ gap: 8, marginBottom: 10 }}>
        <button className="btn" onClick={recommend} disabled={busy}
                style={{ background: '#6d28d9', borderColor: '#6d28d9', color: '#fff' }}>
          {busy ? <span className="ai-thinking" style={{ color: '#fff' }}><svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.4)" strokeWidth="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg> Analyzing…</span> : <><IcSparkle size={13} /> AI tune thresholds</>}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>Recommends Low / No-match cut-offs from the live score histogram.</span>
      </div>
      {aiOpen && (
        <div className="ai-panel">
          <div className="ai-panel-head"><IcSparkle size={15} /> Threshold recommendation <span className="ai-badge">AI</span></div>
          <div className="ai-panel-body">
            <div className="ai-suggestion"><IcInfo size={15} className="ai-ic" />
              <span className="ai-txt">Score distribution is bimodal with a gap at <strong>72–76</strong>. Raising <strong>Low Quality</strong> to <strong>75</strong> captures the clean cluster; <strong>No Match</strong> at <strong>35</strong> isolates the long tail of single-attribute hits. Estimated effect: <strong>−18% low-quality exceptions</strong>, no change to auto-accepted matches.</span>
            </div>
          </div>
        </div>
      )}
      <div className="props-grid" style={{ maxWidth: 560 }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-label">Low Quality Match Threshold — {a.lowThreshold}%</label>
          <input type="range" min="40" max="95" value={a.lowThreshold}
                 onChange={e => onChange({ ...m, advanced: { ...a, lowThreshold: +e.target.value } })}
                 style={{ width: '100%', accentColor: 'var(--magenta)' }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="field-label">No Match Threshold — {a.noThreshold}%</label>
          <input type="range" min="0" max="60" value={a.noThreshold}
                 onChange={e => onChange({ ...m, advanced: { ...a, noThreshold: +e.target.value } })}
                 style={{ width: '100%', accentColor: 'var(--magenta)' }} />
        </div>
      </div>
      <div className="hstack" style={{ gap: 8, marginTop: 18 }}>
        <button className="btn"><IcReset size={14} /> Clear source monitor</button>
        <button className="btn"><IcRedo size={14} /> Recalculate source monitor</button>
      </div>
    </div>
  );
}

function MxAttributes({ m, onChange }) {
  const [busy, run] = useAiRun();
  const [ai, setAi] = React.useState(null);
  function setWeight(i, w) {
    const attrs = m.attributes.map((a, j) => j === i ? { ...a, weight: Math.max(0, Math.min(100, +w || 0)) } : a);
    onChange({ ...m, attributes: attrs });
  }
  function suggest() {
    run(() => {
      setAi([
        { t: <><strong>SEDOL (100)</strong> and <strong>CUSIP (80)</strong> are your most unique identifiers — keep them highest.</> },
        { t: <>Consider raising <strong>ISIN</strong> 60 → <strong>90</strong>: it's populated in {Math.round(98)}% of source rows and rarely collides.</> },
        { t: <>Mark <strong>Issue Currency</strong>, <strong>Exchange MIC</strong>, <strong>Asset Type</strong>, <strong>Security Type</strong> as <strong>Weak</strong> — low uniqueness, high recompute cost.</> },
        { t: <><strong>Security Name</strong> is Informational (weight 0) — switch its rule to <strong>Like</strong> with the synonyms table if you want it to contribute.</> },
      ]);
    });
  }
  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="hstack" style={{ marginBottom: 12, gap: 8 }}>
        <span className="muted">Each attribute needs a weight and a rule type. At least one non-informational attribute must have weight &gt; 0.</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={suggest} disabled={busy}
                style={{ background: '#6d28d9', borderColor: '#6d28d9', color: '#fff' }}>
          {busy ? <span className="ai-thinking" style={{ color: '#fff' }}><svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.4)" strokeWidth="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg> Profiling…</span> : <><IcSparkle size={13} /> Suggest weights</>}
        </button>
      </div>
      {ai && (
        <div className="ai-panel">
          <div className="ai-panel-head"><IcSparkle size={15} /> Attribute & weight suggestions <span className="ai-badge">AI</span></div>
          <div className="ai-panel-body">
            {ai.map((s, i) => (
              <div key={i} className="ai-suggestion"><IcSparkle size={15} className="ai-ic" /><span className="ai-txt">{s.t}</span></div>
            ))}
            <div className="hstack" style={{ gap: 8, marginTop: 4 }}>
              <button className="btn primary" onClick={() => { setWeight(2, 90); ruleToast('Applied: ISIN weight → 90', 'success'); setAi(null); }}>Apply ISIN → 90</button>
              <button className="btn" onClick={() => setAi(null)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-attr-grid">
        <div className="mx-attr-head">
          <span>#</span><span>Attribute</span><span>Primary source</span><span>Weight</span><span>Rule type</span><span>Tolerance</span><span>Weak</span><span>Info</span>
        </div>
        {m.attributes.map((a, i) => (
          <div key={i} className={`mx-attr-row ${a.info ? 'informational' : ''}`}>
            <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{i + 1}</span>
            <span className="mx-attr-name">{a.name}<span style={{ fontSize: 10, color: 'var(--ink-5)', fontFamily: 'Menlo,Consolas,monospace' }}>{a.type}</span></span>
            <span style={{ color: 'var(--ink-3)' }}>{a.primary || '—'}</span>
            <span>
              <input className="mx-weight-input" type="number" min="0" max="100" value={a.weight}
                     disabled={a.info} onChange={e => setWeight(i, e.target.value)} />
              <div className="mx-weight-bar"><i style={{ width: a.weight + '%' }} /></div>
            </span>
            <span>
              <div className="select-wrap"><select className="select" defaultValue={a.rule} disabled={a.info}
                     style={{ padding: '5px 24px 5px 8px', fontSize: 12 }}>{MX_RULE_TYPES.map(r => <option key={r}>{r}</option>)}</select></div>
            </span>
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{a.tol || '—'}</span>
            <span><label className="checkbox"><input type="checkbox" checked={a.weak} disabled={a.info}
                     onChange={e => onChange({ ...m, attributes: m.attributes.map((x, j) => j === i ? { ...x, weak: e.target.checked } : x) })} /><span className="box"><IcCheck size={12} /></span></label></span>
            <span><label className="checkbox"><input type="checkbox" checked={a.info}
                     onChange={e => onChange({ ...m, attributes: m.attributes.map((x, j) => j === i ? { ...x, info: e.target.checked } : x) })} /><span className="box"><IcCheck size={12} /></span></label></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MxConditions({ m, onChange }) {
  const [sel, setSel] = React.useState(m.conditions[0]?.id);
  const [dragId, setDragId] = React.useState(null);
  const [nl, setNl] = React.useState('');
  const [busy, run] = useAiRun();
  const [aiCond, setAiCond] = React.useState(null);

  const cond = m.conditions.find(c => c.id === sel);
  function reorder(overId) {
    if (!dragId || dragId === overId) return;
    const arr = [...m.conditions];
    const from = arr.findIndex(c => c.id === dragId), to = arr.findIndex(c => c.id === overId);
    const [x] = arr.splice(from, 1); arr.splice(to, 0, x);
    onChange({ ...m, conditions: arr });
  }
  function generate() {
    if (!nl.trim()) return;
    run(() => {
      // crude NL → condition: pick up known attribute names + must-match cues
      const text = nl.toLowerCase();
      const details = [];
      m.attributes.forEach(a => {
        if (text.includes(a.name.toLowerCase())) {
          const oneof = /\bor\b/.test(text);
          details.push({ attr: a.name, op: '', value: '', mm: oneof && /isin|cusip|sedol|lei/i.test(a.name) ? 'oneof' : 'yes' });
        }
      });
      if (!details.length) details.push({ attr: m.attributes[0].name, op: '', value: '', mm: 'yes' });
      setAiCond({ name: nl.length > 28 ? nl.slice(0, 28) + '…' : nl, sources: m.sources.map(s => s.name), details });
    });
  }
  function acceptAi() {
    const c = { id: 'ai-' + Date.now(), ...aiCond };
    onChange({ ...m, conditions: [...m.conditions.slice(0, -0), c] });
    setSel(c.id); setAiCond(null); setNl('');
    ruleToast('AI condition added', 'success');
  }

  return (
    <div style={{ padding: '16px 24px 32px', display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <div className="ai-panel">
          <div className="ai-panel-head"><IcSparkle size={15} /> Describe a rule <span className="ai-badge">AI</span></div>
          <div className="ai-panel-body">
            <div className="ai-input-row">
              <input className="input" placeholder="e.g. match on ISIN or CUSIP, must match currency"
                     value={nl} onChange={e => setNl(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()} />
              <button className="btn primary" onClick={generate} disabled={busy || !nl.trim()}>
                {busy ? 'Building…' : 'Generate'}
              </button>
            </div>
            {aiCond && (
              <div style={{ marginTop: 10 }}>
                <div className="ai-suggestion"><IcCircleCheck size={15} className="ai-ic" />
                  <span className="ai-txt">Proposed <strong>{aiCond.name}</strong> — {aiCond.details.length} attribute(s): {aiCond.details.map(d => `${d.attr}${d.mm === 'oneof' ? ' (one-of)' : d.mm === 'yes' ? ' (must)' : ''}`).join(', ')}</span>
                </div>
                <div className="hstack" style={{ gap: 8 }}>
                  <button className="btn primary" onClick={acceptAi}>Add condition</button>
                  <button className="btn" onClick={() => setAiCond(null)}>Discard</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="hstack" style={{ marginBottom: 8, gap: 6 }}>
          <span className="kv-sec-label" style={{ margin: 0 }}>Conditions (top-down order)</span>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => { const c = { id: 'n' + Date.now(), name: 'New condition', sources: m.sources.map(s => s.name), details: [] }; onChange({ ...m, conditions: [...m.conditions, c] }); setSel(c.id); }}>
            <IcPlus size={13} /> New
          </button>
        </div>
        {m.conditions.map((c, i) => (
          <div key={c.id} className={`cond-row ${sel === c.id ? 'active' : ''}`}
               draggable onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)}
               onDragOver={e => { e.preventDefault(); reorder(c.id); }}
               onClick={() => setSel(c.id)}>
            <span className="cond-grip">⋮⋮</span>
            <span className="cond-ord">{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cond-name">{c.name}</div>
              <div className="cond-srcs">{c.sources.map(s => <span key={s} className="cond-src">{s}</span>)}</div>
            </div>
            <span className="muted" style={{ fontSize: 11 }}>{c.details.length} attr</span>
          </div>
        ))}
        <div className="cond-row default">
          <span className="cond-ord" style={{ background: 'var(--ink-5)', color: '#fff' }}>∞</span>
          <div style={{ flex: 1 }}>
            <div className="cond-name">Default condition</div>
            <div className="muted" style={{ fontSize: 11 }}>Matches all attributes for all sources · evaluated last · not editable</div>
          </div>
        </div>
      </div>

      <div>
        <div className="kv-sec-label">{cond ? `${cond.name} — details` : 'Select a condition'}</div>
        {cond && (
          <div className="kv-table">
            <div className="kv-head" style={{ gridTemplateColumns: '1.3fr 1fr 0.8fr 100px' }}>
              <span>Attribute</span><span>Condition</span><span>Weight</span><span>Must match</span>
            </div>
            {cond.details.map((d, i) => {
              const attr = m.attributes.find(a => a.name === d.attr);
              return (
                <div key={i} className="kv-row" style={{ gridTemplateColumns: '1.3fr 1fr 0.8fr 100px' }}>
                  <span style={{ fontWeight: 500 }}>{d.attr}</span>
                  <span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12, color: d.op ? 'var(--ink)' : 'var(--ink-5)' }}>
                    {d.op ? `${d.op} ${d.value}` : '—'}
                  </span>
                  <span style={{ color: 'var(--ink-3)' }}>{attr ? attr.weight : '—'}</span>
                  <span>
                    {d.mm === 'yes' && <span className="mm-pill mm-yes">Must</span>}
                    {d.mm === 'oneof' && <span className="mm-pill mm-oneof">One of</span>}
                    {d.mm === 'excluded' && <span className="mm-pill mm-excluded">Excluded</span>}
                    {(!d.mm || d.mm === 'none') && <span className="mm-pill mm-none">—</span>}
                  </span>
                </div>
              );
            })}
            {cond.details.length === 0 && <div className="dtable-empty">No attribute conditions. Add attributes or generate from a description.</div>}
          </div>
        )}
        {cond && (
          <div className="muted" style={{ fontSize: 12, marginTop: 10, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <IcInfo size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            {m.advanced.runMode === 'Waterfall'
              ? 'Waterfall: a record must pass source filter, attribute filters AND the must-match set, or evaluation falls through to the next condition.'
              : 'First Condition Pass: a record is evaluated on source filter + attribute filters; must-match only affects scoring, not condition selection.'}
          </div>
        )}
      </div>
    </div>
  );
}

function MxResults({ m }) {
  const [busy, run] = useAiRun();
  const [explain, setExplain] = React.useState(null);
  const counts = { good: 0, low: 0, no: 0 };
  MX_RESULTS.forEach(r => counts[qualityOf(r.score, m.advanced)]++);
  function doExplain(r) {
    run(() => {
      const hit = r.attrs.filter(a => a[1]).map(a => a[0]);
      const miss = r.attrs.filter(a => !a[1]).map(a => a[0]);
      setExplain({
        id: r.id,
        text: <>Matched via the <strong>{r.cond}</strong> condition. Scored <strong>{r.score}%</strong> from agreeing attributes ({hit.join(', ') || 'none'}).{miss.length ? <> Lost points on {miss.join(', ')}.</> : ''} {r.score < m.advanced.lowThreshold && r.score >= m.advanced.noThreshold ? 'Below the Low-Quality threshold → routed to exceptions for review.' : r.score < m.advanced.noThreshold ? 'Below the No-Match threshold → treated as a new Core record candidate.' : 'Above threshold → auto-accepted.'}</>,
        action: r.score >= m.advanced.lowThreshold ? 'Accept match' : r.score >= m.advanced.noThreshold ? 'Review — likely the same security; confirm Maturity Date' : 'Create new Core record',
      });
    });
  }
  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="dl-stats" style={{ maxWidth: 620 }}>
        <div className="dl-stat"><div className="v" style={{ color: '#15803d' }}>{counts.good}</div><div className="k">Quality matches</div></div>
        <div className="dl-stat"><div className="v" style={{ color: '#b45309' }}>{counts.low}</div><div className="k">Low-quality (exceptions)</div></div>
        <div className="dl-stat"><div className="v" style={{ color: '#b91c1c' }}>{counts.no}</div><div className="k">No match</div></div>
      </div>
      <div className="muted" style={{ marginBottom: 10 }}>Results Manager — source matches against the Core Record. Thresholds: ≥{m.advanced.lowThreshold}% quality, {m.advanced.noThreshold}–{m.advanced.lowThreshold}% low, &lt;{m.advanced.noThreshold}% no match.</div>
      {MX_RESULTS.map(r => {
        const q = qualityOf(r.score, m.advanced);
        return (
          <div key={r.id} className="rel-card" style={{ cursor: 'default' }}>
            <div className="rel-card-head" style={{ marginBottom: 8 }}>
              <span className="rel-name" style={{ fontSize: 14 }}>{r.core}</span>
              <span className="cond-src">{r.source}</span>
              <span className="rel-tag">{r.srcKey}</span>
              <span className="spacer" style={{ flex: 1 }} />
              <span className={`mx-q-tag mx-q-${q}`}>{q === 'good' ? 'Quality' : q === 'low' ? 'Low quality' : 'No match'}</span>
            </div>
            <div className="hstack" style={{ gap: 12, marginBottom: 8 }}>
              <span className={`mx-score mx-q-${q}`}><span className="bar"><i style={{ width: r.score + '%' }} /></span></span>
              <strong style={{ fontSize: 13 }}>{r.score}%</strong>
              <span className="muted" style={{ fontSize: 12 }}>via {r.cond}</span>
              <span className="spacer" style={{ flex: 1 }} />
              <button className="btn ghost" style={{ fontSize: 12, color: '#6d28d9' }} onClick={() => doExplain(r)} disabled={busy}>
                <IcSparkle size={13} /> Why did this match?
              </button>
            </div>
            <div className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
              {r.attrs.map(([name, hit], i) => (
                <span key={i} className="mp-tag" style={{ background: hit ? '#d1fae5' : '#fee2e2', color: hit ? '#065f46' : '#991b1b' }}>
                  {hit ? '✓' : '✗'} {name}
                </span>
              ))}
            </div>
            {explain && explain.id === r.id && (
              <div className="ai-panel" style={{ marginTop: 10, marginBottom: 0 }}>
                <div className="ai-panel-head"><IcSparkle size={15} /> Match explanation <span className="ai-badge">AI</span></div>
                <div className="ai-panel-body">
                  <div className="ai-suggestion"><IcInfo size={15} className="ai-ic" /><span className="ai-txt">{explain.text}</span></div>
                  <div className="ai-suggestion" style={{ borderColor: '#c4b5fd' }}><IcThumbUp size={15} className="ai-ic" /><span className="ai-txt"><strong>Suggested action:</strong> {explain.action}</span></div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Main Matcher screen
// ============================================================
const MX_TABS = [
  { id: 'sources', label: 'Sources' },
  { id: 'options', label: 'Options' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'attrs', label: 'Matching Attributes' },
  { id: 'conds', label: 'Match Conditions' },
  { id: 'results', label: 'Results' },
];

function Matcher() {
  const [matchers, setMatchers] = React.useState(MX_MATCHERS);
  const [selected, setSelected] = React.useState('Security');
  const [tab, setTab] = React.useState('attrs');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);

  const m = matchers[selected];
  const compKey = 'matcher:' + selected;
  const collab = useCollab();
  const compState = collab.components[compKey];
  const locked = !compState || compState.status !== 'me';

  function update(next) { setMatchers({ ...matchers, [selected]: next }); }

  const allNames = Object.keys(matchers).filter(n => n.toLowerCase().includes(filter.toLowerCase()));
  const dataNames = allNames.filter(n => matchers[n].kind === 'data');
  const coreNames = allNames.filter(n => !matchers[n].kind);

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">Matcher</span>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}><IcChevDoubleLeft size={16} /></button>
          </div>
          <div className="wb-list-search">
            <div className="wb-list-search-wrap">
              <IcSearch size={14} />
              <input className="input" placeholder="Filter matchers…" value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
          </div>
          <div className="wb-list-items" style={{ padding: 0 }}>
            {[{ label: 'Data Matcher', kind: 'data', names: dataNames }, { label: 'Core Matcher', kind: 'core', names: coreNames }].map(sec => (
              sec.names.length === 0 ? null : (
                <div key={sec.kind}>
                  <div style={{ padding: '6px 14px 4px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-4)' }}>
                    {sec.label}
                  </div>
                  {sec.names.map(n => (
                    <div key={n} className={`wb-list-item ${n === selected ? 'active' : ''}`}
                         onClick={() => setSelected(n)} style={{ gap: 10, paddingLeft: 20 }}>
                      <IcMatcher size={15} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                        <span style={{ fontWeight: 500 }}>{n}</span>
                        <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{matchers[n].sources.length} sources · {matchers[n].attributes.length} attrs</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ))}
          </div>
        </div>
      )}

      <div className="wb-body">
        <div className="wb-body-head">
          {!sidebarOpen && (
            <button className="icon-btn" style={{ float: 'left', marginRight: 12 }} onClick={() => setSidebarOpen(true)}><IcChevDoubleRight size={16} /></button>
          )}
          <div className="title-row">
            <span className="head-icon"><IcMatcher size={18} /></span>
            <h1>
              {m.name} <span style={{ color: 'var(--ink-4)', fontWeight: 400, fontSize: 14 }}>· {m.code}</span>
              <span className="ver-pill">EDM {m.version} <IcChevDown size={10} /></span>
            </h1>
            <div className="right hstack" style={{ gap: 6 }}>
              <span className="env-pill" style={{ background: '#ede9fe', color: '#5b21b6' }}>
                <IcGitBranch size={11} /> {m.advanced.runMode}
              </span>
              <button className="ai-star" title="AI Assist"><IcSparkle size={16} /></button>
            </div>
          </div>
          <div className="desc">Matches source records to a Core Record across {m.sources.map(s => s.name).join(', ')} · ID column {m.idCol}.</div>
        </div>

        <CheckoutBar componentKey={compKey} label={m.name + ' Matcher'} type="Matcher"
                     onOpenHistory={() => setShowHistory(true)} />
        {showHistory && <HistoryModal componentKey={compKey} label={m.name + ' Matcher'} onClose={() => setShowHistory(false)} />}

        <div className="wb-body-toolbar">
          <button className="btn ghost" onClick={() => ruleToast('Saved', 'success')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save
          </button>
          <button className="btn primary" onClick={() => ruleToast('Verifying & creating database objects…', 'info')}>
            <IcCheck size={14} /> Verify & Create
          </button>
          <div className="tool-sep" />
          <button className="icon-btn" title="Run the matcher" onClick={() => ruleToast('Core Matcher run queued', 'info')}><IcPlay size={14} /></button>
          <button className="icon-btn" title="Reset" onClick={() => ruleToast('Matcher reset', 'info')}><IcReset size={15} /></button>
          <div className="spacer" />
          <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                  onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from Matcher')}>
            <IcShield size={16} />
          </button>
        </div>

        <div className="tabs" style={{ padding: '0 24px', margin: 0, borderBottom: '1px solid var(--line)' }}>
          {MX_TABS.map(tb => (
            <button key={tb.id} className={`tab ${tab === tb.id ? 'active' : ''}`} onClick={() => setTab(tb.id)}>{tb.label}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {tab === 'sources' && <MxSources m={m} />}
          {tab === 'options' && <MxOptions m={m} />}
          {tab === 'advanced' && <MxAdvanced m={m} onChange={update} />}
          {tab === 'attrs' && <MxAttributes m={m} onChange={update} />}
          {tab === 'conds' && <MxConditions m={m} onChange={update} />}
          {tab === 'results' && <MxResults m={m} />}
        </div>
      </div>
    </div>
  );
}

window.Matcher = Matcher;
