// ============================================================
// Data Illustrator — root workbench.
// Routes: 'illustrator' (illustrations) + 'illustrator-template' (templates)
// Sub-components loaded from illustrator_panels.jsx, illustrator_doc.jsx,
// illustrator_ai.jsx.
// ============================================================

// ---- Seed data ----
const ILL_TEMPLATES_SEED = {
  'Party Template': {
    name: 'Party Template', version: '20.1.15.0',
    description: 'Glossary of illustrated names for the master party entity.',
    category: { role: 'Entity', uses: ['Illustrator', 'Reports', 'API'] },
    names: [
      { id: 'n1', illustratedName: 'Party Identifier',  desc: 'Unique EDM party key',          fieldName: 'EDM_PARTY_ID',  type: 'Integer',  default: '',     format: '',          decode: 'None',   decObj: '', decJoin: '', decField: '', sortField: '' },
      { id: 'n2', illustratedName: 'Legal Name',         desc: 'Full legal entity name',        fieldName: 'PARTY_NAME',    type: 'Text',     default: '',     format: '',          decode: 'None',   decObj: '', decJoin: '', decField: '', sortField: '' },
      { id: 'n3', illustratedName: 'Short Name',         desc: 'Abbreviated display name',      fieldName: 'SHORT_NAME',    type: 'Text',     default: '',     format: '',          decode: 'None',   decObj: '', decJoin: '', decField: '', sortField: '' },
      { id: 'n4', illustratedName: 'LEI',                desc: 'Legal Entity Identifier (20)',  fieldName: 'LEI',           type: 'Text',     default: '',     format: '',          decode: 'None',   decObj: '', decJoin: '', decField: '', sortField: '' },
      { id: 'n5', illustratedName: 'Country',            desc: 'Country of incorporation',      fieldName: 'COUNTRY',       type: 'Text',     default: '',     format: '',          decode: 'Object', decObj: 'REF_COUNTRY', decJoin: 'CODE', decField: 'COUNTRY_NAME', sortField: '' },
      { id: 'n6', illustratedName: 'Sector',             desc: 'GICS sector classification',   fieldName: 'GICS_SECTOR',   type: 'Text',     default: '',     format: '',          decode: 'None',   decObj: '', decJoin: '', decField: '', sortField: '' },
      { id: 'n7', illustratedName: 'Active',             desc: 'Whether the party is active',  fieldName: 'IS_ACTIVE',     type: 'Boolean',  default: 'True', format: 'Yes/No',    decode: 'None',   decObj: '', decJoin: '', decField: '', sortField: '' },
    ],
  },
  'Pricing Template': {
    name: 'Pricing Template', version: '20.1.15.0',
    description: 'Glossary of illustrated names for the pricing master.',
    category: { role: 'Transaction', uses: ['Illustrator', 'Reports'] },
    names: [
      { id: 'n1', illustratedName: 'Security Identifier',  desc: 'EDM security key',             fieldName: 'EDM_SEC_ID',    type: 'Integer',  default: '',  format: '',              decode: 'None',   decObj: '', decJoin: '', decField: '', sortField: '' },
      { id: 'n2', illustratedName: 'Price',                desc: 'Clean price value',             fieldName: 'PRICE',         type: 'Decimal',  default: '',  format: '#,##0.0000',    decode: 'None',   decObj: '', decJoin: '', decField: '', sortField: '' },
      { id: 'n3', illustratedName: 'Currency',             desc: 'Price currency (ISO 4217)',     fieldName: 'CURRENCY',      type: 'Text',     default: '',  format: '',              decode: 'Object', decObj: 'REF_CURRENCY', decJoin: 'CODE', decField: 'SYMBOL', sortField: '' },
      { id: 'n4', illustratedName: 'Price Date',           desc: 'Valuation date of the price',  fieldName: 'PRICE_DATE',    type: 'Date',     default: '',  format: 'dd/mm/yyyy',    decode: 'None',   decObj: '', decJoin: '', decField: '', sortField: '' },
      { id: 'n5', illustratedName: 'Source',               desc: 'Originating price vendor',     fieldName: 'SOURCE_NAME',   type: 'Text',     default: '',  format: '',              decode: 'None',   decObj: '', decJoin: '', decField: '', sortField: '' },
    ],
  },
};

const ILL_ILLUSTRATIONS_SEED = {
  'Party Illustrator': {
    name: 'Party Illustrator', version: '20.1.15.0',
    template: 'Party Template',
    sourceTable: { schema: 'dbo', name: 'T_MASTER_PARTY' },
    sourceColumns: ['EDM_PARTY_ID','PARTY_NAME','SHORT_NAME','LEI','COUNTRY','GICS_SECTOR','IS_ACTIVE','LAST_UPDATE_DATE','CREATE_DATE'],
    mappings: [
      { id: 'm1', glossaryName: 'Party Identifier',  sourceName: 'EDM_PARTY_ID',  origin: 'Auto',   confirmed: true },
      { id: 'm2', glossaryName: 'Legal Name',         sourceName: 'PARTY_NAME',    origin: 'Auto',   confirmed: true },
      { id: 'm3', glossaryName: 'Short Name',         sourceName: 'SHORT_NAME',    origin: 'Auto',   confirmed: true },
      { id: 'm4', glossaryName: 'LEI',                sourceName: 'LEI',           origin: 'Auto',   confirmed: true },
      { id: 'm5', glossaryName: 'Country',            sourceName: 'COUNTRY',       origin: 'Auto',   confirmed: true },
      { id: 'm6', glossaryName: 'Sector',             sourceName: 'GICS_SECTOR',   origin: 'Manual', confirmed: true },
      { id: 'm7', glossaryName: 'Active',             sourceName: 'IS_ACTIVE',     origin: 'Auto',   confirmed: true },
    ],
  },
  'Pricing Illustrator': {
    name: 'Pricing Illustrator', version: '20.1.15.0',
    template: 'Pricing Template',
    sourceTable: { schema: 'dbo', name: 'T_MASTER_PRICE' },
    sourceColumns: ['EDM_SEC_ID','PRICE','CURRENCY','PRICE_DATE','PRICE_DATE_YMD','SOURCE_NAME','PRICE_TYPE','LAST_UPDATE_DATE'],
    mappings: [
      { id: 'm1', glossaryName: 'Security Identifier',  sourceName: 'EDM_SEC_ID',    origin: 'Auto',   confirmed: true },
      { id: 'm2', glossaryName: 'Price',                sourceName: 'PRICE',          origin: 'Auto',   confirmed: true },
      { id: 'm3', glossaryName: 'Currency',             sourceName: 'CURRENCY',       origin: 'Auto',   confirmed: true },
      { id: 'm4', glossaryName: 'Price Date',           sourceName: 'PRICE_DATE',     origin: 'Auto',   confirmed: true },
      { id: 'm5', glossaryName: 'Source',               sourceName: 'SOURCE_NAME',    origin: 'Manual', confirmed: false },
    ],
  },
};

// ============================================================
// Root Illustrator component
// ============================================================
function Illustrator({ initialMode = 'illustration' }) {
  const [templates, setTemplates]       = React.useState(ILL_TEMPLATES_SEED);
  const [illustrations, setIllustrations] = React.useState(ILL_ILLUSTRATIONS_SEED);
  const [selType, setSelType]           = React.useState(initialMode);
  const [selName, setSelName]           = React.useState(() => {
    const openName = window.__illOpenName;
    if (openName) {
      if (ILL_TEMPLATES_SEED[openName]) return openName;
      if (ILL_ILLUSTRATIONS_SEED[openName]) return openName;
    }
    return initialMode === 'template'
      ? Object.keys(ILL_TEMPLATES_SEED)[0]
      : Object.keys(ILL_ILLUSTRATIONS_SEED)[0];
  });
  const [sidebarOpen, setSidebarOpen]   = React.useState(true);
  const [filter, setFilter]             = React.useState('');
  const [secExpanded, setSecExpanded]   = React.useState({ illustration: true, template: true });

  React.useEffect(() => {
    const name = window.__illOpenName;
    if (name) {
      if (ILL_TEMPLATES_SEED[name]) { setSelType('template'); setSelName(name); }
      else if (ILL_ILLUSTRATIONS_SEED[name]) { setSelType('illustration'); setSelName(name); }
      window.__illOpenName = null;
    }
  }, []);

  const filteredIll = Object.keys(illustrations).filter(n => !filter || n.toLowerCase().includes(filter.toLowerCase()));
  const filteredTpl = Object.keys(templates).filter(n => !filter || n.toLowerCase().includes(filter.toLowerCase()));

  function select(type, name) {
    setSelType(type);
    setSelName(name);
  }

  function renderBody() {
    if (selType === 'template' && templates[selName]) {
      return (
        <IllustratorTemplate
          tpl={templates[selName]}
          tplName={selName}
          onChange={v => setTemplates(t => ({ ...t, [selName]: v }))}
        />
      );
    }
    if (selType === 'illustration' && illustrations[selName]) {
      return (
        <IllustratorDoc
          doc={illustrations[selName]}
          docName={selName}
          allTemplates={templates}
          onChange={v => setIllustrations(t => ({ ...t, [selName]: v }))}
        />
      );
    }
    return (
      <div className="wb-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--ink-4)' }}>
        <IcIllustrator size={36} />
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-3)' }}>Select a template or illustration</div>
        <div style={{ fontSize: 13 }}>Browse the list on the left</div>
      </div>
    );
  }

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">Illustrator</span>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}><IcChevDoubleLeft size={16} /></button>
          </div>
          <div className="wb-list-search">
            <div className="wb-list-search-wrap">
              <IcSearch size={14} />
              <input className="input" placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
          </div>
          <div className="wb-list-items" style={{ padding: 0 }}>

            {/* Illustrations section */}
            {(!filter || filteredIll.length > 0) && (
              <div>
                <div className="ill-section-head"
                     onClick={() => setSecExpanded(e => ({ ...e, illustration: !e.illustration }))}>
                  <IcIllustrator size={13} />
                  Illustrations
                  <IcChevDown size={12} style={{ marginLeft: 'auto', transform: secExpanded.illustration ? 'none' : 'rotate(-90deg)', transition: 'transform .12s' }} />
                  <span className="ill-section-count">{filteredIll.length}</span>
                </div>
                {secExpanded.illustration && filteredIll.map(name => {
                  const doc = illustrations[name];
                  const isActive = selType === 'illustration' && selName === name;
                  const tpl = templates[doc.template];
                  const confirmedCount = doc.mappings.filter(m => m.confirmed && m.sourceName).length;
                  const totalCount     = doc.mappings.length;
                  return (
                    <div key={name} className={`wb-list-item ${isActive ? 'active' : ''}`}
                         style={{ paddingLeft: 24, gap: 8 }} onClick={() => select('illustration', name)}>
                      <IcIllustrator size={15} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                          {doc.template} · {confirmedCount}/{totalCount} mapped
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Templates section */}
            {(!filter || filteredTpl.length > 0) && (
              <div>
                <div className="ill-section-head"
                     onClick={() => setSecExpanded(e => ({ ...e, template: !e.template }))}>
                  <IcPages size={13} />
                  Templates
                  <IcChevDown size={12} style={{ marginLeft: 'auto', transform: secExpanded.template ? 'none' : 'rotate(-90deg)', transition: 'transform .12s' }} />
                  <span className="ill-section-count">{filteredTpl.length}</span>
                </div>
                {secExpanded.template && filteredTpl.map(name => {
                  const tpl = templates[name];
                  const isActive = selType === 'template' && selName === name;
                  return (
                    <div key={name} className={`wb-list-item ${isActive ? 'active' : ''}`}
                         style={{ paddingLeft: 24, gap: 8 }} onClick={() => select('template', name)}>
                      <IcPages size={15} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                          {tpl.names.length} names
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

window.Illustrator = Illustrator;
