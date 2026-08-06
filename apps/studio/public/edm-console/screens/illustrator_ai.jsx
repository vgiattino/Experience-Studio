// ============================================================
// Illustrator AI assist — two modes: 'glossary' and 'mapping'
// Used by both IllustratorTemplate and IllustratorDoc.
// ============================================================

function IllustratorAiPanel({ mode, template, illustration, onApply, onClose }) {
  const [busy, setBusy] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState(null);
  const [selected, setSelected] = React.useState(new Set());

  function runGlossary() {
    setBusy(true);
    setTimeout(() => {
      const suggs = [
        { id: 's1', name: 'Party Status', desc: 'Active / inactive / pending review lifecycle state', type: 'Text', format: '', decode: 'None',
          preview: 'New glossary entry: Party Status' },
        { id: 's2', name: 'Registration Date', desc: 'Date the party was first registered in EDM', type: 'Date', format: 'dd/mm/yyyy', decode: 'None',
          preview: 'New glossary entry: Registration Date' },
        { id: 's3', name: 'Parent Entity', desc: 'Ultimate parent party (self-referential)',  type: 'Integer', format: '', decode: 'Object',
          preview: 'New glossary entry: Parent Entity (with decode to T_MASTER_PARTY)' },
      ];
      setSuggestions(suggs);
      setSelected(new Set(suggs.map(s => s.id)));
      setBusy(false);
    }, 1000);
  }

  function runMapping() {
    if (!illustration) return;
    setBusy(true);
    setTimeout(() => {
      const glossaryNames = template?.names || [];
      const sourceColumns = illustration.sourceColumns || [];
      const suggs = glossaryNames
        .filter(n => !illustration.mappings.some(m => m.glossaryName === n.illustratedName && m.sourceName))
        .map(n => {
          const exact = sourceColumns.find(c => c.toUpperCase() === (n.fieldName || '').toUpperCase());
          const fuzzy = !exact && sourceColumns.find(c =>
            c.toLowerCase().includes(n.illustratedName.toLowerCase().split(' ')[0]) ||
            n.illustratedName.toLowerCase().includes(c.toLowerCase().replace(/_/g,' ').split(' ')[0]));
          const col = exact || fuzzy;
          const conf = exact ? 95 : fuzzy ? 68 : 40;
          return { id: 'ms_' + n.id, glossaryName: n.illustratedName, sourceName: col || '', confidence: conf };
        })
        .filter(s => s.sourceName && s.confidence > 50);
      setSuggestions(suggs);
      setSelected(new Set(suggs.map(s => s.id)));
      setBusy(false);
    }, 1100);
  }

  function applySelected() {
    if (!suggestions) return;
    const toApply = suggestions.filter(s => selected.has(s.id));
    onApply(toApply);
    setSuggestions(null);
    setSelected(new Set());
  }

  const confClass = (c) => c >= 80 ? 'ill-conf-high' : c >= 60 ? 'ill-conf-mid' : 'ill-conf-low';

  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <IcSparkle size={15} />
        {mode === 'glossary' ? 'Suggest glossary names' : 'Suggest source mappings'}
        <span className="ai-badge">AI</span>
        <span style={{ flex: 1 }} />
        {onClose && <button className="icon-btn" onClick={onClose}><IcX size={14} /></button>}
      </div>
      <div className="ai-panel-body">
        {!suggestions && !busy && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12, flex: 1 }}>
              {mode === 'glossary'
                ? 'Suggest new names based on the existing glossary and common EDM field patterns.'
                : 'Semantically match source columns to glossary entries using field names and descriptions.'}
            </span>
            <button className="btn" onClick={mode === 'glossary' ? runGlossary : runMapping}
                    style={{ background: '#6d28d9', borderColor: '#6d28d9', color: '#fff' }}>
              <IcSparkle size={13} /> Generate
            </button>
          </div>
        )}
        {busy && (
          <div className="hstack" style={{ gap: 8, color: '#6d28d9' }}>
            <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="rgba(109,40,217,.3)" strokeWidth="2.5"/>
              <path d="M21 12a9 9 0 0 0-9-9" stroke="#6d28d9" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 12 }}>{mode === 'glossary' ? 'Analysing glossary patterns…' : 'Matching columns semantically…'}</span>
          </div>
        )}
        {suggestions && (
          <>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} — select which to apply:
            </div>
            {mode === 'glossary' && suggestions.map(s => (
              <div key={s.id} className="ai-suggestion" style={{ cursor: 'pointer' }}
                   onClick={() => setSelected(prev => {
                     const n = new Set(prev);
                     n.has(s.id) ? n.delete(s.id) : n.add(s.id);
                     return n;
                   })}>
                <label className="checkbox" style={{ margin: 0 }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(s.id)}
                         onChange={() => setSelected(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })} />
                  <span className="box"><IcCheck size={11} /></span>
                </label>
                <span className="ai-txt" style={{ flex: 1 }}>
                  <strong>{s.name}</strong> — {s.desc}
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-4)' }}>{s.type}{s.format ? ` · ${s.format}` : ''}</span>
                </span>
              </div>
            ))}
            {mode === 'mapping' && suggestions.map(s => (
              <div key={s.id} className="ai-suggestion" style={{ cursor: 'pointer' }}
                   onClick={() => setSelected(prev => {
                     const n = new Set(prev);
                     n.has(s.id) ? n.delete(s.id) : n.add(s.id);
                     return n;
                   })}>
                <label className="checkbox" style={{ margin: 0 }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(s.id)}
                         onChange={() => setSelected(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })} />
                  <span className="box"><IcCheck size={11} /></span>
                </label>
                <span className="ai-txt" style={{ flex: 1 }}>
                  <span style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 11.5, color: 'var(--ink-2)' }}>{s.sourceName}</span>
                  <span style={{ margin: '0 6px', color: 'var(--ink-4)' }}>→</span>
                  <strong>{s.glossaryName}</strong>
                </span>
                <div className="hstack" style={{ gap: 6, width: 100 }}>
                  <div className={`ill-conf-bar ${confClass(s.confidence)}`}><i style={{ width: s.confidence + '%' }} /></div>
                  <span style={{ fontSize: 11, color: 'var(--ink-4)', width: 32, textAlign: 'right' }}>{s.confidence}%</span>
                </div>
              </div>
            ))}
            <div className="hstack" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn primary" disabled={selected.size === 0} onClick={applySelected}>
                Apply {selected.size} selected
              </button>
              <button className="btn" onClick={() => setSelected(new Set(suggestions.map(s => s.id)))}>All</button>
              <button className="btn" onClick={() => setSelected(new Set())}>None</button>
              <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={() => { setSuggestions(null); setSelected(new Set()); }}>
                Dismiss
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

window.IllustratorAiPanel = IllustratorAiPanel;
