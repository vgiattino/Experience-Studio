// ============================================================
// Stub page — placeholder for sections we don't have mocks for yet
// ============================================================

const STUB_META = {
  connection: { title: 'Connection', icon: 'IcConnect',
    desc: 'Define and manage data source connections — SFTP, REST, database, message queues — used by your processes and flows.' },
  source: { title: 'Source', icon: 'IcSource',
    desc: 'Browse, configure, and version-control your data sources. Each source describes how Opus EDM receives data from a vendor or internal system.' },
  flow: { title: 'Flow', icon: 'IcFlow',
    desc: 'Compose end-to-end data flows linking Porter pipelines, Solutions and Rules into automated business processes.' },
  inspector: { title: 'Inspector', icon: 'IcInspector',
    desc: 'Trace records through the pipeline and inspect intermediate state at every step — invaluable for debugging match and master decisions.' },
  matcher: { title: 'Matcher', icon: 'IcMatcher',
    desc: 'Configure matching rules across multiple sources. Tune thresholds, weights and survivorship behaviour for Master records.' },
  constructor: { title: 'Constructor', icon: 'IcConstructor',
    desc: 'Design how golden Master records are constructed from contributing sources — order of precedence, fallbacks and overrides.' },
  generator: { title: 'Generator', icon: 'IcGenerator',
    desc: 'Generate synthetic and test datasets to validate flows and rules without touching production data.' },
  manager: { title: 'Manager', icon: 'IcManager',
    desc: 'Operational console for managing users, groups, tenants, schedules and platform-wide settings.' },
  rules: { title: 'Rules', icon: 'IcRules',
    desc: 'Library of all validation, transformation and enrichment rules. Author once, reuse across flows.' },
  'data-products': { title: 'Data Products', icon: 'IcDataProducts',
    desc: 'Publish curated data products to downstream consumers with SLAs, contracts and lineage attached.' },
  workflows: { title: 'Workflows', icon: 'IcWorkflows',
    desc: 'Approval, stewardship and exception-handling workflows that route work to the right person at the right step.' },
  pages: { title: 'Pages', icon: 'IcPages',
    desc: 'Build custom interface pages that surface Opus EDM data to business users in the shape they need.' },
  elements: { title: 'Elements', icon: 'IcElements',
    desc: 'Reusable UI elements — tables, forms, charts, KPI tiles — to compose Pages quickly.' },
  approval: { title: 'Approval', icon: 'IcApproval',
    desc: 'Review and approve pending changes — to rules, masters, attributes and configurations — with a full audit trail.' },
  models: { title: 'Models', icon: 'IcModels',
    desc: 'Manage logical and physical data models. Add, version and deprecate attributes across the master model.' },
  illustrator: { title: 'Illustrator', icon: 'IcIllustrator',
    desc: 'Visualise data lineage, relationships and dependencies across your entire data estate.' },
};

function Stub({ section, onNavigate }) {
  const meta = STUB_META[section] || { title: section, icon: 'IcSparkle', desc: 'This area is being populated with the latest mocks.' };
  const Icon = window[meta.icon];
  return (
    <div className="coming-soon fade-in">
      <span className="cs-icon"><Icon size={28} /></span>
      <h2>{meta.title}</h2>
      <p>{meta.desc}</p>
      <p style={{ fontSize: 13, color: 'var(--ink-4)', marginTop: 4 }}>
        Screenshots of this screen are coming next — placeholder shown for now.
      </p>
      <div className="hstack" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => onNavigate('home')}>← Back to Home</button>
        <button className="btn primary" onClick={() => onNavigate('porter')}>
          See a populated section
        </button>
      </div>
    </div>
  );
}

window.Stub = Stub;
