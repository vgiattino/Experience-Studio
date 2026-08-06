// ============================================================
// Solution — vertical flow canvas with connected nodes
// ============================================================

const SOLUTION_COMPONENTS = [
  '0000 Execute PL Solution',
  '0000 GLEIF Party',
  '0000 Manual Security Test Harness Solution',
  '0000 Party',
  '0000 Reset Master Universe Values',
  '0000 Security Corporate Actions',
  '0000 Security',
  '0000 SPGlobal Corporate Actions Delta Request',
  '0000 SPGlobal Corporate Actions Full Request',
  '0000 Test Harness',
  '0000 Test Solution Bloomberg Party',
  '0000 Test Solution Bond Reference Data Party',
  '0000 Test Solution CIQ Party',
  '0000 Test Solution ILV Fund',
  '0000 Test Solution ILV Party',
  '0000 Test Solution ILV Security',
  '0000 Test Solution LSEG Party',
  '0000 Test Solution LSEG Security',
  '0000 Test Solution Party Process Keys Test Harness',
  '0000 Test Solution Price Process Keys Harness',
  '0000 Test Solution Security Corporate Actions',
  '0000 Test Solution Security Load Source Data Test H…',
  '0000 Test Solution Security Process Keys Test Harness',
  '0000 Test Solution SIX Party',
  '1000 Bloomberg Back Office Party Credit Risk',
];

const SOLUTION_NODES = [
  { id: 'n1', type: 'Data Porter',  title: 'Data Porter',  sub: 'Insert Party Adaptor Process Keys harness' },
  { id: 'n2', type: 'Data Porter',  title: 'Data Porter',  sub: 'Insert Party Adaptor Process Keys harness' },
  { id: 'n3', type: 'Solution',     title: 'Solution',     sub: '2000 Party' },
  { id: 'n4', type: 'Solution',     title: 'Solution',     sub: '4000 Master Party' },
  { id: 'n5', type: 'Solution',     title: 'Solution',     sub: '4000 Master Party Role All' },
];

function Solution() {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [selected, setSelected] = React.useState('0000 Party');
  const [activeNode, setActiveNode] = React.useState(null);
  const [zoom, setZoom] = React.useState(100);
  const [showHistory, setShowHistory] = React.useState(false);

  const filtered = SOLUTION_COMPONENTS.filter(c =>
    c.toLowerCase().includes(filter.toLowerCase()));

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
            {filtered.map((c, i) => (
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

      <div className="wb-body" style={{ position: 'relative' }}>
        <div className="wb-body-head">
          {!sidebarOpen && (
            <button className="icon-btn" style={{ float: 'left', marginRight: 12 }}
                    onClick={() => setSidebarOpen(true)}>
              <IcChevDoubleRight size={16} />
            </button>
          )}
          <div className="title-row">
            <span className="head-icon"><IcSolutions size={18} /></span>
            <h1>
              {selected}
              <span className="ver-pill">v4.2.1 <IcChevDown size={10} /></span>
            </h1>
            <div className="right">
              <button className="ai-star" title="AI Assist"><IcSparkle size={16} /></button>
            </div>
          </div>
          <div className="desc">The Solution is a flow that connects multiple processes into one automated sequence.</div>
        </div>

        <div className="wb-body-toolbar">
          <div className="hstack">
            <button className="btn primary"><IcPlus size={14} /> Add <IcChevDown size={12} /></button>
          </div>
          <button className="btn ghost" disabled><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save</button>
          <div className="tool-sep" />
          <button className="icon-btn"><IcUndo size={16} /></button>
          <button className="icon-btn"><IcRedo size={16} /></button>
          <div className="tool-sep" />
          <button className="icon-btn"><IcPlay size={14} /></button>
          <button className="icon-btn"><IcStop size={12} /></button>
          <button className="icon-btn"><IcCog size={16} /></button>
          <button className="icon-btn" onClick={() => setShowHistory(s => !s)}>
            <IcHistory size={16} />
          </button>
        </div>

        <div className="flow-canvas" style={{ position: 'relative' }}>
          <div style={{ transform: `scale(${zoom/100})`, transformOrigin: 'top center', transition: 'transform .2s' }}>
            <div className="flow-col">
              {SOLUTION_NODES.map((n, i) => {
                const Icon = n.type === 'Data Porter' ? IcPorter : IcSolutions;
                return (
                  <React.Fragment key={n.id}>
                    <div className={`flow-node ${activeNode === n.id ? 'active' : ''}`}
                         onClick={() => setActiveNode(n.id)}>
                      <div className="fn-head">
                        <span className="ic"><Icon size={16} /></span>
                        {n.title}
                      </div>
                      <div className="fn-sub">{n.sub}</div>
                      <div className="fn-foot">
                        <span>COMPONENT</span>
                        <span className="actions">
                          <button title="Edit"><IcEdit size={13} /></button>
                          <button title="View"><IcEye size={13} /></button>
                          <button title="Link"><IcLink size={13} /></button>
                        </span>
                      </div>
                    </div>
                    {i < SOLUTION_NODES.length - 1 && <div className="flow-edge" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="flow-zoom">
            <button onClick={() => setZoom(z => Math.max(40, z - 20))}><IcZoomOut size={14} /></button>
            <span className="pct">{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(200, z + 20))}><IcZoomIn size={14} /></button>
            <button onClick={() => setZoom(100)} title="Fit"><IcFullscreen size={14} /></button>
          </div>

          {showHistory && (
            <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 8 }}>
              <div className="popover fade-in" style={{ position: 'static', minWidth: 260 }}>
                <div className="popover-head">Version history</div>
                <div className="popover-list">
                  {[
                    { v: 'v4.2.1', by: 'Jimmy Brown', t: 'today, 9:14 AM',  current: true },
                    { v: 'v4.2.0', by: 'Kim Wexler',  t: 'yesterday, 4:02 PM' },
                    { v: 'v4.1.3', by: 'Saul Goodman', t: '10 Sep, 1:31 PM' },
                    { v: 'v4.1.2', by: 'Chuck McGill', t: '08 Sep, 11:08 AM' },
                  ].map(h => (
                    <div key={h.v} className="menu-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                      <span style={{ fontWeight: 500 }}>
                        {h.v} {h.current && <span style={{ color: 'var(--magenta)', fontSize: 11, marginLeft: 4 }}>● current</span>}
                      </span>
                      <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{h.by} · {h.t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.Solution = Solution;
