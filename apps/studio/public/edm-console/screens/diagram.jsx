// ============================================================
// Diagram Builder — entity/relationship canvas
// Node kinds: table, view, fk, note, frame
// ============================================================

const DG_KINDS = {
  table: { label: 'Table',       color: '#0067bd', bg: '#eef3f7', border: '#b8d0e8', radius: 6 },
  view:  { label: 'View',        color: '#0f857a', bg: '#e7f6f3', border: '#9ed3cc', radius: 14 },
  fk:    { label: 'Foreign Key', color: '#6d28d9', bg: '#f3effe', border: '#c4b5fd', radius: 20 },
  note:  { label: 'Note',        color: '#92400e', bg: '#fffbeb', border: '#fcd34d', radius: 4 },
  frame: { label: 'Frame',       color: '#6b7280', bg: 'rgba(243,244,246,0.5)', border: '#d1d5db', radius: 8 },
};

const DG_DIAGRAMS = [
  'Party Lineage',
  'Pricing Flow',
  'Security Master Model',
  'Party Master Model',
  'Corporate Actions Model',
  'Fund Model',
  'Counterparty Relationship',
  'Price Hierarchy',
  'Source to Target – Party',
  'Source to Target – Security',
  'Source to Target – Pricing',
  'EDM Core Schema',
  'Instrument Master Relationships',
  'Reference Data Lineage',
  'Asset Class Taxonomy',
  'Identity Resolution Flow',
  'Data Quality Checks',
  'Processing Pipeline Overview',
  'Benchmark Hierarchy',
  'Regulatory Reporting Flow',
  'Client Data Model',
  'Market Data Distribution',
  'Reconciliation Model',
  'Audit Trail Schema',
  'Access Control Model',
];

function dgSeedFor(name) {
  if (name === 'Security Master Model') {
    return {
      nodes: [
        { id: 'fr1', kind: 'frame', x: 30,  y: 60,  w: 520, h: 320, title: 'Core Security' },
        { id: 'n1',  kind: 'table', x: 60,  y: 110, w: 200, label: 'EDM_SECURITY',   schema: 'CADIS', cols: ['EDM_SEC_ID','ISIN','CUSIP','SEDOL','SEC_NAME'] },
        { id: 'n2',  kind: 'table', x: 320, y: 110, w: 200, label: 'EDM_SEC_IDENT',  schema: 'CADIS', cols: ['EDM_SEC_ID','IDENT_TYPE','IDENT_VALUE'] },
        { id: 'n3',  kind: 'table', x: 60,  y: 280, w: 200, label: 'EDM_SEC_PRICE',  schema: 'CADIS', cols: ['EDM_SEC_ID','PRICE_DATE','PRICE','CCY'] },
        { id: 'n4',  kind: 'table', x: 320, y: 280, w: 200, label: 'EDM_SEC_RATING', schema: 'CADIS', cols: ['EDM_SEC_ID','RATING_AGENCY','RATING'] },
        { id: 'n5',  kind: 'view',  x: 600, y: 110, w: 200, label: 'CM_SECURITY_VW', schema: 'CADIS', cols: ['EDM_SEC_ID','DISPLAY_NAME','STATUS'] },
        { id: 'n6',  kind: 'view',  x: 600, y: 280, w: 200, label: 'CM_PRICE_VW',    schema: 'CADIS', cols: ['EDM_SEC_ID','LATEST_PRICE','CCY'] },
        { id: 'fk1', kind: 'fk',    x: 275, y: 155, w: 40,  label: 'FK' },
        { id: 'fk2', kind: 'fk',    x: 275, y: 315, w: 40,  label: 'FK' },
        { id: 'nt1', kind: 'note',  x: 30,  y: 420, w: 220, label: 'EDM_SEC_ID is the master key', text: 'All child tables reference EDM_SECURITY via EDM_SEC_ID', hi: false },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', label: 'EDM_SEC_ID' },
        { id: 'e2', from: 'n1', to: 'n3', label: 'EDM_SEC_ID' },
        { id: 'e3', from: 'n1', to: 'n4', label: 'EDM_SEC_ID' },
        { id: 'e4', from: 'n1', to: 'n5', label: '' },
        { id: 'e5', from: 'n3', to: 'n6', label: '' },
      ],
    };
  }
  if (name === 'Party Master Model') {
    return {
      nodes: [
        { id: 'fr1', kind: 'frame', x: 30,  y: 60,  w: 520, h: 300, title: 'Core Party' },
        { id: 'n1',  kind: 'table', x: 60,  y: 110, w: 200, label: 'EDM_PARTY',      schema: 'CADIS', cols: ['EDM_PTY_ID','PARTY_NAME','PARTY_TYPE','LEI'] },
        { id: 'n2',  kind: 'table', x: 320, y: 110, w: 200, label: 'EDM_PTY_IDENT',  schema: 'CADIS', cols: ['EDM_PTY_ID','IDENT_TYPE','IDENT_VALUE'] },
        { id: 'n3',  kind: 'table', x: 60,  y: 270, w: 200, label: 'EDM_PTY_ROLE',   schema: 'CADIS', cols: ['EDM_PTY_ID','ROLE_TYPE','EFFECTIVE_DATE'] },
        { id: 'n4',  kind: 'table', x: 320, y: 270, w: 200, label: 'EDM_PTY_ADDR',   schema: 'CADIS', cols: ['EDM_PTY_ID','ADDR_TYPE','COUNTRY','CITY'] },
        { id: 'n5',  kind: 'view',  x: 600, y: 110, w: 200, label: 'CM_PARTY_VW',    schema: 'CADIS', cols: ['EDM_PTY_ID','DISPLAY_NAME','STATUS'] },
        { id: 'fk1', kind: 'fk',    x: 275, y: 155, w: 40,  label: 'FK' },
        { id: 'nt1', kind: 'note',  x: 30,  y: 400, w: 220, label: 'GLEIF integration', text: 'LEI sourced from GLEIF golden copy. Party dedup via EDM_PTY_ID + LEG_TYPE.', hi: true },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', label: 'EDM_PTY_ID' },
        { id: 'e2', from: 'n1', to: 'n3', label: 'EDM_PTY_ID + LEG_TYPE' },
        { id: 'e3', from: 'n1', to: 'n4', label: 'EDM_PTY_ID' },
        { id: 'e4', from: 'n1', to: 'n5', label: '' },
      ],
    };
  }
  if (name === 'Party Lineage') {
    return {
      nodes: [
        { id: 'n1', kind: 'table', x: 60,  y: 80,  w: 180, label: 'BBG_PARTY_RAW',   schema: 'STAGE', cols: ['BBG_ID','PARTY_NAME','LEI'] },
        { id: 'n2', kind: 'table', x: 60,  y: 230, w: 180, label: 'GLEIF_RAW',        schema: 'STAGE', cols: ['LEI','ENTITY_NAME','COUNTRY'] },
        { id: 'n3', kind: 'view',  x: 320, y: 155, w: 200, label: 'CM_PARTY_STAGE_VW',schema: 'CADIS', cols: ['EDM_PTY_ID','PARTY_NAME','LEI','SOURCE'] },
        { id: 'n4', kind: 'table', x: 580, y: 155, w: 180, label: 'EDM_PARTY',        schema: 'CADIS', cols: ['EDM_PTY_ID','PARTY_NAME','LEI'] },
        { id: 'nt1', kind: 'note', x: 60,  y: 350, w: 200, label: 'Source priority',  text: 'GLEIF > Bloomberg > LSEG for LEI resolution', hi: false },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n3', label: 'BBG_ID → EDM_PTY_ID' },
        { id: 'e2', from: 'n2', to: 'n3', label: 'LEI match' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Success' },
      ],
    };
  }
  if (name === 'Pricing Flow') {
    return {
      nodes: [
        { id: 'n1', kind: 'table', x: 40,  y: 80,  w: 180, label: 'BBG_PRICE_RAW',   schema: 'STAGE', cols: ['BBG_ID','PRICE','PRICE_DATE','CCY'] },
        { id: 'n2', kind: 'table', x: 40,  y: 230, w: 180, label: 'LSEG_PRICE_RAW',  schema: 'STAGE', cols: ['RIC','PRICE','PRICE_DATE','CCY'] },
        { id: 'n3', kind: 'view',  x: 300, y: 155, w: 200, label: 'CM_PRICE_STAGE_VW',schema: 'CADIS', cols: ['EDM_SEC_ID','PRICE','PRICE_DATE','SOURCE'] },
        { id: 'n4', kind: 'table', x: 560, y: 80,  w: 180, label: 'EDM_SEC_PRICE',   schema: 'CADIS', cols: ['EDM_SEC_ID','PRICE','PRICE_DATE'] },
        { id: 'n5', kind: 'view',  x: 560, y: 230, w: 180, label: 'CM_STALE_VW',     schema: 'CADIS', cols: ['EDM_SEC_ID','LAST_PRICE_DATE','DAYS_STALE'] },
        { id: 'nt1', kind: 'note', x: 40,  y: 360, w: 200, label: 'Stale price rule', text: 'CM_STALE_VW flags prices older than 24h for review', hi: true },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n3', label: 'BBG_ID → EDM_SEC_ID' },
        { id: 'e2', from: 'n2', to: 'n3', label: 'RIC → EDM_SEC_ID' },
        { id: 'e3', from: 'n3', to: 'n4', label: 'Success' },
        { id: 'e4', from: 'n4', to: 'n5', label: 'EDM_SEC_ID' },
      ],
    };
  }
  // blank planning surface for all other diagrams
  return {
    nodes: [
      { id: 'nt0', kind: 'note', x: 80, y: 80, w: 260, label: name, text: 'Add tables, views and relationships to document this diagram.', hi: false },
    ],
    edges: [],
  };
}

// ---- geometry helpers ----
function nodeCenter(n) {
  const h = nodeHeight(n);
  return { x: n.x + (n.w || 180) / 2, y: n.y + h / 2 };
}

function nodeHeight(n) {
  if (n.kind === 'frame') return n.h || 200;
  if (n.kind === 'fk')   return 28;
  if (n.kind === 'note') return 80;
  const cols = (n.cols || []).length;
  return 36 + 8 + cols * 22 + 8;
}

function dgPath(a, b) {
  const ax = a.x + (a.w || 180);
  const ay = a.y + nodeHeight(a) / 2;
  const bx = b.x;
  const by = b.y + nodeHeight(b) / 2;
  const cx = (ax + bx) / 2;
  return `M ${ax},${ay} C ${cx},${ay} ${cx},${by} ${bx},${by}`;
}

let _dgIdSeq = 100;
const dgId = () => 'dg' + (++_dgIdSeq);

// ---- node renderers ----
function DgNode({ node, selected, onMouseDown, onPortMouseDown }) {
  const k = DG_KINDS[node.kind] || DG_KINDS.table;
  const w = node.w || 180;

  if (node.kind === 'frame') {
    return (
      <div onMouseDown={e => onMouseDown(e, node.id)}
           style={{
             position: 'absolute', left: node.x, top: node.y,
             width: w, height: node.h || 200,
             border: `2px dashed ${selected ? '#a11478' : k.border}`,
             borderRadius: k.radius,
             background: k.bg,
             boxSizing: 'border-box',
             zIndex: 0,
             cursor: 'move',
           }}>
        <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: k.color,
                      textTransform: 'uppercase', letterSpacing: '0.08em', userSelect: 'none' }}>
          {node.title || 'Frame'}
        </div>
      </div>
    );
  }

  if (node.kind === 'note') {
    return (
      <div onMouseDown={e => onMouseDown(e, node.id)}
           style={{
             position: 'absolute', left: node.x, top: node.y, width: w,
             background: node.hi ? '#fef9c3' : k.bg,
             border: `1.5px solid ${selected ? '#a11478' : k.border}`,
             borderRadius: k.radius, padding: '8px 10px',
             boxShadow: selected ? '0 0 0 2px #a1147840' : '2px 3px 6px rgba(0,0,0,.08)',
             zIndex: 2, cursor: 'move', userSelect: 'none',
           }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: k.color, marginBottom: 4 }}>{node.label || 'Note'}</div>
        <div style={{ fontSize: 11.5, color: '#78350f', lineHeight: 1.5 }}>{node.text || ''}</div>
      </div>
    );
  }

  if (node.kind === 'fk') {
    return (
      <div onMouseDown={e => onMouseDown(e, node.id)}
           style={{
             position: 'absolute', left: node.x, top: node.y,
             background: k.bg, border: `1.5px solid ${selected ? '#a11478' : k.border}`,
             borderRadius: k.radius, padding: '4px 10px',
             fontSize: 11, fontWeight: 700, color: k.color,
             cursor: 'move', userSelect: 'none', zIndex: 2,
             boxShadow: selected ? '0 0 0 2px #a1147840' : 'none',
             whiteSpace: 'nowrap',
           }}>
        {node.label || 'FK'}
      </div>
    );
  }

  // table / view
  const cols = node.cols || [];
  return (
    <div onMouseDown={e => onMouseDown(e, node.id)}
         style={{
           position: 'absolute', left: node.x, top: node.y, width: w,
           background: '#fff',
           border: `1.5px solid ${selected ? '#a11478' : k.border}`,
           borderRadius: k.radius,
           boxShadow: selected ? '0 0 0 2px #a1147840' : '0 1px 4px rgba(0,0,0,.1)',
           zIndex: 2, cursor: 'move', userSelect: 'none', overflow: 'hidden',
         }}>
      {/* header */}
      <div style={{ background: k.color, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{node.schema || ''}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</span>
        {/* left port */}
        <div data-node-in={node.id} onMouseDown={e => e.stopPropagation()}
             style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.5)',
                      border: '1.5px solid rgba(255,255,255,0.9)', cursor: 'crosshair', flexShrink: 0 }} />
        {/* right port */}
        <div onMouseDown={e => { e.stopPropagation(); onPortMouseDown(e, node.id); }}
             style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.5)',
                      border: '1.5px solid rgba(255,255,255,0.9)', cursor: 'crosshair', flexShrink: 0 }} />
      </div>
      {/* columns */}
      <div style={{ padding: '4px 0' }}>
        {cols.map((c, i) => (
          <div key={i} style={{ padding: '2px 10px', fontSize: 11.5, color: '#374151',
                                borderBottom: i < cols.length - 1 ? '1px solid #f3f4f6' : 'none',
                                fontFamily: 'monospace' }}>
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- inspector ----
function DgInspector({ nodes, edges, sel, onChange, onDelete }) {
  if (!sel) return (
    <div style={{ padding: 20, color: 'var(--ink-4)', fontSize: 13 }}>
      <div style={{ fontWeight: 500, marginBottom: 6 }}>No selection</div>
      <div>Click a node or edge to inspect</div>
    </div>
  );

  if (sel.type === 'edge') {
    const e = edges.find(x => x.id === sel.id);
    if (!e) return null;
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Edge</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>{e.from} → {e.to}</div>
        <label style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 4 }}>Key label</label>
        <input value={e.label || ''} onChange={ev => onChange('edge', e.id, { label: ev.target.value })}
               style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', fontSize: 12,
                        border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)' }} />
        <button onClick={() => onDelete('edge', e.id)}
                style={{ marginTop: 16, width: '100%', padding: '6px 0', fontSize: 12,
                         background: 'none', border: '1px solid #fca5a5', borderRadius: 4,
                         color: '#dc2626', cursor: 'pointer' }}>
          Remove edge
        </button>
      </div>
    );
  }

  const n = nodes.find(x => x.id === sel.id);
  if (!n) return null;
  const k = DG_KINDS[n.kind] || DG_KINDS.table;

  const field = (label, key, val) => (
    <div key={key} style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      <input value={val || ''} onChange={ev => onChange('node', n.id, { [key]: ev.target.value })}
             style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', fontSize: 12,
                      border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)' }} />
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, color: k.color }}>{k.label}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginBottom: 14 }}>{n.id}</div>
      {(n.kind === 'table' || n.kind === 'view') && <>
        {field('Name', 'label', n.label)}
        {field('Schema', 'schema', n.schema)}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Columns</label>
          <textarea value={(n.cols || []).join('\n')} rows={5}
                    onChange={ev => onChange('node', n.id, { cols: ev.target.value.split('\n').filter(Boolean) })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', fontSize: 11,
                             fontFamily: 'monospace', border: '1px solid var(--line)', borderRadius: 4,
                             background: 'var(--bg)', resize: 'vertical' }} />
        </div>
      </>}
      {n.kind === 'frame' && <>
        {field('Title', 'title', n.title)}
      </>}
      {n.kind === 'note' && <>
        {field('Heading', 'label', n.label)}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Text</label>
          <textarea value={n.text || ''} rows={4}
                    onChange={ev => onChange('node', n.id, { text: ev.target.value })}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', fontSize: 12,
                             border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', resize: 'vertical' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!n.hi} onChange={ev => onChange('node', n.id, { hi: ev.target.checked })} />
          Highlight
        </label>
      </>}
      {n.kind === 'fk' && <>
        {field('Label', 'label', n.label)}
      </>}
      <button onClick={() => onDelete('node', n.id)}
              style={{ marginTop: 16, width: '100%', padding: '6px 0', fontSize: 12,
                       background: 'none', border: '1px solid #fca5a5', borderRadius: 4,
                       color: '#dc2626', cursor: 'pointer' }}>
        Delete node
      </button>
    </div>
  );
}

// ---- main canvas ----
function DiagramCanvas({ seed, diagramName }) {
  const [nodes, setNodes] = React.useState(seed.nodes);
  const [edges, setEdges] = React.useState(seed.edges);
  const [view, setView] = React.useState({ tx: 40, ty: 20, k: 1 });
  const [sel, setSel] = React.useState(null);
  const [temp, setTemp] = React.useState(null);
  const canvasRef = React.useRef();
  const dragRef = React.useRef(null);
  const panRef = React.useRef(null);
  const tempRef = React.useRef(null);

  const toWorld = (cx, cy) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (cx - r.left - view.tx) / view.k, y: (cy - r.top - view.ty) / view.k };
  };

  // ---- drag node ----
  const onNodeMouseDown = (e, id) => {
    e.stopPropagation();
    const n = nodes.find(x => x.id === id);
    if (!n) return;
    setSel({ type: 'node', id });
    const wx = toWorld(e.clientX, e.clientY);
    dragRef.current = { id, ox: wx.x - n.x, oy: wx.y - n.y };
  };

  // ---- connect ----
  const onPortMouseDown = (e, fromId) => {
    e.stopPropagation();
    const n = nodes.find(x => x.id === fromId);
    if (!n) return;
    const wx = toWorld(e.clientX, e.clientY);
    const sx = n.x + (n.w || 180);
    const sy = n.y + nodeHeight(n) / 2;
    tempRef.current = { fromId, sx, sy, ex: wx.x, ey: wx.y };
    setTemp({ ...tempRef.current });
  };

  // ---- pan ----
  const onCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current || e.target.classList.contains('dg-world')) {
      setSel(null);
      panRef.current = { sx: e.clientX - view.tx, sy: e.clientY - view.ty };
    }
  };

  React.useEffect(() => {
    const onMove = (e) => {
      if (dragRef.current) {
        const wx = toWorld(e.clientX, e.clientY);
        const id = dragRef.current.id;
        setNodes(ns => ns.map(n => n.id === id
          ? { ...n, x: wx.x - dragRef.current.ox, y: wx.y - dragRef.current.oy }
          : n));
      }
      if (panRef.current) {
        setView(v => ({ ...v, tx: e.clientX - panRef.current.sx, ty: e.clientY - panRef.current.sy }));
      }
      if (tempRef.current) {
        const wx = toWorld(e.clientX, e.clientY);
        tempRef.current = { ...tempRef.current, ex: wx.x, ey: wx.y };
        setTemp({ ...tempRef.current });
      }
    };
    const onUp = (e) => {
      if (tempRef.current) {
        // resolve drop target via elementFromPoint
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const toId = el && el.dataset.nodeIn;
        if (toId && toId !== tempRef.current.fromId) {
          const id = dgId();
          setEdges(es => [...es, { id, from: tempRef.current.fromId, to: toId, label: '' }]);
        }
        tempRef.current = null;
        setTemp(null);
      }
      dragRef.current = null;
      panRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [view]);

  // ---- zoom ----
  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const r = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    setView(v => {
      const k2 = Math.max(0.3, Math.min(3, v.k * delta));
      return {
        tx: mx - (mx - v.tx) * (k2 / v.k),
        ty: my - (my - v.ty) * (k2 / v.k),
        k: k2,
      };
    });
  };

  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- delete key ----
  React.useEffect(() => {
    const onKey = (e) => {
      if (!sel) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.type === 'node') setNodes(ns => ns.filter(n => n.id !== sel.id));
        if (sel.type === 'edge') setEdges(es => es.filter(e => e.id !== sel.id));
        setSel(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sel]);

  const inspChange = (type, id, patch) => {
    if (type === 'node') setNodes(ns => ns.map(n => n.id === id ? { ...n, ...patch } : n));
    if (type === 'edge') setEdges(es => es.map(e => e.id === id ? { ...e, ...patch } : e));
  };
  const inspDelete = (type, id) => {
    if (type === 'node') setNodes(ns => ns.filter(n => n.id !== id));
    if (type === 'edge') setEdges(es => es.filter(e => e.id !== id));
    setSel(null);
  };

  const addNode = (kind) => {
    const id = dgId();
    const cx = toWorld(canvasRef.current.getBoundingClientRect().left + canvasRef.current.clientWidth / 2,
                       canvasRef.current.getBoundingClientRect().top  + canvasRef.current.clientHeight / 2);
    const base = { id, kind, x: cx.x - 90, y: cx.y - 50, w: kind === 'frame' ? 300 : kind === 'fk' ? 40 : 180 };
    if (kind === 'table')  setNodes(ns => [...ns, { ...base, label: 'NEW_TABLE',  schema: 'CADIS', cols: ['ID','NAME'] }]);
    if (kind === 'view')   setNodes(ns => [...ns, { ...base, label: 'NEW_VIEW',   schema: 'CADIS', cols: ['ID','NAME'] }]);
    if (kind === 'fk')     setNodes(ns => [...ns, { ...base, label: 'FK' }]);
    if (kind === 'note')   setNodes(ns => [...ns, { ...base, w: 220, label: 'Note', text: '', hi: false }]);
    if (kind === 'frame')  setNodes(ns => [...ns, { ...base, h: 200, title: 'Group' }]);
    setSel({ type: 'node', id });
  };

  // sort: frames first, then rest
  const sortedNodes = [...nodes].sort((a, b) =>
    (a.kind === 'frame' ? 0 : 1) - (b.kind === 'frame' ? 0 : 1));

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* left palette */}
      <div style={{ width: 48, background: 'var(--bg-2)', borderRight: '1px solid var(--line)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 4 }}>
        {Object.entries(DG_KINDS).map(([k, kd]) => (
          <button key={k} title={'Add ' + kd.label} onClick={() => addNode(k)}
                  style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid ' + kd.border,
                           background: kd.bg, color: kd.color, fontSize: 9, fontWeight: 700,
                           cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
                           lineHeight: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {k === 'frame' ? '[ ]' : k === 'fk' ? 'FK' : k === 'note' ? '📝' : kd.label.slice(0,3)}
          </button>
        ))}
      </div>

      {/* canvas */}
      <div ref={canvasRef} onMouseDown={onCanvasMouseDown}
           style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#f8f9fa', cursor: 'default' }}>
        {/* dot grid */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <defs>
            <pattern id="dg-dot" x={view.tx % (20 * view.k)} y={view.ty % (20 * view.k)}
                     width={20 * view.k} height={20 * view.k} patternUnits="userSpaceOnUse">
              <circle cx={view.k} cy={view.k} r={view.k < 0.6 ? 0.4 : 0.8} fill="#cbd5e1" />
            </pattern>
            <marker id="dg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#dg-dot)" />
        </svg>

        {/* world */}
        <div className="dg-world"
             style={{ position: 'absolute', transformOrigin: '0 0',
                      transform: `translate(${view.tx}px,${view.ty}px) scale(${view.k})` }}>
          {/* edges SVG */}
          <svg style={{ position: 'absolute', inset: '-500px', width: 'calc(100% + 1000px)', height: 'calc(100% + 1000px)',
                        overflow: 'visible', pointerEvents: 'none' }}>
            {edges.map(e => {
              const a = nodes.find(n => n.id === e.from);
              const b = nodes.find(n => n.id === e.to);
              if (!a || !b) return null;
              const d = dgPath(a, b);
              const mx = (a.x + (a.w || 180) + b.x) / 2;
              const myCurve = (a.y + nodeHeight(a) / 2 + b.y + nodeHeight(b) / 2) / 2;
              const isSelEdge = sel && sel.type === 'edge' && sel.id === e.id;
              return (
                <g key={e.id}>
                  {/* clickable hit area */}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={12}
                        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                        onClick={() => setSel({ type: 'edge', id: e.id })} />
                  <path d={d} fill="none"
                        stroke={isSelEdge ? '#a11478' : '#94a3b8'}
                        strokeWidth={isSelEdge ? 2 : 1.5}
                        strokeDasharray={isSelEdge ? '0' : '0'}
                        markerEnd="url(#dg-arrow)" />
                  {e.label && (
                    <text x={mx} y={myCurve - 6} textAnchor="middle"
                          fontSize={10} fill={isSelEdge ? '#a11478' : '#64748b'}
                          fontWeight={500} style={{ userSelect: 'none' }}>
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {/* temp connection preview */}
            {temp && (
              <path d={`M ${temp.sx},${temp.sy} C ${(temp.sx + temp.ex) / 2},${temp.sy} ${(temp.sx + temp.ex) / 2},${temp.ey} ${temp.ex},${temp.ey}`}
                    fill="none" stroke="#a11478" strokeWidth={1.5} strokeDasharray="6,3"
                    markerEnd="url(#dg-arrow)" />
            )}
          </svg>

          {/* nodes */}
          {sortedNodes.map(n => (
            <DgNode key={n.id} node={n}
                    selected={sel && sel.type === 'node' && sel.id === n.id}
                    onMouseDown={onNodeMouseDown}
                    onPortMouseDown={onPortMouseDown} />
          ))}
        </div>

        {/* zoom controls */}
        <div className="flow-zoom" style={{ position: 'absolute', bottom: 16, right: 16 }}>
          <button onClick={() => setView(v => ({ ...v, k: Math.max(0.3, v.k - 0.2) }))}><IcZoomOut size={14} /></button>
          <span className="pct">{Math.round(view.k * 100)}%</span>
          <button onClick={() => setView(v => ({ ...v, k: Math.min(3, v.k + 0.2) }))}><IcZoomIn size={14} /></button>
          <button onClick={() => setView({ tx: 40, ty: 20, k: 1 })} title="Reset"><IcFullscreen size={14} /></button>
        </div>
      </div>

      {/* inspector */}
      <div style={{ width: 220, borderLeft: '1px solid var(--line)', background: 'var(--bg)',
                    overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontSize: 12,
                      fontWeight: 600, color: 'var(--ink-2)' }}>Inspector</div>
        <DgInspector nodes={nodes} edges={edges} sel={sel} onChange={inspChange} onDelete={inspDelete} />
      </div>
    </div>
  );
}

// ---- top-level Diagram component with workbench sidebar ----
function Diagram({ selectedName: initialName }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [selected, setSelected] = React.useState(initialName || DG_DIAGRAMS[0]);
  const [canvasKey, setCanvasKey] = React.useState(0);

  const filtered = DG_DIAGRAMS.filter(d => d.toLowerCase().includes(filter.toLowerCase()));

  const selectDiagram = (name) => {
    setSelected(name);
    setCanvasKey(k => k + 1);
  };

  const seed = React.useMemo(() => dgSeedFor(selected), [selected]);

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">
              Diagrams
              <button className="icon-btn" onClick={() => {
                const name = 'New Diagram ' + (DG_DIAGRAMS.length + 1);
                selectDiagram(name);
              }}><IcPlus size={16} /></button>
            </span>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}>
              <IcChevDoubleLeft size={16} />
            </button>
          </div>
          <div className="wb-list-search">
            <div className="wb-list-search-wrap">
              <IcSearch size={14} />
              <input className="input" placeholder="Filter diagrams…"
                     value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
          </div>
          <div className="wb-list-items">
            {filtered.map((d, i) => (
              <div key={i}
                   className={`wb-list-item ${d === selected ? 'active' : ''}`}
                   title={d}
                   onClick={() => selectDiagram(d)}>
                <IcSitemap size={13} style={{ flexShrink: 0, color: 'var(--ink-4)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="wb-body" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="wb-body-head">
          {!sidebarOpen && (
            <button className="icon-btn" style={{ float: 'left', marginRight: 12 }}
                    onClick={() => setSidebarOpen(true)}>
              <IcChevDoubleRight size={16} />
            </button>
          )}
          <div className="title-row">
            <span className="head-icon"><IcSitemap size={18} /></span>
            <h1>{selected}</h1>
            <div className="right">
              <button className="btn ghost" style={{ fontSize: 12 }}><IcExport size={13} /> Export</button>
              <button className="ai-star" title="AI Assist" style={{ marginLeft: 8 }}><IcSparkle size={16} /></button>
            </div>
          </div>
          <div className="desc">Drag to move nodes · Scroll to zoom · Drag ports to connect · Click to select · Delete to remove</div>
        </div>

        <div className="wb-body-toolbar">
          <div className="hstack" style={{ gap: 4 }}>
            {Object.entries(DG_KINDS).map(([k, kd]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                     padding: '2px 8px', borderRadius: 12, fontSize: 11,
                                     background: kd.bg, color: kd.color, border: '1px solid ' + kd.border,
                                     fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: kd.color, display: 'inline-block' }} />
                {kd.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <DiagramCanvas key={selected + '-' + canvasKey} seed={seed} diagramName={selected} />
        </div>
      </div>
    </div>
  );
}

window.Diagram = Diagram;
