// ============================================================
// Illustrator Template editor — glossary names grid + predefined
// names drag panel.  Exported as window.IllustratorTemplate.
// ============================================================

const ILL_TYPES   = ['Text', 'Integer', 'Decimal', 'Boolean', 'Date', 'DateTime', 'Binary', 'Image'];
const ILL_FORMATS = { Date: ['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd'], DateTime: ['dd/mm/yyyy HH:mm', 'ISO 8601'], Decimal: ['#,##0.00', '#,##0.0000', '0.00%'], Boolean: ['Yes/No', 'True/False', '1/0'] };
const ILL_DECODES = ['None', 'Object', 'Join', 'Field', 'Sort by Field'];

// ---- Predefined names catalogue ----
const PREDEFINED_NAMES = [
  { cat: 'Identity',  names: ['Identifier', 'Code', 'Reference', 'Name', 'Short Name', 'Legal Name', 'Display Name'] },
  { cat: 'Dates',     names: ['Effective Date', 'Expiry Date', 'Create Date', 'Update Date', 'Value Date', 'Settlement Date'] },
  { cat: 'Amounts',   names: ['Price', 'Quantity', 'Amount', 'Face Value', 'Market Value', 'Notional', 'Rate', 'Yield'] },
  { cat: 'Geography', names: ['Country', 'Region', 'City', 'Address', 'Postcode', 'Currency'] },
  { cat: 'Status',    names: ['Active', 'Status', 'Stage', 'Priority', 'Approved', 'Flag'] },
  { cat: 'Relations', names: ['Parent', 'Group', 'Category', 'Type', 'Class', 'Sector'] },
];

// ---- Predefined names drag panel ----
function PredefinedNamesPanel({ onDrop, locked }) {
  const [open, setOpen] = React.useState({ Identity: true, Dates: false, Amounts: false, Geography: false, Status: false, Relations: false });
  return (
    <div className="ill-pred-panel">
      <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ink-4)', marginBottom: 2 }}>Predefined names</div>
        <div style={{ fontSize: 11, color: 'var(--ink-5)' }}>Drag into the grid</div>
      </div>
      {PREDEFINED_NAMES.map(sec => (
        <div key={sec.cat}>
          <div className="ill-pred-section" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
               onClick={() => setOpen(o => ({ ...o, [sec.cat]: !o[sec.cat] }))}>
            <IcChevDown size={10} style={{ transform: open[sec.cat] ? 'none' : 'rotate(-90deg)', transition: 'transform .1s' }} />
            {sec.cat}
          </div>
          {open[sec.cat] && sec.names.map(n => (
            <div key={n} className="ill-pred-item"
                 draggable={!locked}
                 onDragStart={e => { e.dataTransfer.setData('ill-predefined-name', n); }}>
              <span className="ill-drag-dot">⣿</span>
              {n}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---- Template names grid ----
function NamesGrid({ tpl, onChange, locked }) {
  const [dragId, setDragId] = React.useState(null);
  const [dropPred, setDropPred] = React.useState(false);

  function updateName(id, patch) {
    onChange({ ...tpl, names: tpl.names.map(n => n.id === id ? { ...n, ...patch } : n) });
  }
  function deleteName(id) {
    onChange({ ...tpl, names: tpl.names.filter(n => n.id !== id) });
  }
  function addName(illustratedName = '') {
    const n = { id: 'n' + Date.now(), illustratedName, desc: '', fieldName: '', type: 'Text',
                default: '', format: '', decode: 'None', decObj: '', decJoin: '', decField: '', sortField: '' };
    onChange({ ...tpl, names: [...tpl.names, n] });
  }
  function reorder(overId) {
    if (!dragId || dragId === overId) return;
    const arr = [...tpl.names];
    const from = arr.findIndex(n => n.id === dragId);
    const to   = arr.findIndex(n => n.id === overId);
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    onChange({ ...tpl, names: arr });
  }

  return (
    <div
      className="ill-names-outer"
      onDragOver={e => { e.preventDefault(); setDropPred(true); }}
      onDragLeave={() => setDropPred(false)}
      onDrop={e => {
        setDropPred(false);
        const predName = e.dataTransfer.getData('ill-predefined-name');
        if (predName) addName(predName);
      }}
      style={{ outline: dropPred ? '2px dashed var(--magenta)' : undefined }}>
      <div className="ill-names-scroll">
        <table className="ill-names-table">
          <thead>
            <tr>
              <th style={{ width: 20 }}></th>
              <th style={{ minWidth: 160 }}>Illustrated name</th>
              <th style={{ minWidth: 200 }}>Description</th>
              <th style={{ minWidth: 140 }}>Field name</th>
              <th style={{ minWidth: 80 }}>Type</th>
              <th style={{ minWidth: 70 }}>Default</th>
              <th style={{ minWidth: 100 }}>Format</th>
              <th style={{ minWidth: 80 }}>Decode</th>
              <th style={{ minWidth: 120 }}>Dec. object</th>
              <th style={{ minWidth: 100 }}>Dec. join</th>
              <th style={{ minWidth: 100 }}>Dec. field</th>
              <th style={{ minWidth: 100 }}>Sort field</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {tpl.names.map((n, i) => (
              <tr key={n.id}
                  draggable={!locked}
                  onDragStart={() => setDragId(n.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={e => { e.preventDefault(); reorder(n.id); }}>
                <td style={{ cursor: 'grab', color: 'var(--ink-5)', textAlign: 'center', padding: '5px 4px' }}>⣿</td>
                <td><input className="ill-name-input" value={n.illustratedName} disabled={locked}
                           style={{ fontWeight: 500 }}
                           onChange={e => updateName(n.id, { illustratedName: e.target.value })} /></td>
                <td><input className="ill-name-input" value={n.desc} disabled={locked} placeholder="Description…"
                           onChange={e => updateName(n.id, { desc: e.target.value })} /></td>
                <td><input className="ill-name-input mono" value={n.fieldName} disabled={locked} placeholder="optional"
                           onChange={e => updateName(n.id, { fieldName: e.target.value })} /></td>
                <td>
                  <select className="ill-name-select" value={n.type} disabled={locked}
                          onChange={e => updateName(n.id, { type: e.target.value, format: '' })}>
                    {ILL_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td><input className="ill-name-input" value={n.default} disabled={locked} placeholder="—"
                           onChange={e => updateName(n.id, { default: e.target.value })} /></td>
                <td>
                  {ILL_FORMATS[n.type] ? (
                    <select className="ill-name-select" value={n.format} disabled={locked}
                            onChange={e => updateName(n.id, { format: e.target.value })}>
                      <option value="">—</option>
                      {ILL_FORMATS[n.type].map(f => <option key={f}>{f}</option>)}
                    </select>
                  ) : (
                    <input className="ill-name-input" value={n.format} disabled={locked} placeholder="—"
                           onChange={e => updateName(n.id, { format: e.target.value })} />
                  )}
                </td>
                <td>
                  <select className="ill-name-select" value={n.decode} disabled={locked}
                          onChange={e => updateName(n.id, { decode: e.target.value })}>
                    {ILL_DECODES.map(d => <option key={d}>{d}</option>)}
                  </select>
                </td>
                <td><input className="ill-name-input mono" value={n.decObj} disabled={locked || n.decode === 'None'} placeholder={n.decode !== 'None' ? 'Table/Object' : '—'}
                           onChange={e => updateName(n.id, { decObj: e.target.value })} /></td>
                <td><input className="ill-name-input mono" value={n.decJoin} disabled={locked || n.decode !== 'Object'} placeholder={n.decode === 'Object' ? 'Join key' : '—'}
                           onChange={e => updateName(n.id, { decJoin: e.target.value })} /></td>
                <td><input className="ill-name-input mono" value={n.decField} disabled={locked || !['Object','Join','Field'].includes(n.decode)} placeholder={['Object','Join','Field'].includes(n.decode) ? 'Display field' : '—'}
                           onChange={e => updateName(n.id, { decField: e.target.value })} /></td>
                <td><input className="ill-name-input mono" value={n.sortField} disabled={locked || n.decode !== 'Sort by Field'} placeholder={n.decode === 'Sort by Field' ? 'Sort field' : '—'}
                           onChange={e => updateName(n.id, { sortField: e.target.value })} /></td>
                <td><button className="icon-btn" disabled={locked} onClick={() => deleteName(n.id)}><IcTrash size={13} /></button></td>
              </tr>
            ))}
            {!tpl.names.length && (
              <tr>
                <td colSpan={13} style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--ink-4)', fontStyle: 'italic' }}>
                  Drag names from the panel on the left, or click "Add name"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// IllustratorTemplate — main template editor
// ============================================================
const ILL_TPL_TABS = [
  { id: 'names',    label: 'Names' },
  { id: 'category', label: 'Categorization' },
  { id: 'comments', label: 'Comments' },
];

const ILL_ROLES = ['Entity', 'Transaction', 'Reference', 'Derived', 'Aggregate', 'Configuration'];
const ILL_USES  = ['Illustrator', 'Reports', 'API', 'Dashboard', 'Export'];

function IllustratorTemplate({ tpl, tplName, onChange }) {
  const [tab, setTab]         = React.useState('names');
  const [showAi, setShowAi]   = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const compKey = 'ill-tpl:' + tplName;
  const collab  = useCollab();
  const locked  = !collab.components[compKey] || collab.components[compKey].status !== 'me';

  function applyAiSuggestions(suggs) {
    const newNames = suggs.map(s => ({
      id: 'n' + Date.now() + Math.random(),
      illustratedName: s.name, desc: s.desc, fieldName: '', type: s.type || 'Text',
      default: '', format: s.format || '', decode: s.decode || 'None',
      decObj: '', decJoin: '', decField: '', sortField: '',
    }));
    onChange({ ...tpl, names: [...tpl.names, ...newNames] });
    ruleToast(`${newNames.length} name${newNames.length !== 1 ? 's' : ''} added from AI suggestions`, 'success');
    collabLogChange(compKey, { action: 'AI add names', after: newNames.map(n => n.illustratedName) });
    setShowAi(false);
  }

  return (
    <div className="wb-body">
      <div className="wb-body-head">
        <div className="title-row">
          <span className="head-icon"><IcIllustrator size={18} /></span>
          <h1>
            {tplName}
            <span className="ver-pill">EDM {tpl.version} <IcChevDown size={10} /></span>
          </h1>
          <div className="right hstack" style={{ gap: 6 }}>
            <span className="env-pill" style={{ background: 'var(--bg-2)', color: 'var(--ink-3)' }}>
              <IcRules size={11} /> {tpl.names.length} names
            </span>
            <button className="ai-star" title="AI Assist" onClick={() => setShowAi(v => !v)}><IcSparkle size={16} /></button>
          </div>
        </div>
        <div className="desc">Template — glossary of illustrated names. No source table is bound at this stage.</div>
      </div>

      <CheckoutBar componentKey={compKey} label={tplName} type="Illustrator Template"
                   onOpenHistory={() => setShowHistory(true)} />
      {showHistory && <HistoryModal componentKey={compKey} label={tplName} onClose={() => setShowHistory(false)} />}

      <div className="wb-body-toolbar">
        <button className="btn ghost" onClick={() => { ruleToast('Saved', 'success'); collabLogChange(compKey, { action: 'Save' }); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg> Save
        </button>
        <button className="btn primary" onClick={() => ruleToast('Template published', 'success')}>
          <IcCheck size={14} /> Publish
        </button>
        <div className="tool-sep" />
        <button className="icon-btn" title="Export template" onClick={() => ruleToast('Exported', 'info')}><IcExport size={14} /></button>
        <div className="spacer" />
        <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from Template editor')}>
          <IcShield size={16} />
        </button>
      </div>

      <div className="tabs" style={{ padding: '0 24px', margin: 0, borderBottom: '1px solid var(--line)' }}>
        {ILL_TPL_TABS.map(t => <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'names' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <PredefinedNamesPanel locked={locked} />
            <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 32px' }}>
              {showAi && (
                <div style={{ marginBottom: 16 }}>
                  <IllustratorAiPanel mode="glossary" template={tpl}
                    onApply={applyAiSuggestions}
                    onClose={() => setShowAi(false)} />
                </div>
              )}
              <div className="hstack" style={{ marginBottom: 10, gap: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>{tpl.names.length} names · drag rows to reorder · drag from panel to add</span>
                <span style={{ flex: 1 }} />
                <button className="btn primary" style={{ fontSize: 12 }} disabled={locked}
                        onClick={() => onChange({ ...tpl, names: [...tpl.names, { id: 'n'+Date.now(), illustratedName: '', desc: '', fieldName: '', type: 'Text', default: '', format: '', decode: 'None', decObj: '', decJoin: '', decField: '', sortField: '' }] })}>
                  <IcPlus size={13} /> Add name
                </button>
              </div>
              <NamesGrid tpl={tpl} onChange={onChange} locked={locked} />
            </div>
          </div>
        )}

        {tab === 'category' && (
          <div style={{ padding: '16px 24px 32px', maxWidth: 680 }}>
            <div className="kv-sec-label" style={{ marginBottom: 8 }}>Template role</div>
            <div className="select-wrap" style={{ maxWidth: 260, marginBottom: 20 }}>
              <select className="select" disabled={locked}
                      defaultValue={tpl.category?.role || 'Entity'}>
                {ILL_ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="kv-sec-label" style={{ marginBottom: 10 }}>Used in</div>
            <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
              {ILL_USES.map(u => {
                const active = (tpl.category?.uses || ['Illustrator']).includes(u);
                return (
                  <span key={u} className={`tb-use-tag${active ? ' active' : ''}`}>
                    {active && <IcCheck size={12} />}{u}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'comments' && (
          <div style={{ padding: '16px 24px 32px', maxWidth: 720 }}>
            <div className="kv-sec-label" style={{ marginBottom: 8 }}>Template description</div>
            <textarea className="textarea" style={{ minHeight: 120 }} disabled={locked}
                      defaultValue={tpl.description || ''}
                      placeholder="Purpose and usage of this template…" />
          </div>
        )}
      </div>
    </div>
  );
}

window.IllustratorTemplate = IllustratorTemplate;
