// ============================================================
// First-time Setup — Email mockup + 7-step wizard + Success
//
// 1. Welcome email (inbox-style mockup) with "Set up Opus EDM" CTA
// 2. After CTA → goes to login
// 3. After login (first time) → setup wizard
// 4. Wizard steps:
//    Welcome · Organization · Identity Providers · First Admin
//    · Database · Marketplace · Invite Users · Review & Apply
// 5. Apply page with progress + success screen
// ============================================================

const SETUP_LS_KEY = 'opus.setup.complete';

// ============================================================
// Email mockup
// ============================================================
function SetupEmail({ onStart, onSkip }) {
  return (
    <div className="setup-stage">
      <div style={{ padding: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
        <OpusLogo size={26} />
        <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
          <button className="btn ghost" onClick={onSkip}>
            Skip — go straight to sign-in
          </button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', padding: '20px 24px 60px' }}>
        <div className="email-shell">
          <div className="email-toolbar">
            <IcSend size={13} /> Inbox · Acme Capital Management
            <span style={{ marginLeft: 'auto' }}>1 of 1</span>
          </div>
          <div className="email-meta">
            <h2 className="subject">Your Opus EDM environment is ready</h2>
            <div className="email-from-row">
              <span className="email-avatar">OE</span>
              <div className="email-from">
                <div className="name">Opus EDM Onboarding</div>
                <div className="addr">noreply@opusedm.spglobal.com</div>
                <div className="to">
                  to <strong>vincent.giattino@acmecapital.com</strong>
                </div>
              </div>
              <span className="email-date">Thu, May 28 · 9:14 AM</span>
            </div>
          </div>
          <div className="email-body">
            <h2>Hi Vincent —</h2>
            <p>
              Welcome to Opus EDM. Your environment for <strong>Acme Capital Management </strong>
              has been provisioned at <a href="#" onClick={e => e.preventDefault()}
                                          style={{ color: 'var(--blue)' }}>https://edm.acmecapital.com</a>
              and the <strong>EDM 19.4.0</strong> release is staged from the Opus Marketplace, ready to install.
            </p>
            <p>
              As the named primary contact, you have been pre-authorized as the <strong>first administrator</strong>.
              Click the button below to sign in with your corporate identity and complete the one-time setup —
              it takes about <strong>5 minutes</strong>.
            </p>

            <div className="email-cta-row">
              <button className="btn primary" onClick={onStart}>
                <IcRocket size={14} /> Set up Opus EDM
              </button>
              <button className="btn" onClick={onSkip}>
                Sign in another time
              </button>
            </div>

            <div className="email-checklist">
              <h3>You'll need before you start</h3>
              <ul>
                <li>SQL Server connection for the EDM database</li>
                <li>Your Opus EDM license file</li>
                <li>Okta (or other IdP) tenant URL + OIDC client credentials</li>
                <li>The Setup CD path (or use the staged EDM 19.4.0 from the Marketplace)</li>
              </ul>
            </div>

            <p style={{ color: 'var(--ink-4)', fontSize: 12.5 }}>
              If you have any trouble, reach out to your S&P Global success engineer or reply to this email.
              This sign-in link expires in 72 hours.
            </p>
          </div>
          <div className="email-footer">
            S&P Global Market Intelligence · 55 Water Street, New York, NY 10041 · You're receiving this because you were added to the Opus EDM environment for Acme Capital Management.
          </div>
        </div>
      </div>
    </div>
  );
}

// Small rocket icon used in the email button + welcome step
function IcRocket({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true">
      <path d="M4.5 16.5L4 20l3.5-.5" />
      <path d="M9 14l-3 3" />
      <path d="M13 4c4 0 7 3 7 7-3 3-6 5-8 5l-4-4c0-2 2-5 5-8z" />
      <circle cx="15" cy="9" r="1.5" />
    </svg>
  );
}

// ============================================================
// Step content components
// ============================================================
function StepWelcome() {
  const items = [
    { ic: 'IcBrand',   bg: '#fef3c7', fg: '#d97706', t: 'Organization',       d: 'Company name, domain, industry, primary contact, timezone.' },
    { ic: 'IcShield',  bg: '#ede9fe', fg: '#6d28d9', t: 'Identity provider',  d: 'Connect Okta, Azure AD, ADFS or another OIDC / SAML provider.' },
    { ic: 'IcUser',    bg: '#dbeafe', fg: '#1e40af', t: 'First administrator',d: 'You\'ll be granted full Admin access to the platform.' },
    { ic: 'IcManager', bg: '#d1fae5', fg: '#065f46', t: 'EDM database',       d: 'SQL Server, setup CD, license key, post-install scripts, permissions.' },
    { ic: 'IcMarketplace', bg: '#fce7f3', fg: '#be185d', t: 'Marketplace',    d: 'Optional — pre-install adapters or modules from the Opus Marketplace.' },
    { ic: 'IcUsers',   bg: '#d1fae5', fg: '#065f46', t: 'Invite teammates',   d: 'Provision Data Stewards, Ops, Approvers, and more.' },
  ];
  return (
    <div className="setup-card setup-center">
      <div className="setup-rocket"><IcRocket size={28} /></div>
      <h1>Let's get your Opus EDM platform configured.</h1>
      <p className="lead">
        This wizard walks you through everything you need to deploy Opus EDM at <strong>Acme Capital Management</strong>
        {' '}— usually under 5 minutes.
      </p>
      <div className="setup-summary-grid">
        {items.map((i) => {
          const Icon = window[i.ic] || IcInfo;
          return (
            <div key={i.t} className="setup-summary">
              <span className="si" style={{ background: i.bg, color: i.fg }}><Icon size={18} /></span>
              <h3>{i.t}</h3>
              <p>{i.d}</p>
            </div>
          );
        })}
      </div>
      <div className="setup-banner warn" style={{ textAlign: 'left' }}>
        <IcInfo size={14} />
        <span>
          <strong>You'll need:</strong> a SQL Server connection, your Opus EDM license file, your Okta tenant URL
          + client credentials, and the Setup CD path (or use the EDM 19.4.0 release staged from Marketplace).
          Have these handy before starting the database step.
        </span>
      </div>
    </div>
  );
}

// Make sure missing icons fall back gracefully
window.IcBrand = window.IcDataProducts;

function StepOrganization({ value, onChange }) {
  return (
    <div className="setup-card">
      <h1>Tell us about your organization</h1>
      <p className="lead">These details are used to brand the portal and seed initial defaults.</p>
      <div className="form2">
        <div className="field">
          <label className="field-label">Company name <span className="field-required">*</span></label>
          <input className="input" value={value.company}
                 onChange={e => onChange({ ...value, company: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label">Primary domain <span className="field-required">*</span></label>
          <input className="input" value={value.domain}
                 onChange={e => onChange({ ...value, domain: e.target.value })} />
          <div className="field-help">Used for email validation and Okta tenant inference.</div>
        </div>
        <div className="field">
          <label className="field-label">Industry</label>
          <div className="select-wrap">
            <select className="select" value={value.industry}
                    onChange={e => onChange({ ...value, industry: e.target.value })}>
              <option>Asset Management</option>
              <option>Banking</option>
              <option>Insurance</option>
              <option>Hedge Fund</option>
              <option>Pension</option>
              <option>Sovereign Wealth</option>
              <option>Other Financial Services</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Primary region</label>
          <div className="select-wrap">
            <select className="select" value={value.region}
                    onChange={e => onChange({ ...value, region: e.target.value })}>
              <option>North America</option>
              <option>EMEA</option>
              <option>APAC</option>
              <option>LATAM</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Default timezone</label>
          <div className="select-wrap">
            <select className="select" value={value.timezone}
                    onChange={e => onChange({ ...value, timezone: e.target.value })}>
              <option>America / New York</option>
              <option>America / Chicago</option>
              <option>America / Los Angeles</option>
              <option>Europe / London</option>
              <option>Europe / Frankfurt</option>
              <option>Asia / Singapore</option>
              <option>Asia / Tokyo</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Primary contact (email)</label>
          <input className="input" value={value.contact}
                 onChange={e => onChange({ ...value, contact: e.target.value })}
                 placeholder="operations@acmecapital.com" />
          <div className="field-help">Where platform alerts and renewal reminders are sent.</div>
        </div>
      </div>
    </div>
  );
}

// ----- Identity providers --------------------------------------
const IDP_TYPES = [
  { id: 'okta',  name: 'Okta',                desc: 'Cloud identity — connect via OIDC discovery.',  logo: 'O',  color: '#007dc1' },
  { id: 'azure', name: 'Azure AD',            desc: 'Microsoft Entra ID — OIDC or SAML.',            logo: 'AD', color: '#0078d4' },
  { id: 'adfs',  name: 'ADFS (Federation Services)', desc: 'On-prem ADFS / WS-Federation or SAML.', logo: 'AF', color: '#5a5a8b' },
  { id: 'ad',    name: 'Active Directory',    desc: 'On-prem AD for service accounts.',              logo: 'AD', color: '#1f7a36' },
  { id: 'google',name: 'Google Workspace',    desc: 'Sign in with Google.',                          logo: 'G',  color: '#ea4335' },
  { id: 'ping',  name: 'PingFederate',        desc: 'PingIdentity OIDC / SAML.',                     logo: 'P',  color: '#ee4135' },
  { id: 'saml',  name: 'Generic SAML 2.0',    desc: 'Any SAML 2.0 identity provider.',               logo: 'S2', color: '#5a5a5a' },
];

function StepIdentity({ value, onChange }) {
  const [showAdd, setShowAdd] = React.useState(false);
  const [expanded, setExpanded] = React.useState(value.providers[0]?.id);

  function add(type) {
    const cfg = IDP_TYPES.find(t => t.id === type);
    const np = {
      id: 'idp-' + Date.now(),
      type, label: cfg.name + (value.providers.length === 0 ? ' — Primary' : ' — Secondary'),
      domain: value.providers.length === 0 ? '@' + value.domain : '',
      issuer: '', clientId: '', clientSecret: '',
      redirect: `https://edm.${value.domain}/auth/callback`,
      primary: value.providers.length === 0,
      status: 'pending',
    };
    onChange({ ...value, providers: [...value.providers, np] });
    setExpanded(np.id);
    setShowAdd(false);
  }
  function update(id, patch) {
    onChange({ ...value, providers: value.providers.map(p => p.id === id ? { ...p, ...patch } : p) });
  }
  function remove(id) {
    const list = value.providers.filter(p => p.id !== id);
    // If we removed primary, mark first as primary
    if (!list.find(p => p.primary) && list.length) list[0].primary = true;
    onChange({ ...value, providers: list });
  }
  function setPrimary(id) {
    onChange({ ...value, providers: value.providers.map(p => ({ ...p, primary: p.id === id })) });
  }

  return (
    <div className="setup-card">
      <h1>Connect identity providers</h1>
      <p className="lead">
        Single sign-on lets users log in with their existing corporate identity. You can configure
        <strong> multiple providers</strong> — for example Okta as primary, ADFS for legacy users, and AD for service
        accounts. The provider marked <strong>Primary</strong> is used when no domain mapping applies.
      </p>

      {value.providers.map(p => {
        const cfg = IDP_TYPES.find(t => t.id === p.type) || IDP_TYPES[0];
        const isOpen = expanded === p.id;
        return (
          <div key={p.id} className={`idp-card ${p.primary ? 'primary' : ''}`}>
            <div className="idp-card-head" onClick={() => setExpanded(isOpen ? null : p.id)}>
              <span className="idp-card-logo">
                <IcShield size={20} style={{ color: cfg.color }} />
              </span>
              <div className="meta">
                <h3>{p.label}</h3>
                <div className="sub">{cfg.name} · {cfg.desc}</div>
              </div>
              <div className="idp-card-tags">
                {p.primary && <span className="idp-status primary">Primary</span>}
                <span className={`idp-status ${p.status}`}>{p.status === 'ok' ? 'Verified' : 'Pending'}</span>
              </div>
              <div className="idp-card-actions" onClick={e => e.stopPropagation()}>
                <button className="icon-btn" title="Test connection"
                        onClick={() => { update(p.id, { status: 'ok' }); ruleToast(`${cfg.name} connection verified`, 'success'); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
                  </svg>
                </button>
                <button className="icon-btn" title="Mark as primary"
                        onClick={() => setPrimary(p.id)}
                        style={{ color: p.primary ? 'var(--magenta)' : 'var(--ink-4)' }}>
                  <IcStar size={14} />
                </button>
                <button className="icon-btn" title={isOpen ? 'Collapse' : 'Expand'}
                        onClick={() => setExpanded(isOpen ? null : p.id)}>
                  {isOpen ? <IcChevDown size={14} style={{ transform: 'rotate(180deg)' }} /> : <IcChevDown size={14} />}
                </button>
                <button className="icon-btn" title="Remove" onClick={() => remove(p.id)}>
                  <IcX size={14} style={{ color: 'var(--red)' }} />
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="idp-card-body">
                <div className="field" style={{ marginBottom: 12 }}>
                  <label className="field-label">Domain mapping <span style={{ fontWeight: 400, color: 'var(--ink-4)' }}>(optional)</span></label>
                  <input className="input" value={p.domain}
                         onChange={e => update(p.id, { domain: e.target.value })}
                         placeholder="@yourdomain.com" />
                  <div className="field-help">Users whose email matches this domain are routed to this provider. Leave blank to make this an explicit-choice fallback.</div>
                </div>
                <div className="form2">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Issuer URL <span className="field-required">*</span></label>
                    <input className="input" value={p.issuer}
                           onChange={e => update(p.id, { issuer: e.target.value })}
                           placeholder="https://acme.okta.com/oauth2/default" />
                    <div className="field-help"><code>/.well-known/openid-configuration</code> is fetched from here.</div>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Client ID</label>
                    <input className="input" value={p.clientId}
                           onChange={e => update(p.id, { clientId: e.target.value })}
                           placeholder="0oa3kx7…" />
                  </div>
                </div>
                <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                  <label className="field-label">Client secret</label>
                  <input className="input" type="password" value={p.clientSecret}
                         onChange={e => update(p.id, { clientSecret: e.target.value })}
                         placeholder="••••••••" />
                  <div className="field-help">Encrypted at rest.</div>
                </div>
                <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                  <label className="field-label">Redirect URI</label>
                  <input className="input" value={p.redirect}
                         onChange={e => update(p.id, { redirect: e.target.value })} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ position: 'relative', marginTop: 6 }}>
        <button className="btn" onClick={() => setShowAdd(s => !s)}
                style={{ border: '1px dashed var(--line-2)', borderRadius: 6, width: '100%',
                         justifyContent: 'center', padding: '10px' }}>
          <IcPlus size={14} /> Add identity provider
        </button>
        {showAdd && (
          <div className="popover fade-in" style={{ position: 'absolute', top: 'calc(100% + 6px)',
                                                     left: 0, right: 0, padding: 4 }}>
            {IDP_TYPES.filter(t => !value.providers.find(p => p.type === t.id)).map(t => (
              <div key={t.id} className="menu-item" onClick={() => add(t.id)}>
                <IcShield size={14} style={{ color: t.color }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 500 }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{t.desc}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18, padding: 14 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600,
                     display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <IcCog size={13} /> Global SSO settings
        </h3>
        <div className="field" style={{ marginTop: 12, marginBottom: 12 }}>
          <label className="field-label">Default group for new users</label>
          <div className="select-wrap">
            <select className="select" value={value.defaultGroup}
                    onChange={e => onChange({ ...value, defaultGroup: e.target.value })}>
              <option>Read-only</option>
              <option>Data Stewards</option>
              <option>Editors</option>
              <option>Administrators</option>
            </select>
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={value.autoProvision}
                 onChange={e => onChange({ ...value, autoProvision: e.target.checked })} />
          <span className="box"><IcCheck size={12} /></span>
          Auto-provision new SSO users on first sign-in
        </label>
        <div className="field-help" style={{ marginTop: 6, marginLeft: 24 }}>
          When off, new users must be manually invited by an admin.
        </div>
      </div>
    </div>
  );
}

function StepAdmin({ value, onChange }) {
  return (
    <div className="setup-card">
      <h1>First administrator account</h1>
      <p className="lead">You'll be created as the first user with full Admin access. Additional admins can be added later.</p>
      <div className="form2">
        <div className="field">
          <label className="field-label">Full name <span className="field-required">*</span></label>
          <input className="input" value={value.name}
                 onChange={e => onChange({ ...value, name: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label">Email <span className="field-required">*</span></label>
          <input className="input" value={value.email}
                 onChange={e => onChange({ ...value, email: e.target.value })} />
          <div className="field-help">Must use your verified domain.</div>
        </div>
        <div className="field">
          <label className="field-label">Title <span style={{ fontWeight: 400, color: 'var(--ink-4)' }}>(optional)</span></label>
          <input className="input" value={value.title}
                 onChange={e => onChange({ ...value, title: e.target.value })} />
        </div>
      </div>
      <label className="checkbox" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={value.sendEmail}
               onChange={e => onChange({ ...value, sendEmail: e.target.checked })} />
        <span className="box"><IcCheck size={12} /></span>
        Send welcome email after applying
      </label>

      <div className="setup-banner info" style={{ marginTop: 18 }}>
        <IcShield size={16} />
        <span>
          <strong>{value.name || 'You'}</strong> will be added to the <strong>Administrators</strong> system group with the
          following permissions:
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li><code>admin.full</code> — Full administrative access</li>
            <li><code>users.manage</code> — Manage users and groups</li>
            <li><code>solutions.write</code>, <code>data-models.write</code>, <code>rules.write</code> — Edit all configurations</li>
          </ul>
        </span>
      </div>
    </div>
  );
}

function StepDatabase({ value, onChange }) {
  // The latest non-current version from the marketplace catalog
  const latestRelease = (window.VERSIONS_CATALOG || [])
    .find(v => v.status === 'available') ||
    { v: '19.4.0', date: 'May 2026' };

  function setLicense(file) {
    onChange({ ...value, licenseFile: file ? file.name : '' });
  }
  return (
    <div className="setup-card">
      <h1>EDM database setup</h1>
      <p className="lead">
        Create the Opus EDM database on your SQL Server, apply the license, run any post-install scripts, and grant
        default permissions.
      </p>

      <div style={{ background: 'var(--bg-1)', padding: '8px 12px', borderRadius: 4,
                    marginBottom: 14, fontSize: 11, fontWeight: 600,
                    letterSpacing: '.06em', color: 'var(--ink-3)',
                    display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <IcManager size={13} /> EDM DATABASE
      </div>
      <div className="form2">
        <div className="field">
          <label className="field-label">SQL Server <span className="field-required">*</span></label>
          <input className="input" value={value.sqlServer}
                 onChange={e => onChange({ ...value, sqlServer: e.target.value })}
                 placeholder="EDM-SQL-01\SQLEXPRESS" />
          <div className="field-help"><code>&lt;server&gt;\&lt;instance&gt;</code> — or use a connection string.</div>
        </div>
        <div className="field">
          <label className="field-label">Database name <span className="field-required">*</span></label>
          <input className="input" value={value.dbName}
                 onChange={e => onChange({ ...value, dbName: e.target.value })} />
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label className="field-label">
          Setup CD location <span className="field-required">*</span>
        </label>
        <div className="hstack" style={{ gap: 8 }}>
          <input className="input" value={value.setupCd}
                 onChange={e => onChange({ ...value, setupCd: e.target.value })}
                 style={{ flex: 1 }} />
          <button className="btn">Browse…</button>
        </div>
        <div className="field-help" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IcMarketplace size={12} style={{ color: '#6d28d9' }} />
          Auto-staged from Marketplace · <strong>EDM {latestRelease.v}</strong> ({latestRelease.date}) — your most recent available release.
          You can switch to a local CD path if needed.
        </div>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label className="field-label">License key file <span className="field-required">*</span></label>
        <FileDrop fileName={value.licenseFile}
                  onPick={f => setLicense(f)}
                  hint="Provided by your Opus account team. Required to unlock the platform." />
      </div>

      <div style={{ background: 'var(--bg-1)', padding: '8px 12px', borderRadius: 4,
                    margin: '22px 0 14px', fontSize: 11, fontWeight: 600,
                    letterSpacing: '.06em', color: 'var(--ink-3)',
                    display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <IcLightning size={13} /> PACKAGE / SQL SCRIPTS
      </div>
      <div className="form2">
        <div className="field">
          <label className="field-label">Utility location</label>
          <div className="hstack" style={{ gap: 8 }}>
            <input className="input" value={value.utilityLoc}
                   onChange={e => onChange({ ...value, utilityLoc: e.target.value })}
                   style={{ flex: 1 }} />
            <button className="btn">Browse…</button>
          </div>
        </div>
        <div className="field">
          <label className="field-label">EDM install location</label>
          <div className="hstack" style={{ gap: 8 }}>
            <input className="input" value={value.installLoc}
                   onChange={e => onChange({ ...value, installLoc: e.target.value })}
                   style={{ flex: 1 }} />
            <button className="btn">Browse…</button>
          </div>
        </div>
      </div>
      <div className="field-help" style={{ marginTop: 8 }}>
        Scripts applied after the database is created (optional).
      </div>

      <div style={{ background: 'var(--bg-1)', padding: '8px 12px', borderRadius: 4,
                    margin: '22px 0 14px', fontSize: 11, fontWeight: 600,
                    letterSpacing: '.06em', color: 'var(--ink-3)',
                    display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <IcShield size={13} /> DEFAULT PERMISSIONS
      </div>
      <div className="field-help" style={{ marginTop: -6, marginBottom: 12 }}>
        Granted to the First Admin user after the database is created.
      </div>
      <div className="form2">
        <label className="checkbox">
          <input type="checkbox" checked={value.permConsole}
                 onChange={e => onChange({ ...value, permConsole: e.target.checked })} />
          <span className="box"><IcCheck size={12} /></span>
          Console Groups
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={value.permSql}
                 onChange={e => onChange({ ...value, permSql: e.target.checked })} />
          <span className="box"><IcCheck size={12} /></span>
          SQL Roles
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={value.permWebUser}
                 onChange={e => onChange({ ...value, permWebUser: e.target.checked })} />
          <span className="box"><IcCheck size={12} /></span>
          Web User
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={value.permWebAdmin}
                 onChange={e => onChange({ ...value, permWebAdmin: e.target.checked })} />
          <span className="box"><IcCheck size={12} /></span>
          Web Admin
        </label>
      </div>

      <div style={{ background: 'var(--bg-1)', padding: '8px 12px', borderRadius: 4,
                    margin: '22px 0 12px', fontSize: 11, fontWeight: 600,
                    letterSpacing: '.06em', color: 'var(--ink-3)',
                    display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <IcHistory size={13} /> VERSION CONTROL DATABASE (OPTIONAL)
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={value.versionControl}
               onChange={e => onChange({ ...value, versionControl: e.target.checked })} />
        <span className="box"><IcCheck size={12} /></span>
        Also create a Version Control database
      </label>
      <div className="field-help" style={{ marginTop: 4, marginLeft: 24 }}>
        Enables versioned configuration changes — recommended for production.
      </div>
    </div>
  );
}

function FileDrop({ fileName, onPick, hint }) {
  const inputRef = React.useRef(null);
  const [drag, setDrag] = React.useState(false);
  return (
    <>
      <div className={`file-drop ${fileName ? 'has-file' : ''} ${drag ? 'has-file' : ''}`}
           onClick={() => inputRef.current?.click()}
           onDragOver={e => { e.preventDefault(); setDrag(true); }}
           onDragLeave={() => setDrag(false)}
           onDrop={e => {
             e.preventDefault(); setDrag(false);
             onPick(e.dataTransfer.files?.[0]);
           }}>
        <span className="fd-icon"><IcDownload size={16} /></span>
        {fileName
          ? <span><strong>{fileName}</strong> &nbsp;·&nbsp; click to replace</span>
          : <span>Drop file here or click to browse</span>}
      </div>
      <input ref={inputRef} type="file" style={{ display: 'none' }}
             onChange={e => onPick(e.target.files?.[0])} />
      <div className="field-help">{hint}</div>
    </>
  );
}

// ----- Marketplace seeding step --------------------------------
function StepMarketplace({ value, onChange }) {
  const adapters = window.ADAPTERS_CATALOG || [];
  const modules  = window.MODULES_CATALOG || [];
  const cats     = window.MP_CATEGORIES_LIST || ['All'];
  const [tab, setTab]   = React.useState('modules');
  const [cat, setCat]   = React.useState('All');

  const list = tab === 'modules' ? modules : adapters;
  const filtered = list.filter(x => cat === 'All' || x.category === cat);

  const selected = value.selected || {};
  function toggle(id) {
    onChange({ ...value, selected: { ...selected, [id]: !selected[id] } });
  }
  function selectAll() {
    const next = { ...selected };
    filtered.forEach(x => { next[x.id] = true; });
    onChange({ ...value, selected: next });
  }
  function clearAll() {
    const next = { ...selected };
    filtered.forEach(x => { delete next[x.id]; });
    onChange({ ...value, selected: next });
  }

  const totalSelected = Object.values(selected).filter(Boolean).length;
  const adaptersSelected = adapters.filter(a => selected[a.id]).length;
  const modulesSelected = modules.filter(m => selected[m.id]).length;

  return (
    <div className="setup-card">
      <h1>Pre-install from the Marketplace</h1>
      <p className="lead">
        Optional — pick adapters or modules to install along with the platform. You can always come back to the
        Marketplace later from the sidebar. <strong>Recommended:</strong> install the modules and let users add adapters as needed.
      </p>

      <label className="checkbox" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={!!value.skip}
               onChange={e => onChange({ ...value, skip: e.target.checked })} />
        <span className="box"><IcCheck size={12} /></span>
        Skip — I'll install everything later from the Marketplace
      </label>

      {!value.skip && (
        <>
          <div className="hstack" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <button className={`tab ${tab === 'modules' ? 'active' : ''}`}
                    onClick={() => setTab('modules')}>
              <IcPackage size={14} /> Modules
              <span className="count">{modulesSelected || modules.length}</span>
            </button>
            <button className={`tab ${tab === 'adapters' ? 'active' : ''}`}
                    onClick={() => setTab('adapters')}>
              <IcConnect size={14} /> Adapters
              <span className="count">{adaptersSelected || adapters.length}</span>
            </button>
            <div className="spacer" style={{ flex: 1 }} />
            <button className="btn ghost" onClick={selectAll}>Select all</button>
            <button className="btn ghost" onClick={clearAll}>Clear</button>
          </div>

          <div className="hstack" style={{ gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {cats.map(c => (
              <button key={c}
                      className={`mp-chip ${cat === c ? 'active' : ''}`}
                      onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>

          <div className="seed-grid">
            {filtered.map(x => {
              const sel = !!selected[x.id];
              return (
                <div key={x.id}
                     className={`seed-card ${sel ? 'selected' : ''}`}
                     onClick={() => toggle(x.id)}>
                  <div className="seed-card-head">
                    <span className="mp-logo"
                          style={{ background: window.logoColor((tab === 'modules' ? 'mod-' : '') + x.name) }}>
                      {tab === 'modules' ? <IcPackage size={14} /> : window.logoInitials(x.name)}
                    </span>
                    <div className="seed-card-title">
                      <div className="t" title={x.name}>{x.name}</div>
                      <div className="s">{x.category} · v{x.version}</div>
                    </div>
                    <span className="seed-check">{sel && <IcCheck size={12} />}</span>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', padding: 28, textAlign: 'center', color: 'var(--ink-4)' }}>
                Nothing in this category.
              </div>
            )}
          </div>

          <div className="setup-banner info" style={{ marginTop: 16 }}>
            <IcMarketplace size={16} />
            <span>
              <strong>{totalSelected}</strong> {totalSelected === 1 ? 'item' : 'items'} selected
              ({modulesSelected} modules + {adaptersSelected} adapters) — these will be installed automatically after the database is created.
            </span>
          </div>
        </>
      )}
      {value.skip && (
        <div className="setup-banner ok">
          <IcCheck size={16} />
          <span>Marketplace seeding skipped. You can browse and install items anytime from <strong>Marketplace</strong> in the sidebar.</span>
        </div>
      )}
    </div>
  );
}

// ----- Invite users --------------------------------------
function StepInvite({ value, onChange }) {
  function add() {
    onChange({ ...value, rows: [...value.rows, { id: 'u-' + Date.now(), name: '', email: '', group: 'Data Stewards', role: 'Editor' }] });
  }
  function update(id, patch) {
    onChange({ ...value, rows: value.rows.map(r => r.id === id ? { ...r, ...patch } : r) });
  }
  function remove(id) {
    onChange({ ...value, rows: value.rows.filter(r => r.id !== id) });
  }
  return (
    <div className="setup-card">
      <h1>Invite your team</h1>
      <p className="lead">
        Add the rest of your users now or invite them later from the Users section. Each user receives an email with an
        SSO sign-in link.
      </p>
      <div className="invite-table">
        <div className="invite-row head">
          <div className="invite-cell">Name</div>
          <div className="invite-cell">Email</div>
          <div className="invite-cell">Group</div>
          <div className="invite-cell">Role</div>
          <div className="invite-cell" />
        </div>
        {value.rows.map(r => (
          <div key={r.id} className="invite-row">
            <div className="invite-cell">
              <input value={r.name} placeholder="Full name"
                     onChange={e => update(r.id, { name: e.target.value })} />
            </div>
            <div className="invite-cell">
              <input value={r.email} placeholder={`first.last@acmecapital.com`}
                     onChange={e => update(r.id, { email: e.target.value })} />
            </div>
            <div className="invite-cell">
              <select value={r.group}
                      onChange={e => update(r.id, { group: e.target.value })}>
                <option>Administrators</option>
                <option>Data Stewards</option>
                <option>Ops</option>
                <option>Risk</option>
                <option>Read-only</option>
                <option>Approvers</option>
              </select>
            </div>
            <div className="invite-cell">
              <select value={r.role}
                      onChange={e => update(r.id, { role: e.target.value })}>
                <option>Administrator</option>
                <option>Editor</option>
                <option>Approver</option>
                <option>Read-only</option>
              </select>
            </div>
            <div className="invite-cell">
              <button className="icon-btn" onClick={() => remove(r.id)}>
                <IcX size={14} style={{ color: 'var(--red)' }} />
              </button>
            </div>
          </div>
        ))}
        {value.rows.length === 0 && (
          <div className="dtable-empty">
            No users yet. Click <strong>Add another user</strong> below to add one.
          </div>
        )}
      </div>
      <div className="hstack" style={{ marginTop: 14, gap: 8 }}>
        <button className="btn" onClick={add}>
          <IcUser size={14} /> Add another user
        </button>
        <button className="btn">
          <IcImport size={14} /> Bulk import from CSV
        </button>
      </div>
      <div className="setup-banner info" style={{ marginTop: 14 }}>
        <IcUsers size={16} />
        <span>
          <strong>{value.rows.length} users</strong> will be provisioned. You can always add or remove members
          from the <em>Users</em> and <em>Groups</em> pages later.
        </span>
      </div>
    </div>
  );
}

// ----- Review --------------------------------------
function StepReview({ data, onJump }) {
  function s(section, rows) {
    return (
      <div className="review-section">
        <div className="review-section-head">
          <h3>{section.icon} {section.label}</h3>
          <button className="edit-link" onClick={() => onJump(section.step)}>Edit</button>
        </div>
        {rows.map(([k, v]) => (
          <div key={k} className="review-row">
            <div className="k">{k}</div>
            <div className="v">{v ?? <em style={{ color: 'var(--ink-4)' }}>not set</em>}</div>
          </div>
        ))}
      </div>
    );
  }
  const primaryIdp = data.identity.providers.find(p => p.primary);
  const seedCount = Object.values(data.marketplace.selected || {}).filter(Boolean).length;
  return (
    <div className="setup-card">
      <h1>Review your configuration</h1>
      <p className="lead">
        Once you click <strong>Apply</strong>, the platform will be provisioned with these settings.
        You can edit anything later from the admin portal.
      </p>

      {s({ label: 'Organization', icon: <IcBrand size={14} />, step: 'org' }, [
        ['Company', data.org.company],
        ['Domain', data.org.domain],
        ['Industry', data.org.industry],
        ['Region', data.org.region],
        ['Timezone', data.org.timezone],
        ['Contact', data.org.contact],
      ])}

      {s({ label: `Identity providers (${data.identity.providers.length})`, icon: <IcShield size={14} />, step: 'idp' },
        [
          ...data.identity.providers.map(p => [
            p.label + (p.primary ? ' · Primary' : ''),
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{IDP_TYPES.find(t => t.id === p.type)?.name}</strong>
              {p.domain && <><span>·</span><code>{p.domain}</code></>}
              {p.issuer && <><span>·</span><code>{p.issuer.length > 40 ? p.issuer.slice(0, 40) + '…' : p.issuer}</code></>}
              <span className={`idp-status ${p.status}`}>{p.status === 'ok' ? 'Verified' : 'Pending'}</span>
            </span>
          ]),
          ['Default group', data.identity.defaultGroup],
          ['Auto-provision', data.identity.autoProvision ? 'On' : 'Off'],
        ]
      )}

      {s({ label: 'First administrator', icon: <IcUser size={14} />, step: 'admin' }, [
        ['Name', data.admin.name],
        ['Email', data.admin.email],
        ['Title', data.admin.title],
        ['Welcome email', data.admin.sendEmail ? 'Send on apply' : 'Off'],
      ])}

      {s({ label: 'EDM database', icon: <IcManager size={14} />, step: 'db' }, [
        ['Server', <code>{data.db.sqlServer}</code>],
        ['Database', <code>{data.db.dbName}</code>],
        ['Setup CD', <code>{data.db.setupCd}</code>],
        ['License file', data.db.licenseFile || <em style={{ color: 'var(--ink-4)' }}>Click Browse on the previous step</em>],
        ['Utility location', data.db.utilityLoc || 'none'],
        ['EDM install', <code>{data.db.installLoc}</code>],
        ['Permissions', [
          data.db.permConsole && 'Console Groups',
          data.db.permSql && 'SQL Roles',
          data.db.permWebUser && 'Web User',
          data.db.permWebAdmin && 'Web Admin',
        ].filter(Boolean).join(', ') || 'none'],
        ['Version Control DB', data.db.versionControl ? 'Yes' : 'No'],
      ])}

      {s({ label: 'Marketplace pre-install', icon: <IcMarketplace size={14} />, step: 'market' }, [
        ['Selection',
          data.marketplace.skip
            ? <em style={{ color: 'var(--ink-4)' }}>Skipped — install later from Marketplace</em>
            : seedCount === 0
              ? <em style={{ color: 'var(--ink-4)' }}>Nothing selected</em>
              : <strong>{seedCount} {seedCount === 1 ? 'item' : 'items'}</strong>],
      ])}

      {s({ label: `Invitations (${data.invites.rows.length})`, icon: <IcUsers size={14} />, step: 'invite' },
        data.invites.rows.length === 0
          ? [['Users', <em style={{ color: 'var(--ink-4)' }}>None</em>]]
          : data.invites.rows.map(r => [
              r.name || <em style={{ color: 'var(--ink-4)' }}>(no name)</em>,
              <span><code>{r.email || 'no email'}</code> · {r.group} · <strong>{r.role}</strong></span>
            ])
      )}

      <div className="setup-banner info">
        <IcInfo size={16} />
        <span>Apply takes 30–60 seconds. You can keep this browser tab open — we'll show progress as it runs.</span>
      </div>
    </div>
  );
}

// ----- Apply (progress) --------------------------------------
function StepApply({ data, onDone }) {
  const allSteps = [
    'Validating organization details',
    'Connecting to identity providers',
    'Provisioning admin user',
    'Connecting to SQL Server',
    'Creating EDM database',
    'Applying license key',
    'Running post-create scripts',
  ];
  const seedCount = Object.values(data.marketplace.selected || {}).filter(Boolean).length;
  if (seedCount > 0 && !data.marketplace.skip) {
    allSteps.push(`Pre-installing ${seedCount} Marketplace ${seedCount === 1 ? 'item' : 'items'}`);
  }
  allSteps.push('Granting permissions');
  if (data.invites.rows.length) allSteps.push('Sending user invites');
  allSteps.push('Finalizing platform');

  const [idx, setIdx] = React.useState(0);
  const [logs, setLogs] = React.useState([]);

  React.useEffect(() => {
    if (idx >= allSteps.length) {
      setTimeout(() => onDone(), 700);
      return;
    }
    const dur = 700 + Math.random() * 600;
    const step = allSteps[idx];
    setLogs(l => [...l, { tag: '▶', text: `${step}…` }]);
    const t = setTimeout(() => {
      setLogs(l => [...l, { tag: '✓', text: 'Done.' }]);
      setIdx(i => i + 1);
    }, dur);
    return () => clearTimeout(t);
  }, [idx]);

  return (
    <div className="setup-card">
      <h1>Applying your configuration</h1>
      <p className="lead">Hang tight — this should take about 30–60 seconds.</p>
      <div>
        {allSteps.map((s, i) => (
          <div key={i} className={`apply-step ${i < idx ? 'done' : i === idx ? 'active' : ''}`}>
            <span className="stat">
              {i < idx ? <IcCheck size={13} /> :
                i === idx ? <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.35)" strokeWidth="2.5" />
                              <path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                : null}
            </span>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <div className="apply-terminal">
        <div>Starting configuration…</div>
        {logs.map((l, i) => (
          <div key={i}>
            <span className="t-time">{i.toString().padStart(2, '0')}</span>
            <span className={l.tag === '✓' ? 't-ok' : 't-info'}>{l.tag}</span>{' '}
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ----- Success --------------------------------------
function StepSuccess({ data, onEnter }) {
  const seedCount = Object.values(data.marketplace.selected || {}).filter(Boolean).length;
  return (
    <div className="setup-card setup-center">
      <div className="setup-rocket" style={{ background: '#d1fae5', color: '#065f46' }}>
        <IcCheck size={32} />
      </div>
      <h1>Opus EDM is configured.</h1>
      <p className="lead">Your platform is ready to use. Here's what was just provisioned:</p>

      <div className="setup-success-grid">
        <div className="setup-success-card">
          <span className="si" style={{ background: '#d1fae5', color: '#065f46' }}><IcManager size={18} /></span>
          <h3>Database online</h3>
          <p><code>{data.db.dbName}</code> on <code>{data.db.sqlServer}</code>. License applied, 10 post-install steps completed.</p>
        </div>
        <div className="setup-success-card">
          <span className="si" style={{ background: '#ede9fe', color: '#6d28d9' }}><IcShield size={18} /></span>
          <h3>SSO connected</h3>
          <p>
            {data.identity.providers.length} providers configured:
            <strong> {data.identity.providers.map(p => IDP_TYPES.find(t => t.id === p.type)?.name).join(', ')}</strong>.
            New users land in <code>{data.identity.defaultGroup}</code>.
          </p>
        </div>
        <div className="setup-success-card">
          <span className="si" style={{ background: '#dbeafe', color: '#1e40af' }}><IcUser size={18} /></span>
          <h3>Admin ready</h3>
          <p><strong>{data.admin.name}</strong> ({data.admin.email}) — full Administrator access.</p>
        </div>
        {seedCount > 0 && !data.marketplace.skip && (
          <div className="setup-success-card">
            <span className="si" style={{ background: '#fce7f3', color: '#be185d' }}><IcMarketplace size={18} /></span>
            <h3>Marketplace seeded</h3>
            <p><strong>{seedCount} items</strong> pre-installed from the Marketplace and ready to configure.</p>
          </div>
        )}
        {data.invites.rows.length > 0 && (
          <div className="setup-success-card">
            <span className="si" style={{ background: '#d1fae5', color: '#065f46' }}><IcUsers size={18} /></span>
            <h3>{data.invites.rows.length} users invited</h3>
            <p>Each will receive a welcome email with their SSO sign-in link.</p>
          </div>
        )}
      </div>

      <div className="setup-next" style={{ textAlign: 'left' }}>
        <h4>What's next?</h4>
        <ul>
          <li>Browse the <strong>Opus Marketplace</strong> to install additional adapters and modules</li>
          <li>Open the <strong>Solutions</strong> canvas and wire your first ingestion</li>
          <li>Set up <strong>Console Grouping & Security</strong> for your team's permissions</li>
          <li>Define your first <strong>Rules</strong> in the Rule Builder</li>
        </ul>
      </div>

      <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
        <button className="btn primary" onClick={onEnter} style={{ padding: '11px 28px', fontSize: 14 }}>
          Enter Opus EDM →
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Setup wizard (orchestrator)
// ============================================================
const SETUP_STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'org',     label: 'Organization' },
  { id: 'idp',     label: 'Identity Providers' },
  { id: 'admin',   label: 'First Admin' },
  { id: 'db',      label: 'Database' },
  { id: 'market',  label: 'Marketplace' },
  { id: 'invite',  label: 'Invite Users' },
  { id: 'review',  label: 'Review & Apply' },
];

function SetupWizard({ initialEmail, onComplete }) {
  const [step, setStep] = React.useState('welcome');
  const [phase, setPhase] = React.useState('form');   // 'form' | 'applying' | 'done'
  const latestRelease = (window.VERSIONS_CATALOG || []).find(v => v.status === 'available')?.v || '19.4.0';

  const [data, setData] = React.useState({
    org: { company: 'Acme Capital Management', domain: 'acmecapital.com',
           industry: 'Asset Management', region: 'North America',
           timezone: 'America / New York', contact: 'operations@acmecapital.com' },
    identity: {
      domain: 'acmecapital.com',
      providers: [{
        id: 'idp-okta', type: 'okta', label: 'Okta — Primary',
        domain: '@acmecapital.com',
        issuer: 'https://acme.okta.com/oauth2/default',
        clientId: '0oa3kx7…', clientSecret: '••••••',
        redirect: 'https://edm.acmecapital.com/auth/callback',
        primary: true, status: 'pending',
      }],
      defaultGroup: 'Read-only',
      autoProvision: true,
    },
    admin: { name: 'Vincent Giattino', email: initialEmail || 'vincent.giattino@acmecapital.com',
             title: 'Head of Data Engineering', sendEmail: true },
    db: { sqlServer: 'EDM-SQL-01\\SQLEXPRESS', dbName: 'OPUS_EDM',
          setupCd: `M:\\v${latestRelease.replace(/\./g, '-')}\\Setup CD\\New Database`,
          licenseFile: '',
          utilityLoc: 'C:\\Opus\\PostInstallScripts\\',
          installLoc: `C:\\Program Files\\Opus EDM\\EDM ${latestRelease}`,
          permConsole: true, permSql: true, permWebUser: true, permWebAdmin: true,
          versionControl: false },
    marketplace: { selected: { 'sm-10': true, 'pm-10': true, 'fs-dash': true, 'persona-wf': true }, skip: false },
    invites: { rows: [
      { id: 'r1', name: 'Maria Chen',   email: 'maria.chen@acmecapital.com', group: 'Data Stewards', role: 'Editor' },
      { id: 'r2', name: 'Pavel Novak',  email: 'pavel.novak@acmecapital.com', group: 'Risk',          role: 'Editor' },
      { id: 'r3', name: 'Tomás Nguyen', email: 'tomas.nguyen@acmecapital.com', group: 'Administrators', role: 'Administrator' },
    ] },
  });

  function next() {
    const idx = SETUP_STEPS.findIndex(s => s.id === step);
    if (idx < SETUP_STEPS.length - 1) setStep(SETUP_STEPS[idx + 1].id);
  }
  function back() {
    const idx = SETUP_STEPS.findIndex(s => s.id === step);
    if (idx > 0) setStep(SETUP_STEPS[idx - 1].id);
  }
  function apply() {
    setPhase('applying');
  }

  function renderStep() {
    if (phase === 'applying') return <StepApply data={data} onDone={() => setPhase('done')} />;
    if (phase === 'done') return <StepSuccess data={data} onEnter={() => onComplete(data)} />;
    switch (step) {
      case 'welcome': return <StepWelcome />;
      case 'org':     return <StepOrganization value={data.org}
                                                onChange={v => setData({ ...data, org: v })} />;
      case 'idp':     return <StepIdentity value={{ ...data.identity, domain: data.org.domain }}
                                            onChange={v => setData({ ...data, identity: v })} />;
      case 'admin':   return <StepAdmin value={data.admin}
                                         onChange={v => setData({ ...data, admin: v })} />;
      case 'db':      return <StepDatabase value={data.db}
                                            onChange={v => setData({ ...data, db: v })} />;
      case 'market':  return <StepMarketplace value={data.marketplace}
                                               onChange={v => setData({ ...data, marketplace: v })} />;
      case 'invite':  return <StepInvite value={data.invites}
                                          onChange={v => setData({ ...data, invites: v })} />;
      case 'review':  return <StepReview data={data} onJump={setStep} />;
      default: return null;
    }
  }

  const stepIdx = SETUP_STEPS.findIndex(s => s.id === step);
  const isLast = step === 'review';

  return (
    <div className="setup-stage">
      <div className="setup-topbar">
        <OpusLogo size={26} />
        <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>First-time setup</span>
        <div className="right">
          <span>Signed in as <strong>{data.admin.email}</strong></span>
        </div>
      </div>
      {phase === 'form' && (
        <div className="setup-stepper">
          {SETUP_STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <button className={`setup-step ${step === s.id ? 'active' : ''} ${stepIdx > i ? 'done' : ''}`}
                      onClick={() => stepIdx >= i && setStep(s.id)}>
                <span className="bub">
                  {stepIdx > i ? <IcCheck size={14} /> : <SetupStepIcon id={s.id} />}
                </span>
                {s.label}
              </button>
              {i < SETUP_STEPS.length - 1 && (
                <span className={`setup-connector ${stepIdx > i ? 'done' : ''}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="setup-scroll">
        {renderStep()}
      </div>

      {phase === 'form' && (
        <div className="setup-foot">
          <button className="btn" onClick={back} disabled={stepIdx === 0}>
            <IcChevLeft size={14} /> Back
          </button>
          <span className="spacer" />
          <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>
            Step {stepIdx + 1} of {SETUP_STEPS.length}
          </span>
          <span className="spacer" />
          {isLast ? (
            <button className="btn primary" onClick={apply}>
              <IcCheck size={14} /> Apply configuration
            </button>
          ) : (
            <button className="btn primary" onClick={next}>
              Next <IcChevRight size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SetupStepIcon({ id }) {
  const map = {
    welcome: IcRocket, org: IcBrand, idp: IcShield, admin: IcUser,
    db: IcManager, market: IcMarketplace, invite: IcUsers, review: IcCheck,
  };
  const I = map[id] || IcInfo;
  return <I size={14} />;
}

window.SetupEmail = SetupEmail;
window.SetupWizard = SetupWizard;
window.SETUP_LS_KEY = SETUP_LS_KEY;
