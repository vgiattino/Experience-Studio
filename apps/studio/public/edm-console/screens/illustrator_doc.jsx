// ============================================================
// Illustrator Illustration editor — source table binding + column
// mapping.  Exported as window.IllustratorDoc.
// ============================================================

// ---- Align: auto-map source columns to glossary names ----
function autoAlign(doc, template) {
  if (!template) return doc;
  const newMappings = template.names.map(n => {
    const existing = doc.mappings.find(m => m.glossaryName === n.illustratedName);
    if (existing) return existing;
    const fieldUp  = (n.fieldName || '').toUpperCase();
    const exact    = fieldUp && doc.sourceColumns.find(c => c.toUpperCase() === fieldUp);
    const nameWord = n.illustratedName.toLowerCase().replace(/\s+/g, '_');
    const fuzzy    = !exact && doc.sourceColumns.find(c =>
      c.toLowerCase() === nameWord ||
      c.toLowerCase().includes(n.illustratedName.toLowerCase().split(' ')[0].toLowerCase()) ||
      n.illustratedName.toLowerCase().includes(c.toLowerCase().replace(/_/g, ' '))
    );
    const col = exact || fuzzy || '';
    return { id: 'am' + n.id, glossaryName: n.illustratedName, sourceName: col, origin: col ? 'Auto' : '', confirmed: !!col };
  });
  return { ...doc, mappings: newMappings };
}

// ============================================================
// IllustratorDoc — main illustration editor
// ============================================================
const ILL_DOC_TABS = [
  { id: 'mapping',    label: 'Mapping' },
  { id: 'properties', label: 'Properties' },
];

function IllustratorDoc({ doc, docName, allTemplates, onChange }) {
  const [tab, setTab]           = React.useState('mapping');
  const [showAi, setShowAi]     = React.useState(false);
  const [showBrowser, setShowBrowser] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [warnTemplate, setWarnTemplate] = React.useState(null);
  const [noAskTemplate, setNoAskTemplate] = React.useState(false);
  const [undoStack, setUndoStack] = React.useState([]);
  const [redoStack, setRedoStack] = React.useState([]);
  const compKey = 'ill:' + docName;
  const collab  = useCollab();
  const locked  = !collab.components[compKey] || collab.components[compKey].status !== 'me';

  const template = allTemplates[doc.template] || null;

  function push(next) {
    setUndoStack(u => [...u, doc]);
    setRedoStack([]);
    onChange(next);
    collabLogChange(compKey, { action: 'Update mapping' });
  }
  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, doc]);
    setUndoStack(u => u.slice(0, -1));
    onChange(prev);
  }
  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, doc]);
    setRedoStack(r => r.slice(0, -1));
    onChange(next);
  }

  React.useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undoStack, redoStack, doc]);

  function align() {
    const aligned = autoAlign(doc, template);
    const autoCount = aligned.mappings.filter(m => m.origin === 'Auto' && m.sourceName).length;
    push(aligned);
    ruleToast(`Aligned: ${autoCount} mapping${autoCount !== 1 ? 's' : ''} auto-matched`, 'success');
  }

  function updateMapping(glossaryName, sourceName, origin = 'Manual') {
    const mappings = doc.mappings.map(m =>
      m.glossaryName === glossaryName ? { ...m, sourceName, origin, confirmed: !!sourceName } : m
    );
    push({ ...doc, mappings });
  }

  function applyAiSuggestions(suggs) {
    let next = { ...doc };
    suggs.forEach(s => {
      next = { ...next, mappings: next.mappings.map(m =>
        m.glossaryName === s.glossaryName ? { ...m, sourceName: s.sourceName, origin: 'Auto', confirmed: true } : m
      )};
    });
    push(next);
    ruleToast(`${suggs.length} AI mapping${suggs.length !== 1 ? 's' : ''} applied`, 'success');
    setShowAi(false);
  }

  function switchTemplate(newTpl) {
    const next = { ...doc, template: newTpl };
    const realigned = autoAlign(next, allTemplates[newTpl]);
    push(realigned);
    collabLogChange(compKey, { action: 'Switch template', before: [doc.template], after: [newTpl] });
    ruleToast(`Template switched to "${newTpl}" — mappings re-validated`, 'info');
    setWarnTemplate(null);
  }

  function selectSource(obj) {
    const cols = DB_CATALOG ? (DB_CATALOG.filter
      ? DB_CATALOG.filter(r => r.schema === obj.schema && r.name === obj.name)
      : []) : [];
    const mockCols = {
      'T_MASTER_PARTY':  ['EDM_PARTY_ID','PARTY_NAME','SHORT_NAME','LEI','COUNTRY','GICS_SECTOR','IS_ACTIVE','LAST_UPDATE_DATE','CREATE_DATE'],
      'T_MASTER_SEC':    ['EDM_SEC_ID','SECURITY_NAME','ASSET_TYPE_CODE','ISIN','CUSIP','SEDOL','CURRENCY','ISSUE_DATE','MATURITY_DATE','IS_ACTIVE','LAST_UPDATE_DATE'],
      'T_MASTER_PRICE':  ['EDM_SEC_ID','PRICE','CURRENCY','PRICE_DATE','PRICE_DATE_YMD','SOURCE_NAME','PRICE_TYPE','LAST_UPDATE_DATE'],
    };
    const sourceColumns = mockCols[obj.name] || ['COLUMN_1','COLUMN_2','COLUMN_3'];
    const next = { ...doc, sourceTable: { schema: obj.schema, name: obj.name }, sourceColumns };
    const realigned = autoAlign(next, template);
    push(realigned);
    ruleToast(`Source bound to ${obj.schema}.${obj.name} — ${sourceColumns.length} columns`, 'success');
    setShowBrowser(false);
  }

  const mappedCols = new Set(doc.mappings.map(m => m.sourceName).filter(Boolean));
  const unmappedSrcCols = doc.sourceColumns.filter(c => !mappedCols.has(c));
  const confirmedCount = doc.mappings.filter(m => m.confirmed && m.sourceName).length;
  const totalCount     = doc.mappings.length;

  return (
    <div className="wb-body">
      <div className="wb-body-head">
        <div className="title-row">
          <span className="head-icon"><IcIllustrator size={18} /></span>
          <h1>
            {docName}
            <span className="ver-pill">EDM {doc.version} <IcChevDown size={10} /></span>
          </h1>
          <div className="right hstack" style={{ gap: 6 }}>
            <span className="env-pill" style={{
              background: confirmedCount === totalCount ? '#d1fae5' : '#fef3c7',
              color: confirmedCount === totalCount ? '#065f46' : '#92400e' }}>
              <IcCheck size={11} /> {confirmedCount}/{totalCount} mapped
            </span>
            <button className="ai-star" title="AI Assist" onClick={() => setShowAi(v => !v)}><IcSparkle size={16} /></button>
          </div>
        </div>
        <div className="desc">
          Illustration — {doc.sourceTable
            ? <><code style={{ fontSize: 11 }}>{doc.sourceTable.schema}.{doc.sourceTable.name}</code> bound to <strong>{doc.template}</strong> template</>
            : 'No source table bound yet'
          }.
        </div>
      </div>

      <CheckoutBar componentKey={compKey} label={docName} type="Illustrator"
                   onOpenHistory={() => setShowHistory(true)} />
      {showHistory && <HistoryModal componentKey={compKey} label={docName} onClose={() => setShowHistory(false)} />}

      <div className="wb-body-toolbar">
        <button className="btn ghost" onClick={() => { ruleToast('Saved', 'success'); collabLogChange(compKey, { action: 'Save' }); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg> Save
        </button>
        <button className="btn primary" onClick={() => ruleToast('Illustration published', 'success')}>
          <IcCheck size={14} /> Publish
        </button>
        <div className="tool-sep" />
        <button className="btn ghost" style={{ fontSize: 12 }} disabled={locked} onClick={align}>
          <IcRealign size={13} /> Align
        </button>
        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!undoStack.length || locked} onClick={undo}><IcUndo size={14} /></button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!redoStack.length || locked} onClick={redo}><IcRedo size={14} /></button>
        <div className="spacer" />
        <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from Illustrator')}>
          <IcShield size={16} />
        </button>
      </div>

      <div className="tabs" style={{ padding: '0 24px', margin: 0, borderBottom: '1px solid var(--line)' }}>
        {ILL_DOC_TABS.map(t => <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'mapping' && (
          <div style={{ padding: '14px 24px 32px' }}>
            {showAi && (
              <div style={{ marginBottom: 14 }}>
                <IllustratorAiPanel mode="mapping" template={template} illustration={doc}
                  onApply={applyAiSuggestions} onClose={() => setShowAi(false)} />
              </div>
            )}

            {!doc.sourceTable && (
              <div className="hstack" style={{ gap: 10, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, marginBottom: 14 }}>
                <IcWarn size={18} />
                <span style={{ fontSize: 13 }}>No source table bound. Bind a table or view first.</span>
                <button className="btn primary" style={{ marginLeft: 'auto', fontSize: 12 }} disabled={locked}
                        onClick={() => setShowBrowser(true)}>
                  <IcSource size={13} /> Bind source…
                </button>
              </div>
            )}

            {/* Unmapped source columns */}
            {unmappedSrcCols.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-4)', marginBottom: 6 }}>
                  Unmapped source columns ({unmappedSrcCols.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {unmappedSrcCols.map(c => (
                    <span key={c} className="ill-src-col-chip">{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Mapping grid */}
            <div className="ill-mapping-grid">
              <div className="ill-mapping-head">
                <span>Glossary name</span>
                <span>Source column</span>
                <span>Origin</span>
                <span></span>
              </div>
              {doc.mappings.map(m => (
                <div key={m.id} className={`ill-mapping-row${!m.confirmed ? ' unconfirmed' : ''}`}>
                  <div style={{ fontWeight: 500 }}>{m.glossaryName}</div>
                  <div>
                    <select className="ill-src-select" value={m.sourceName || ''} disabled={locked}
                            onChange={e => updateMapping(m.glossaryName, e.target.value, 'Manual')}>
                      <option value="">— unmapped —</option>
                      {doc.sourceColumns.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    {m.sourceName
                      ? <span className={`ill-origin ${m.origin === 'Auto' ? 'auto' : 'manual'}`}>{m.origin}</span>
                      : <span className="ill-origin unmap">Unmapped</span>
                    }
                  </div>
                  <div>
                    {!m.confirmed && m.sourceName && (
                      <button className="btn ghost" style={{ fontSize: 11, padding: '2px 8px' }}
                              disabled={locked}
                              onClick={() => push({ ...doc, mappings: doc.mappings.map(x => x.id === m.id ? { ...x, confirmed: true } : x) })}>
                        Confirm
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!doc.mappings.length && (
                <div style={{ gridColumn: '1/-1', padding: '20px 14px', textAlign: 'center', color: 'var(--ink-4)', fontStyle: 'italic' }}>
                  Bind a source table and click Align to auto-map columns.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'properties' && (
          <div style={{ padding: '16px 24px 32px', maxWidth: 680 }}>
            <div className="kv-sec-label" style={{ marginBottom: 10 }}>Source table / view</div>
            <div className="hstack" style={{ gap: 10, marginBottom: 20 }}>
              {doc.sourceTable
                ? <span style={{ fontSize: 13 }}>
                    <span className="tb-schema-badge">{doc.sourceTable.schema}</span>
                    <span style={{ fontFamily: 'Menlo,Consolas,monospace', fontWeight: 500 }}>{doc.sourceTable.name}</span>
                    <span style={{ color: 'var(--ink-4)', marginLeft: 8 }}>{doc.sourceColumns.length} columns</span>
                  </span>
                : <span className="muted" style={{ fontSize: 13 }}>No source bound</span>
              }
              <button className="btn ghost" style={{ fontSize: 12 }} disabled={locked}
                      onClick={() => setShowBrowser(true)}>
                <IcSource size={13} /> {doc.sourceTable ? 'Change…' : 'Bind source…'}
              </button>
            </div>

            <div className="kv-sec-label" style={{ marginBottom: 10 }}>Template</div>
            <div className="hstack" style={{ gap: 10, marginBottom: 20 }}>
              <div className="select-wrap" style={{ maxWidth: 280 }}>
                <select className="select" value={doc.template} disabled={locked}
                        onChange={e => {
                          if (noAskTemplate) { switchTemplate(e.target.value); }
                          else { setWarnTemplate(e.target.value); }
                        }}>
                  {Object.keys(allTemplates).map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                {template ? `${template.names.length} glossary names` : 'Template not found'}
              </span>
            </div>

            <div className="kv-sec-label" style={{ marginBottom: 8 }}>Version</div>
            <input className="input" style={{ maxWidth: 200 }} defaultValue={doc.version} disabled={locked} />

            {warnTemplate && (
              <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setWarnTemplate(null); }}>
                <div className="modal">
                  <div className="modal-head"><h3>Switch template?</h3></div>
                  <div className="modal-body">
                    <p style={{ fontSize: 13, margin: 0 }}>
                      Switching from <strong>{doc.template}</strong> to <strong>{warnTemplate}</strong> will
                      re-validate all column mappings against the new glossary. Mappings that no longer match
                      will be cleared.
                    </p>
                    <label className="checkbox" style={{ marginTop: 14 }}>
                      <input type="checkbox" onChange={e => setNoAskTemplate(e.target.checked)} />
                      <span className="box"><IcCheck size={12} /></span>
                      Don't ask again this session
                    </label>
                  </div>
                  <div className="modal-foot">
                    <button className="btn" onClick={() => setWarnTemplate(null)}>Cancel</button>
                    <button className="btn primary" onClick={() => switchTemplate(warnTemplate)}>Switch template</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showBrowser && (
        <ObjectBrowserModal title="Select source table or view" onSelect={selectSource} onClose={() => setShowBrowser(false)} />
      )}
    </div>
  );
}

window.IllustratorDoc = IllustratorDoc;
