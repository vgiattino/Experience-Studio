// ============================================================
// Enrich Bloomberg — process pipeline + Construction Rules table
// ============================================================

const ENRICH_COMPONENTS = [
  'Enrich Bloomberg Party',
  'Enrich Bloomberg Party Relationship',
  'Enrich Manual Security with EDM Security Id',
  'Enrich Master Price With Previous',
  'Enrich SIX Party Alternative ID',
  'Enrich SIX Party Classification',
  'Enrich SIX Party Contact',
  'Enrich SIX Party Manual',
  'Enrich Bloomberg Price',
  'Enrich Manual Security Fixed Income',
  'Enrich LSEG Party Relationship',
  'Enrich Bloomberg Security List',
  'Enrich ILV Fund',
  'Enrich Manual Security Derivative',
  'Enrich Bloomberg Security Schedule',
  'Enrich LSEG Price',
  'Enrich ILV Security Party Role with EDM Sec Id',
  'Enrich Manual Party',
  'Enrich Bond Reference Data Party Relationship',
  'Enrich LSG Party with CAPIQ_ID',
  'Enrich Manual Security Equity',
  'Enrich iLevel Party with CAPIQ_ID',
  'Enrich Bond Reference Data Party',
  'Enrich GLEIF Party',
  'Enrich Manual Security Private',
  'Enrich GLEIF Party Relationship',
  'Enrich Manual Security Swap',
  'Enrich SIX Party Rating',
  'Enrich SIX Party Relationship',
  'Enrich Bloomberg Party with CAPIQ_ID',
];

const ENRICH_PIPELINE_ROW1 = [
  { t: 'Source monitor',         c: 'gray',   ic: 'IcSourceCard' },
  { t: 'Column Filter',          c: 'pink',   ic: 'IcFilter' },
  { t: 'Key Mappings',           c: 'amber',  ic: 'IcVariables' },
  { t: 'Process Keys Table',     c: 'green',  ic: 'IcManager' },
  { t: 'Process Keys Mappings',  c: 'purple', ic: 'IcVariables' },
  { t: 'Rules',                  c: 'teal',   ic: 'IcSliders' },
];

const ENRICH_PIPELINE_ROW2 = [
  { t: 'Column Filter',  c: 'pink',  ic: 'IcFilter' },
  { t: 'Key Mappings',   c: 'amber', ic: 'IcVariables' },
];

function enrichChipClass(c) {
  return ({
    gray:   { border: '#cfd5dc', color: '#3b4554', bg: '#f6f8fb' },
    pink:   { border: '#e87fb0', color: '#b51e7a', bg: '#fff' },
    amber:  { border: '#e9b870', color: '#a86a13', bg: '#fff' },
    green:  { border: '#7bc28e', color: '#1f7a36', bg: '#fff' },
    purple: { border: '#a78bfa', color: '#6d28d9', bg: '#fff' },
    teal:   { border: '#5ec1b6', color: '#0f7c70', bg: '#fff' },
  })[c];
}

const CONSTRUCTION_RULES_INITIAL = [
  { name: 'Active',           pills: ['CM.Active', 'BBG.Active', 'Set to null'] },
  { name: 'Asset Type',       pills: ['BBG.Asset Type', 'CM.Asset Type'] },
  { name: 'Bid',              pills: ['BBG.Bid'] },
  { name: 'Currency',         pills: ['CM.Currency', 'BBG.Currency'] },
  { name: 'Currency code',    pills: ['BBG.Currency code', 'CM.Currency code'] },
  { name: 'CUSIP',            pills: ['BBG.CUSIP', 'Set to null'] },
  { name: 'Date of Issue',    pills: ['BBG.Date of Issue'] },
  { name: 'Day Count (Fixed Rate Day Count Fraction)', pills: ['BBG.Day Count', 'CM.Day Count', 'Set to null'] },
  { name: 'Expiry Date',      pills: ['BBG.Expiry Date', 'CM.Expiry Date'] },
  { name: 'ISIN',             pills: ['BBG.ISIN', 'CM.ISIN'] },
  { name: 'Issue Price',      pills: ['CM.Expiry Date', 'BBG.Expiry Date'] },
  { name: 'RIC',              pills: ['BBG.RIC', 'CM.RIC', 'Set to null'] },
  { name: 'Short term',       pills: ['BBG.Short term', 'CM.Short term', 'Set to null'] },
  { name: 'Security Description', pills: ['BBG.Security Description'] },
];

function Enrich() {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [selected, setSelected] = React.useState('Enrich Bloomberg Party Relationship');
  const [rules, setRules] = React.useState(CONSTRUCTION_RULES_INITIAL);
  const [checked, setChecked] = React.useState({});
  const [search, setSearch] = React.useState('');
  const [showSearch, setShowSearch] = React.useState(false);

  const filteredCompList = ENRICH_COMPONENTS.filter(c =>
    c.toLowerCase().includes(filter.toLowerCase()));

  const visibleRules = rules.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()));

  const allChecked = visibleRules.length > 0 && visibleRules.every(r => checked[r.name]);

  function toggleAll(v) {
    const next = { ...checked };
    visibleRules.forEach(r => { next[r.name] = v; });
    setChecked(next);
  }

  function resetRules() {
    setRules(CONSTRUCTION_RULES_INITIAL.map(r => ({ ...r, pills: [...r.pills] })));
    setChecked({});
  }

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">
              Solution
              <button className="icon-btn"><IcPlus size={16} /></button>
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
            {filteredCompList.map((c, i) => (
              <div key={i}
                   className={`wb-list-item ${c === selected ? 'active' : ''}`}
                   title={c}
                   onClick={() => setSelected(c)}>
                {c}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="wb-body">
        <div className="wb-body-head">
          {!sidebarOpen && (
            <button className="icon-btn" style={{ float: 'left', marginRight: 12 }}
                    onClick={() => setSidebarOpen(true)}>
              <IcChevDoubleRight size={16} />
            </button>
          )}
          <div className="title-row">
            <span className="head-icon"><IcSliders size={18} /></span>
            <h1>
              Enrich Bloomberg Party Aligned
              <span className="ver-pill">v4.2.1 <IcChevDown size={10} /></span>
            </h1>
            <div className="right hstack">
              <label className="toggle">
                <input type="checkbox" defaultChecked />
                <span className="track" />
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Enabled</span>
              </label>
            </div>
          </div>
          <div className="desc">Enriches party records by aligning them with Bloomberg data to enhance accuracy and completeness.</div>
        </div>

        <div className="wb-body-toolbar">
          <button className="btn primary"><IcPlus size={14} /> Add process</button>
          <button className="btn ghost" disabled><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save</button>
          <div className="tool-sep" />
          <button className="icon-btn"><IcUndo size={16} /></button>
          <button className="icon-btn"><IcRedo size={16} /></button>
          <div className="tool-sep" />
          <button className="icon-btn"><IcPlay size={14} /></button>
          <button className="icon-btn"><IcStop size={12} /></button>
          <div className="spacer" />
          <button className="ai-star" title="AI Assist"><IcSparkle size={16} /></button>
        </div>

        <div className="enrich-flow">
          <div className="proc-row">
            <span className="pn" />
            {ENRICH_PIPELINE_ROW1.map((s, i) => {
              const sty = enrichChipClass(s.c);
              const Icon = window[s.ic];
              return (
                <React.Fragment key={i}>
                  <span className="proc-chip"
                        style={{ borderColor: sty.border, color: sty.color, background: sty.bg }}>
                    <Icon size={14} /> {s.t}
                  </span>
                  {i < ENRICH_PIPELINE_ROW1.length - 1 && (
                    <span className="proc-arrow"><IcArrowRight size={16} /></span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div className="proc-row" style={{ marginLeft: 130 }}>
            {ENRICH_PIPELINE_ROW2.map((s, i) => {
              const sty = enrichChipClass(s.c);
              const Icon = window[s.ic];
              return (
                <React.Fragment key={i}>
                  <span className="proc-chip"
                        style={{ borderColor: sty.border, color: sty.color, background: sty.bg }}>
                    <Icon size={14} /> {s.t}
                  </span>
                  {i < ENRICH_PIPELINE_ROW2.length - 1 && (
                    <span className="proc-arrow"><IcArrowRight size={16} /></span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="rules">
          <div className="rules-head">
            <div>
              <div className="h2" style={{ marginBottom: 2 }}>Construction Rules</div>
              <div className="muted">Select an attribute to set your own source and source order under certain conditions</div>
            </div>
          </div>

          <div className="rules-tools">
            <label className="checkbox" style={{ padding: '6px 10px' }}>
              <input type="checkbox" checked={allChecked}
                     onChange={e => toggleAll(e.target.checked)} />
              <span className="box"><IcCheck size={12} /></span>
            </label>
            <button className="btn" onClick={() => setShowSearch(s => !s)}>
              <IcSearch size={14} /> Search
            </button>
            <button className="btn"><IcRealign size={14} /> Re-align rules</button>
            <button className="btn" onClick={resetRules}><IcReset size={14} /> Reset rules to default</button>
            {showSearch && (
              <input className="input" autoFocus
                     placeholder="Search attribute…"
                     value={search} onChange={e => setSearch(e.target.value)}
                     style={{ width: 220, marginLeft: 4 }} />
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--line)' }} />

          {visibleRules.map(r => (
            <div key={r.name} className="rule-row">
              <label className="checkbox">
                <input type="checkbox" checked={!!checked[r.name]}
                       onChange={e => setChecked({ ...checked, [r.name]: e.target.checked })} />
                <span className="box"><IcCheck size={12} /></span>
              </label>
              <span className="rule-name">{r.name}</span>
              {[0, 1, 2].map(slot => {
                const pill = r.pills[slot];
                if (!pill) return <span key={slot} />;
                const isNull = pill === 'Set to null';
                return (
                  <div key={slot} className={`rule-pill ${isNull ? 'set-null' : ''}`}>
                    <span className="num">{slot + 1}</span>
                    {pill}
                    {slot < r.pills.length - 1 && (
                      <span className="rule-pill-arrow"><IcArrowRight size={14} /></span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {visibleRules.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-4)' }}>
              No attributes match "{search}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.Enrich = Enrich;
