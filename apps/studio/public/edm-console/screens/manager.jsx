// ============================================================
// Data Manager — view, compare & edit matched data across sources
//   Function tabs: Function Attributes (Illustration Template + Key +
//   sources w/ Editable/Override/Update-from-Override) · Field Groups ·
//   Field Control (Visible/Editable/Constrain) · Validation Rules ·
//   Quick Searches · Launch Processes.
//   Inbox: side-by-side source comparison on a common key with
//   Highlight Differences, inline edit, and drag-drop across sources.
//   AI: best-value (survivorship) suggestions, explain differences,
//   auto-resolve conflicts, NL→validation.
// Seeded from real .MG.xml (Security, Party, Price, …).
// ============================================================

const MG_FUNCTIONS = {
  'Security': {
    name: 'Security', code: 'MGSEC', version: '20.1.15.0', template: 'Security Master Template', key: 'EDM_SEC_ID',
    roleBased: true,
    sources: [
      { name: 'Master Security', grid: 'Master', editable: false, override: false, fromOverride: false, nonStd: false, master: true },
      { name: 'Bloomberg', grid: 'BBG', editable: false, override: false, fromOverride: true, nonStd: false },
      { name: 'LSEG', grid: 'LSEG', editable: false, override: false, fromOverride: true, nonStd: false },
      { name: 'Manual Override', grid: 'Override', editable: true, override: true, fromOverride: false, nonStd: false, gen: 'Manual Security Create' },
    ],
    groups: ['Identifiers', 'Terms', 'Classification'],
    fields: [
      { name: 'SECURITY_NAME', group: 'Identifiers', illustrated: true, visible: true, editable: true, constrain: false },
      { name: 'ISIN', group: 'Identifiers', illustrated: true, visible: true, editable: true, constrain: false },
      { name: 'CUSIP', group: 'Identifiers', illustrated: true, visible: true, editable: true, constrain: false },
      { name: 'ASSET_TYPE', group: 'Classification', illustrated: true, visible: true, editable: true, constrain: true, decode: 'AssetType' },
      { name: 'CURRENCY', group: 'Terms', illustrated: true, visible: true, editable: true, constrain: true, decode: 'Currency' },
      { name: 'MATURITY_DATE', group: 'Terms', illustrated: true, visible: true, editable: true, constrain: false },
      { name: 'COUPON', group: 'Terms', illustrated: true, visible: true, editable: true, constrain: false },
    ],
    validation: [
      { id: 'v1', desc: 'Override needs expiry & comment', msg: 'You applied an override but did not set an expiry date and/or comment.', enabled: true, override: true, field: 'All editable fields' },
      { id: 'v2', desc: 'Currency in ISO 4217', msg: 'Currency must be a valid ISO 4217 code.', enabled: true, override: false, field: 'CURRENCY' },
    ],
    searches: ['ISIN', 'CUSIP', 'Security Name'],
    processes: ['Master Security', 'Distribute Security Changes'],
    // per-field values across sources (inbox)
    rows: {
      SECURITY_NAME: { Master: 'APPLE INC 4.65% 11/46', BBG: 'APPLE INC 4.65 2046', LSEG: 'APPLE INC 4.65% 2046', Override: '' },
      ISIN: { Master: 'US037833AL42', BBG: 'US037833AL42', LSEG: 'US037833AL42', Override: '' },
      CUSIP: { Master: '037833AL4', BBG: '037833AL4', LSEG: '037833AL4', Override: '' },
      ASSET_TYPE: { Master: 'FI', BBG: 'FI', LSEG: 'CORP', Override: '' },
      CURRENCY: { Master: 'USD', BBG: 'USD', LSEG: 'USD', Override: '' },
      MATURITY_DATE: { Master: '2046-11-23', BBG: '2046-11-23', LSEG: '2046-11-24', Override: '' },
      COUPON: { Master: '4.65', BBG: '4.65', LSEG: '465', Override: '' },
    },
    decodes: { AssetType: ['FI', 'EQ', 'FX', 'DER', 'FND'], Currency: ['USD', 'EUR', 'GBP', 'JPY', 'CHF'] },
  },
  'Party': {
    name: 'Party', code: 'MGPARTY', version: '20.1.15.0', template: 'Party Master Template', key: 'EDM_PARTY_ID',
    roleBased: true,
    sources: [
      { name: 'Master Party', grid: 'Master', editable: false, master: true },
      { name: 'GLEIF', grid: 'GLEIF', editable: false, fromOverride: true },
      { name: 'Capital IQ', grid: 'CIQ', editable: false, fromOverride: true },
      { name: 'Manual Override', grid: 'Override', editable: true, override: true, gen: 'Manual Party Create' },
    ],
    groups: ['Identity', 'Classification'],
    fields: [
      { name: 'LEGAL_NAME', group: 'Identity', illustrated: true, visible: true, editable: true, constrain: false },
      { name: 'LEI', group: 'Identity', illustrated: true, visible: true, editable: true, constrain: false },
      { name: 'COUNTRY', group: 'Identity', illustrated: true, visible: true, editable: true, constrain: true, decode: 'Country' },
      { name: 'GICS_SECTOR', group: 'Classification', illustrated: true, visible: true, editable: true, constrain: true, decode: 'GICS' },
    ],
    validation: [{ id: 'v1', desc: 'LEI is 20 chars', msg: 'LEI must be exactly 20 characters.', enabled: true, override: false, field: 'LEI' }],
    searches: ['LEI', 'Legal Name'],
    processes: ['Master Party'],
    rows: {
      LEGAL_NAME: { Master: 'Vodafone Group Plc', GLEIF: 'VODAFONE GROUP PUBLIC LIMITED COMPANY', CIQ: 'Vodafone Group plc', Override: '' },
      LEI: { Master: '213800XZAGORV9B5Jls', GLEIF: '213800XZAGORV9B5Jls', CIQ: '', Override: '' },
      COUNTRY: { Master: 'GB', GLEIF: 'GB', CIQ: 'UK', Override: '' },
      GICS_SECTOR: { Master: '50', GLEIF: '', CIQ: '50', Override: '' },
    },
    decodes: { Country: ['US', 'GB', 'DE', 'JP', 'SG'], GICS: ['10', '20', '30', '40', '50'] },
  },
  'Price': {
    name: 'Price', code: 'MGPRICE', version: '20.1.15.0', template: 'Price Master Template', key: 'EDM_SEC_ID',
    roleBased: false,
    sources: [
      { name: 'Master Price', grid: 'Master', editable: false, master: true },
      { name: 'Bloomberg BVAL', grid: 'BVAL', editable: false, fromOverride: true },
      { name: 'LSEG', grid: 'LSEG', editable: false, fromOverride: true },
      { name: 'Manual Override', grid: 'Override', editable: true, override: true, gen: 'Manual Price Create' },
    ],
    groups: ['Price'],
    fields: [
      { name: 'PRICE', group: 'Price', illustrated: true, visible: true, editable: true, constrain: false },
      { name: 'PRICE_CCY', group: 'Price', illustrated: true, visible: true, editable: true, constrain: true, decode: 'Currency' },
      { name: 'PRICE_DATE', group: 'Price', illustrated: true, visible: true, editable: false, constrain: false },
      { name: 'SOURCE', group: 'Price', illustrated: true, visible: true, editable: false, constrain: false },
    ],
    validation: [],
    searches: ['ISIN'],
    processes: ['Master Price'],
    rows: {
      PRICE: { Master: '98.21', BVAL: '98.21', LSEG: '98.25', Override: '' },
      PRICE_CCY: { Master: 'USD', BVAL: 'USD', LSEG: 'USD', Override: '' },
      PRICE_DATE: { Master: '2026-05-29', BVAL: '2026-05-29', LSEG: '2026-05-28', Override: '' },
      SOURCE: { Master: 'BVAL', BVAL: 'BVAL', LSEG: 'LSEG', Override: '' },
    },
    decodes: { Currency: ['USD', 'EUR', 'GBP', 'JPY'] },
  },
};

const MG_TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'attrs', label: 'Function Attributes' },
  { id: 'fields', label: 'Field Control' },
  { id: 'valid', label: 'Validation Rules' },
  { id: 'search', label: 'Searches & Processes' },
];

function useAiRunM() {
  const [busy, setBusy] = React.useState(false);
  const run = (fn, ms = 900) => { setBusy(true); setTimeout(() => { fn(); setBusy(false); }, ms); };
  return [busy, run];
}
function AiSpinM({ label }) {
  return <span className="ai-thinking" style={{ color: '#fff' }}>
    <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.4)" strokeWidth="2.5"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg> {label}
  </span>;
}

// ---- Inbox: source comparison grid (the hero) ----
function MgInbox({ fn, onChange }) {
  const [highlight, setHighlight] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [busy, run] = useAiRunM();
  const [ai, setAi] = React.useState(null);
  const [dragVal, setDragVal] = React.useState(null);

  const srcs = fn.sources;
  const visFields = fn.fields.filter(f => f.visible);
  const groups = fn.groups;

  function diff(field) {
    const vals = srcs.filter(s => !s.master).map(s => fn.rows[field.name][s.grid]).filter(v => v !== '' && v != null);
    return new Set(vals).size > 1;
  }
  function setCell(field, grid, value) {
    onChange({ ...fn, rows: { ...fn.rows, [field.name]: { ...fn.rows[field.name], [grid]: value } } });
  }
  function aiBestValue() {
    run(() => {
      const suggestions = [];
      visFields.forEach(f => {
        if (diff(f)) {
          // pick master if present else first non-empty, with reasoning
          const row = fn.rows[f.name];
          let pick = row.Master || Object.values(row).find(v => v); 
          let why = 'matches Master';
          if (f.name === 'ASSET_TYPE') { pick = 'FI'; why = 'BBG + Master agree (FI); LSEG "CORP" is a vendor synonym'; }
          if (f.name === 'MATURITY_DATE') { pick = '2046-11-23'; why = 'BBG + Master agree; LSEG off-by-one (settlement vs maturity)'; }
          if (f.name === 'COUPON') { pick = '4.65', why = 'LSEG "465" is unscaled bps — Master/BBG 4.65 correct'; }
          if (f.name === 'LEGAL_NAME') { pick = 'Vodafone Group plc'; why = 'CIQ casing preferred; GLEIF all-caps'; }
          if (f.name === 'COUNTRY') { pick = 'GB'; why = 'CIQ "UK" is non-ISO; GB correct'; }
          suggestions.push({ field: f.name, pick, why });
        }
      });
      setAi(suggestions);
    }, 1100);
  }
  function applyAi() {
    let next = { ...fn, rows: { ...fn.rows } };
    ai.forEach(s => { next.rows[s.field] = { ...next.rows[s.field], Override: s.pick }; });
    onChange(next);
    setAi(null); setEditing(true);
    ruleToast(`Applied ${ai.length} best-value suggestions to Override`, 'success');
  }

  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="hstack" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <span className="muted">Comparing <strong>{srcs.length} sources</strong> on {fn.key}. {fn.roleBased ? 'Role-based editing (CADIS_MG_DATAADMIN).' : ''}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <label className="checkbox" style={{ fontSize: 12 }}><input type="checkbox" checked={highlight} onChange={e => setHighlight(e.target.checked)} /><span className="box"><IcCheck size={12} /></span> Highlight differences</label>
        <label className="checkbox" style={{ fontSize: 12 }}><input type="checkbox" checked={editing} onChange={e => setEditing(e.target.checked)} /><span className="box"><IcCheck size={12} /></span> Enable editing</label>
        <button className="btn" onClick={aiBestValue} disabled={busy} style={{ background: '#6d28d9', borderColor: '#6d28d9', color: '#fff' }}>
          {busy ? <AiSpinM label="Analyzing…" /> : <><IcSparkle size={13} /> AI best value</>}
        </button>
      </div>

      {ai && (
        <div className="ai-panel">
          <div className="ai-panel-head"><IcSparkle size={15} /> Best-value (survivorship) suggestions <span className="ai-badge">AI</span></div>
          <div className="ai-panel-body">
            {ai.length === 0 && <div className="ai-suggestion"><IcCircleCheck size={15} className="ai-ic" /><span className="ai-txt">No conflicts — all sources agree on the visible fields.</span></div>}
            {ai.map((s, i) => (
              <div key={i} className="ai-suggestion"><IcSparkle size={15} className="ai-ic" />
                <span className="ai-txt"><strong>{s.field}</strong> → use <code>{s.pick}</code> — {s.why}.</span></div>
            ))}
            {ai.length > 0 && <div className="hstack" style={{ gap: 8 }}><button className="btn primary" onClick={applyAi}>Apply all to Override</button><button className="btn" onClick={() => setAi(null)}>Dismiss</button></div>}
          </div>
        </div>
      )}

      <div className="mg-cmp">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 150 }}>Field</th>
              {srcs.map(s => (
                <th key={s.grid} className={s.master ? 'master' : ''}>
                  {s.name}
                  <span className="mg-src-tag">{s.override ? 'override' : s.editable ? 'editable' : s.master ? 'master' : 'read-only'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const gFields = visFields.filter(f => f.group === g);
              if (!gFields.length) return null;
              return (
                <React.Fragment key={g}>
                  <tr className="mg-group-row"><td colSpan={srcs.length + 1}>{g}</td></tr>
                  {gFields.map(f => {
                    const isDiff = highlight && diff(f);
                    return (
                      <tr key={f.name}>
                        <td className="field-name">{f.name}{f.constrain && <span className="mg-constrain-tag" title="Constrained to decode list">▾</span>}</td>
                        {srcs.map(s => {
                          const val = fn.rows[f.name][s.grid];
                          const canEdit = editing && s.editable && f.editable;
                          const cls = [s.master ? 'master-cell' : '', isDiff && !s.master ? 'diff' : '', canEdit ? 'editable' : ''].filter(Boolean).join(' ');
                          return (
                            <td key={s.grid} className={cls}
                                draggable={!canEdit && val !== ''}
                                onDragStart={() => setDragVal(val)}
                                onDragOver={canEdit ? (e => e.preventDefault()) : undefined}
                                onDrop={canEdit ? (() => { setCell(f, s.grid, dragVal); ruleToast('Dropped value into Override', 'success'); }) : undefined}>
                              {canEdit
                                ? (f.constrain
                                    ? <select className="cell-input" value={val} onChange={e => setCell(f, s.grid, e.target.value)}>
                                        <option value=""></option>
                                        {(fn.decodes[f.decode] || []).map(o => <option key={o}>{o}</option>)}
                                      </select>
                                    : <input className="cell-input" value={val} placeholder="—" onChange={e => setCell(f, s.grid, e.target.value)} />)
                                : <span className={val !== '' ? 'mg-cell-drag' : ''} style={{ color: val === '' ? 'var(--ink-5)' : undefined }}>{val === '' ? '—' : val}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <IcInfo size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        {editing ? 'Editing on: over-type Override cells, pick from constrained drop-downs, or drag a value from any source into the Override column. Changes feed Update-from-Override sources on save.' : 'Enable editing to over-type, use constrained drop-downs, or drag-and-drop values across sources. Differences are highlighted in amber.'}
      </div>
    </div>
  );
}

// ---- Function Attributes ----
function MgAttributes({ fn, onChange }) {
  function moveSrc(i, dir) {
    const j = i + dir; if (j < 0 || j >= fn.sources.length) return;
    const arr = [...fn.sources]; [arr[i], arr[j]] = [arr[j], arr[i]]; onChange({ ...fn, sources: arr });
  }
  function toggle(i, k) { onChange({ ...fn, sources: fn.sources.map((s, j) => j === i ? { ...s, [k]: !s[k] } : s) }); }
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 980 }}>
      <div className="props-grid" style={{ marginBottom: 18 }}>
        <div className="field" style={{ margin: 0 }}><label className="field-label">Illustration Template</label>
          <div className="select-wrap"><select className="select" defaultValue={fn.template}><option>{fn.template}</option></select></div>
          <div className="field-help">Sources are pulled together via this template on a common key.</div></div>
        <div className="field" style={{ margin: 0 }}><label className="field-label">Key field</label><input className="input" value={fn.key} disabled style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }} /></div>
      </div>
      <div className="kv-sec-label">Function sources</div>
      <div className="co-table">
        <div className="mg-src-row head"><span>#</span><span>Source</span><span>Grid caption</span><span>Editable</span><span>Override</span><span>From override</span><span>Non-standard</span></div>
        {fn.sources.map((s, i) => (
          <div key={i} className="mg-src-row">
            <span className="mg-idx"><button onClick={() => moveSrc(i, -1)}>▲</button><button onClick={() => moveSrc(i, 1)}>▼</button></span>
            <span className="co-comp" style={{ gap: 8 }}><span className="ci"><IcSource size={14} /></span>{s.name}{s.master && <span className="mp-tag" style={{ background: 'var(--magenta-soft)', color: 'var(--magenta)' }}>Master</span>}{s.gen && <span className="mp-tag" title={'Editable via ' + s.gen}>DG</span>}</span>
            <span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }}>{s.grid}</span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={!!s.editable} disabled={!s.gen} onChange={() => toggle(i, 'editable')} /><span className="box"><IcCheck size={12} /></span></label></span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={!!s.override} onChange={() => toggle(i, 'override')} /><span className="box"><IcCheck size={12} /></span></label></span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={!!s.fromOverride} onChange={() => toggle(i, 'fromOverride')} /><span className="box"><IcCheck size={12} /></span></label></span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={!!s.nonStd} onChange={() => toggle(i, 'nonStd')} /><span className="box"><IcCheck size={12} /></span></label></span>
          </div>
        ))}
      </div>
      <div className="setup-banner info" style={{ marginTop: 16 }}>
        <IcInfo size={15} /><span>Only <strong>Data Generator</strong> sources can be editable (the <strong>DG</strong> tag). Mark one source as <strong>Override</strong>; flag others <strong>Update from Override</strong> to propagate saved override values by illustrated field name.</span>
      </div>
    </div>
  );
}

// ---- Field Control ----
function MgFields({ fn, onChange }) {
  const [busy, run] = useAiRunM();
  const [ai, setAi] = React.useState(false);
  function toggle(i, k) { onChange({ ...fn, fields: fn.fields.map((f, j) => j === i ? { ...f, [k]: !f[k] } : f) }); }
  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="hstack" style={{ marginBottom: 12, gap: 8 }}>
        <span className="muted">Use <strong>illustrated fields</strong> (shown across all sources) where possible. Constrain limits a field to its Decode Object values.</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={() => run(() => setAi(true))} disabled={busy} style={{ background: '#6d28d9', borderColor: '#6d28d9', color: '#fff' }}>
          {busy ? <AiSpinM label="Reviewing…" /> : <><IcSparkle size={13} /> AI review fields</>}
        </button>
      </div>
      {ai && (
        <div className="ai-panel"><div className="ai-panel-head"><IcSparkle size={15} /> Field-control review <span className="ai-badge">AI</span></div>
          <div className="ai-panel-body">
            <div className="ai-suggestion"><IcSparkle size={15} className="ai-ic" /><span className="ai-txt">Constrain <strong>ASSET_TYPE</strong> and <strong>CURRENCY</strong> to their decode lists — both have free-text variance across sources (e.g. LSEG "CORP" vs "FI").</span></div>
            <div className="ai-suggestion"><IcSparkle size={15} className="ai-ic" /><span className="ai-txt"><strong>MATURITY_DATE</strong> and <strong>COUPON</strong> show source disagreement — keep editable so stewards can resolve in the Override column.</span></div>
            <button className="btn" onClick={() => setAi(false)}>Dismiss</button>
          </div></div>
      )}
      <div className="gen-field-grid">
        <div className="gen-field-head" style={{ gridTemplateColumns: '26px 1.6fr 1fr 1fr 80px 80px 90px' }}>
          <span>#</span><span>Field</span><span>Source column</span><span>Group</span><span>Visible</span><span>Editable</span><span>Constrain</span>
        </div>
        {fn.fields.map((f, i) => (
          <div key={i} className="gen-field-row" style={{ gridTemplateColumns: '26px 1.6fr 1fr 1fr 80px 80px 90px' }}>
            <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{i + 1}</span>
            <span className="gen-field-name">{f.name}</span>
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{f.illustrated ? fn.template : 'source-specific'}</span>
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{f.group}</span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={f.visible} onChange={() => toggle(i, 'visible')} /><span className="box"><IcCheck size={12} /></span></label></span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={f.editable} onChange={() => toggle(i, 'editable')} /><span className="box"><IcCheck size={12} /></span></label></span>
            <span className="gen-cb"><label className="checkbox"><input type="checkbox" checked={f.constrain} onChange={() => toggle(i, 'constrain')} /><span className="box"><IcCheck size={12} /></span></label></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Validation ----
function MgValidation({ fn, onChange }) {
  const [nl, setNl] = React.useState('');
  const [busy, run] = useAiRunM();
  const [prop, setProp] = React.useState(null);
  function gen() { if (!nl.trim()) return; run(() => setProp({ desc: nl.length > 38 ? nl.slice(0, 38) + '…' : nl, msg: 'Auto-generated from: ' + nl, enabled: true, override: /override/i.test(nl), field: /all/i.test(nl) ? 'All editable fields' : (fn.fields.find(f => nl.toUpperCase().includes(f.name))?.name || 'All editable fields') })); }
  function accept() { onChange({ ...fn, validation: [...fn.validation, { id: 'v' + Date.now(), ...prop }] }); setProp(null); setNl(''); ruleToast('Validation rule added', 'success'); }
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 980 }}>
      <div className="ai-panel">
        <div className="ai-panel-head"><IcSparkle size={15} /> Describe a validation rule <span className="ai-badge">AI</span></div>
        <div className="ai-panel-body">
          <div className="ai-input-row"><input className="input" placeholder="e.g. override needs an expiry date and comment, allow override" value={nl} onChange={e => setNl(e.target.value)} onKeyDown={e => e.key === 'Enter' && gen()} /><button className="btn primary" onClick={gen} disabled={busy || !nl.trim()}>{busy ? 'Building…' : 'Generate'}</button></div>
          {prop && <div style={{ marginTop: 10 }}><div className="ai-suggestion"><IcCircleCheck size={15} className="ai-ic" /><span className="ai-txt"><strong>{prop.desc}</strong> on <strong>{prop.field}</strong>{prop.override ? ' · override allowed' : ''}</span></div><div className="hstack" style={{ gap: 8 }}><button className="btn primary" onClick={accept}>Add rule</button><button className="btn" onClick={() => setProp(null)}>Discard</button></div></div>}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8, display: 'flex', gap: 6, alignItems: 'center' }}><IcInfo size={13} /> Validation runs in the Web UI when the user leaves an edited field.</div>
      <div className="kv-table">
        <div className="kv-head" style={{ gridTemplateColumns: '1.4fr 1.6fr 1fr 80px 80px' }}><span>Description</span><span>Message</span><span>Field</span><span>Enabled</span><span>Override</span></div>
        {fn.validation.map(v => (
          <div key={v.id} className="kv-row" style={{ gridTemplateColumns: '1.4fr 1.6fr 1fr 80px 80px' }}>
            <span style={{ fontWeight: 500 }}>{v.desc}</span><span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{v.msg}</span>
            <span style={{ fontSize: 12 }}>{v.field}</span>
            <span>{v.enabled ? <IcCheck size={14} style={{ color: '#15803d' }} /> : '—'}</span>
            <span>{v.override ? 'Yes' : 'No'}</span>
          </div>
        ))}
        {fn.validation.length === 0 && <div className="dtable-empty">No validation rules.</div>}
      </div>
    </div>
  );
}

// ---- Searches & Processes ----
function MgSearch({ fn }) {
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 980 }}>
      <div className="kv-sec-label">Quick searches</div>
      <div className="hstack" style={{ gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {fn.searches.map(s => <span key={s} className="mp-tag" style={{ fontSize: 12, padding: '4px 10px' }}>{s}</span>)}
        <button className="btn ghost" style={{ fontSize: 12 }}><IcPlus size={13} /> Add</button>
        <span className="muted" style={{ fontSize: 12 }}>Best practice: quick searches use the Master source as their data source.</span>
      </div>
      <div className="kv-sec-label">Launch processes</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Run via the Process Launcher after Inbox edits — to process or distribute changes downstream.</div>
      {fn.processes.map(p => (
        <div key={p} className="run-card" style={{ marginBottom: 6 }}>
          <span className="rc-icon" style={{ background: '#e7f6f1', color: '#0f7c70' }}><IcSolutions size={16} /></span>
          <div className="rc-meta"><div className="rc-title">{p}</div><div className="rc-sub">Solution · launched after save</div></div>
          <button className="btn ghost" style={{ fontSize: 12 }}><IcPlay size={12} /> Launch</button>
        </div>
      ))}
      <div className="kv-sec-label" style={{ marginTop: 18 }}>Filter</div>
      <textarea className="code-editor" style={{ minHeight: 70 }} spellCheck={false} defaultValue={'-- filtered view across all Manager sources\n{MASTER}.[ASSET_TYPE] = \'FI\''} />
    </div>
  );
}

// ============================================================
// Main Data Manager screen
// ============================================================
function Manager() {
  const [fns, setFns] = React.useState(MG_FUNCTIONS);
  const [selected, setSelected] = React.useState('Security');
  const [tab, setTab] = React.useState('inbox');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);

  const fn = fns[selected];
  const compKey = 'manager:' + selected;
  const collab = useCollab();
  const compState = collab.components[compKey];
  const locked = !compState || compState.status !== 'me';
  function update(next) { setFns({ ...fns, [selected]: next }); }
  const names = Object.keys(fns).filter(n => n.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">Data Manager</span>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}><IcChevDoubleLeft size={16} /></button>
          </div>
          <div className="wb-list-search">
            <div className="wb-list-search-wrap"><IcSearch size={14} />
              <input className="input" placeholder="Filter functions…" value={filter} onChange={e => setFilter(e.target.value)} /></div>
          </div>
          <div className="wb-list-items">
            {names.map(n => (
              <div key={n} className={`wb-list-item ${n === selected ? 'active' : ''}`} onClick={() => setSelected(n)} style={{ gap: 10 }}>
                <IcManager size={15} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }}>{n}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{fns[n].sources.length} sources · {fns[n].fields.length} fields</span>
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
            <span className="head-icon"><IcManager size={18} /></span>
            <h1>{fn.name} <span style={{ color: 'var(--ink-4)', fontWeight: 400, fontSize: 14 }}>· {fn.code}</span>
              <span className="ver-pill">EDM {fn.version} <IcChevDown size={10} /></span></h1>
            <div className="right hstack" style={{ gap: 6 }}>
              <span className="env-pill" style={{ background: '#eef2ff', color: '#4338ca' }}><IcLayers size={11} /> {fn.template}</span>
              <button className="ai-star" title="AI Assist"><IcSparkle size={16} /></button>
            </div>
          </div>
          <div className="desc">Compares & edits {fn.sources.length} sources aligned on {fn.key} via the {fn.template}.</div>
        </div>

        <CheckoutBar componentKey={compKey} label={fn.name + ' Manager'} type="Manager" onOpenHistory={() => setShowHistory(true)} />
        {showHistory && <HistoryModal componentKey={compKey} label={fn.name + ' Manager'} onClose={() => setShowHistory(false)} />}

        <div className="wb-body-toolbar">
          <button className="btn ghost" onClick={() => ruleToast('Saved · Update-from-Override applied', 'success')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save
          </button>
          <button className="btn" onClick={() => ruleToast('Launching processes…', 'info')}><IcPlay size={13} /> Launch processes</button>
          <div className="spacer" />
          <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                  onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from Manager')}><IcShield size={16} /></button>
        </div>

        <div className="tabs" style={{ padding: '0 24px', margin: 0, borderBottom: '1px solid var(--line)' }}>
          {MG_TABS.map(tb => <button key={tb.id} className={`tab ${tab === tb.id ? 'active' : ''}`} onClick={() => setTab(tb.id)}>{tb.label}</button>)}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {tab === 'inbox' && <MgInbox fn={fn} onChange={update} />}
          {tab === 'attrs' && <MgAttributes fn={fn} onChange={update} />}
          {tab === 'fields' && <MgFields fn={fn} onChange={update} />}
          {tab === 'valid' && <MgValidation fn={fn} onChange={update} />}
          {tab === 'search' && <MgSearch fn={fn} />}
        </div>
      </div>
    </div>
  );
}

window.Manager = Manager;
