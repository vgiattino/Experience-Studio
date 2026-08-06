// ============================================================
// Porter — process editor
// Drives:
//   - Component list (left)
//   - Multi-row pipeline of chip-based steps
//   - Per-step property panel (see porter_panels.jsx)
//   - New-process and new-step modals
// ============================================================

const PORTER_COMPONENTS = [
  'Append Process Monitor',
  'Archive and Update File Monitor Bloomberg Back Office Security Corp Pf Failed File',
  'Archive Bloomberg Back Office Party Credit Risk Fail…',
  'Archive Bloomberg Back Office Party Credit Risk Suc…',
  'Archive Bloomberg Back Office Price Corp Pdf Exch…',
  'Archive Bloomberg Back Office Price Corp Pdf Failed…',
  'Archive Bloomberg Back Office Price Corp Pdf Succe…',
  'Archive Bloomberg Back Office Price Equity Failed File',
  'Archive Bloomberg Back Office Price Equity Success…',
  'Archive Bloomberg Back Office Price Govt Agency R…',
  'Archive Bloomberg Back Office Security Corp Pdf Cl…',
  'Archive Bloomberg Back Office Security Corp Pdf Ex…',
  'Archive Bloomberg Back Office Security Corp Pdf Fai…',
  'Archive Bloomberg Back Office Security Corp Pdf M…',
  'Archive Bloomberg Back Office Security Corp Pdf SP…',
  'Archive Bloomberg Back Office Security Corp Pdf Su…',
  'Archive Bloomberg Back Office Security Currency Su…',
  'Archive Bloomberg Back Office Security Equity CINS…',
  'Archive Bloomberg Back Office Security Equity Faile…',
  'Archive Bloomberg Back Office Security Equity File a…',
  'Archive Bloomberg Back Office Security Equity MIFI…',
  'Archive Bloomberg Back Office Security Equity Succ…',
];

// ------------------------------------------------------------
// Chip palette (icon + colour per step type)
// ------------------------------------------------------------
const CHIP_TYPES = {
  'Archive File':           { c: 'proc-c-blue',   ic: 'IcArchive',     pt: 'File_Function' },
  'Archive File list':      { c: 'proc-c-blue',   ic: 'IcArchive',     pt: 'File_Function' },
  'Variables':              { c: 'proc-c-pink',   ic: 'IcVariables',   pt: 'Variable_Assignment' },
  'Source File':            { c: 'proc-c-orange', ic: 'IcFile',        pt: 'File_Source' },
  'File Action':            { c: 'proc-c-purple', ic: 'IcLightning',   pt: 'Action' },
  'Target File':            { c: 'proc-c-teal',   ic: 'IcFile',        pt: 'File_Target' },
  'Update file monitor':    { c: 'proc-c-blue',   ic: 'IcConnect',     pt: 'Monitor' },
  'Source connection':      { c: 'proc-c-pink',   ic: 'IcConnect',     pt: 'Connection' },
  'Source Data':            { c: 'proc-c-orange', ic: 'IcFile',        pt: 'Port_Data' },
  'Source Attributes':      { c: 'proc-c-pink',   ic: 'IcAttribute',   pt: 'Port_Data' },
  'Change Tolerance':       { c: 'proc-c-purple', ic: 'IcShield',      pt: 'Port_Data' },
  'Source Deduplication':   { c: 'proc-c-teal',   ic: 'IcMatcher',     pt: 'Deduplication' },
  'Target Connection':      { c: 'proc-c-pink',   ic: 'IcConnect',     pt: 'Connection' },
  'Target Table':           { c: 'proc-c-blue',   ic: 'IcManager',     pt: 'Port_Data' },
  'Update Control':         { c: 'proc-c-orange', ic: 'IcSliders',     pt: 'Action' },
  'Field Mapping':          { c: 'proc-c-teal',   ic: 'IcRules',       pt: 'Port_Data' },
  'Source SQL':             { c: 'proc-c-orange', ic: 'IcManager',     pt: 'Port_Data' },
  'Plug-In':                { c: 'proc-c-purple', ic: 'IcLightning',   pt: 'Plug_In' },
  'Test':                   { c: 'proc-c-blue',   ic: 'IcArchive',     pt: 'Port_Data' },
  'File Transfer':          { c: 'proc-c-teal',   ic: 'IcFile',        pt: 'File_Transfer' },
  'Email':                  { c: 'proc-c-purple', ic: 'IcSend',        pt: 'E_Mail' },
  'Delete Data':            { c: 'proc-c-orange', ic: 'IcTrash',       pt: 'Delete_Data' },
  'DB Process':             { c: 'proc-c-blue',   ic: 'IcSource',      pt: 'DB_Process' },
};
const CHIP_TYPE_LIST = Object.keys(CHIP_TYPES);
window.CHIP_TYPES = CHIP_TYPES;

// ------------------------------------------------------------
// Initial process pipelines (matching the screenshots)
// ------------------------------------------------------------
function makeStep(type, name) {
  return {
    id: 's-' + Math.random().toString(36).slice(2, 9),
    type,
    name: name || type.toLowerCase().replace(/\s+/g, '_'),
    props: {},
  };
}

const INITIAL_PROCESSES = [
  { id: 'P1', name: 'Archive File', nodes: [
    makeStep('Archive File', 'Archive File'),
    makeStep('Variables'),
    makeStep('Source File'),
    makeStep('File Action'),
    makeStep('Target File'),
  ]},
  { id: 'P2', name: 'Archive File list', nodes: [
    makeStep('Archive File list', 'Archive File list'),
    makeStep('Variables'),
    makeStep('Source File'),
    makeStep('File Action'),
    makeStep('Target File'),
  ]},
  { id: 'P3', name: 'Update file monitor', nodes: [
    makeStep('Update file monitor'),
    makeStep('Source connection'),
    makeStep('Source Data'),
    makeStep('Variables'),
    makeStep('Source Deduplication'),
    makeStep('Target Connection'),
    makeStep('Target Table'),
    makeStep('Update Control'),
    makeStep('Field Mapping'),
  ]},
  { id: 'P4', name: 'Test', nodes: [
    makeStep('Test', 'Test'),
    makeStep('Source File'),
    makeStep('Source Attributes'),
    makeStep('Change Tolerance'),
    makeStep('Variables'),
    makeStep('Source Deduplication'),
    makeStep('Target Connection'),
    makeStep('Target Table'),
    makeStep('Update Control'),
    makeStep('Field Mapping'),
  ]},
];

// Maps short display names (from Components panel) to full bundle keys
const DISPLAY_NAME_MAP = {
  'Archive & Update File Monitor': 'Archive and Update File Monitor Bloomberg Back Office Security Corp Pfd V2 Sucess File',
  'BBG Nightly File Porter':       'Archive Bloomberg Back Office Security Equity Success File',
  'Insert Party Adaptor Process Keys': 'In Gearbox API',
};

// ------------------------------------------------------------
// Live: derive morning-shaped processes/nodes from a parsed
// XML model, seeding each panel with real values (round-trip-safe).
// ------------------------------------------------------------
function liveProcesses(model) {
  const pushVars = (nodes, s, si) => {
    if (s.variables.length) {
      nodes.push({ id: 'n' + si + '-' + nodes.length, type: 'Variables', name: 'Variables',
        props: { vars: { input: s.variables.map((v, i) => ({ id: 'v' + i, name: v.name, value: v.value })),
                         file: [], fileName: [], sql: [] } } });
    }
  };
  const pushTargets = (nodes, s, si, opts = {}) => {
    s.targets.forEach(t => {
      if (opts.targetConnection) {
        nodes.push({ id: 'n' + si + '-' + nodes.length, type: 'Target Connection', name: 'Target Connection', props: {} });
      }
      nodes.push({ id: 'n' + si + '-' + nodes.length, type: 'Target Table', name: 'Target Table',
        props: { table: t.isFile ? t.fileName : t.table } });
      if (t.updateType) {
        nodes.push({ id: 'n' + si + '-' + nodes.length, type: 'Update Control', name: 'Update Control', props: {
          mode: /Append/i.test(t.updateType) ? 'append' : /Update|Controlled/i.test(t.updateType) ? 'controlled' : 'overwrite',
          keys: t.keys,
        }});
      }
      if (t.mappings.length) {
        nodes.push({ id: 'n' + si + '-' + nodes.length, type: 'Field Mapping', name: 'Field Mapping', props: {
          mappings: t.mappings.map((m, i) => ({
            id: 'fm' + i,
            source: m.value || '<null>',
            sourceType: m.value && m.value.indexOf('{RUNTIME') === 0 ? 'runtime' : '',
            target: m.name.replace(/^\{TABLE\}\./, '').replace(/[\[\]]/g, ''),
            targetType: '',
          })),
        }});
      }
    });
  };

  return model.steps.map((s, si) => {
    const nodes = [];
    const push = (type, props) => nodes.push({ id: 'n' + si + '-' + nodes.length, type, name: type, props: props || {} });
    const pt = s.procType || '';

    if (pt === 'File_Function') {
      // Determine first chip: use step name if it matches a known chip, else derive from "list" in name
      const firstChip = CHIP_TYPES[s.name] ? s.name : (/list/i.test(s.name) ? 'Archive File list' : 'Archive File');
      push(firstChip, {});
      pushVars(nodes, s, si);
      push('Source File', { uncPath: s.source.unc || s.source.path, fileName: s.source.fileName,
                            dateFormat: s.source.dateFmt, encoding: s.source.encoding, mode: 'manual', useUNC: true });
      push('File Action', {});
      if (s.targets.length) {
        s.targets.forEach(t => push('Target File', { fileName: t.isFile ? t.fileName : t.table }));
      } else {
        push('Target File', {});
      }

    } else if (pt === 'Monitor') {
      push('Update file monitor', {});
      push('Source connection', {});
      push('Source Data', {});
      pushVars(nodes, s, si);
      push('Source Deduplication', {});
      if (s.targets.length) {
        pushTargets(nodes, s, si, { targetConnection: true });
      } else {
        push('Target Connection', {});
        push('Target Table', {});
        push('Field Mapping', {});
      }

    } else if (pt === 'Plug_In' || s.kind === 'plugin') {
      push('Plug-In', { assembly: s.source.assembly, typeName: s.source.typeName, params: s.source.params });
      pushVars(nodes, s, si);
      pushTargets(nodes, s, si);

    } else if (pt === 'File_Transfer') {
      push('File Transfer', {});
      pushVars(nodes, s, si);
      if (s.targets.length) {
        s.targets.forEach(t => push('Target File', { fileName: t.isFile ? t.fileName : t.table }));
      } else {
        push('Target File', {});
      }

    } else if (pt === 'Delete_Data') {
      push('Delete Data', {});
      push('Source Data', {});
      pushVars(nodes, s, si);
      pushTargets(nodes, s, si, { targetConnection: true });

    } else if (pt === 'E_Mail') {
      push('Email', {});
      push('Source Data', {});
      pushVars(nodes, s, si);
      if (s.targets.length) pushTargets(nodes, s, si);

    } else if (pt === 'DB_Process') {
      push('DB Process', {});
      push('Source Data', {});
      pushVars(nodes, s, si);
      if (s.targets.length) pushTargets(nodes, s, si, { targetConnection: true });

    } else if (s.kind === 'sql') {
      push('Source SQL', { sql: s.source.sql });
      pushVars(nodes, s, si);
      pushTargets(nodes, s, si, { targetConnection: true });

    } else {
      // Port_Data and any remaining kinds
      if (s.kind === 'file') {
        push('Source File', { uncPath: s.source.unc || s.source.path, fileName: s.source.fileName,
                              dateFormat: s.source.dateFmt, encoding: s.source.encoding, mode: 'manual', useUNC: true });
        push('Source Attributes', {});
        push('Change Tolerance', {});
      } else {
        // Data_Source (kind=none) or any other unrecognised kind
        push('Source Data', {});
      }
      pushVars(nodes, s, si);
      push('Source Deduplication', {});
      if (s.targets.length) {
        pushTargets(nodes, s, si, { targetConnection: true });
      } else {
        push('Target Connection', {});
        push('Target Table', {});
        push('Field Mapping', {});
      }
    }

    return { id: 'P' + (si + 1), name: s.name, nodes };
  });
}

// ------------------------------------------------------------
// New DataPort Step modal
// ------------------------------------------------------------
function NewStepModal({ defaults, onSave, onCancel }) {
  const [name, setName] = React.useState(defaults?.name || '');
  const [type, setType] = React.useState(defaults?.type || 'Source File');
  const [source, setSource] = React.useState(defaults?.source || 'Data Source');
  const [target, setTarget] = React.useState(defaults?.target || 'Data Source');
  const cfg = CHIP_TYPES[type] || CHIP_TYPES['Source File'];
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-head">
          <h3><IcPorter size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              {defaults?.editing ? 'Edit Step' : 'New DataPort Step'}</h3>
        </div>
        <div className="modal-body">
          <div className="muted" style={{ marginBottom: 14 }}>
            Add a new DataPort process input step
          </div>

          <div className="field">
            <label className="field-label">Name</label>
            <input className="input" autoFocus value={name}
                   onChange={e => setName(e.target.value)}
                   placeholder="e.g. ingest_bbg_prices" />
          </div>

          <div className="field">
            <label className="field-label">Step type</label>
            <div className="step-palette">
              {CHIP_TYPE_LIST.filter(t => t !== 'Test').map(t => {
                const Icon = window[CHIP_TYPES[t].ic];
                return (
                  <button key={t}
                          type="button"
                          className={`step-palette-item ${type === t ? 'selected' : ''}`}
                          onClick={() => setType(t)}>
                    <span className="sp-icon"><Icon size={16} /></span>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="props-grid">
            <div className="field" style={{ margin: 0 }}>
              <label className="field-label">Process type</label>
              <input className="input" value={cfg.pt} disabled />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="field-label">Source</label>
              <div className="select-wrap">
                <select className="select" value={source}
                        onChange={e => setSource(e.target.value)}>
                  <option>Data Source</option>
                  <option>Delimited File</option>
                  <option>Delimited Message</option>
                  <option>File Contents</option>
                  <option>Message Contents</option>
                  <option>XML Data Source</option>
                  <option>XML File</option>
                  <option>XML Message</option>
                </select>
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="field-label">Target</label>
              <div className="select-wrap">
                <select className="select" value={target}
                        onChange={e => setTarget(e.target.value)}>
                  <option>Data Source</option>
                  <option>Database Table</option>
                  <option>Delimited File</option>
                  <option>XML File</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()}
                  onClick={() => onSave({ name: name.trim(), type, source, target })}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Inline chip picker (when adding step mid-row, no full modal)
// ------------------------------------------------------------
function ChipPicker({ onPick, onCancel, anchor = 'left' }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onCancel(); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onCancel]);
  return (
    <div ref={ref} className="popover fade-in"
         style={{ position: 'absolute', top: 28, [anchor]: 0, minWidth: 200, padding: 4 }}>
      {CHIP_TYPE_LIST.filter(t => t !== 'Test').map(t => {
        const Icon = window[CHIP_TYPES[t].ic];
        return (
          <div key={t} className="menu-item" onClick={() => onPick(t)}>
            <Icon size={14} /> {t}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Main Porter screen
// ============================================================
function Porter({ selectedName, hideSidebar } = {}) {
  const bundleNames = window.PORTER_BUNDLE_NAMES || [];
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [enabled, setEnabled] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [selected, setSelected] = React.useState(selectedName || bundleNames[0] || PORTER_COMPONENTS[1]);

  // sync externally-driven selection
  React.useEffect(() => {
    if (selectedName) setSelected(selectedName);
  }, [selectedName]);

  // live XML
  const importedRef = React.useRef({});
  const [importedNames, setImportedNames] = React.useState([]);
  const fileInputRef = React.useRef(null);
  const folderInputRef = React.useRef(null);
  const [model, setModel] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);

  const [processes, setProcesses] = React.useState(INITIAL_PROCESSES);
  const [activeStep, setActiveStep] = React.useState({ proc: 'P1', idx: 0 });
  const [showNewStep, setShowNewStep] = React.useState(null);  // null | {procId} | 'newprocess'
  const [showChipPicker, setShowChipPicker] = React.useState(null); // { procId, idx }
  const [confirmDel, setConfirmDel] = React.useState(null);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const collab = useCollab();
  const compKey = 'porter:' + selected;
  const compState = collab.components[compKey];
  const locked = !compState || compState.status !== 'me';
  const [showProperties, setShowProperties] = React.useState(false);
  const [showRun, setShowRun] = React.useState(false);

  function rawFor(name) {
    const bundleKey = DISPLAY_NAME_MAP[name] || name;
    return importedRef.current[name] || (window.PORTER_BUNDLE || {})[name] || (window.PORTER_BUNDLE || {})[bundleKey];
  }
  const allNames = React.useMemo(() => {
    const real = [...new Set([...importedNames, ...bundleNames])];
    return real.length ? real.sort((a, b) => a.localeCompare(b)) : PORTER_COMPONENTS;
  }, [importedNames]);
  const filtered = allNames.filter(c => c.toLowerCase().includes(filter.toLowerCase()));

  // parse selected XML → derive morning-shaped processes seeded with real values
  React.useEffect(() => {
    const raw = rawFor(selected);
    if (!raw) { setModel(null); setProcesses(INITIAL_PROCESSES); setActiveStep({ proc: 'P1', idx: 0 }); return; }
    try {
      const m = buildPorterModel(edmParse(raw));
      setModel(m);
      const procs = liveProcesses(m);
      setProcesses(procs);
      setActiveStep({ proc: procs[0]?.id || 'P1', idx: 0 });
      setDirty(false);
    } catch (e) {
      setModel(null); setProcesses(INITIAL_PROCESSES);
      ruleToast('Could not parse ' + selected + ': ' + e.message, 'error');
    }
  }, [selected, importedNames]);

  React.useEffect(() => {
    if (folderInputRef.current) { folderInputRef.current.setAttribute('webkitdirectory', ''); folderInputRef.current.setAttribute('directory', ''); }
  }, []);

  function ingestFiles(fileList) {
    const files = [...fileList].filter(f => /\.xml$/i.test(f.name));
    if (!files.length) { ruleToast('No .xml files found', 'error'); return; }
    let pending = files.length; const added = [];
    files.forEach(f => {
      const r = new FileReader();
      r.onload = () => {
        const nm = f.name.replace(/\.DP\.xml$/i, '').replace(/\.xml$/i, '');
        importedRef.current[nm] = r.result; added.push(nm);
        if (--pending === 0) {
          setImportedNames(n => [...new Set([...n, ...added])]);
          if (added.length === 1) setSelected(added[0]);
          ruleToast(`Loaded ${added.length} Porter${added.length === 1 ? '' : 's'} from XML`, 'success');
        }
      };
      r.readAsText(f);
    });
  }
  function exportXml() {
    if (!model) { ruleToast('No live component to export', 'info'); return; }
    const xml = serializePorter(model.doc);
    const blob = new Blob([xml], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = selected + '.DP.xml';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    ruleToast(`Exported ${selected}.DP.xml${dirty ? ' with your edits' : ''}`, 'success');
    setDirty(false);
  }

  const filteredComponents = filtered;

  const proc = processes.find(p => p.id === activeStep.proc);
  const step = proc?.nodes[activeStep.idx];

  // -------------------- mutations --------------------
  function updateStep(stepProps) {
    setProcesses(processes.map(p => p.id === activeStep.proc
      ? { ...p, nodes: p.nodes.map((n, i) =>
            i === activeStep.idx ? { ...n, props: stepProps } : n) }
      : p));
    if (model) setDirty(true);
  }

  function addProcess({ name, type, source, target }) {
    const newProc = {
      id: 'P' + (processes.length + 1),
      name,
      nodes: [ makeStep(type, name) ],
    };
    setProcesses([...processes, newProc]);
    setActiveStep({ proc: newProc.id, idx: 0 });
    setShowNewStep(null);
    ruleToast(`Added process "${name}" — ${type}`, 'success');
  }

  function addStepToProcess(procId, stepType) {
    setProcesses(processes.map(p => {
      if (p.id !== procId) return p;
      const newStep = makeStep(stepType, stepType.toLowerCase().replace(/\s+/g, '_'));
      const nodes = [...p.nodes, newStep];
      setActiveStep({ proc: procId, idx: nodes.length - 1 });
      return { ...p, nodes };
    }));
    setShowChipPicker(null);
    ruleToast(`Added "${stepType}" step`, 'success');
  }

  function deleteStep(procId, idx) {
    setProcesses(processes.map(p => {
      if (p.id !== procId) return p;
      const nodes = p.nodes.filter((_, i) => i !== idx);
      return { ...p, nodes };
    }));
    if (activeStep.proc === procId && activeStep.idx >= idx) {
      setActiveStep(a => ({ ...a, idx: Math.max(0, a.idx - 1) }));
    }
    setConfirmDel(null);
    ruleToast('Step removed', 'info');
  }

  function deleteProcess(procId) {
    const next = processes.filter(p => p.id !== procId);
    setProcesses(next);
    if (activeStep.proc === procId) {
      setActiveStep({ proc: next[0]?.id || 'P1', idx: 0 });
    }
    setConfirmDel(null);
    ruleToast('Process removed', 'info');
  }

  return (
    <div className="workbench" style={hideSidebar ? { gridTemplateColumns: '1fr' } : undefined}>
      {!hideSidebar && sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">
              Porter
              <button className="icon-btn" title="New process"><IcPlus size={16} /></button>
            </span>
            <button className="icon-btn" title="Collapse panel"
                    onClick={() => setSidebarOpen(false)}>
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
            {filtered.map((c, i) => (
              <div key={i}
                   className={`wb-list-item ${c === selected ? 'active' : ''}`}
                   title={c}
                   onClick={() => setSelected(c)}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</span>
                {importedRef.current[c] && <span className="new-tag" style={{ fontSize: 8 }}>LIVE</span>}
                {!rawFor(c) && <span style={{ fontSize: 9, color: 'var(--ink-5)' }}>○</span>}
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn" style={{ justifyContent: 'center' }} onClick={() => folderInputRef.current?.click()}>
              <IcConnect size={14} /> Connect config folder
            </button>
            <button className="btn ghost" style={{ justifyContent: 'center', fontSize: 12 }} onClick={() => fileInputRef.current?.click()}>
              <IcImport size={13} /> Import .DP.xml file(s)
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept=".xml" multiple style={{ display: 'none' }}
                 onChange={e => { ingestFiles(e.target.files); e.target.value = ''; }} />
          <input ref={folderInputRef} type="file" multiple style={{ display: 'none' }}
                 onChange={e => { ingestFiles(e.target.files); e.target.value = ''; }} />
        </div>
      )}

      <div className="wb-body">
        <div className="wb-body-head">
          {!hideSidebar && !sidebarOpen && (
            <button className="icon-btn" style={{ float: 'left', marginRight: 12 }}
                    onClick={() => setSidebarOpen(true)} title="Open panel">
              <IcChevDoubleRight size={16} />
            </button>
          )}
          <div className="title-row">
            <span className="head-icon"><IcPorter size={18} /></span>
            <h1>
              {selected}
              {dirty && <span style={{ color: 'var(--amber)', fontSize: 12, marginLeft: 8, fontWeight: 500 }}>● unsaved</span>}
              <span className="ver-pill">{model ? 'EDM ' + model.version : 'v4.2.1'} <IcChevDown size={10} /></span>
            </h1>
            <div className="right">
              <label className="toggle">
                <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                <span className="track" />
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>
          </div>
          <div className="desc">
            {model
              ? <>Live configuration · {model.steps.length} input step{model.steps.length === 1 ? '' : 's'} · {importedRef.current[selected] ? 'imported from your file' : 'from connected config'} · round-trip enabled</>
              : 'Archives processed success files from the Bloomberg Back Office Corp Pfd feed and updates the target deduplication table.'}
          </div>
        </div>

        <CheckoutBar componentKey={compKey} label={selected} type="Porter"
                     onOpenHistory={() => setShowHistory(true)} />
        {showHistory && (
          <HistoryModal componentKey={compKey} label={selected}
                        onClose={() => setShowHistory(false)} />
        )}

        <div className="wb-body-toolbar">
          <button className="btn primary" disabled={locked}
                  onClick={() => setShowNewStep('newprocess')}>
            <IcPlus size={14} /> Add process
          </button>
          <button className="btn ghost" disabled={locked}
                  onClick={() => ruleToast('Saved', 'success')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save
          </button>
          <button className="btn" onClick={() => setShowProperties(true)}>
            <IcSliders size={14} /> Properties
          </button>
          <button className="icon-btn" title="Delete process" disabled={locked || !proc}
                  onClick={() => setConfirmDel({ kind: 'process', id: proc.id, name: proc.name })}>
            <IcTrash size={16} />
          </button>
          <div className="tool-sep" />
          <button className="icon-btn" title="Undo" disabled={locked}><IcUndo size={16} /></button>
          <button className="icon-btn" title="Redo" disabled={locked}><IcRedo size={16} /></button>
          <div className="tool-sep" />
          <button className="icon-btn" title="Execute the Process"
                  onClick={() => setShowRun(true)}>
            <IcPlay size={14} />
          </button>
          <button className="icon-btn" title="Stop"><IcStop size={12} /></button>
          <div className="spacer" />
          <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                  onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from Porter')}>
            <IcShield size={16} />
          </button>
          <button className="icon-btn" title="Import XML" onClick={() => fileInputRef.current?.click()}><IcImport size={16} /></button>
          <button className="icon-btn" title="Export to EDM XML (round-trip)" onClick={exportXml}><IcExport size={16} /></button>
          <div className="tool-sep" />
          <div style={{ position: 'relative' }}>
            <button className="icon-btn" title="Settings"
                    onClick={() => setShowSettings(s => !s)}>
              <IcCog size={16} />
            </button>
            {showSettings && (
              <div className="dropdown-menu fade-in" style={{ minWidth: 200 }}>
                <div className="menu-item"><IcRealign size={14} /> Auto-arrange</div>
                <div className="menu-item"><IcReset size={14} /> Reset layout</div>
                <div className="menu-item" onClick={() => collabCheckin(compKey, 'Checked in from Porter')}>
                  <IcShield size={14} /> Check in
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pipeline canvas */}
        <div style={{ padding: '8px 24px 4px', background: '#fafbfc',
                      overflowX: 'auto', borderBottom: '1px solid var(--line)' }}>
          {processes.map((p) => (
            <div key={p.id} className="proc-row">
              <span className="pn" title={p.name}>{p.id}</span>
              {p.nodes.map((node, i) => {
                const cfg = CHIP_TYPES[node.type] || CHIP_TYPES['Source File'];
                const Icon = window[cfg.ic];
                const isActive = activeStep.proc === p.id && activeStep.idx === i;
                return (
                  <React.Fragment key={node.id}>
                    <button className={`proc-chip ${cfg.c} ${isActive ? 'active' : ''}`}
                            onClick={() => setActiveStep({ proc: p.id, idx: i })}>
                      <Icon size={14} />
                      {node.type}
                    </button>
                    {i < p.nodes.length - 1 && (
                      <span className="proc-arrow"><IcArrowRight size={16} /></span>
                    )}
                  </React.Fragment>
                );
              })}
              <span className="proc-arrow"><IcArrowRight size={16} /></span>
              <div style={{ position: 'relative' }}>
                <button className="chip-ghost"
                        disabled={locked}
                        style={{ opacity: 1 }}
                        onClick={() => setShowChipPicker({ procId: p.id })}>
                  <IcPlus size={12} /> Add step
                </button>
                {showChipPicker?.procId === p.id && (
                  <ChipPicker
                    onPick={(t) => addStepToProcess(p.id, t)}
                    onCancel={() => setShowChipPicker(null)} />
                )}
              </div>
              <button className="icon-btn proc-row-delete"
                      disabled={locked}
                      title="Delete process"
                      onClick={() => setConfirmDel({ kind: 'process', id: p.id, name: p.name })}>
                <IcTrash size={13} />
              </button>
            </div>
          ))}

          <div className="proc-add-row">
            <button disabled={locked} onClick={() => setShowNewStep('newprocess')}>
              <IcPlus size={12} /> Add new process
            </button>
          </div>
        </div>

        {/* Step property panel */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {step ? (
            <>
              <div style={{ padding: '14px 24px 0',
                            display: 'flex', alignItems: 'baseline',
                            gap: 12, borderBottom: '1px solid transparent' }}>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600,
                             color: 'var(--ink-2)' }}>
                  {proc.id} · {step.type}
                </h2>
                <span className="muted" style={{ fontSize: 12 }}>
                  Specify the properties for this step
                </span>
                <div className="spacer" style={{ flex: 1 }} />
                <button className="icon-btn"
                        disabled={locked}
                        title="Delete this step"
                        onClick={() => setConfirmDel({ kind: 'step', procId: proc.id, idx: activeStep.idx, name: step.type })}>
                  <IcTrash size={14} />
                </button>
              </div>
              <StepPanel step={step} locked={locked} onUpdate={updateStep} />
            </>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-4)' }}>
              No step selected. Add one from a process row above.
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showNewStep === 'newprocess' && (
        <NewStepModal onCancel={() => setShowNewStep(null)} onSave={addProcess} />
      )}
      {showProperties && (
        <DataPorterProperties
          porterName={selected}
          processes={processes}
          locked={locked}
          onClose={() => setShowProperties(false)} />
      )}
      {showRun && (
        <PorterRunSheet
          porterName={selected}
          processes={processes}
          onClose={() => setShowRun(false)} />
      )}
      {confirmDel && (
        <ConfirmModal
          title={confirmDel.kind === 'step' ? 'Delete step?' : 'Delete process?'}
          message={confirmDel.kind === 'step'
            ? <>Remove the <strong>{confirmDel.name}</strong> step from this process? This can't be undone.</>
            : <>Delete process <strong>{confirmDel.name}</strong> and all its steps? This can't be undone.</>}
          confirmLabel="Delete"
          confirmKind="danger"
          onConfirm={() => confirmDel.kind === 'step'
            ? deleteStep(confirmDel.procId, confirmDel.idx)
            : deleteProcess(confirmDel.id)}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

window.Porter = Porter;
