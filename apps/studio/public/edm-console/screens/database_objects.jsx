// ============================================================
// Database Objects — Table Builder · View Builder · Stored Procedure Builder
// Routes: database-objects, view-builder, stored-proc
// ============================================================

// ---- SQL type metadata ----
const SQL_TYPES = [
  'int','bigint','smallint','tinyint','bit',
  'varchar','nvarchar','char','nchar',
  'decimal','numeric','float','real','money','smallmoney',
  'datetime2','date','time','datetimeoffset','datetime','smalldatetime',
  'uniqueidentifier','varbinary','xml','text','ntext',
];
const TYPE_HAS_LENGTH = new Set(['varchar','nvarchar','char','nchar','varbinary','binary']);
const TYPE_HAS_PREC   = new Set(['decimal','numeric']);
const TYPE_HAS_SCALE  = new Set(['datetime2','time','datetimeoffset']);
function formatTypeFull(f) {
  const t = (f.type || '').toLowerCase();
  if (TYPE_HAS_LENGTH.has(t) && f.length) return `${f.type}(${f.length})`;
  if (TYPE_HAS_PREC.has(t) && f.prec) return `${f.type}(${f.prec}${f.scale ? ','+f.scale : ''})`;
  if (TYPE_HAS_SCALE.has(t) && f.scale) return `${f.type}(${f.scale})`;
  return f.type || 'int';
}
function generateDDL(tbl) {
  const lines = [`CREATE TABLE [${tbl.schema}].[${tbl.name}] (`];
  const pks = tbl.fields.filter(f => f.pk);
  tbl.fields.forEach((f, i) => {
    const typ = formatTypeFull(f).toUpperCase();
    let line = `    [${f.name}] ${typ}`;
    if (f.identity) line += ` IDENTITY(${f.seed || 1},${f.inc || 1})`;
    line += f.nulls ? ' NULL' : ' NOT NULL';
    if (f.default) line += ` DEFAULT ${f.default}`;
    const isLast = i === tbl.fields.length - 1 && !pks.length;
    lines.push(line + (isLast ? '' : ','));
  });
  if (pks.length) {
    lines.push(`    CONSTRAINT [PK_${tbl.name}] PRIMARY KEY CLUSTERED (${pks.map(f=>`[${f.name}]`).join(', ')})`);
  }
  lines.push(');');
  return lines.join('\n');
}
function nextFieldId(fields) { return 'f' + (Date.now() % 100000); }

// ---- Seed data ----
const TB_TABLES_SEED = {
  'Party Table': {
    name: 'T_MASTER_PARTY', schema: 'dbo', version: '20.1.15.0',
    category: { role: 'Core Entity', uses: ['Matcher', 'Constructor', 'Inspector'] },
    comments: 'Master party reference table. Contains all counterparties, issuers and entities managed by EDM.',
    fields: [
      { id: 'f1', name: 'EDM_PARTY_ID',     pk: true,  type: 'int',       prec:'', scale:'',  length:'',   nulls: false, default: '',          identity: true,  seed: 500000000, inc: 1 },
      { id: 'f2', name: 'PARTY_NAME',        pk: false, type: 'nvarchar',  prec:'', scale:'',  length:'255',nulls: false, default: '',          identity: false },
      { id: 'f3', name: 'SHORT_NAME',        pk: false, type: 'nvarchar',  prec:'', scale:'',  length:'60', nulls: true,  default: '',          identity: false },
      { id: 'f4', name: 'LEI',               pk: false, type: 'nchar',     prec:'', scale:'',  length:'20', nulls: true,  default: '',          identity: false },
      { id: 'f5', name: 'COUNTRY',           pk: false, type: 'nchar',     prec:'', scale:'',  length:'2',  nulls: true,  default: '',          identity: false },
      { id: 'f6', name: 'GICS_SECTOR',       pk: false, type: 'nvarchar',  prec:'', scale:'',  length:'50', nulls: true,  default: '',          identity: false },
      { id: 'f7', name: 'IS_ACTIVE',         pk: false, type: 'bit',       prec:'', scale:'',  length:'',   nulls: false, default: '1',         identity: false },
      { id: 'f8', name: 'LAST_UPDATE_DATE',  pk: false, type: 'datetime2', prec:'', scale:'7', length:'',   nulls: true,  default: 'GETDATE()', identity: false },
      { id: 'f9', name: 'CREATE_DATE',       pk: false, type: 'datetime2', prec:'', scale:'7', length:'',   nulls: false, default: 'GETDATE()', identity: false },
    ],
    sqlSteps: [
      { id: 's1', type: 'index',  label: 'Clustered index on primary key', desc: 'Speed up lookups by EDM Party ID',            enabled: true,  sql: 'CREATE CLUSTERED INDEX [IX_T_MASTER_PARTY_PK]\n  ON [dbo].[T_MASTER_PARTY] ([EDM_PARTY_ID]);' },
      { id: 's2', type: 'index',  label: 'Non-clustered index on LEI',     desc: 'Matcher queries filter heavily on LEI',        enabled: true,  sql: 'CREATE NONCLUSTERED INDEX [IX_T_MASTER_PARTY_LEI]\n  ON [dbo].[T_MASTER_PARTY] ([LEI]);' },
      { id: 's3', type: 'unique', label: 'Unique constraint on LEI',       desc: 'Prevent duplicate LEIs in the master table',   enabled: false, sql: 'ALTER TABLE [dbo].[T_MASTER_PARTY]\n  ADD CONSTRAINT [UQ_T_MASTER_PARTY_LEI] UNIQUE ([LEI]);' },
      { id: 's4', type: 'fk',    label: 'Foreign key to country reference',desc: 'Enforce valid ISO 3166 country codes',         enabled: false, sql: 'ALTER TABLE [dbo].[T_MASTER_PARTY]\n  ADD CONSTRAINT [FK_T_MASTER_PARTY_COUNTRY]\n  FOREIGN KEY ([COUNTRY]) REFERENCES [dbo].[REF_COUNTRY]([CODE]);' },
    ],
    additionalSql: '',
  },
  'Security Table': {
    name: 'T_MASTER_SEC', schema: 'dbo', version: '20.1.15.0',
    category: { role: 'Core Entity', uses: ['Matcher', 'Inspector', 'Illustrator', 'Porter'] },
    comments: 'Master security reference table for all asset types: equities, fixed income, funds.',
    fields: [
      { id: 'f1',  name: 'EDM_SEC_ID',        pk: true,  type: 'int',       prec:'', scale:'',  length:'',   nulls: false, default: '',          identity: true,  seed: 700000000, inc: 1 },
      { id: 'f2',  name: 'SECURITY_NAME',      pk: false, type: 'nvarchar',  prec:'', scale:'',  length:'255',nulls: false, default: '',          identity: false },
      { id: 'f3',  name: 'ASSET_TYPE_CODE',    pk: false, type: 'nvarchar',  prec:'', scale:'',  length:'10', nulls: false, default: '',          identity: false },
      { id: 'f4',  name: 'ISIN',               pk: false, type: 'nchar',     prec:'', scale:'',  length:'12', nulls: true,  default: '',          identity: false },
      { id: 'f5',  name: 'CUSIP',              pk: false, type: 'nchar',     prec:'', scale:'',  length:'9',  nulls: true,  default: '',          identity: false },
      { id: 'f6',  name: 'SEDOL',              pk: false, type: 'nchar',     prec:'', scale:'',  length:'7',  nulls: true,  default: '',          identity: false },
      { id: 'f7',  name: 'CURRENCY',           pk: false, type: 'nchar',     prec:'', scale:'',  length:'3',  nulls: true,  default: '',          identity: false },
      { id: 'f8',  name: 'ISSUE_DATE',         pk: false, type: 'date',      prec:'', scale:'',  length:'',   nulls: true,  default: '',          identity: false },
      { id: 'f9',  name: 'MATURITY_DATE',      pk: false, type: 'date',      prec:'', scale:'',  length:'',   nulls: true,  default: '',          identity: false },
      { id: 'f10', name: 'IS_ACTIVE',          pk: false, type: 'bit',       prec:'', scale:'',  length:'',   nulls: false, default: '1',         identity: false },
      { id: 'f11', name: 'LAST_UPDATE_DATE',   pk: false, type: 'datetime2', prec:'', scale:'7', length:'',   nulls: true,  default: 'GETDATE()', identity: false },
    ],
    sqlSteps: [
      { id: 's1', type: 'index',  label: 'Index on ISIN',            desc: 'Most Matcher queries start with ISIN',                 enabled: true,  sql: 'CREATE NONCLUSTERED INDEX [IX_T_MASTER_SEC_ISIN]\n  ON [dbo].[T_MASTER_SEC] ([ISIN]);' },
      { id: 's2', type: 'index',  label: 'Index on ASSET_TYPE_CODE', desc: 'Inspector and Constructor filter by asset type',       enabled: true,  sql: 'CREATE NONCLUSTERED INDEX [IX_T_MASTER_SEC_ASSET_TYPE]\n  ON [dbo].[T_MASTER_SEC] ([ASSET_TYPE_CODE]);' },
      { id: 's3', type: 'unique', label: 'Composite unique on ISIN + CURRENCY', desc: 'No duplicate ISIN/currency pairs',         enabled: false, sql: 'ALTER TABLE [dbo].[T_MASTER_SEC]\n  ADD CONSTRAINT [UQ_T_MASTER_SEC_ISIN_CCY] UNIQUE ([ISIN], [CURRENCY]);' },
      { id: 's4', type: 'fk',    label: 'Foreign key to currency reference', desc: 'Enforce valid ISO 4217 currency codes',       enabled: false, sql: 'ALTER TABLE [dbo].[T_MASTER_SEC]\n  ADD CONSTRAINT [FK_T_MASTER_SEC_CURRENCY]\n  FOREIGN KEY ([CURRENCY]) REFERENCES [dbo].[REF_CURRENCY]([CODE]);' },
    ],
    additionalSql: '',
  },
};

const TB_VIEWS_SEED = {
  'Party View': {
    name: 'VW_GLEIF_Party_Matcher', schema: 'dbo', version: '20.1.15.0',
    description: 'Shapes GLEIF party feed into the Matcher input format.',
    inputs: [
      { id: 'i1', schema: 'dbo', name: 'T_GLEIF_PARTY_FEED',  alias: 'G', joinType: 'FROM',      joinOn: '' },
      { id: 'i2', schema: 'dbo', name: 'T_MASTER_PARTY',       alias: 'P', joinType: 'LEFT JOIN', joinOn: 'G.LEI = P.LEI' },
    ],
    sql: `SELECT
  G.LEI,
  G.ENTITY_NAME         AS PARTY_NAME,
  G.ENTITY_SHORT_NAME   AS SHORT_NAME,
  G.JURISDICTION_CODE   AS COUNTRY,
  G.ENTITY_STATUS
FROM dbo.T_GLEIF_PARTY_FEED G
LEFT JOIN dbo.T_MASTER_PARTY P ON G.LEI = P.LEI
WHERE G.ENTITY_STATUS = 'ACTIVE'`,
  },
};

const TB_SPROCS_SEED = {
  'Load Party SP': {
    name: 'USP_LOAD_PARTY', schema: 'dbo', version: '20.1.15.0',
    description: 'Merges staged GLEIF party records into T_MASTER_PARTY.',
    params: [
      { id: 'p1', name: '@RunDate',      type: 'date', direction: 'IN',  default: 'GETDATE()', desc: 'Processing date for the run' },
      { id: 'p2', name: '@BatchSize',    type: 'int',  direction: 'IN',  default: '1000',      desc: 'Max rows per merge batch' },
      { id: 'p3', name: '@RowsAffected', type: 'int',  direction: 'OUT', default: '',          desc: 'Total rows merged' },
    ],
    sql: `CREATE OR ALTER PROCEDURE [dbo].[USP_LOAD_PARTY]
  @RunDate      DATE = NULL,
  @BatchSize    INT  = 1000,
  @RowsAffected INT  OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET @RunDate = ISNULL(@RunDate, GETDATE());
  SET @RowsAffected = 0;

  MERGE [dbo].[T_MASTER_PARTY] AS TGT
  USING (
    SELECT TOP (@BatchSize)
      LEI, ENTITY_NAME, ENTITY_SHORT_NAME, JURISDICTION_CODE
    FROM [dbo].[T_GLEIF_PARTY_FEED]
    WHERE ENTITY_STATUS = 'ACTIVE'
      AND LOAD_DATE = @RunDate
  ) AS SRC ON TGT.LEI = SRC.LEI
  WHEN MATCHED THEN UPDATE SET
    TGT.PARTY_NAME       = SRC.ENTITY_NAME,
    TGT.SHORT_NAME       = SRC.ENTITY_SHORT_NAME,
    TGT.COUNTRY          = SRC.JURISDICTION_CODE,
    TGT.LAST_UPDATE_DATE = GETDATE()
  WHEN NOT MATCHED BY TARGET THEN INSERT
    (LEI, PARTY_NAME, SHORT_NAME, COUNTRY, IS_ACTIVE, CREATE_DATE)
  VALUES
    (SRC.LEI, SRC.ENTITY_NAME, SRC.ENTITY_SHORT_NAME,
     SRC.JURISDICTION_CODE, 1, GETDATE());

  SET @RowsAffected = @@ROWCOUNT;
END;`,
  },
};

// ---- Object catalog for the browser ----
const DB_CATALOG = [
  { schema: 'dbo',   name: 'T_MASTER_PARTY',              type: 'TABLE', rows: 142891 },
  { schema: 'dbo',   name: 'T_MASTER_SEC',                type: 'TABLE', rows: 891234 },
  { schema: 'dbo',   name: 'T_MASTER_SEC_FIXED',          type: 'TABLE', rows: 423100 },
  { schema: 'dbo',   name: 'T_MASTER_SEC_EQUITY',         type: 'TABLE', rows: 468134 },
  { schema: 'dbo',   name: 'T_MASTER_PRICE',              type: 'TABLE', rows: 3218440 },
  { schema: 'dbo',   name: 'T_GLEIF_PARTY_FEED',          type: 'TABLE', rows: 98213 },
  { schema: 'dbo',   name: 'T_BLOOMBERG_PARTY_FEED',      type: 'TABLE', rows: 234100 },
  { schema: 'dbo',   name: 'T_CIQ_PARTY_FEED',            type: 'TABLE', rows: 187230 },
  { schema: 'dbo',   name: 'REF_CURRENCY',                type: 'TABLE', rows: 175 },
  { schema: 'dbo',   name: 'REF_COUNTRY',                 type: 'TABLE', rows: 249 },
  { schema: 'dbo',   name: 'REF_MIC',                     type: 'TABLE', rows: 1842 },
  { schema: 'dbo',   name: 'REF_DAYCOUNT',                type: 'TABLE', rows: 18 },
  { schema: 'stage', name: 'T_STAGE_PARTY',               type: 'TABLE', rows: 12310 },
  { schema: 'stage', name: 'T_STAGE_SEC',                 type: 'TABLE', rows: 34221 },
  { schema: 'dbo',   name: 'VW_GLEIF_Party_Matcher',      type: 'VIEW',  rows: null },
  { schema: 'dbo',   name: 'VW_Bloomberg_Security_Matcher',type:'VIEW',  rows: null },
  { schema: 'dbo',   name: 'VW_LSEG_Security_Matcher',    type: 'VIEW',  rows: null },
  { schema: 'dbo',   name: 'VW_Manual_Security_Matcher',  type: 'VIEW',  rows: null },
];

// ============================================================
// Object Browser modal — shared picker for View inputs
// ============================================================
function ObjectBrowserModal({ onSelect, onClose, multi = false, title = 'Select object' }) {
  const [query, setQuery] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [sel, setSel] = React.useState(null);

  const items = DB_CATALOG.filter(r => {
    if (typeFilter === 'table' && r.type !== 'TABLE') return false;
    if (typeFilter === 'view' && r.type !== 'VIEW') return false;
    const q = query.toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || r.schema.toLowerCase().includes(q);
  });

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 600 }}>
        <div className="modal-head">
          <h3>{title}</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 2 }}>
            {DB_CATALOG.length} objects in implementationdb_adv
          </span>
        </div>
        <div className="modal-body">
          <div className="hstack" style={{ gap: 8, marginBottom: 12 }}>
            <div className="wb-list-search-wrap" style={{ flex: 1 }}>
              <IcSearch size={14} />
              <input className="input" autoFocus placeholder="Filter by name or schema…"
                     value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <div className="select-wrap" style={{ width: 120 }}>
              <select className="select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="all">All types</option>
                <option value="table">Tables</option>
                <option value="view">Views</option>
              </select>
            </div>
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', maxHeight: 340, overflowY: 'auto' }}>
            <table className="tb-obj-table" style={{ width: '100%' }}>
              <thead>
                <tr><th>Schema</th><th>Name</th><th>Type</th><th style={{ textAlign: 'right' }}>Rows</th></tr>
              </thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.schema + '.' + r.name} className={'tb-obj-selectable' + (sel === r ? ' sel' : '')}
                      onClick={() => setSel(r)} onDoubleClick={() => { onSelect(r); onClose(); }}>
                    <td><span className="tb-schema-badge">{r.schema}</span></td>
                    <td style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }}>{r.name}</td>
                    <td><span className={`tb-type-tag ${r.type.toLowerCase()}`}>{r.type}</span></td>
                    <td style={{ textAlign: 'right', color: 'var(--ink-4)', fontFamily: 'Menlo,Consolas,monospace', fontSize: 11 }}>
                      {r.rows != null ? r.rows.toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr><td colSpan={4} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--ink-4)' }}>
                    No objects match
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!sel}
                  onClick={() => { onSelect(sel); onClose(); }}>
            Select
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Table Builder tabs
// ============================================================
const SQL_STEP_ICONS = {
  index:   <IcSearch size={14} />,
  unique:  <IcShield size={14} />,
  fk:      <IcLink size={14} />,
  default: <IcEdit size={14} />,
  check:   <IcCheck size={14} />,
};

function TbFieldsTab({ tbl, onChange, locked }) {
  const [dragId, setDragId] = React.useState(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newType, setNewType] = React.useState('nvarchar');

  function updateField(id, patch) {
    onChange({ ...tbl, fields: tbl.fields.map(f => f.id === id ? { ...f, ...patch } : f) });
  }
  function deleteField(id) {
    onChange({ ...tbl, fields: tbl.fields.filter(f => f.id !== id) });
  }
  function addField() {
    const f = { id: 'f' + Date.now(), name: newName.trim(), pk: false, type: newType,
      prec: '', scale: '', length: TYPE_HAS_LENGTH.has(newType) ? '255' : '',
      nulls: true, default: '', identity: false };
    onChange({ ...tbl, fields: [...tbl.fields, f] });
    setNewName(''); setShowAdd(false);
    ruleToast('Field added', 'success');
  }
  function reorder(overId) {
    if (!dragId || dragId === overId) return;
    const arr = [...tbl.fields];
    const from = arr.findIndex(f => f.id === dragId);
    const to = arr.findIndex(f => f.id === overId);
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    onChange({ ...tbl, fields: arr });
  }

  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="hstack" style={{ marginBottom: 10, gap: 8 }}>
        <span className="muted" style={{ fontSize: 12 }}>{tbl.fields.length} fields · drag rows to reorder</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost" style={{ fontSize: 12 }} disabled={locked}
                onClick={() => ruleToast('Clone fields from table…', 'info')}>
          <IcImport size={13} /> Clone from table
        </button>
        <button className="btn primary" style={{ fontSize: 12 }} disabled={locked}
                onClick={() => setShowAdd(true)}>
          <IcPlus size={13} /> Add field
        </button>
      </div>
      <div className="tb-fields-wrap">
        <table className="tb-fields-table">
          <thead>
            <tr>
              <th style={{ width: 20 }}></th>
              <th style={{ width: 22 }}>#</th>
              <th>Name</th>
              <th style={{ width: 36 }}>PK</th>
              <th style={{ width: 130 }}>Type</th>
              <th style={{ width: 90 }}>Size / Prec</th>
              <th style={{ width: 50 }}>Nulls</th>
              <th>Default</th>
              <th style={{ width: 88 }}>Identity</th>
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {tbl.fields.map((f, i) => (
              <tr key={f.id} className={f.pk ? 'is-pk' : ''}
                  draggable={!locked}
                  onDragStart={() => setDragId(f.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={e => { e.preventDefault(); reorder(f.id); }}>
                <td className="tb-drag-cell">⣿</td>
                <td className="tb-num-cell">{i + 1}</td>
                <td>
                  <input className="tb-inline-input" value={f.name} disabled={locked}
                         style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 12 }}
                         onChange={e => updateField(f.id, { name: e.target.value })} />
                </td>
                <td style={{ textAlign: 'center' }}>
                  {f.pk
                    ? <span className="tb-pk-badge">PK</span>
                    : <label className="checkbox" style={{ margin: 0 }}>
                        <input type="checkbox" checked={false} disabled={locked}
                               onChange={() => updateField(f.id, { pk: true })} />
                        <span className="box"><IcCheck size={11} /></span>
                      </label>
                  }
                </td>
                <td>
                  <select className="tb-inline-select" value={f.type} disabled={locked}
                          onChange={e => updateField(f.id, {
                            type: e.target.value,
                            length: TYPE_HAS_LENGTH.has(e.target.value) ? (f.length || '255') : '',
                            prec: TYPE_HAS_PREC.has(e.target.value) ? (f.prec || '18') : '',
                            scale: (TYPE_HAS_PREC.has(e.target.value) || TYPE_HAS_SCALE.has(e.target.value)) ? (f.scale || '4') : '',
                          })}>
                    {SQL_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td>
                  {TYPE_HAS_LENGTH.has(f.type.toLowerCase()) && (
                    <input className="tb-inline-input tb-type-mono" value={f.length} disabled={locked}
                           placeholder="max" style={{ width: 60 }}
                           onChange={e => updateField(f.id, { length: e.target.value })} />
                  )}
                  {TYPE_HAS_PREC.has(f.type.toLowerCase()) && (
                    <span className="hstack" style={{ gap: 2 }}>
                      <input className="tb-inline-input tb-type-mono" value={f.prec} disabled={locked} placeholder="18" style={{ width: 28 }} onChange={e => updateField(f.id, { prec: e.target.value })} />
                      <span style={{ color: 'var(--ink-4)' }}>,</span>
                      <input className="tb-inline-input tb-type-mono" value={f.scale} disabled={locked} placeholder="4" style={{ width: 24 }} onChange={e => updateField(f.id, { scale: e.target.value })} />
                    </span>
                  )}
                  {TYPE_HAS_SCALE.has(f.type.toLowerCase()) && (
                    <input className="tb-inline-input tb-type-mono" value={f.scale} disabled={locked} placeholder="7" style={{ width: 24 }} onChange={e => updateField(f.id, { scale: e.target.value })} />
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <label className="checkbox" style={{ margin: 0 }}>
                    <input type="checkbox" checked={f.nulls} disabled={locked}
                           onChange={e => updateField(f.id, { nulls: e.target.checked })} />
                    <span className="box"><IcCheck size={11} /></span>
                  </label>
                </td>
                <td>
                  <input className="tb-inline-input tb-type-mono" value={f.default} disabled={locked}
                         placeholder="—"
                         onChange={e => updateField(f.id, { default: e.target.value })} />
                </td>
                <td>
                  <label className="checkbox" style={{ margin: 0, gap: 5 }}>
                    <input type="checkbox" checked={!!f.identity} disabled={locked}
                           onChange={e => updateField(f.id, { identity: e.target.checked, seed: 1, inc: 1 })} />
                    <span className="box"><IcCheck size={11} /></span>
                    {f.identity && (
                      <span className="tb-type-mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                        {f.seed}/{f.inc}
                      </span>
                    )}
                  </label>
                </td>
                <td>
                  <button className="icon-btn" disabled={locked} title="Remove field"
                          onClick={() => deleteField(f.id)}>
                    <IcTrash size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="modal">
            <div className="modal-head"><h3>Add field</h3></div>
            <div className="modal-body">
              <div className="field"><label className="field-label">Field name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="input" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                       placeholder="e.g. CURRENCY" style={{ fontFamily: 'Menlo,Consolas,monospace' }} /></div>
              <div className="field" style={{ marginBottom: 0 }}><label className="field-label">Type</label>
                <div className="select-wrap"><select className="select" value={newType} onChange={e => setNewType(e.target.value)}>
                  {SQL_TYPES.map(t => <option key={t}>{t}</option>)}
                </select></div></div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn primary" disabled={!newName.trim()} onClick={addField}>Add field</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TbPreviewTab({ tbl }) {
  const ddl = generateDDL(tbl);
  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="hstack" style={{ marginBottom: 10, gap: 8 }}>
        <span className="muted" style={{ fontSize: 12 }}>Generated DDL — read-only. Enabled SQL Script steps are appended at build time.</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost" style={{ fontSize: 12 }}
                onClick={() => { navigator.clipboard?.writeText(ddl); ruleToast('Copied to clipboard', 'success'); }}>
          <IcImport size={13} /> Copy
        </button>
      </div>
      <pre className="tb-ddl">{ddl}</pre>
    </div>
  );
}

function TbSqlTab({ tbl, onChange, locked }) {
  const [sqlMode, setSqlMode] = React.useState('guided');
  const enabledSql = tbl.sqlSteps.filter(s => s.enabled).map(s => s.sql).join('\n\n');
  const fullSql = [generateDDL(tbl), enabledSql, tbl.additionalSql].filter(Boolean).join('\n\n');

  function toggleStep(id) {
    onChange({ ...tbl, sqlSteps: tbl.sqlSteps.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s) });
  }

  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <div className="hstack" style={{ gap: 8, marginBottom: 18 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          Post-build steps appended to the CREATE TABLE statement at build time.
        </span>
        <span style={{ flex: 1 }} />
        <div className="hstack" style={{ gap: 0, border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
          {['guided', 'sql'].map(m => (
            <button key={m} onClick={() => setSqlMode(m)}
                    style={{ padding: '5px 14px', fontSize: 12, fontWeight: sqlMode === m ? 600 : 400,
                             background: sqlMode === m ? 'var(--magenta)' : 'var(--bg-0)',
                             color: sqlMode === m ? '#fff' : 'var(--ink-2)',
                             border: 'none', cursor: 'pointer' }}>
              {m === 'guided' ? 'Guided' : 'SQL'}
            </button>
          ))}
        </div>
      </div>

      {sqlMode === 'guided' && (
        <>
          {tbl.sqlSteps.map(s => (
            <div key={s.id} className={`tb-sql-step${s.enabled ? ' enabled' : ''}`}>
              <div className="tb-sql-step-head" onClick={() => !locked && toggleStep(s.id)}>
                <label className="checkbox" style={{ margin: 0 }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={s.enabled} disabled={locked}
                         onChange={() => toggleStep(s.id)} />
                  <span className="box"><IcCheck size={11} /></span>
                </label>
                <span className="tb-step-icon">{SQL_STEP_ICONS[s.type] || <IcCog size={14} />}</span>
                <span className="tb-sql-step-label">{s.label}</span>
                <span className="tb-sql-step-desc">{s.desc}</span>
              </div>
              {s.enabled && (
                <div className="tb-sql-step-body">
                  <code className="tb-sql-step-code">{s.sql}</code>
                </div>
              )}
            </div>
          ))}
          <button className="btn ghost" style={{ fontSize: 12, marginTop: 4 }} disabled={locked}
                  onClick={() => ruleToast('Custom step added', 'info')}>
            <IcPlus size={13} /> Add custom step
          </button>
        </>
      )}

      {sqlMode === 'sql' && (
        <>
          <div className="kv-sec-label" style={{ marginBottom: 8 }}>Generated script (read-only)</div>
          <pre className="tb-ddl" style={{ marginBottom: 16, maxHeight: 300, overflowY: 'auto' }}>{fullSql || generateDDL(tbl)}</pre>
          <div className="kv-sec-label" style={{ marginBottom: 8 }}>Additional SQL</div>
          <textarea className="code-editor" style={{ minHeight: 100 }} disabled={locked}
                    value={tbl.additionalSql}
                    onChange={e => onChange({ ...tbl, additionalSql: e.target.value })}
                    placeholder="-- Any additional SQL executed after the script above" />
        </>
      )}
    </div>
  );
}

const CATEGORY_ROLES = ['Core Entity', 'Staging', 'Reference', 'Archive', 'Audit', 'Configuration', 'Work Table'];
const CATEGORY_USES  = ['Matcher', 'Constructor', 'Inspector', 'Illustrator', 'Porter', 'Reports', 'External API', 'Audit Trail'];

function TbCategoryTab({ tbl, onChange, locked }) {
  function toggleUse(u) {
    const uses = tbl.category.uses.includes(u)
      ? tbl.category.uses.filter(x => x !== u)
      : [...tbl.category.uses, u];
    onChange({ ...tbl, category: { ...tbl.category, uses } });
  }
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 700 }}>
      <div className="kv-sec-label" style={{ marginBottom: 8 }}>Table role</div>
      <div className="select-wrap" style={{ maxWidth: 280, marginBottom: 20 }}>
        <select className="select" value={tbl.category.role} disabled={locked}
                onChange={e => onChange({ ...tbl, category: { ...tbl.category, role: e.target.value } })}>
          {CATEGORY_ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div className="kv-sec-label" style={{ marginBottom: 10 }}>Used by</div>
      <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
        {CATEGORY_USES.map(u => (
          <span key={u} className={`tb-use-tag${tbl.category.uses.includes(u) ? ' active' : ''}`}
                onClick={() => !locked && toggleUse(u)}>
            {tbl.category.uses.includes(u) && <IcCheck size={12} />}
            {u}
          </span>
        ))}
      </div>
    </div>
  );
}

function TbCommentsTab({ tbl, onChange, locked }) {
  const [mode, setMode] = React.useState('plain');
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 720 }}>
      <div className="hstack" style={{ gap: 8, marginBottom: 12 }}>
        <span className="kv-sec-label" style={{ margin: 0 }}>Table description</span>
        <span style={{ flex: 1 }} />
        <div className="hstack" style={{ gap: 0, border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
          {['plain', 'html'].map(m => (
            <button key={m} onClick={() => setMode(m)}
                    style={{ padding: '4px 12px', fontSize: 11.5, fontWeight: mode === m ? 600 : 400,
                             background: mode === m ? 'var(--bg-2)' : 'var(--bg-0)',
                             color: mode === m ? 'var(--ink)' : 'var(--ink-3)',
                             border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <textarea className={mode === 'html' ? 'code-editor' : 'textarea'} style={{ minHeight: 120 }} disabled={locked}
                value={tbl.comments}
                onChange={e => onChange({ ...tbl, comments: e.target.value })}
                placeholder="Describe the purpose, ownership and usage of this table…" />
    </div>
  );
}

// ============================================================
// Table Builder
// ============================================================
const TB_TABS = [
  { id: 'fields',   label: 'Fields' },
  { id: 'preview',  label: 'Preview' },
  { id: 'sql',      label: 'SQL Script' },
  { id: 'category', label: 'Categorization' },
  { id: 'comments', label: 'Comments' },
];

function TableBuilder({ tbl, tblName, onChange }) {
  const [tab, setTab] = React.useState('fields');
  const [showHistory, setShowHistory] = React.useState(false);
  const compKey = 'tbl:' + tblName;
  const collab = useCollab();
  const locked = !collab.components[compKey] || collab.components[compKey].status !== 'me';

  return (
    <div className="wb-body">
      <div className="wb-body-head">
        <div className="title-row">
          <span className="head-icon"><IcManager size={18} /></span>
          <h1>
            <span className="tb-type-mono" style={{ fontSize: 14, color: 'var(--ink-3)' }}>{tbl.schema}.</span>{tbl.name}
            <span className="ver-pill">EDM {tbl.version} <IcChevDown size={10} /></span>
          </h1>
          <div className="right hstack" style={{ gap: 6 }}>
            <span className="env-pill" style={{ background: 'var(--bg-2)', color: 'var(--ink-3)' }}>
              <IcSource size={11} /> {tbl.fields.length} fields
            </span>
          </div>
        </div>
        <div className="desc">Table builder — define fields, constraints and post-build steps, then build to the target database.</div>
      </div>

      <CheckoutBar componentKey={compKey} label={tblName} type="Table" onOpenHistory={() => setShowHistory(true)} />
      {showHistory && <HistoryModal componentKey={compKey} label={tblName} onClose={() => setShowHistory(false)} />}

      <div className="wb-body-toolbar">
        <button className="btn ghost" onClick={() => ruleToast('Saved', 'success')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg> Save
        </button>
        <button className="btn primary" onClick={() => ruleToast('Verifying and building table…', 'info')}>
          <IcCheck size={14} /> Verify &amp; Build
        </button>
        <div className="tool-sep" />
        <button className="icon-btn" title="Run build" onClick={() => ruleToast('Build queued', 'info')}><IcPlay size={14} /></button>
        <button className="icon-btn" title="Drop table" onClick={() => ruleToast('Drop table…', 'info')}><IcTrash size={14} /></button>
        <div className="spacer" />
        <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from Table Builder')}>
          <IcShield size={16} />
        </button>
      </div>

      <div className="tabs" style={{ padding: '0 24px', margin: 0, borderBottom: '1px solid var(--line)' }}>
        {TB_TABS.map(t => <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'fields'   && <TbFieldsTab tbl={tbl} onChange={onChange} locked={locked} />}
        {tab === 'preview'  && <TbPreviewTab tbl={tbl} />}
        {tab === 'sql'      && <TbSqlTab tbl={tbl} onChange={onChange} locked={locked} />}
        {tab === 'category' && <TbCategoryTab tbl={tbl} onChange={onChange} locked={locked} />}
        {tab === 'comments' && <TbCommentsTab tbl={tbl} onChange={onChange} locked={locked} />}
      </div>
    </div>
  );
}

// ============================================================
// View Builder (stepper)
// ============================================================
const VB_STEPS = ['Properties', 'Input objects', 'Source SQL', 'Preview'];

function ViewBuilder({ view, viewName, onChange }) {
  const [step, setStep] = React.useState(0);
  const [showBrowser, setShowBrowser] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const compKey = 'view:' + viewName;
  const collab = useCollab();
  const locked = !collab.components[compKey] || collab.components[compKey].status !== 'me';

  function addInput(obj) {
    const alias = obj.name.replace(/[^A-Z0-9]/gi, '').slice(0, 1).toUpperCase() + (view.inputs.length + 1);
    const newInput = { id: 'i' + Date.now(), schema: obj.schema, name: obj.name, alias,
                       joinType: view.inputs.length === 0 ? 'FROM' : 'JOIN', joinOn: '' };
    onChange({ ...view, inputs: [...view.inputs, newInput] });
  }
  function removeInput(id) {
    onChange({ ...view, inputs: view.inputs.filter(i => i.id !== id) });
  }

  const joinTypes = ['FROM', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN'];

  const previewCols = ['LEI', 'PARTY_NAME', 'SHORT_NAME', 'COUNTRY', 'ENTITY_STATUS'];

  return (
    <div className="wb-body">
      <div className="wb-body-head">
        <div className="title-row">
          <span className="head-icon"><IcPages size={18} /></span>
          <h1>
            <span className="tb-type-mono" style={{ fontSize: 14, color: 'var(--ink-3)' }}>{view.schema}.</span>{view.name}
            <span className="ver-pill">EDM {view.version} <IcChevDown size={10} /></span>
          </h1>
        </div>
        <div className="desc">View builder — compose input objects and source SQL, then build the view on the target database.</div>
      </div>

      <CheckoutBar componentKey={compKey} label={viewName} type="View" onOpenHistory={() => setShowHistory(true)} />
      {showHistory && <HistoryModal componentKey={compKey} label={viewName} onClose={() => setShowHistory(false)} />}

      <div className="wb-body-toolbar">
        <button className="btn ghost" onClick={() => ruleToast('Saved', 'success')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg> Save
        </button>
        <button className="btn primary" onClick={() => ruleToast('Verifying and building view…', 'info')}>
          <IcCheck size={14} /> Verify &amp; Build
        </button>
        <div className="tool-sep" />
        <button className="icon-btn" title="Validate SQL" onClick={() => ruleToast('SQL validated — no errors', 'success')}><IcPlay size={14} /></button>
        <div className="spacer" />
        <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from View Builder')}>
          <IcShield size={16} />
        </button>
      </div>

      {/* Stepper */}
      <div className="tb-stepper">
        {VB_STEPS.map((s, i) => (
          <div key={s} className={`tb-step ${i === step ? 'active' : i < step ? 'done' : ''}`}
               style={{ cursor: i <= step ? 'pointer' : 'default' }}
               onClick={() => i <= step && setStep(i)}>
            <div className="tb-step-dot">
              {i < step ? <IcCheck size={11} /> : i + 1}
            </div>
            <div className="tb-step-label">{s}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 32px' }}>
        {step === 0 && (
          <div style={{ maxWidth: 680 }}>
            <div className="props-grid">
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">View name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="input" value={view.name} disabled={locked}
                       style={{ fontFamily: 'Menlo,Consolas,monospace' }}
                       onChange={e => onChange({ ...view, name: e.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Schema</label>
                <div className="select-wrap">
                  <select className="select" value={view.schema} disabled={locked}
                          onChange={e => onChange({ ...view, schema: e.target.value })}>
                    {['dbo', 'stage', 'archive', 'reporting'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label className="field-label">Description</label>
              <textarea className="textarea" style={{ minHeight: 80 }} value={view.description} disabled={locked}
                        onChange={e => onChange({ ...view, description: e.target.value })}
                        placeholder="Purpose and usage of this view…" />
            </div>
            <button className="btn primary" style={{ marginTop: 4 }} onClick={() => setStep(1)}>
              Next — Input objects <IcChevRight size={14} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div style={{ maxWidth: 720 }}>
            <div className="hstack" style={{ marginBottom: 12, gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Add tables and views. The first input is the primary FROM; additional inputs specify the join type and ON condition.
              </span>
              <span style={{ flex: 1 }} />
              <button className="btn primary" style={{ fontSize: 12 }} disabled={locked}
                      onClick={() => setShowBrowser(true)}>
                <IcPlus size={13} /> Add from catalogue
              </button>
            </div>
            {view.inputs.map((inp, i) => (
              <div key={inp.id} className="tb-input-row">
                {i === 0
                  ? <span className="muted" style={{ fontSize: 11, width: 76, textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>FROM</span>
                  : (
                    <div className="select-wrap" style={{ width: 110 }}>
                      <select className="select" value={inp.joinType} disabled={locked}
                              onChange={e => onChange({ ...view, inputs: view.inputs.map(x => x.id === inp.id ? { ...x, joinType: e.target.value } : x) })}>
                        {joinTypes.filter(j => j !== 'FROM').map(j => <option key={j}>{j}</option>)}
                      </select>
                    </div>
                  )
                }
                <span className="tb-schema-badge">{inp.schema}</span>
                <span style={{ flex: 1, fontFamily: 'Menlo,Consolas,monospace', fontSize: 12, fontWeight: 500 }}>{inp.name}</span>
                <span className="muted" style={{ fontSize: 11 }}>alias</span>
                <input className="tb-input-alias tb-inline-input" value={inp.alias} disabled={locked} style={{ width: 44, textAlign: 'center' }}
                       onChange={e => onChange({ ...view, inputs: view.inputs.map(x => x.id === inp.id ? { ...x, alias: e.target.value } : x) })} />
                {i > 0 && (
                  <>
                    <span className="muted" style={{ fontSize: 11 }}>ON</span>
                    <input className="tb-inline-input tb-type-mono" value={inp.joinOn} disabled={locked}
                           placeholder="A.KEY = B.KEY" style={{ flex: 2 }}
                           onChange={e => onChange({ ...view, inputs: view.inputs.map(x => x.id === inp.id ? { ...x, joinOn: e.target.value } : x) })} />
                  </>
                )}
                <button className="icon-btn" disabled={locked || i === 0} onClick={() => removeInput(inp.id)}><IcTrash size={13} /></button>
              </div>
            ))}
            {!view.inputs.length && (
              <div className="dtable-empty">No inputs added. Use "Add from catalogue" to select tables or views.</div>
            )}
            <div className="hstack" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn ghost" onClick={() => setStep(0)}><IcChevLeft size={13} /> Back</button>
              <button className="btn primary" onClick={() => setStep(2)}>Next — Source SQL <IcChevRight size={14} /></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="hstack" style={{ marginBottom: 10, gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Define the SELECT statement. Use the aliases from the Input objects step.</span>
              <span style={{ flex: 1 }} />
              <button className="btn ghost" style={{ fontSize: 12 }} disabled={locked}
                      onClick={() => ruleToast('SQL validated — no errors found', 'success')}>
                <IcPlay size={12} /> Validate
              </button>
            </div>
            <textarea className="code-editor" style={{ minHeight: 280 }} disabled={locked}
                      value={view.sql}
                      onChange={e => onChange({ ...view, sql: e.target.value })} />
            <div className="hstack" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn ghost" onClick={() => setStep(1)}><IcChevLeft size={13} /> Back</button>
              <button className="btn primary" onClick={() => setStep(3)}>Next — Preview <IcChevRight size={14} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              Preview of the first 10 rows from the live database. Columns derived from the SELECT clause.
            </div>
            <div className="gen-inbox" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>{previewCols.map(c => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {[
                    ['2138003W0E9STYGBX418', 'APPLE INC',               'Apple',   'US', 'ACTIVE'],
                    ['529900T8BM49AURSDO55', 'GOLDMAN SACHS GROUP INC', 'GS',      'US', 'ACTIVE'],
                    ['213800MBWEIJDM5CU638', 'VODAFONE GROUP PLC',      'Vodafone','GB', 'ACTIVE'],
                    ['5493001KJTIIGC8Y1R12', 'DEUTSCHE BANK AG',        'DB',      'DE', 'ACTIVE'],
                    ['3157001RNKGBKGNZ4P88', 'BNP PARIBAS SA',          'BNP',     'FR', 'ACTIVE'],
                  ].map((r, i) => (
                    <tr key={i}>{r.map((v, j) => <td key={j} style={j === 0 ? { fontFamily: 'Menlo,Consolas,monospace', fontSize: 11 } : {}}>{v}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hstack" style={{ gap: 8 }}>
              <button className="btn ghost" onClick={() => setStep(2)}><IcChevLeft size={13} /> Back</button>
              <button className="btn primary" onClick={() => ruleToast('View built successfully on implementationdb_adv', 'success')}>
                <IcCheck size={14} /> Build view
              </button>
            </div>
          </div>
        )}
      </div>

      {showBrowser && <ObjectBrowserModal title="Select table or view" onSelect={addInput} onClose={() => setShowBrowser(false)} />}
    </div>
  );
}

// ============================================================
// Stored Procedure Builder (stepper)
// ============================================================
const SP_STEPS = ['Properties', 'Parameters', 'Source SQL', 'Preview'];

function SPBuilder({ sp, spName, onChange }) {
  const [step, setStep] = React.useState(0);
  const [showHistory, setShowHistory] = React.useState(false);
  const compKey = 'sp:' + spName;
  const collab = useCollab();
  const locked = !collab.components[compKey] || collab.components[compKey].status !== 'me';

  function addParam() {
    const p = { id: 'p' + Date.now(), name: '@NewParam', type: 'int', direction: 'IN', default: '', desc: '' };
    onChange({ ...sp, params: [...sp.params, p] });
  }
  function updateParam(id, patch) {
    onChange({ ...sp, params: sp.params.map(p => p.id === id ? { ...p, ...patch } : p) });
  }
  function deleteParam(id) {
    onChange({ ...sp, params: sp.params.filter(p => p.id !== id) });
  }

  const execExample = sp.params.filter(p => p.direction !== 'OUT').map(p => {
    const val = p.default || (p.type === 'int' ? '0' : p.type === 'date' ? "'2026-01-01'" : "'value'");
    return `  ${p.name} = ${val}`;
  }).join(',\n');

  return (
    <div className="wb-body">
      <div className="wb-body-head">
        <div className="title-row">
          <span className="head-icon"><IcCog size={18} /></span>
          <h1>
            <span className="tb-type-mono" style={{ fontSize: 14, color: 'var(--ink-3)' }}>{sp.schema}.</span>{sp.name}
            <span className="ver-pill">EDM {sp.version} <IcChevDown size={10} /></span>
          </h1>
        </div>
        <div className="desc">Stored procedure builder — define parameters and the procedure body, then build to the target database.</div>
      </div>

      <CheckoutBar componentKey={compKey} label={spName} type="Stored Procedure" onOpenHistory={() => setShowHistory(true)} />
      {showHistory && <HistoryModal componentKey={compKey} label={spName} onClose={() => setShowHistory(false)} />}

      <div className="wb-body-toolbar">
        <button className="btn ghost" onClick={() => ruleToast('Saved', 'success')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg> Save
        </button>
        <button className="btn primary" onClick={() => ruleToast('Building stored procedure…', 'info')}>
          <IcCheck size={14} /> Verify &amp; Build
        </button>
        <div className="tool-sep" />
        <button className="icon-btn" title="Execute procedure" onClick={() => ruleToast('Procedure executed', 'success')}><IcPlay size={14} /></button>
        <div className="spacer" />
        <button className="icon-btn" title={locked ? 'Check out to edit' : 'Check in'}
                onClick={() => locked ? collabCheckout(compKey) : collabCheckin(compKey, 'Checked in from SP Builder')}>
          <IcShield size={16} />
        </button>
      </div>

      <div className="tb-stepper">
        {SP_STEPS.map((s, i) => (
          <div key={s} className={`tb-step ${i === step ? 'active' : i < step ? 'done' : ''}`}
               style={{ cursor: i <= step ? 'pointer' : 'default' }}
               onClick={() => i <= step && setStep(i)}>
            <div className="tb-step-dot">{i < step ? <IcCheck size={11} /> : i + 1}</div>
            <div className="tb-step-label">{s}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 32px' }}>
        {step === 0 && (
          <div style={{ maxWidth: 680 }}>
            <div className="props-grid">
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Procedure name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className="input" value={sp.name} disabled={locked}
                       style={{ fontFamily: 'Menlo,Consolas,monospace' }}
                       onChange={e => onChange({ ...sp, name: e.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Schema</label>
                <div className="select-wrap">
                  <select className="select" value={sp.schema} disabled={locked}
                          onChange={e => onChange({ ...sp, schema: e.target.value })}>
                    {['dbo', 'stage', 'archive'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label className="field-label">Description</label>
              <textarea className="textarea" style={{ minHeight: 80 }} value={sp.description} disabled={locked}
                        onChange={e => onChange({ ...sp, description: e.target.value })} />
            </div>
            <button className="btn primary" style={{ marginTop: 4 }} onClick={() => setStep(1)}>
              Next — Parameters <IcChevRight size={14} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div style={{ maxWidth: 820 }}>
            <div className="hstack" style={{ marginBottom: 12, gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Define input and output parameters.</span>
              <span style={{ flex: 1 }} />
              <button className="btn primary" style={{ fontSize: 12 }} disabled={locked} onClick={addParam}>
                <IcPlus size={13} /> Add parameter
              </button>
            </div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
              <table className="tb-param-grid">
                <thead>
                  <tr><th>Name</th><th style={{ width: 110 }}>Type</th><th style={{ width: 80 }}>Direction</th><th style={{ width: 120 }}>Default</th><th>Description</th><th style={{ width: 32 }}></th></tr>
                </thead>
                <tbody>
                  {sp.params.map(p => (
                    <tr key={p.id}>
                      <td><input className="tb-inline-input tb-type-mono" value={p.name} disabled={locked} onChange={e => updateParam(p.id, { name: e.target.value })} /></td>
                      <td>
                        <select className="tb-inline-select" value={p.type} disabled={locked} onChange={e => updateParam(p.id, { type: e.target.value })}>
                          {SQL_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="select-wrap" style={{ width: '100%' }}>
                          <select className="select" style={{ fontSize: 12 }} value={p.direction} disabled={locked}
                                  onChange={e => updateParam(p.id, { direction: e.target.value })}>
                            <option value="IN">IN</option>
                            <option value="OUT">OUT</option>
                          </select>
                        </div>
                      </td>
                      <td><input className="tb-inline-input tb-type-mono" value={p.default} disabled={locked} placeholder="—" onChange={e => updateParam(p.id, { default: e.target.value })} /></td>
                      <td><input className="tb-inline-input" value={p.desc} disabled={locked} placeholder="Description…" onChange={e => updateParam(p.id, { desc: e.target.value })} /></td>
                      <td><button className="icon-btn" disabled={locked} onClick={() => deleteParam(p.id)}><IcTrash size={13} /></button></td>
                    </tr>
                  ))}
                  {!sp.params.length && (
                    <tr><td colSpan={6} className="dtable-empty">No parameters defined.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="hstack" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn ghost" onClick={() => setStep(0)}><IcChevLeft size={13} /> Back</button>
              <button className="btn primary" onClick={() => setStep(2)}>Next — Source SQL <IcChevRight size={14} /></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="hstack" style={{ marginBottom: 10, gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Write the procedure body. Parameters are available as declared in the previous step.</span>
              <span style={{ flex: 1 }} />
              <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => ruleToast('SQL validated — no errors', 'success')}>
                <IcPlay size={12} /> Validate
              </button>
            </div>
            <textarea className="code-editor" style={{ minHeight: 320 }} disabled={locked}
                      value={sp.sql} onChange={e => onChange({ ...sp, sql: e.target.value })} />
            <div className="hstack" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn ghost" onClick={() => setStep(1)}><IcChevLeft size={13} /> Back</button>
              <button className="btn primary" onClick={() => setStep(3)}>Next — Preview <IcChevRight size={14} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ maxWidth: 680 }}>
            <div className="kv-sec-label" style={{ marginBottom: 8 }}>Execute example</div>
            <pre className="tb-ddl" style={{ marginBottom: 18 }}>
{`DECLARE @RowsAffected INT;

EXEC [${sp.schema}].[${sp.name}]
${execExample},
  @RowsAffected = @RowsAffected OUTPUT;

SELECT @RowsAffected AS RowsAffected;`}
            </pre>
            <div className="hstack" style={{ gap: 8 }}>
              <button className="btn ghost" onClick={() => setStep(2)}><IcChevLeft size={13} /> Back</button>
              <button className="btn primary" onClick={() => ruleToast('Stored procedure built on implementationdb_adv', 'success')}>
                <IcCheck size={14} /> Build procedure
              </button>
              <button className="btn ghost" onClick={() => ruleToast('Procedure executed — 0 rows affected', 'info')}>
                <IcPlay size={13} /> Run now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Root: DatabaseObjects
// ============================================================
const DB_OBJ_SECTIONS = [
  { id: 'table',       label: 'Tables',               icon: <IcManager size={13} />,  seed: TB_TABLES_SEED },
  { id: 'view',        label: 'Views',                 icon: <IcEye size={13} />,      seed: TB_VIEWS_SEED },
  { id: 'stored-proc', label: 'Stored Procedures',     icon: <IcCog size={13} />,      seed: TB_SPROCS_SEED },
];

function DatabaseObjects({ initialType = 'table', selectedName: propName }) {
  const [tables, setTables]   = React.useState(TB_TABLES_SEED);
  const [views, setViews]     = React.useState(TB_VIEWS_SEED);
  const [sprocs, setSprocs]   = React.useState(TB_SPROCS_SEED);
  const [selType, setSelType] = React.useState(initialType);
  const [filter, setFilter]   = React.useState('');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [expanded, setExpanded] = React.useState({ table: true, view: true, 'stored-proc': true });

  const openName = propName || window.__illOpenName;
  const [selName, setSelNameRaw] = React.useState(() => {
    if (openName) {
      if (TB_TABLES_SEED[openName]) return openName;
      if (TB_VIEWS_SEED[openName]) return openName;
      if (TB_SPROCS_SEED[openName]) return openName;
    }
    return Object.keys(initialType === 'view' ? TB_VIEWS_SEED : initialType === 'stored-proc' ? TB_SPROCS_SEED : TB_TABLES_SEED)[0];
  });

  function selectItem(type, name) {
    setSelType(type);
    setSelNameRaw(name);
    window.__illOpenName = null;
  }

  React.useEffect(() => {
    if (openName) {
      if (TB_TABLES_SEED[openName]) { setSelType('table'); setSelNameRaw(openName); }
      else if (TB_VIEWS_SEED[openName]) { setSelType('view'); setSelNameRaw(openName); }
      else if (TB_SPROCS_SEED[openName]) { setSelType('stored-proc'); setSelNameRaw(openName); }
    }
  }, [openName]);

  const dataBySec = { table: tables, view: views, 'stored-proc': sprocs };
  const setterBySec = { table: setTables, view: setViews, 'stored-proc': setSprocs };

  function renderBody() {
    if (selType === 'table' && tables[selName]) {
      return <TableBuilder tbl={tables[selName]} tblName={selName}
               onChange={v => setTables(t => ({ ...t, [selName]: v }))} />;
    }
    if (selType === 'view' && views[selName]) {
      return <ViewBuilder view={views[selName]} viewName={selName}
               onChange={v => setViews(t => ({ ...t, [selName]: v }))} />;
    }
    if (selType === 'stored-proc' && sprocs[selName]) {
      return <SPBuilder sp={sprocs[selName]} spName={selName}
               onChange={v => setSprocs(t => ({ ...t, [selName]: v }))} />;
    }
    return (
      <div className="wb-body" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--ink-4)' }}>
        <IcManager size={36} />
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-3)' }}>Select an object</div>
        <div style={{ fontSize: 13 }}>Choose a table, view or stored procedure from the list</div>
      </div>
    );
  }

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">Database Objects</span>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}><IcChevDoubleLeft size={16} /></button>
          </div>
          <div className="wb-list-search">
            <div className="wb-list-search-wrap">
              <IcSearch size={14} />
              <input className="input" placeholder="Filter objects…" value={filter}
                     onChange={e => setFilter(e.target.value)} />
            </div>
          </div>
          <div className="wb-list-items" style={{ padding: 0 }}>
            {DB_OBJ_SECTIONS.map(sec => {
              const items = Object.keys(dataBySec[sec.id]).filter(n =>
                !filter || n.toLowerCase().includes(filter.toLowerCase()) ||
                dataBySec[sec.id][n].name?.toLowerCase().includes(filter.toLowerCase()));
              if (filter && !items.length) return null;
              const isExp = expanded[sec.id];
              return (
                <div key={sec.id}>
                  <div className="tb-section-head" onClick={() => setExpanded(e => ({ ...e, [sec.id]: !isExp }))}>
                    {sec.icon}
                    {sec.label}
                    <IcChevDown size={12} style={{ transform: isExp ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .12s', marginLeft: 'auto' }} />
                    <span className="tb-section-count">{items.length}</span>
                  </div>
                  {isExp && items.map(name => {
                    const obj = dataBySec[sec.id][name];
                    const isActive = selType === sec.id && selName === name;
                    return (
                      <div key={name} className={`wb-list-item ${isActive ? 'active' : ''}`}
                           style={{ paddingLeft: 24, gap: 8 }}
                           onClick={() => selectItem(sec.id, name)}>
                        {sec.icon}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                          <span style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'Menlo,Consolas,monospace' }}>
                            {obj.schema}.{obj.name}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!sidebarOpen && (
        <button className="icon-btn" style={{ margin: '12px 0 0 10px', alignSelf: 'flex-start' }}
                onClick={() => setSidebarOpen(true)}>
          <IcChevDoubleRight size={16} />
        </button>
      )}

      {renderBody()}
    </div>
  );
}

window.DatabaseObjects = DatabaseObjects;
