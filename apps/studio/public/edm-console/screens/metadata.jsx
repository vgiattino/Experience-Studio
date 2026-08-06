// ============================================================
// Metadata Studio
// A canonical logical model that abstracts physical tables/columns.
//   Sources → Logical Attributes → Physical Targets
// Tabs: Attributes · Mapping Matrix · Domains · Lineage (where-used)
// ============================================================

// Sources contributing to the model (colour-coded in the matrix)
const MD_SOURCES = [
  { id: 'bbg',   short: 'BBG',   name: 'Bloomberg BO', color: '#ff8a65' },
  { id: 'lseg',  short: 'LSEG',  name: 'LSEG DSS',     color: '#6366f1' },
  { id: 'six',   short: 'SIX',   name: 'SIX',          color: '#06b6d4' },
  { id: 'red',   short: 'RED',   name: 'RED CDS',      color: '#10b981' },
];

// Classification tag → css class
const CLS = {
  PII:        'pii',
  Golden:     'golden',
  Derived:    'derived',
  Key:        'key',
  Public:     'public',
  Mandatory:  'mandatory',
};

// ------------------------------------------------------------
// Worked example: Security Master (fully populated)
// Each attribute: logical name, definition, datatype, domain,
//   target physical column, classifications, and per-source mappings.
// ------------------------------------------------------------
function m(source, column, transform) { return { source, column, transform: transform || null }; }

const SECURITY_ATTRS = [
  { id: 'isin', name: 'ISIN', target: 'dbo.Master_Security.ISIN', type: 'CHAR(12)', domain: null,
    def: 'International Securities Identification Number — the primary global identifier for the instrument.',
    cls: ['Key', 'Golden', 'Mandatory'],
    maps: { bbg: m('bbg', 'ID_ISIN'), lseg: m('lseg', 'IsinCode'), six: m('six', 'Isin'), red: null } },
  { id: 'cusip', name: 'CUSIP', target: 'dbo.Master_Security.CUSIP', type: 'CHAR(9)', domain: null,
    def: 'CUSIP identifier for North American securities. Check digit validated on load.',
    cls: ['Key', 'Mandatory'],
    maps: { bbg: m('bbg', 'ID_CUSIP', 'Rule: Calculate Cusip Check Digit'), lseg: m('lseg', 'CusipCode'), six: null, red: null } },
  { id: 'sedol', name: 'SEDOL', target: 'dbo.Master_Security.SEDOL', type: 'CHAR(7)', domain: null,
    def: 'Stock Exchange Daily Official List identifier (UK / Ireland listings).',
    cls: ['Key'],
    maps: { bbg: m('bbg', 'ID_SEDOL1'), lseg: m('lseg', 'SedolCode'), six: m('six', 'Sedol'), red: null } },
  { id: 'desc', name: 'Security Description', target: 'dbo.Master_Security.SecurityDesc', type: 'VARCHAR(200)', domain: null,
    def: 'Human-readable security name used across the UI and reports.',
    cls: ['Golden'],
    maps: { bbg: m('bbg', 'SECURITY_DES'), lseg: m('lseg', 'Description'), six: m('six', 'ShortName'), red: m('red', 'ReferenceEntity') } },
  { id: 'assettype', name: 'Asset Type', target: 'dbo.Master_Security.AssetType', type: 'VARCHAR(20)', domain: 'AssetType',
    def: 'Classifies the instrument into a high-level asset class. Normalized against the AssetType domain.',
    cls: ['Golden'],
    maps: { bbg: m('bbg', 'MARKET_SECTOR_DES', 'Decode → AssetType'), lseg: m('lseg', 'AssetCategory', 'Decode → AssetType'), six: m('six', 'InstrumentType', 'Decode → AssetType'), red: null } },
  { id: 'ccy', name: 'Currency', target: 'dbo.Master_Security.Currency', type: 'CHAR(3)', domain: 'Currency',
    def: 'ISO 4217 currency code the instrument is denominated in.',
    cls: ['Mandatory'],
    maps: { bbg: m('bbg', 'CRNCY'), lseg: m('lseg', 'Currency'), six: m('six', 'Ccy'), red: m('red', 'Currency') } },
  { id: 'maturity', name: 'Maturity Date', target: 'dbo.Master_Security.MaturityDate', type: 'DATE', domain: null,
    def: 'Date on which the principal of a fixed-income instrument is repaid.',
    cls: [],
    maps: { bbg: m('bbg', 'MATURITY', 'Cast As Date'), lseg: m('lseg', 'MaturityDate'), six: m('six', 'Maturity'), red: null } },
  { id: 'coupon', name: 'Coupon', target: 'dbo.Master_Security.Coupon', type: 'DECIMAL(9,6)', domain: null,
    def: 'Annual coupon rate (%) for fixed-income instruments.',
    cls: [],
    maps: { bbg: m('bbg', 'CPN'), lseg: m('lseg', 'CouponRate'), six: null, red: null } },
  { id: 'issuer', name: 'Issuer LEI', target: 'dbo.Master_Security.IssuerLEI', type: 'CHAR(20)', domain: null,
    def: 'Legal Entity Identifier of the issuing entity. Links Security Master to Party Master.',
    cls: ['Key', 'Golden'],
    maps: { bbg: m('bbg', 'ID_BB_COMPANY', 'Lookup → LEI'), lseg: m('lseg', 'IssuerOrgId', 'Lookup → LEI'), six: m('six', 'IssuerLei'), red: m('red', 'ReferenceEntityLei') } },
  { id: 'country', name: 'Country of Risk', target: 'dbo.Master_Security.CountryOfRisk', type: 'CHAR(2)', domain: 'Country',
    def: 'ISO 3166 country code representing the primary risk exposure.',
    cls: [],
    maps: { bbg: m('bbg', 'CNTRY_OF_RISK'), lseg: m('lseg', 'CountryOfRisk'), six: m('six', 'RiskCountry'), red: null } },
  { id: 'rating', name: 'Credit Rating', target: 'dbo.Master_Security.CreditRating', type: 'VARCHAR(8)', domain: 'Rating',
    def: 'Composite credit rating, normalized to the internal Rating domain scale.',
    cls: ['Derived'],
    maps: { bbg: m('bbg', 'RTG_SP', 'Decode → Rating'), lseg: null, six: null, red: m('red', 'Tier') } },
  { id: 'price', name: 'Last Price', target: 'dbo.Master_Security.LastPrice', type: 'DECIMAL(18,6)', domain: null,
    def: 'Most recent evaluated price. Sourced via the Price Master survivorship rules.',
    cls: ['Derived'],
    maps: { bbg: m('bbg', 'PX_LAST'), lseg: m('lseg', 'ClosePrice'), six: m('six', 'LastPrice'), red: null } },
  { id: 'active', name: 'Active Flag', target: 'dbo.Master_Security.Active', type: 'BIT', domain: 'YesNo',
    def: 'Indicates whether the security is currently active / tradeable.',
    cls: [],
    maps: { bbg: m('bbg', 'TRADE_STATUS', 'Decode → YesNo'), lseg: m('lseg', 'IsActive'), six: null, red: null } },
  { id: 'exch', name: 'Primary Exchange', target: 'dbo.Master_Security.PrimaryExchange', type: 'VARCHAR(10)', domain: 'MIC',
    def: 'MIC code of the primary listing exchange.',
    cls: [],
    maps: { bbg: m('bbg', 'EXCH_CODE'), lseg: m('lseg', 'ExchangeCode'), six: m('six', 'Mic'), red: null } },
  { id: 'daybasis', name: 'Day Count Basis', target: 'dbo.Master_Security.DayCountBasis', type: 'VARCHAR(12)', domain: 'DayCount',
    def: 'Day-count convention used for accrued interest calculations.',
    cls: [],
    maps: { bbg: m('bbg', 'DAY_CNT_DES', 'Decode → DayCount'), lseg: m('lseg', 'DayCountConvention'), six: null, red: null } },
  { id: 'pii_contact', name: 'RM Contact Email', target: 'dbo.Master_Security.RMContact', type: 'VARCHAR(120)', domain: null,
    def: 'Relationship-manager email associated with the position. Personal data — access-restricted.',
    cls: ['PII'],
    maps: { bbg: null, lseg: null, six: null, red: null } },
];

// Other entities (lighter — show coverage but a smaller attr set)
const PARTY_ATTRS = [
  { id: 'lei', name: 'LEI', target: 'dbo.Master_Party.LEI', type: 'CHAR(20)', domain: null,
    def: 'Legal Entity Identifier — primary key for the party.', cls: ['Key','Golden','Mandatory'],
    maps: { bbg: m('bbg','ID_BB_COMPANY','Lookup → LEI'), lseg: m('lseg','OrgId'), six: m('six','Lei'), red: m('red','EntityLei') } },
  { id: 'legalname', name: 'Legal Name', target: 'dbo.Master_Party.LegalName', type: 'VARCHAR(200)', domain: null,
    def: 'Registered legal name of the entity.', cls: ['Golden'],
    maps: { bbg: m('bbg','LONG_COMP_NAME'), lseg: m('lseg','LegalName'), six: m('six','Name'), red: m('red','EntityName') } },
  { id: 'country', name: 'Country of Incorporation', target: 'dbo.Master_Party.CountryInc', type: 'CHAR(2)', domain: 'Country',
    def: 'ISO country of incorporation.', cls: [],
    maps: { bbg: m('bbg','CNTRY_ISSUE_ISO'), lseg: m('lseg','CountryInc'), six: null, red: null } },
  { id: 'industry', name: 'Industry (GICS)', target: 'dbo.Master_Party.GICS', type: 'VARCHAR(10)', domain: 'GICS',
    def: 'GICS classification code.', cls: ['Derived'],
    maps: { bbg: m('bbg','GICS_SECTOR','Decode → GICS'), lseg: null, six: null, red: null } },
  { id: 'parent', name: 'Ultimate Parent LEI', target: 'dbo.Master_Party.ParentLEI', type: 'CHAR(20)', domain: null,
    def: 'LEI of the ultimate parent in the ownership hierarchy.', cls: ['Key'],
    maps: { bbg: m('bbg','ID_ULT_PARENT'), lseg: null, six: m('six','ParentLei'), red: null } },
];

const PRICE_ATTRS = [
  { id: 'instr', name: 'Instrument ISIN', target: 'dbo.Master_Price.ISIN', type: 'CHAR(12)', domain: null,
    def: 'Links the price to the Security Master.', cls: ['Key','Mandatory'],
    maps: { bbg: m('bbg','ID_ISIN'), lseg: m('lseg','IsinCode'), six: m('six','Isin'), red: null } },
  { id: 'price', name: 'Price', target: 'dbo.Master_Price.Price', type: 'DECIMAL(18,6)', domain: null,
    def: 'Evaluated price value.', cls: ['Golden'],
    maps: { bbg: m('bbg','PX_LAST'), lseg: m('lseg','ClosePrice'), six: m('six','LastPrice'), red: null } },
  { id: 'asof', name: 'As-of Date', target: 'dbo.Master_Price.AsOfDate', type: 'DATE', domain: null,
    def: 'Pricing date.', cls: ['Mandatory'],
    maps: { bbg: m('bbg','PX_LAST_DT','Cast As Date'), lseg: m('lseg','PriceDate'), six: m('six','ValuationDate'), red: null } },
  { id: 'src', name: 'Price Source', target: 'dbo.Master_Price.Source', type: 'VARCHAR(20)', domain: 'PriceSource',
    def: 'Winning source after survivorship.', cls: ['Derived'],
    maps: { bbg: m('bbg','PRICING_SOURCE'), lseg: m('lseg','Source'), six: null, red: null } },
  { id: 'quality', name: 'Quality Score', target: 'dbo.Master_Price.Quality', type: 'INT', domain: null,
    def: 'Confidence / quality score 0–100.', cls: ['Derived'],
    maps: { bbg: m('bbg','PX_QUALITY'), lseg: null, six: null, red: null } },
];

const MD_ENTITIES = [
  { id: 'security', name: 'Security Master', icon: 'IcSource', attrs: SECURITY_ATTRS,
    desc: 'The golden record for instruments — identifiers, terms, classification and pricing links.' },
  { id: 'party', name: 'Party Master', icon: 'IcUsers', attrs: PARTY_ATTRS,
    desc: 'The golden record for legal entities — identifiers, hierarchy and classification.' },
  { id: 'price', name: 'Price Master', icon: 'IcDataProducts', attrs: PRICE_ATTRS,
    desc: 'Mastered prices with source survivorship and quality scoring.' },
];

// Domains / value lists
const MD_DOMAINS = [
  { id: 'AssetType', name: 'AssetType', desc: 'High-level asset classification', usedBy: 1,
    values: [['EQ','Equity'],['FI','Fixed Income'],['FX','Foreign Exchange'],['DER','Derivative'],['FND','Fund'],['CASH','Cash']] },
  { id: 'Currency', name: 'Currency', desc: 'ISO 4217 currency codes', usedBy: 2,
    values: [['USD','US Dollar'],['EUR','Euro'],['GBP','Pound Sterling'],['JPY','Japanese Yen'],['CHF','Swiss Franc']] },
  { id: 'Rating', name: 'Rating', desc: 'Normalized internal credit scale', usedBy: 1,
    values: [['AAA','Prime'],['AA','High grade'],['A','Upper medium'],['BBB','Lower medium'],['BB','Speculative'],['D','Default']] },
  { id: 'Country', name: 'Country', desc: 'ISO 3166 country codes', usedBy: 3,
    values: [['US','United States'],['GB','United Kingdom'],['DE','Germany'],['JP','Japan'],['SG','Singapore']] },
  { id: 'YesNo', name: 'YesNo', desc: 'Boolean flag domain', usedBy: 2,
    values: [['1','Yes'],['0','No']] },
  { id: 'DayCount', name: 'DayCount', desc: 'Day-count conventions', usedBy: 1,
    values: [['30/360','30/360'],['ACT/360','Actual/360'],['ACT/365','Actual/365'],['ACT/ACT','Actual/Actual']] },
];

// Where-used / lineage references per attribute id
const MD_LINEAGE = {
  isin:    [ { kind: 'Porter', name: 'Enrich Bloomberg Security', step: 'Field Mapping', icon: 'IcPorter', goto: 'porter' },
             { kind: 'Rule', name: 'Validate ISIN check digit', step: 'IF / THEN', icon: 'IcRules', goto: 'rules' },
             { kind: 'Solution', name: '2000 Security', step: 'Master Security', icon: 'IcSolutions', goto: 'solutions' },
             { kind: 'Constructor', name: 'Enrich Bloomberg Party Aligned', step: 'Construction Rule', icon: 'IcSliders', goto: 'constructor' } ],
  cusip:   [ { kind: 'Rule', name: 'Calculate Cusip Check Digit', step: 'THEN expression', icon: 'IcRules', goto: 'rules' },
             { kind: 'Porter', name: 'Enrich Bloomberg Security', step: 'Field Mapping', icon: 'IcPorter', goto: 'porter' } ],
  assettype:[ { kind: 'Constructor', name: 'Asset Type construction rule', step: 'Construction Rule', icon: 'IcSliders', goto: 'constructor' },
             { kind: 'Rule', name: 'Decode Asset Type', step: 'Table rule', icon: 'IcRules', goto: 'rules' } ],
  maturity:[ { kind: 'Rule', name: 'Cast As Date', step: 'THEN expression', icon: 'IcRules', goto: 'rules' },
             { kind: 'Porter', name: 'Enrich Bloomberg Security', step: 'Field Mapping', icon: 'IcPorter', goto: 'porter' } ],
  issuer:  [ { kind: 'Solution', name: '2000 Party', step: 'Link Security→Party', icon: 'IcSolutions', goto: 'solutions' },
             { kind: 'Constructor', name: 'Issuer LEI survivorship', step: 'Construction Rule', icon: 'IcSliders', goto: 'constructor' } ],
  price:   [ { kind: 'Solution', name: 'Master Price', step: 'Survivorship', icon: 'IcSolutions', goto: 'solutions' } ],
  rating:  [ { kind: 'Rule', name: 'Decode Rating', step: 'Table rule', icon: 'IcRules', goto: 'rules' } ],
};

// ============================================================
// Helpers
// ============================================================
function coverageOf(attr) {
  const mapped = MD_SOURCES.filter(s => attr.maps[s.id]).length;
  return { mapped, total: MD_SOURCES.length, pct: Math.round((mapped / MD_SOURCES.length) * 100) };
}
function entityCoverage(attrs) {
  const totalCells = attrs.length * MD_SOURCES.length;
  let mapped = 0, fullyMapped = 0, unmapped = 0;
  attrs.forEach(a => {
    const c = coverageOf(a);
    mapped += c.mapped;
    if (c.mapped === 0) unmapped++;
    if (c.mapped === MD_SOURCES.length) fullyMapped++;
  });
  return { pct: Math.round((mapped / totalCells) * 100), unmapped, fullyMapped, attrs: attrs.length };
}

// ============================================================
// Attribute detail drawer
// ============================================================
function AttributeDrawer({ attr, onClose, onNavigate }) {
  const [tab, setTab] = React.useState('mappings');
  const cov = coverageOf(attr);
  const lineage = MD_LINEAGE[attr.id] || [];
  return (
    <>
      <div className="mp-drawer-backdrop" onClick={onClose} />
      <div className="mp-drawer">
        <div className="mp-drawer-head">
          <span className="mp-logo" style={{ background: 'linear-gradient(135deg,#b51e7a,#6d28d9)' }}>
            <IcLayers size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{attr.name}</h2>
            <div style={{ color: 'var(--ink-4)', fontSize: 12.5, marginTop: 2,
                          fontFamily: 'Menlo,Consolas,monospace' }}>{attr.target}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span className="pill-type">{attr.type}</span>
              {attr.domain && <span className="cls-tag derived">DOMAIN: {attr.domain}</span>}
              {attr.cls.map(c => <span key={c} className={`cls-tag ${CLS[c]}`}>{c}</span>)}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><IcX size={16} /></button>
        </div>

        <div className="tabs" style={{ padding: '0 22px', margin: 0, borderBottom: '1px solid var(--line)' }}>
          {[['mappings','Source Mappings'],['def','Definition'],['lineage',`Where Used (${lineage.length})`]].map(([id,label]) => (
            <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        <div className="mp-drawer-body">
          {tab === 'mappings' && (
            <>
              <div className="hstack" style={{ marginBottom: 12, gap: 8 }}>
                <div className="a-cov" style={{ flex: 1 }}>
                  <div className="bar"><i className={cov.mapped === 0 ? 'none' : cov.mapped < 2 ? 'low' : ''}
                                           style={{ width: cov.pct + '%' }} /></div>
                  <span className="n">{cov.mapped}/{cov.total} sources</span>
                </div>
                <button className="btn" onClick={() => ruleToast('Auto-mapped 1 source by column-name match', 'success')}>
                  <IcSparkle size={14} /> Auto-map
                </button>
              </div>
              {MD_SOURCES.map(s => {
                const mp = attr.maps[s.id];
                return (
                  <div key={s.id} className="attr-mapping">
                    <div className="attr-mapping-head">
                      <span className="src-dot" style={{ background: s.color, width: 10, height: 10, borderRadius: 2 }} />
                      {s.name}
                      {mp
                        ? <span className="badge-pri">Mapped</span>
                        : <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)', fontStyle: 'italic' }}>Not mapped</span>}
                    </div>
                    {mp && (
                      <div className="attr-mapping-body">
                        <div>
                          <div className="mk">Physical column</div>
                          <div className="mv">{s.short}.{mp.column}</div>
                        </div>
                        <div>
                          <div className="mk">Transform</div>
                          <div className="mv" style={{ color: mp.transform ? 'var(--magenta)' : 'var(--ink-4)' }}>
                            {mp.transform || 'direct (1:1)'}
                          </div>
                        </div>
                      </div>
                    )}
                    {!mp && (
                      <div style={{ padding: '10px 14px' }}>
                        <button className="btn ghost" style={{ fontSize: 12 }}
                                onClick={() => ruleToast(`Open mapping editor for ${s.name}`, 'info')}>
                          <IcPlus size={13} /> Map a column from {s.short}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {tab === 'def' && (
            <>
              <div className="mp-drawer-section">
                <div className="h">Business definition</div>
                <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>{attr.def}</p>
              </div>
              <div className="mp-drawer-section">
                <div className="h">Physical target</div>
                <div className="prop-grid">
                  <div className="prop-grid-row"><div className="pg-k">Column</div><div className="pg-v readonly">{attr.target}</div></div>
                  <div className="prop-grid-row"><div className="pg-k">Data type</div><div className="pg-v readonly">{attr.type}</div></div>
                  <div className="prop-grid-row"><div className="pg-k">Domain</div><div className="pg-v readonly">{attr.domain || '—'}</div></div>
                  <div className="prop-grid-row"><div className="pg-k">Classification</div><div className="pg-v readonly">{attr.cls.join(', ') || 'Public'}</div></div>
                </div>
              </div>
              <div className="mp-drawer-section">
                <div className="h">Governance</div>
                <div className="vstack" style={{ gap: 6, fontSize: 13, color: 'var(--ink-3)' }}>
                  <div className="hstack" style={{ gap: 8 }}><IcUser size={13} /> Steward: <strong style={{ color: 'var(--ink)' }}>kim.wexler@hhm.com</strong></div>
                  <div className="hstack" style={{ gap: 8 }}><IcHistory size={13} /> Last reviewed: 14 Apr 2026</div>
                </div>
              </div>
            </>
          )}

          {tab === 'lineage' && (
            <>
              <div className="lineage-flow">
                <span className="lineage-node source"><IcSource size={13} /> Sources ({cov.mapped})</span>
                <IcArrowRight size={16} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                <span className="lineage-node logical"><IcLayers size={13} /> {attr.name}</span>
                <IcArrowRight size={16} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                <span className="lineage-node target"><IcManager size={13} /> {attr.target.split('.').slice(-1)[0]}</span>
              </div>
              <div className="mp-drawer-section">
                <div className="h">Used by {lineage.length} component{lineage.length === 1 ? '' : 's'}</div>
                {lineage.length === 0 && (
                  <div style={{ color: 'var(--ink-4)', fontSize: 13, fontStyle: 'italic' }}>
                    Not referenced by any Porter, Rule, Solution or Constructor yet.
                  </div>
                )}
                {lineage.map((l, i) => {
                  const Icon = window[l.icon] || IcFile;
                  const tint = { Porter: ['#eaf2fc','#1968d3'], Rule: ['#fdf3f9','#b51e7a'],
                                 Solution: ['#e7f6f1','#0f7c70'], Constructor: ['#ede9fe','#6d28d9'] }[l.kind] || ['#f4f4f4','#5a5a5a'];
                  return (
                    <div key={i} className="lineage-item" onClick={() => onNavigate(l.goto)}>
                      <span className="li-icon" style={{ background: tint[0], color: tint[1] }}><Icon size={16} /></span>
                      <div className="li-meta">
                        <div className="li-title">{l.name}</div>
                        <div className="li-sub">{l.step}</div>
                      </div>
                      <span className="li-kind">{l.kind}</span>
                      <IcChevRight size={14} style={{ color: 'var(--ink-4)' }} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="mp-drawer-foot">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={() => ruleToast('Attribute saved', 'success')}>
            <IcCheck size={14} /> Save
          </button>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Main Metadata Studio
// ============================================================
function MetadataStudio({ onNavigate }) {
  const [entityId, setEntityId] = React.useState('security');
  const [tab, setTab] = React.useState('attributes');
  const [filter, setFilter] = React.useState('');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [selectedAttr, setSelectedAttr] = React.useState(null);
  const [clsFilter, setClsFilter] = React.useState(null);

  const entity = MD_ENTITIES.find(e => e.id === entityId);
  const cov = entityCoverage(entity.attrs);

  const attrs = entity.attrs.filter(a =>
    (!filter || a.name.toLowerCase().includes(filter.toLowerCase()) || a.target.toLowerCase().includes(filter.toLowerCase())) &&
    (!clsFilter || a.cls.includes(clsFilter)));

  return (
    <div className="workbench">
      {sidebarOpen && (
        <div className="wb-list">
          <div className="wb-list-head">
            <span className="title">
              Business Entities
              <button className="icon-btn" title="New entity"
                      onClick={() => ruleToast('New business entity', 'info')}><IcPlus size={16} /></button>
            </span>
            <button className="icon-btn" onClick={() => setSidebarOpen(false)}>
              <IcChevDoubleLeft size={16} />
            </button>
          </div>
          <div className="wb-list-items" style={{ paddingTop: 8 }}>
            {MD_ENTITIES.map(e => {
              const Icon = window[e.icon];
              const c = entityCoverage(e.attrs);
              return (
                <div key={e.id}
                     className={`wb-list-item ${e.id === entityId ? 'active' : ''}`}
                     style={{ padding: '10px 12px', alignItems: 'center', gap: 10 }}
                     onClick={() => { setEntityId(e.id); setSelectedAttr(null); }}>
                  <Icon size={16} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{e.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{e.attrs.length} attrs · {c.pct}% mapped</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
            <div className="recent-group-label" style={{ margin: '0 0 8px' }}>Library</div>
            <div className="wb-list-item" onClick={() => setTab('domains')} style={{ gap: 10 }}>
              <IcList size={15} /> Domains & Value Lists
            </div>
            <div className="wb-list-item" onClick={() => ruleToast('Business Glossary', 'info')} style={{ gap: 10 }}>
              <IcBook size={15} /> Business Glossary
            </div>
          </div>
        </div>
      )}

      <div className="wb-body">
        <div className="wb-body-head">
          {!sidebarOpen && (
            <button className="icon-btn" style={{ float: 'left', marginRight: 12 }}
                    onClick={() => setSidebarOpen(true)}><IcChevDoubleRight size={16} /></button>
          )}
          <div className="title-row">
            <span className="head-icon"><IcLayers size={18} /></span>
            <h1>
              {entity.name}
              <span className="ver-pill">Logical model v2.3 <IcChevDown size={10} /></span>
            </h1>
            <div className="right hstack" style={{ gap: 6 }}>
              <button className="btn" onClick={() => ruleToast('Generated starter Solution from Security Master', 'success')}>
                <IcSparkle size={14} /> Generate starter
              </button>
              <button className="btn"><IcExport size={14} /> Export model</button>
            </div>
          </div>
          <div className="desc">{entity.desc}</div>
        </div>

        {/* Coverage band */}
        <div className="md-coverage">
          <div className="md-stat" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <div className="md-ring" style={{ '--pct': cov.pct, position: 'relative' }}>
              <span>{cov.pct}%</span>
            </div>
            <div>
              <div className="k">Mapping coverage</div>
              <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>across {MD_SOURCES.length} sources</div>
            </div>
          </div>
          <div className="md-stat">
            <span className="v">{cov.attrs}</span>
            <span className="k">Logical attributes</span>
          </div>
          <div className="md-stat good">
            <span className="v">{cov.fullyMapped}</span>
            <span className="k">Fully mapped</span>
          </div>
          <div className="md-stat warn">
            <span className="v">{cov.unmapped}</span>
            <span className="k">Unmapped</span>
          </div>
          <div className="md-stat">
            <span className="v">{MD_SOURCES.length}</span>
            <span className="k">Contributing sources</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ padding: '0 24px', margin: 0, borderBottom: '1px solid var(--line)' }}>
          {[['attributes','Attributes'],['matrix','Mapping Matrix'],['domains','Domains'],['lineage','Lineage']].map(([id,label]) => (
            <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 32px' }}>
          {tab === 'attributes' && (
            <>
              <div className="hstack" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                <div className="wb-list-search-wrap" style={{ width: 260 }}>
                  <IcSearch size={14} />
                  <input className="input" placeholder="Search attributes…"
                         value={filter} onChange={e => setFilter(e.target.value)}
                         style={{ paddingLeft: 32 }} />
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {['Key','Golden','Derived','PII','Mandatory'].map(c => (
                    <button key={c} className={`mp-chip ${clsFilter === c ? 'active' : ''}`}
                            onClick={() => setClsFilter(clsFilter === c ? null : c)}>{c}</button>
                  ))}
                </div>
                <div className="spacer" style={{ flex: 1 }} />
                <button className="btn primary" onClick={() => ruleToast('New logical attribute', 'info')}>
                  <IcPlus size={14} /> Add attribute
                </button>
              </div>

              <div className="attr-grid">
                <div className="attr-head">
                  <span>#</span><span>Logical attribute</span><span>Business definition</span>
                  <span>Type</span><span>Classification</span><span>Coverage</span><span />
                </div>
                {attrs.map((a, i) => {
                  const c = coverageOf(a);
                  return (
                    <div key={a.id}
                         className={`attr-row ${selectedAttr === a.id ? 'selected' : ''}`}
                         onClick={() => setSelectedAttr(a.id)}>
                      <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{i + 1}</span>
                      <span className="a-name">
                        {a.name}
                        <span className="phys">{a.target.split('.').slice(-1)[0]}{a.domain ? ` · ${a.domain}` : ''}</span>
                      </span>
                      <span className="a-def">{a.def}</span>
                      <span className="a-type">{a.type}</span>
                      <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {a.cls.length === 0 && <span className="cls-tag public">Public</span>}
                        {a.cls.map(cl => <span key={cl} className={`cls-tag ${CLS[cl]}`}>{cl}</span>)}
                      </span>
                      <span className="a-cov">
                        <span className="bar"><i className={c.mapped === 0 ? 'none' : c.mapped < 2 ? 'low' : ''}
                                                  style={{ width: c.pct + '%' }} /></span>
                        <span className="n">{c.mapped}/{c.total}</span>
                      </span>
                      <IcChevRight size={14} style={{ color: 'var(--ink-4)' }} />
                    </div>
                  );
                })}
                {attrs.length === 0 && <div className="dtable-empty">No attributes match the filter.</div>}
              </div>
              <div className="assist-banner" style={{ marginTop: 14 }}>
                <IcSparkle size={16} />
                <span>
                  These logical attributes are reusable across the platform — map a source column once here, and Porter,
                  Rules and Constructor can reference <strong>{entity.name}</strong> attributes instead of physical columns.
                </span>
              </div>
            </>
          )}

          {tab === 'matrix' && (
            <>
              <div className="hstack" style={{ marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                <span className="muted">Logical attribute → physical column, per source. Click a cell to edit the mapping.</span>
                <div className="spacer" style={{ flex: 1 }} />
                <div className="hstack" style={{ gap: 10 }}>
                  {MD_SOURCES.map(s => (
                    <span key={s.id} className="src-pill" style={{ fontSize: 12 }}>
                      <span className="src-dot" style={{ background: s.color }} /> {s.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th className="row-head" style={{ textAlign: 'left' }}>Logical attribute</th>
                      {MD_SOURCES.map(s => <th key={s.id}>{s.name}</th>)}
                      <th>Target column</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entity.attrs.map(a => (
                      <tr key={a.id}>
                        <td className="row-head" onClick={() => setSelectedAttr(a.id)} style={{ cursor: 'pointer' }}>
                          {a.name}
                          {a.cls.includes('Golden') && <span className="cls-tag golden" style={{ marginLeft: 6 }}>G</span>}
                        </td>
                        {MD_SOURCES.map(s => {
                          const mp = a.maps[s.id];
                          return (
                            <td key={s.id} className={mp ? 'cell-map' : 'cell-empty'}
                                onClick={() => setSelectedAttr(a.id)}
                                title={mp ? (mp.transform ? `${mp.column} · ${mp.transform}` : mp.column) : 'Not mapped — click to map'}>
                              {mp ? <>
                                {mp.column}{mp.transform && <span style={{ color: 'var(--magenta)' }}> *ƒ</span>}
                              </> : '—'}
                            </td>
                          );
                        })}
                        <td style={{ fontFamily: 'Menlo,Consolas,monospace', fontSize: 11, color: 'var(--ink-3)' }}>
                          {a.target.split('.').slice(-1)[0]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                <span style={{ color: 'var(--magenta)' }}>*ƒ</span> = a transform or Rule is applied during mapping.
              </div>
            </>
          )}

          {tab === 'domains' && (
            <>
              <div className="hstack" style={{ marginBottom: 14 }}>
                <span className="muted">Value lists referenced by logical attributes. Decode rules normalize source values into these domains.</span>
                <div className="spacer" style={{ flex: 1 }} />
                <button className="btn primary" onClick={() => ruleToast('New domain', 'info')}>
                  <IcPlus size={14} /> Add domain
                </button>
              </div>
              {MD_DOMAINS.map(d => (
                <div key={d.id} className="domain-card">
                  <div className="domain-card-head">
                    <IcList size={15} style={{ color: 'var(--magenta)' }} />
                    <h3>{d.name}</h3>
                    <span className="muted" style={{ fontSize: 12 }}>{d.desc}</span>
                    <span className="spacer" style={{ flex: 1 }} />
                    <span className="cls-tag derived">{d.usedBy} attribute{d.usedBy === 1 ? '' : 's'}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{d.values.length} values</span>
                  </div>
                  <div className="domain-values">
                    {d.values.map(([code, label]) => (
                      <span key={code} className="domain-value">
                        <code>{code}</code> <span className="vsep">→</span> {label}
                      </span>
                    ))}
                    <button className="domain-value" style={{ cursor: 'pointer', color: 'var(--magenta)', borderStyle: 'dashed' }}
                            onClick={() => ruleToast(`Add value to ${d.name}`, 'info')}>
                      <IcPlus size={12} /> value
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'lineage' && (
            <>
              <div className="muted" style={{ marginBottom: 14 }}>
                Trace where each logical attribute flows — the Porters, Rules, Solutions and Constructors that reference it.
                Click an attribute to see its full source-to-target lineage.
              </div>
              {entity.attrs.filter(a => MD_LINEAGE[a.id]).map(a => {
                const lin = MD_LINEAGE[a.id];
                return (
                  <div key={a.id} style={{ marginBottom: 18 }}>
                    <div className="hstack" style={{ gap: 8, marginBottom: 8 }}>
                      <span className="lineage-node logical"><IcLayers size={13} /> {a.name}</span>
                      <span className="muted" style={{ fontSize: 12 }}>used by {lin.length}</span>
                    </div>
                    {lin.map((l, i) => {
                      const Icon = window[l.icon] || IcFile;
                      const tint = { Porter: ['#eaf2fc','#1968d3'], Rule: ['#fdf3f9','#b51e7a'],
                                     Solution: ['#e7f6f1','#0f7c70'], Constructor: ['#ede9fe','#6d28d9'] }[l.kind] || ['#f4f4f4','#5a5a5a'];
                      return (
                        <div key={i} className="lineage-item" onClick={() => onNavigate(l.goto)}>
                          <span className="li-icon" style={{ background: tint[0], color: tint[1] }}><Icon size={16} /></span>
                          <div className="li-meta">
                            <div className="li-title">{l.name}</div>
                            <div className="li-sub">{l.step}</div>
                          </div>
                          <span className="li-kind">{l.kind}</span>
                          <IcChevRight size={14} style={{ color: 'var(--ink-4)' }} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {selectedAttr && (
        <AttributeDrawer
          attr={entity.attrs.find(a => a.id === selectedAttr)}
          onClose={() => setSelectedAttr(null)}
          onNavigate={(p) => { setSelectedAttr(null); onNavigate(p); }} />
      )}
    </div>
  );
}

window.MetadataStudio = MetadataStudio;
window.MD_ENTITIES = MD_ENTITIES;
window.MD_SOURCES = MD_SOURCES;
