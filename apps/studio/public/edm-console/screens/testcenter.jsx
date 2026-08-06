// ============================================================
// Test Center
//   • Test cases (build them) grouped into suites
//   • Runs: nightly (scheduled), ad-hoc (manual), deploy-gated
//   • A run executes a suite and reports pass/fail; deploys to higher
//     environments are gated on a green run.
// ============================================================

const TEST_SUITES = [
  { id: 'sec-master', name: 'Security Master regression', env: 'qa', cases: 142,
    desc: 'Identifier validation, mastering survivorship, CAX application.' },
  { id: 'party', name: 'Party Master regression', env: 'qa', cases: 96,
    desc: 'LEI resolution, hierarchy, GICS classification.' },
  { id: 'price', name: 'Price Master smoke', env: 'uat', cases: 38,
    desc: 'Source survivorship, quality scoring, as-of dating.' },
  { id: 'prod-smoke', name: 'Production smoke', env: 'prod', cases: 24,
    desc: 'Critical-path checks run automatically on every prod deploy.' },
];

const TEST_CASES = {
  'sec-master': [
    { id: 't1', name: 'ISIN check-digit validation rejects bad ISIN', kind: 'Rule', result: 'pass', ms: 42 },
    { id: 't2', name: 'CUSIP → ISIN enrichment populates target', kind: 'Porter', result: 'pass', ms: 118 },
    { id: 't3', name: 'Cast As Date handles null DateTime', kind: 'Rule', result: 'pass', ms: 31 },
    { id: 't4', name: 'Asset Type decodes BBG MARKET_SECTOR_DES', kind: 'Rule', result: 'pass', ms: 27 },
    { id: 't5', name: 'Maturity precedence BBG > LSEG > SIX', kind: 'Constructor', result: 'fail', ms: 64,
      error: 'Expected maturity from BBG (2031-06-15) but got LSEG (2031-06-14) — precedence misordered.' },
    { id: 't6', name: 'Issuer LEI links to Party master', kind: 'Solution', result: 'pass', ms: 203 },
    { id: 't7', name: 'Currency is mandatory — load fails when blank', kind: 'Porter', result: 'pass', ms: 51 },
    { id: 't8', name: 'Duplicate ISIN deduplicated on load', kind: 'Porter', result: 'skip', ms: 0 },
  ],
  'party': [
    { id: 'p1', name: 'GLEIF LEI is primary key', kind: 'Rule', result: 'pass', ms: 22 },
    { id: 'p2', name: 'Ultimate parent resolves 3 levels', kind: 'Solution', result: 'pass', ms: 189 },
    { id: 'p3', name: 'GICS sector decode', kind: 'Rule', result: 'pass', ms: 30 },
  ],
  'price': [
    { id: 'pr1', name: 'BVAL wins over BBG when quality higher', kind: 'Constructor', result: 'pass', ms: 77 },
    { id: 'pr2', name: 'As-of date casts correctly', kind: 'Rule', result: 'pass', ms: 25 },
  ],
  'prod-smoke': [
    { id: 's1', name: 'Master_Security row count > 0', kind: 'Query', result: 'pass', ms: 12 },
    { id: 's2', name: 'No orphaned Issuer LEIs', kind: 'Query', result: 'pass', ms: 88 },
  ],
};

const TEST_RUNS = [
  { id: 'run-1', suite: 'Security Master regression', trigger: 'nightly', when: 'Today 02:00', env: 'qa',
    pass: 141, fail: 1, skip: 0, total: 142, status: 'done', dur: '4m 12s' },
  { id: 'run-2', suite: 'Party Master regression', trigger: 'nightly', when: 'Today 02:05', env: 'qa',
    pass: 96, fail: 0, skip: 0, total: 96, status: 'done', dur: '2m 48s' },
  { id: 'run-3', suite: 'Security Master regression', trigger: 'deploy', when: 'Yesterday 14:45', env: 'uat',
    pass: 142, fail: 0, skip: 0, total: 142, status: 'done', dur: '4m 02s', rel: 'REL-2026.05.0' },
  { id: 'run-4', suite: 'Price Master smoke', trigger: 'adhoc', when: 'Yesterday 11:20', env: 'uat',
    pass: 37, fail: 0, skip: 1, total: 38, status: 'done', dur: '1m 09s' },
  { id: 'run-5', suite: 'Production smoke', trigger: 'deploy', when: '13 May 22:30', env: 'prod',
    pass: 24, fail: 0, skip: 0, total: 24, status: 'done', dur: '38s', rel: 'REL-2026.04.2' },
];

function resultIcon(r) {
  if (r === 'pass') return <span className="test-result pass"><IcCircleCheck size={14} /> Pass</span>;
  if (r === 'fail') return <span className="test-result fail"><IcCircleX size={14} /> Fail</span>;
  if (r === 'running') return <span className="test-result running"><IcCircleDot size={14} /> Running</span>;
  return <span className="test-result skip"><IcCircleDot size={14} /> Skipped</span>;
}

function TestCenter() {
  const [tab, setTab] = React.useState('suites');
  const [openSuite, setOpenSuite] = React.useState(null);
  const [runs, setRuns] = React.useState(TEST_RUNS);
  const [cases, setCases] = React.useState(TEST_CASES);
  const [running, setRunning] = React.useState(null);
  const [showNewCase, setShowNewCase] = React.useState(false);

  const Icon = { Rule: IcRules, Porter: IcPorter, Solution: IcSolutions, Constructor: IcSliders, Query: IcManager };

  function runSuite(suiteId, trigger) {
    const suite = TEST_SUITES.find(s => s.id === suiteId);
    setRunning(suiteId);
    ruleToast && ruleToast(`Running "${suite.name}"…`, 'info');
    setTimeout(() => {
      const cs = cases[suiteId] || [];
      const pass = cs.filter(c => c.result === 'pass').length;
      const fail = cs.filter(c => c.result === 'fail').length;
      const skip = cs.filter(c => c.result === 'skip').length;
      const total = suite.cases;
      setRuns(r => [{
        id: 'run-' + Date.now(), suite: suite.name, trigger, when: 'just now', env: suite.env,
        pass: pass + (total - cs.length), fail, skip, total, status: 'done', dur: '0m 52s',
      }, ...r]);
      setRunning(null);
      ruleToast && ruleToast(fail ? `${suite.name}: ${fail} failed` : `${suite.name}: all passed`, fail ? 'error' : 'success');
      setTab('runs');
    }, 1800);
  }

  function addCase(suiteId, name, kind) {
    setCases({ ...cases, [suiteId]: [...(cases[suiteId] || []),
      { id: 'tc-' + Date.now(), name, kind, result: 'skip', ms: 0 }] });
    setShowNewCase(false);
    ruleToast && ruleToast('Test case added', 'success');
  }

  // suite detail
  if (openSuite) {
    const suite = TEST_SUITES.find(s => s.id === openSuite);
    const cs = cases[openSuite] || [];
    return (
      <div className="dl-page fade-in">
        <div className="dl-head">
          <button className="btn ghost" style={{ marginBottom: 12, padding: '4px 8px' }} onClick={() => setOpenSuite(null)}>
            <IcChevLeft size={14} /> All suites
          </button>
          <div className="hstack" style={{ gap: 12, marginBottom: 6 }}>
            <h1 style={{ margin: 0 }}>{suite.name}</h1>
            <span className={`env-pill env-${suite.env}`}><span className="ed" style={{ background: 'currentColor' }} />{suite.env.toUpperCase()}</span>
          </div>
          <p className="sub">{suite.desc}</p>
          <div className="dl-tabs"><div className="tab active"><IcFlask size={15} /> Test cases <span className="count">{cs.length}</span></div></div>
        </div>
        <div className="dl-body">
          <div className="dl-toolbar">
            <button className="btn primary" disabled={running === openSuite} onClick={() => runSuite(openSuite, 'adhoc')}>
              {running === openSuite ? <><svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="rgba(181,30,122,.3)" strokeWidth="2.5" /><path d="M21 12a9 9 0 0 0-9-9" stroke="#b51e7a" strokeWidth="2.5" strokeLinecap="round" /></svg> Running…</> : <><IcPlay size={13} /> Run suite</>}
            </button>
            <button className="btn" onClick={() => setShowNewCase(true)}><IcPlus size={14} /> New test case</button>
            <span className="co-spacer" style={{ flex: 1 }} />
            <span className="muted">{cs.filter(c => c.result === 'pass').length} pass · {cs.filter(c => c.result === 'fail').length} fail · {cs.filter(c => c.result === 'skip').length} skipped</span>
          </div>
          <div className="co-table">
            <div className="test-row head">
              <span /><span>Test case</span><span>Targets</span><span>Result</span><span>Duration</span><span>Last run</span><span />
            </div>
            {cs.map(c => {
              const I = Icon[c.kind] || IcFile;
              return (
                <div key={c.id} className="test-row">
                  <span><I size={15} style={{ color: 'var(--ink-4)' }} /></span>
                  <span className="test-name">
                    {c.name}
                    {c.result === 'fail' && c.error && <span className="tn-sub" style={{ color: '#b91c1c' }}>{c.error}</span>}
                  </span>
                  <span style={{ color: 'var(--ink-3)' }}>{c.kind}</span>
                  <span>{resultIcon(c.result)}</span>
                  <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{c.ms ? c.ms + 'ms' : '—'}</span>
                  <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>Today 02:00</span>
                  <span><button className="icon-btn" onClick={() => ruleToast && ruleToast('Edit test case', 'info')}><IcEdit size={13} /></button></span>
                </div>
              );
            })}
          </div>
        </div>
        {showNewCase && <NewCaseModal onAdd={(n, k) => addCase(openSuite, n, k)} onCancel={() => setShowNewCase(false)} />}
      </div>
    );
  }

  const totalCases = Object.values(cases).reduce((n, a) => n + a.length, 0);
  const lastNightly = runs.find(r => r.trigger === 'nightly');

  return (
    <div className="dl-page fade-in">
      <div className="dl-head">
        <h1>Test Center</h1>
        <p className="sub">
          Build test cases, group them into suites, and run them on a nightly schedule, ad-hoc, or automatically on
          deployment. Promotion to a higher environment is gated on a green run.
        </p>
        <div className="dl-tabs">
          <button className={`tab ${tab === 'suites' ? 'active' : ''}`} onClick={() => setTab('suites')}>
            <IcFlask size={15} /> Suites <span className="count">{TEST_SUITES.length}</span>
          </button>
          <button className={`tab ${tab === 'runs' ? 'active' : ''}`} onClick={() => setTab('runs')}>
            <IcClock size={15} /> Runs <span className="count">{runs.length}</span>
          </button>
        </div>
      </div>
      <div className="dl-body">
        <div className="dl-stats">
          <div className="dl-stat"><div className="v">{TEST_SUITES.length}</div><div className="k">Suites</div></div>
          <div className="dl-stat"><div className="v">{totalCases}</div><div className="k">Test cases</div></div>
          <div className="dl-stat"><div className="v" style={{ color: lastNightly && lastNightly.fail ? '#b45309' : '#15803d' }}>
            {lastNightly ? `${lastNightly.pass}/${lastNightly.total}` : '—'}</div><div className="k">Last nightly</div></div>
          <div className="dl-stat"><div className="v">{runs.length}</div><div className="k">Total runs</div></div>
        </div>

        {tab === 'suites' && (
          <>
            {TEST_SUITES.map(s => {
              const cs = cases[s.id] || [];
              const pass = cs.filter(c => c.result === 'pass').length;
              const fail = cs.filter(c => c.result === 'fail').length;
              const skip = cs.filter(c => c.result === 'skip').length;
              const pp = (pass / Math.max(cs.length, 1)) * 100;
              const fp = (fail / Math.max(cs.length, 1)) * 100;
              const sp = (skip / Math.max(cs.length, 1)) * 100;
              return (
                <div key={s.id} className="rel-card" onClick={() => setOpenSuite(s.id)}>
                  <div className="rel-card-head">
                    <span className="rel-name">{s.name}</span>
                    <span className={`env-pill env-${s.env}`}><span className="ed" style={{ background: 'currentColor' }} />{s.env.toUpperCase()}</span>
                    <span className="co-spacer" style={{ flex: 1 }} />
                    {fail > 0
                      ? <span className="test-result fail"><IcCircleX size={14} /> {fail} failing</span>
                      : <span className="test-result pass"><IcCircleCheck size={14} /> Green</span>}
                    <button className="btn" style={{ marginLeft: 12, padding: '5px 10px', fontSize: 12 }}
                            disabled={running === s.id}
                            onClick={(e) => { e.stopPropagation(); runSuite(s.id, 'adhoc'); }}>
                      {running === s.id ? 'Running…' : <><IcPlay size={12} /> Run</>}
                    </button>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10 }}>{s.desc}</div>
                  <div className="test-bar" style={{ marginBottom: 6 }}>
                    <i className="pass" style={{ width: pp + '%' }} />
                    <i className="fail" style={{ width: fp + '%' }} />
                    <i className="skip" style={{ width: sp + '%' }} />
                  </div>
                  <div className="rel-card-meta">
                    <span className="item"><IcFlask size={12} /> {s.cases} cases</span>
                    <span className="item" style={{ color: '#15803d' }}>{pass} pass</span>
                    {fail > 0 && <span className="item" style={{ color: '#b91c1c' }}>{fail} fail</span>}
                    {skip > 0 && <span className="item">{skip} skipped</span>}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === 'runs' && (
          <>
            <div className="dl-toolbar">
              <span className="muted">Nightly runs execute at 02:00. Deploy runs fire automatically when a release promotes.</span>
            </div>
            {runs.map(r => {
              const trig = { nightly: ['nightly', IcClock], adhoc: ['adhoc', IcPlay], deploy: ['deploy', IcDeploy] }[r.trigger];
              const TI = trig[1];
              const ok = r.fail === 0;
              return (
                <div key={r.id} className="run-card">
                  <span className="rc-icon" style={{ background: ok ? '#d1fae5' : '#fee2e2', color: ok ? '#065f46' : '#991b1b' }}>
                    {ok ? <IcCircleCheck size={18} /> : <IcCircleX size={18} />}
                  </span>
                  <div className="rc-meta">
                    <div className="rc-title">
                      {r.suite}
                      <span className={`run-trigger ${r.trigger}`}>{trig[0]}</span>
                      <span className={`env-pill env-${r.env}`} style={{ fontSize: 10 }}><span className="ed" style={{ background: 'currentColor' }} />{r.env.toUpperCase()}</span>
                      {r.rel && <span className="rel-tag" style={{ fontSize: 11 }}>{r.rel}</span>}
                    </div>
                    <div className="rc-sub">{r.when} · {r.dur} · <span style={{ color: '#15803d' }}>{r.pass} pass</span>{r.fail ? <span style={{ color: '#b91c1c' }}> · {r.fail} fail</span> : ''}{r.skip ? ` · ${r.skip} skipped` : ''}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: ok ? '#15803d' : '#b91c1c' }}>
                    {r.pass}/{r.total}
                  </span>
                  <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => ruleToast && ruleToast('Opening run report', 'info')}>
                    Report <IcChevRight size={13} />
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function NewCaseModal({ onAdd, onCancel }) {
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState('Rule');
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal-head"><h3><IcFlask size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} /> New test case</h3></div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">Test name <span style={{ color: 'var(--red)' }}>*</span></label>
            <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)}
                   placeholder="e.g. ISIN check-digit validation rejects bad ISIN" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Targets component type</label>
            <div className="select-wrap">
              <select className="select" value={kind} onChange={e => setKind(e.target.value)}>
                <option>Rule</option><option>Porter</option><option>Solution</option><option>Constructor</option><option>Query</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => onAdd(name.trim(), kind)}>Add test case</button>
        </div>
      </div>
    </div>
  );
}

window.TestCenter = TestCenter;
