// ============================================================
// Environments — per-client environment topology & config
//   Clients vary: most have DEV/QA/UAT/PROD, some collapse stages.
//   Shows the promotion flow, per-env config, deploy automation
//   and the human-in-the-loop gate for production.
// ============================================================

const ENVIRONMENTS = [
  { id: 'dev',  name: 'Development', short: 'DEV',  cls: 'env-dev',  dot: '#4338ca',
    server: 'EDM-SQL-DEV\\SQLEXPRESS', db: 'OPUS_EDM_DEV', version: '19.4.0',
    auto: true, approvals: 0, lastDeploy: 'Today 10:20', health: 'ok',
    desc: 'Sandbox for active configuration. Auto-deploys on every check-in.' },
  { id: 'qa',   name: 'Quality Assurance', short: 'QA', cls: 'env-qa', dot: '#0e7490',
    server: 'EDM-SQL-QA', db: 'OPUS_EDM_QA', version: '19.4.0',
    auto: true, approvals: 0, lastDeploy: 'Today 14:45', health: 'ok',
    desc: 'Automated regression target. Promotion requires a green nightly run.' },
  { id: 'uat',  name: 'User Acceptance', short: 'UAT', cls: 'env-uat', dot: '#92400e',
    server: 'EDM-SQL-UAT', db: 'OPUS_EDM_UAT', version: '19.3.2',
    auto: true, approvals: 1, lastDeploy: 'Yesterday 09:02', health: 'warn',
    desc: 'Business sign-off environment. Auto-deploys after QA; needs checker approval.' },
  { id: 'prod', name: 'Production', short: 'PROD', cls: 'env-prod', dot: '#991b1b',
    server: 'EDM-SQL-PROD (AG)', db: 'OPUS_EDM_PROD', version: '19.3.1.2',
    auto: false, approvals: 3, lastDeploy: '13 May 22:30', health: 'ok',
    desc: 'Live environment. Manual gate: maker/checker + CAB + human confirm with backup & rollback.' },
];

function EnvHealth({ h }) {
  if (h === 'ok') return <span className="test-result pass"><IcCircleCheck size={13} /> Healthy</span>;
  if (h === 'warn') return <span className="test-result" style={{ color: '#b45309' }}><IcWarn size={13} /> Drift</span>;
  return <span className="test-result fail"><IcCircleX size={13} /> Down</span>;
}

function Environments() {
  const [tab, setTab] = React.useState('topology');
  const [envs, setEnvs] = React.useState(ENVIRONMENTS);
  const [edit, setEdit] = React.useState(null);

  return (
    <div className="dl-page fade-in">
      <div className="dl-head">
        <h1>Environments</h1>
        <p className="sub">
          Configure the promotion path for this client. Lower environments deploy automatically; Production is a manual,
          human-approved gate with backup and rollback. Topologies vary per client — add or remove stages here.
        </p>
        <div className="dl-tabs">
          <button className={`tab ${tab === 'topology' ? 'active' : ''}`} onClick={() => setTab('topology')}>
            <IcGitBranch size={15} /> Promotion path
          </button>
          <button className={`tab ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>
            <IcServer size={15} /> Environments <span className="count">{envs.length}</span>
          </button>
        </div>
      </div>
      <div className="dl-body">
        {tab === 'topology' && (
          <>
            <div className="env-flow">
              {envs.map((e, i) => (
                <React.Fragment key={e.id}>
                  <span className="env-flow-node" style={{ borderColor: e.dot, color: e.dot }}>
                    {e.auto ? <IcBolt size={14} /> : <IcUserShield size={14} />}
                    {e.short}
                  </span>
                  {i < envs.length - 1 && (
                    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <IcArrowRight size={18} style={{ color: 'var(--ink-4)' }} />
                      <span style={{ fontSize: 9, color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase' }}>
                        {envs[i + 1].auto ? 'auto' : 'manual'}
                      </span>
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="dl-stats">
              <div className="dl-stat"><div className="v">{envs.length}</div><div className="k">Environments</div></div>
              <div className="dl-stat"><div className="v" style={{ color: '#4338ca' }}>{envs.filter(e => e.auto).length}</div><div className="k">Automated</div></div>
              <div className="dl-stat"><div className="v" style={{ color: '#991b1b' }}>{envs.filter(e => !e.auto).length}</div><div className="k">Manual gate</div></div>
              <div className="dl-stat"><div className="v">{envs.filter(e => e.health !== 'ok').length}</div><div className="k">Need attention</div></div>
            </div>

            <div className="cab-item" style={{ alignItems: 'flex-start' }}>
              <span className="cab-check checked" style={{ background: '#16a34a', borderColor: '#16a34a', cursor: 'default' }}><IcBolt size={13} /></span>
              <div className="cab-meta">
                <div className="cab-title">Automated deployment — DEV · QA · UAT</div>
                <div className="cab-desc">Promotions to these environments run automatically once the gating test suite passes. Failed tests block promotion and notify the release owner.</div>
              </div>
            </div>
            <div className="cab-item" style={{ alignItems: 'flex-start' }}>
              <span className="cab-check checked" style={{ background: '#991b1b', borderColor: '#991b1b', cursor: 'default' }}><IcUserShield size={13} /></span>
              <div className="cab-meta">
                <div className="cab-title">Human-in-the-loop — Production</div>
                <div className="cab-desc">Production requires maker/checker approval, a completed CAB checklist (test verification, backup, rollback plan) and an explicit human confirm. A database backup is always taken first, and smoke-test failure triggers automatic rollback.</div>
              </div>
            </div>
          </>
        )}

        {tab === 'config' && (
          <>
            <div className="dl-toolbar">
              <span className="muted">Per-client environment configuration. Some clients omit UAT or add a pre-prod stage.</span>
              <span className="co-spacer" style={{ flex: 1 }} />
              <button className="btn"><IcPlus size={14} /> Add environment</button>
            </div>
            <div className="env-grid">
              {envs.map(e => (
                <div key={e.id} className="env-card">
                  <div className="env-card-top">
                    <div className="ec-name">
                      <span className={`env-pill ${e.cls}`}><span className="ed" style={{ background: e.dot }} />{e.short}</span>
                      {e.name}
                    </div>
                    <div className="hstack" style={{ gap: 10, marginTop: 8 }}>
                      <EnvHealth h={e.health} />
                      {e.auto
                        ? <span style={{ fontSize: 11, color: '#4338ca', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IcBolt size={12} /> Automated</span>
                        : <span style={{ fontSize: 11, color: '#991b1b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IcUserShield size={12} /> Manual gate</span>}
                    </div>
                  </div>
                  <div className="env-card-body">
                    <div className="env-prop"><span className="ep-k">Server</span><span className="ep-v">{e.server}</span></div>
                    <div className="env-prop"><span className="ep-k">Database</span><span className="ep-v">{e.db}</span></div>
                    <div className="env-prop"><span className="ep-k">EDM version</span><span className="ep-v">{e.version}</span></div>
                    <div className="env-prop"><span className="ep-k">Approvals</span><span className="ep-v">{e.approvals} required</span></div>
                    <div className="env-prop"><span className="ep-k">Last deploy</span><span className="ep-v">{e.lastDeploy}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, marginTop: 4 }}>{e.desc}</div>
                    <div className="hstack" style={{ gap: 6, marginTop: 6 }}>
                      <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => setEdit(e)}>
                        <IcCog size={13} /> Configure
                      </button>
                      <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => ruleToast && ruleToast(`Backup of ${e.db} started`, 'info')}>
                        <IcBackup size={13} /> Backup
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {edit && (
        <div className="modal-backdrop" onMouseDown={ev => { if (ev.target === ev.currentTarget) setEdit(null); }}>
          <div className="modal" style={{ width: 520, maxWidth: '95vw' }}>
            <div className="modal-head">
              <h3><span className={`env-pill ${edit.cls}`} style={{ marginRight: 8 }}><span className="ed" style={{ background: edit.dot }} />{edit.short}</span> Configure {edit.name}</h3>
              <button className="icon-btn" onClick={() => setEdit(null)}><IcX size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form2">
                <div className="field"><label className="field-label">SQL Server</label><input className="input" defaultValue={edit.server} /></div>
                <div className="field"><label className="field-label">Database</label><input className="input" defaultValue={edit.db} /></div>
                <div className="field"><label className="field-label">EDM version</label><input className="input" defaultValue={edit.version} /></div>
                <div className="field"><label className="field-label">Required approvals</label><input className="input" type="number" defaultValue={edit.approvals} /></div>
              </div>
              <div className="vstack" style={{ gap: 10, marginTop: 14 }}>
                <label className="checkbox"><input type="checkbox" defaultChecked={edit.auto} /><span className="box"><IcCheck size={12} /></span> Automated deployment (no human confirm)</label>
                <label className="checkbox"><input type="checkbox" defaultChecked /><span className="box"><IcCheck size={12} /></span> Take database backup before deploy</label>
                <label className="checkbox"><input type="checkbox" defaultChecked /><span className="box"><IcCheck size={12} /></span> Run gating test suite before promotion</label>
                <label className="checkbox"><input type="checkbox" defaultChecked={!edit.auto} /><span className="box"><IcCheck size={12} /></span> Auto-rollback on smoke-test failure</label>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn primary" onClick={() => { setEdit(null); ruleToast && ruleToast(`${edit.name} configuration saved`, 'success'); }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.Environments = Environments;
