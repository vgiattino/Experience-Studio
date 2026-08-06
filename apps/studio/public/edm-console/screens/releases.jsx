// ============================================================
// Releases — change packaging & promotion across environments
//   • Release list (changeset → review → approved → deploying → released)
//   • Release detail: contents (packaged components), maker/checker
//     approvals, Change Advisory Board checklist (test verification,
//     backup, rollback plan), and the DEV→QA→UAT→PROD pipeline with
//     automated lower envs + human-in-the-loop gate for Production.
// ============================================================

const REL_ENVS = [
  { id: 'dev',  name: 'DEV',  cls: 'env-dev',  dot: '#4338ca', auto: true },
  { id: 'qa',   name: 'QA',   cls: 'env-qa',   dot: '#0e7490', auto: true },
  { id: 'uat',  name: 'UAT',  cls: 'env-uat',  dot: '#92400e', auto: true },
  { id: 'prod', name: 'PROD', cls: 'env-prod', dot: '#991b1b', auto: false },
];

function relComponent(label, type, change) { return { label, type, change }; }

const RELEASES_SEED = [
  {
    id: 'rel-2026-05',
    name: 'Security Master — May enrichment',
    tag: 'REL-2026.05.0',
    stage: 'deploying',
    created: '26 May 2026',
    owner: 'jb',
    desc: 'Adds target deduplication to the BBG BO Corp Pfd porter and a null-safe Cast As Date rule.',
    components: [
      relComponent('Archive & Update File Monitor — BBG BO Corp Pfd', 'Porter', 'Modified'),
      relComponent('Cast As Date', 'Rule', 'Modified'),
      relComponent('Enrich Bloomberg Security', 'Porter', 'Modified'),
      relComponent('AssetType', 'Domain', 'Added'),
    ],
    approvals: [
      { role: 'Maker', user: 'jb', status: 'approved', at: '26 May, 10:14' },
      { role: 'Checker', user: 'kw', status: 'approved', at: '26 May, 14:30' },
      { role: 'CAB approver', user: 'cm', status: 'pending', at: null },
    ],
    cab: [
      { id: 'c1', title: 'Test verification', auto: true, checked: true, desc: 'Regression suite (Security Master) passed on QA — 142/142.' },
      { id: 'c2', title: 'Database backup taken', auto: true, checked: true, desc: 'Snapshot OPUS_EDM_PROD @ 26 May 02:00 retained 30 days.' },
      { id: 'c3', title: 'Rollback plan in place', auto: false, checked: true, desc: 'One-click rollback to REL-2026.04.2 verified on UAT.' },
      { id: 'c4', title: 'Downstream consumers notified', auto: false, checked: false, desc: 'Notify Risk & Reporting of the schema addition (AssetType).' },
      { id: 'c5', title: 'Change window booked', auto: false, checked: true, desc: 'Sat 31 May 22:00–23:00 ET approved by Ops.' },
    ],
    pipeline: {
      dev:  { status: 'done', tests: '142/142', at: '26 May 10:20', deployedBy: 'auto' },
      qa:   { status: 'done', tests: '142/142', at: '26 May 14:45', deployedBy: 'auto' },
      uat:  { status: 'active', tests: '138/142', at: '27 May 09:02', deployedBy: 'auto' },
      prod: { status: 'wait', tests: null, at: null, deployedBy: null },
    },
  },
  {
    id: 'rel-2026-04-2',
    name: 'Party hierarchy fixes',
    tag: 'REL-2026.04.2',
    stage: 'released',
    created: '12 May 2026',
    owner: 'kw',
    desc: 'Corrects ultimate-parent LEI resolution in the Party master solution.',
    components: [
      relComponent('2000 Party', 'Solution', 'Modified'),
      relComponent('Enrich GLEIF Party', 'Porter', 'Modified'),
    ],
    approvals: [
      { role: 'Maker', user: 'kw', status: 'approved', at: '12 May, 09:00' },
      { role: 'Checker', user: 'jb', status: 'approved', at: '12 May, 11:20' },
      { role: 'CAB approver', user: 'cm', status: 'approved', at: '12 May, 15:00' },
    ],
    cab: [
      { id: 'c1', title: 'Test verification', auto: true, checked: true, desc: 'All suites green.' },
      { id: 'c2', title: 'Database backup taken', auto: true, checked: true, desc: 'Snapshot retained.' },
      { id: 'c3', title: 'Rollback plan in place', auto: false, checked: true, desc: 'Verified.' },
    ],
    pipeline: {
      dev:  { status: 'done', tests: '96/96', at: '12 May 09:10', deployedBy: 'auto' },
      qa:   { status: 'done', tests: '96/96', at: '12 May 11:30', deployedBy: 'auto' },
      uat:  { status: 'done', tests: '96/96', at: '12 May 16:00', deployedBy: 'auto' },
      prod: { status: 'done', tests: '96/96', at: '13 May 22:30', deployedBy: 'jb' },
    },
  },
  {
    id: 'rel-2026-06-draft',
    name: 'Sustainability adapters (draft)',
    tag: 'REL-2026.06.0',
    stage: 'review',
    created: '28 May 2026',
    owner: 'sg',
    desc: 'Wires MSCI ESG + Sustainalytics adapters into the new Sustainability module.',
    components: [
      relComponent('Enrich MSCI ESG', 'Porter', 'Added'),
      relComponent('Enrich Sustainalytics', 'Porter', 'Added'),
      relComponent('ESG Risk Score', 'Rule', 'Added'),
    ],
    approvals: [
      { role: 'Maker', user: 'sg', status: 'approved', at: '28 May, 16:00' },
      { role: 'Checker', user: 'jb', status: 'pending', at: null },
      { role: 'CAB approver', user: 'cm', status: 'pending', at: null },
    ],
    cab: [
      { id: 'c1', title: 'Test verification', auto: true, checked: false, desc: 'Suite not yet run on QA.' },
      { id: 'c2', title: 'Database backup taken', auto: true, checked: false, desc: 'Scheduled at deploy time.' },
      { id: 'c3', title: 'Rollback plan in place', auto: false, checked: false, desc: 'Pending sign-off.' },
    ],
    pipeline: {
      dev:  { status: 'done', tests: '54/54', at: '28 May 16:10', deployedBy: 'auto' },
      qa:   { status: 'wait', tests: null, at: null, deployedBy: null },
      uat:  { status: 'wait', tests: null, at: null, deployedBy: null },
      prod: { status: 'wait', tests: null, at: null, deployedBy: null },
    },
  },
];

const STAGE_LABEL = { draft: 'Draft', review: 'In review', approved: 'Approved', deploying: 'Deploying', released: 'Released', blocked: 'Blocked' };

// ------------------------------------------------------------
// Pipeline component (used in list + detail)
// ------------------------------------------------------------
function Pipeline({ release, onDeploy, compact }) {
  return (
    <div className="pipeline">
      {REL_ENVS.map(env => {
        const p = release.pipeline[env.id];
        const st = p.status;
        const stateCls = st === 'done' ? 'done' : st === 'active' ? 'active' : st === 'fail' ? 'blocked' : '';
        const canDeployProd = env.id === 'prod' && release.pipeline.uat.status === 'done'
          && release.approvals.every(a => a.status === 'approved')
          && st !== 'done';
        return (
          <div key={env.id} className={`pipe-stage ${stateCls}`}>
            <div className="pipe-stage-head">
              <span className={`env-pill ${env.cls}`}><span className="ed" style={{ background: env.dot }} />{env.name}</span>
              {!env.auto && <span title="Manual approval gate"><IcUserShield size={13} style={{ color: '#92400e' }} /></span>}
            </div>
            <div className={`pipe-stage-status ${st === 'done' ? 'ok' : st === 'active' ? 'run' : st === 'fail' ? 'fail' : st === 'gate' ? 'gate' : 'wait'}`}>
              {st === 'done' && <><IcCircleCheck size={14} /> Deployed</>}
              {st === 'active' && <><IcCircleDot size={14} /> Deploying…</>}
              {st === 'fail' && <><IcCircleX size={14} /> Failed</>}
              {st === 'wait' && <><IcClock size={14} /> Waiting</>}
            </div>
            <div className="pipe-stage-sub">
              {p.tests && <>Tests {p.tests}<br /></>}
              {p.at ? p.at : 'Not yet deployed'}
              {p.deployedBy && p.deployedBy !== 'auto' && <><br />by {collabUser(p.deployedBy).name}</>}
              {p.deployedBy === 'auto' && <><br />automated</>}
            </div>
            {!compact && env.auto && st === 'wait' && (
              <button className="btn pipe-btn" onClick={() => onDeploy(env.id)}>
                <IcBolt size={13} /> Deploy to {env.name}
              </button>
            )}
            {!compact && canDeployProd && (
              <button className="btn primary pipe-btn" onClick={() => onDeploy('prod')}>
                <IcDeploy size={13} /> Approve & deploy
              </button>
            )}
            {!compact && env.id === 'prod' && st === 'wait' && !canDeployProd && (
              <div style={{ marginTop: 10, fontSize: 11, color: '#92400e', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <IcLock size={12} style={{ flexShrink: 0, marginTop: 1 }} /> Needs UAT + all approvals
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------
// Release detail
// ------------------------------------------------------------
function ReleaseDetail({ release, onBack, onChange }) {
  const [confirmProd, setConfirmProd] = React.useState(false);
  const Icon = { Porter: IcPorter, Rule: IcRules, Solution: IcSolutions, Constructor: IcSliders, Domain: IcList };

  function deploy(envId) {
    if (envId === 'prod') { setConfirmProd(true); return; }
    const next = { ...release, pipeline: { ...release.pipeline,
      [envId]: { ...release.pipeline[envId], status: 'active', at: 'just now', deployedBy: 'auto' } } };
    onChange(next);
    ruleToast && ruleToast(`Deploying to ${envId.toUpperCase()}…`, 'info');
    setTimeout(() => {
      onChange({ ...next, pipeline: { ...next.pipeline,
        [envId]: { status: 'done', tests: '142/142', at: 'just now', deployedBy: 'auto' } } });
      ruleToast && ruleToast(`${envId.toUpperCase()} deploy complete — tests passed`, 'success');
    }, 1800);
  }
  function deployProd() {
    setConfirmProd(false);
    const next = { ...release, pipeline: { ...release.pipeline,
      prod: { status: 'active', at: 'just now', deployedBy: 'jb' } } };
    onChange(next);
    ruleToast && ruleToast('Production deployment started — backup + smoke tests running', 'info');
    setTimeout(() => {
      onChange({ ...next, stage: 'released', pipeline: { ...next.pipeline,
        prod: { status: 'done', tests: '142/142', at: 'just now', deployedBy: 'jb' } } });
      ruleToast && ruleToast('Released to Production 🎉', 'success');
    }, 2200);
  }

  function toggleCab(id) {
    onChange({ ...release, cab: release.cab.map(c => c.id === id ? { ...c, checked: !c.checked } : c) });
  }
  function approve(role) {
    onChange({ ...release, approvals: release.approvals.map(a =>
      a.role === role ? { ...a, status: 'approved', at: 'just now' } : a) });
    ruleToast && ruleToast(`${role} approval recorded`, 'success');
  }

  const cabDone = release.cab.filter(c => c.checked).length;
  const approvalsDone = release.approvals.filter(a => a.status === 'approved').length;

  return (
    <div className="dl-page fade-in">
      <div className="dl-head">
        <button className="btn ghost" style={{ marginBottom: 12, padding: '4px 8px' }} onClick={onBack}>
          <IcChevLeft size={14} /> All releases
        </button>
        <div className="hstack" style={{ gap: 12, marginBottom: 6 }}>
          <h1 style={{ margin: 0 }}>{release.name}</h1>
          <span className={`rel-stage-badge rs-${release.stage}`}>{STAGE_LABEL[release.stage]}</span>
          <span className="rel-card-meta"><span className="item" style={{ fontFamily: 'Menlo,Consolas,monospace' }}>{release.tag}</span></span>
        </div>
        <p className="sub">{release.desc}</p>
        <div className="dl-tabs"><div className="tab active">Release overview</div></div>
      </div>

      <div className="dl-body" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
        <div>
          {/* Pipeline */}
          <h2 className="h2" style={{ marginBottom: 12 }}>Deployment pipeline</h2>
          <Pipeline release={release} onDeploy={deploy} />
          <div style={{ margintop: 8, marginTop: 10, fontSize: 12, color: 'var(--ink-4)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <IcInfo size={13} /> DEV · QA · UAT deploy automatically once tests pass. Production requires all approvals and a human to confirm.
          </div>

          {/* Contents */}
          <h2 className="h2" style={{ margin: '26px 0 12px' }}>Package contents <span className="muted" style={{ fontWeight: 400 }}>({release.components.length} components)</span></h2>
          <div className="co-table">
            {release.components.map((c, i) => {
              const I = Icon[c.type] || IcFile;
              return (
                <div key={i} className="co-row" style={{ gridTemplateColumns: '1.8fr 1fr 120px' }}>
                  <span className="co-comp"><span className="ci"><I size={15} /></span>{c.label}</span>
                  <span style={{ color: 'var(--ink-3)' }}>{c.type}</span>
                  <span><span className={`hist-action ha-${c.change.toLowerCase() === 'added' ? 'created' : 'modified'}`}>{c.change}</span></span>
                </div>
              );
            })}
          </div>
          <div className="dl-toolbar" style={{ marginTop: 12 }}>
            <button className="btn"><IcExport size={14} /> Export package</button>
            <button className="btn"><IcGitBranch size={14} /> View in version control</button>
          </div>
        </div>

        {/* Right rail: approvals + CAB */}
        <div>
          <h2 className="h2" style={{ marginBottom: 12 }}>Maker / Checker</h2>
          {release.approvals.map(a => {
            const u = collabUser(a.user);
            return (
              <div key={a.role} className="approval-row">
                <span className="ar-avatar" style={{ background: u.color }}>{collabInitials(u.name)}</span>
                <div className="ar-meta">
                  <div className="ar-role">{a.role}</div>
                  <div className="ar-name">{u.name}</div>
                </div>
                {a.status === 'approved'
                  ? <span className="ar-status approved"><IcCircleCheck size={14} /> {a.at}</span>
                  : a.role !== 'Maker'
                    ? <button className="btn primary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => approve(a.role)}>
                        <IcThumbUp size={13} /> Approve
                      </button>
                    : <span className="ar-status pending"><IcClock size={14} /> pending</span>}
              </div>
            );
          })}

          <h2 className="h2" style={{ margin: '24px 0 12px' }}>
            Change Advisory Board
            <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>{cabDone}/{release.cab.length}</span>
          </h2>
          {release.cab.map(c => (
            <div key={c.id} className={`cab-item ${c.checked ? 'checked' : ''}`}>
              <span className="cab-check" onClick={() => toggleCab(c.id)}>{c.checked && <IcCheck size={13} />}</span>
              <div className="cab-meta">
                <div className="cab-title">
                  {c.title}
                  {c.auto && <span className="cab-auto">Auto</span>}
                </div>
                <div className="cab-desc">{c.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 8, padding: 10, borderRadius: 6, fontSize: 12,
                        background: cabDone === release.cab.length && approvalsDone === release.approvals.length ? '#d1fae5' : '#fff7e6',
                        border: `1px solid ${cabDone === release.cab.length && approvalsDone === release.approvals.length ? '#6ee7b7' : '#f0d28a'}`,
                        color: cabDone === release.cab.length && approvalsDone === release.approvals.length ? '#065f46' : '#92400e',
                        display: 'flex', gap: 8, alignItems: 'center' }}>
            {cabDone === release.cab.length && approvalsDone === release.approvals.length
              ? <><IcCircleCheck size={14} /> All gates satisfied — cleared for Production.</>
              : <><IcWarn size={14} /> {release.approvals.length - approvalsDone} approval(s) + {release.cab.length - cabDone} CAB item(s) outstanding before Production.</>}
          </div>
        </div>
      </div>

      {confirmProd && (
        <ConfirmModal
          title="Deploy to Production?"
          message={
            <div>
              <p>You're about to release <strong>{release.tag}</strong> to <strong>Production</strong>. This will:</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.7 }}>
                <li>Take a fresh database backup (rollback point)</li>
                <li>Import the package + label the VC database</li>
                <li>Run the Production smoke test suite</li>
                <li>Auto-rollback if smoke tests fail</li>
              </ul>
            </div>
          }
          confirmLabel="Back up & deploy to Production"
          onConfirm={deployProd}
          onCancel={() => setConfirmProd(false)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Releases list
// ------------------------------------------------------------
function Releases() {
  const [releases, setReleases] = React.useState(RELEASES_SEED);
  const [openId, setOpenId] = React.useState(null);
  const [showNew, setShowNew] = React.useState(false);

  const open = releases.find(r => r.id === openId);
  function updateRelease(next) { setReleases(releases.map(r => r.id === next.id ? next : r)); }

  if (open) return <ReleaseDetail release={open} onBack={() => setOpenId(null)} onChange={updateRelease} />;

  const active = releases.filter(r => r.stage !== 'released').length;
  const inProd = releases.filter(r => r.pipeline.prod.status === 'done').length;

  return (
    <div className="dl-page fade-in">
      <div className="dl-head">
        <h1>Releases</h1>
        <p className="sub">
          Package version-controlled changes and promote them through your environments. Lower environments deploy
          automatically once tests pass; Production is gated behind maker/checker approval, the CAB checklist, and a human confirm.
        </p>
        <div className="dl-tabs"><div className="tab active"><IcRocketShip size={15} /> All releases <span className="count">{releases.length}</span></div></div>
      </div>
      <div className="dl-body">
        <div className="dl-stats">
          <div className="dl-stat"><div className="v">{active}</div><div className="k">In flight</div></div>
          <div className="dl-stat"><div className="v" style={{ color: '#15803d' }}>{inProd}</div><div className="k">Live in prod</div></div>
          <div className="dl-stat"><div className="v">{REL_ENVS.length}</div><div className="k">Environments</div></div>
          <div className="dl-stat"><div className="v">{releases.reduce((n, r) => n + r.components.length, 0)}</div><div className="k">Packaged components</div></div>
        </div>

        <div className="dl-toolbar">
          <span className="co-spacer" style={{ flex: 1 }} />
          <button className="btn primary" onClick={() => setShowNew(true)}>
            <IcPlus size={14} /> New release
          </button>
        </div>

        {releases.map(r => {
          const u = collabUser(r.owner);
          return (
            <div key={r.id} className="rel-card" onClick={() => setOpenId(r.id)}>
              <div className="rel-card-head">
                <span className="rel-name">{r.name}</span>
                <span className="rel-tag">{r.tag}</span>
                <span className={`rel-stage-badge rs-${r.stage}`}>{STAGE_LABEL[r.stage]}</span>
                <span className="co-spacer" style={{ flex: 1 }} />
                <PipelineMini release={r} />
              </div>
              <div className="rel-card-meta">
                <span className="item"><IcUser size={12} /> {u.name}</span>
                <span className="item"><IcClock size={12} /> {r.created}</span>
                <span className="item"><IcPackage size={12} /> {r.components.length} components</span>
                <span className="item"><IcThumbUp size={12} /> {r.approvals.filter(a => a.status === 'approved').length}/{r.approvals.length} approvals</span>
              </div>
            </div>
          );
        })}
      </div>

      {showNew && (
        <NewReleaseModal
          onCreate={(rel) => { setReleases([rel, ...releases]); setShowNew(false); setOpenId(rel.id); }}
          onCancel={() => setShowNew(false)} />
      )}
    </div>
  );
}

function PipelineMini({ release }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {REL_ENVS.map(env => {
        const st = release.pipeline[env.id].status;
        const color = st === 'done' ? '#22c55e' : st === 'active' ? '#b51e7a' : st === 'fail' ? '#ef4444' : '#d8d8d8';
        return (
          <span key={env.id} title={`${env.name}: ${st}`}
                style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 8, color: 'var(--ink-4)', fontWeight: 600 }}>{env.name}</span>
          </span>
        );
      })}
    </span>
  );
}

function NewReleaseModal({ onCreate, onCancel }) {
  const collab = useCollab();
  const [name, setName] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [picked, setPicked] = React.useState({});
  // candidate components = recently changed (from collab history)
  const candidates = Object.entries(collab.components).map(([k, c]) => ({ key: k, label: c.label, type: c.type }));

  function create() {
    const comps = candidates.filter(c => picked[c.key]).map(c => relComponent(c.label, c.type, 'Modified'));
    onCreate({
      id: 'rel-' + Date.now(),
      name: name.trim(), tag: 'REL-2026.06.' + Math.floor(Math.random() * 9),
      stage: 'draft', created: 'just now', owner: 'jb',
      desc: desc.trim() || 'New release.',
      components: comps.length ? comps : [relComponent('(no components yet)', 'Porter', 'Modified')],
      approvals: [
        { role: 'Maker', user: 'jb', status: 'approved', at: 'just now' },
        { role: 'Checker', user: 'kw', status: 'pending', at: null },
        { role: 'CAB approver', user: 'cm', status: 'pending', at: null },
      ],
      cab: [
        { id: 'c1', title: 'Test verification', auto: true, checked: false, desc: 'Suite not yet run.' },
        { id: 'c2', title: 'Database backup taken', auto: true, checked: false, desc: 'Scheduled at deploy time.' },
        { id: 'c3', title: 'Rollback plan in place', auto: false, checked: false, desc: 'Pending sign-off.' },
      ],
      pipeline: { dev: { status: 'wait', tests: null, at: null, deployedBy: null },
                  qa: { status: 'wait', tests: null, at: null, deployedBy: null },
                  uat: { status: 'wait', tests: null, at: null, deployedBy: null },
                  prod: { status: 'wait', tests: null, at: null, deployedBy: null } },
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" style={{ width: 560, maxWidth: '95vw' }}>
        <div className="modal-head"><h3><IcRocketShip size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} /> New release</h3></div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">Release name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)}
                   placeholder="e.g. Price Master quality scoring" />
          </div>
          <div className="field">
            <label className="field-label">Description</label>
            <textarea className="textarea" value={desc} onChange={e => setDesc(e.target.value)}
                      placeholder="What's in this release and why" style={{ minHeight: 70 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Include changed components</label>
            <div style={{ border: '1px solid var(--line)', borderRadius: 6, maxHeight: 180, overflow: 'auto' }}>
              {candidates.map(c => (
                <div key={c.key} className="dtable-row" style={{ gridTemplateColumns: '32px 1fr 90px', padding: '0 12px' }}
                     onClick={() => setPicked({ ...picked, [c.key]: !picked[c.key] })}>
                  <span><span className="hist-check" style={{ background: picked[c.key] ? 'var(--magenta)' : '#fff', borderColor: picked[c.key] ? 'var(--magenta)' : 'var(--line-2)' }}>{picked[c.key] && <IcCheck size={12} />}</span></span>
                  <span style={{ fontWeight: 500 }}>{c.label}</span>
                  <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{c.type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()} onClick={create}>Create release</button>
        </div>
      </div>
    </div>
  );
}

window.Releases = Releases;
