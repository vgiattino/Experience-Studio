// ============================================================
// Workspace Activity — "View All Check-outs" console + co-presence
//   • Who has what checked out (filter: only mine)
//   • Bulk Check In / Undo Check Out (maps to the EDM wizard)
//   • Components I'm subscribed to be notified about
//   • Live presence across the workspace
// ============================================================

function WorkspaceActivity({ onNavigate }) {
  const collab = useCollab();
  const [tab, setTab] = React.useState('checkouts');
  const [onlyMine, setOnlyMine] = React.useState(false);
  const [sel, setSel] = React.useState({});
  const [confirm, setConfirm] = React.useState(null); // { mode:'checkin'|'undo', keys:[] }
  const [history, setHistory] = React.useState(null);

  const entries = Object.entries(collab.components).map(([key, c]) => ({ key, ...c }));
  const checkedOut = entries.filter(e => e.status !== 'available');
  const visible = checkedOut.filter(e => !onlyMine || e.status === 'me');
  const myNotifs = entries.filter(e => e.notify.includes('jb'));
  const mineCount = checkedOut.filter(e => e.status === 'me').length;

  const selKeys = Object.keys(sel).filter(k => sel[k]);
  const allSelected = visible.length > 0 && visible.every(e => sel[e.key]);

  function toggleAll() {
    if (allSelected) setSel({});
    else { const n = {}; visible.forEach(e => n[e.key] = true); setSel(n); }
  }
  function runBulk(mode) {
    selKeys.forEach(k => {
      const c = collab.components[k];
      if (mode === 'checkin') collabCheckin(k, 'Bulk check-in from Workspace Activity');
      else if (c.status === 'me') collabUndoCheckout(k);
      else collabForceCheckin(k);
    });
    setSel({});
    setConfirm(null);
  }

  const Icon = { Porter: IcPorter, Rule: IcRules, Solution: IcSolutions, Constructor: IcSliders };

  return (
    <div className="dl-page fade-in">
      <div className="dl-head">
        <h1>Workspace Activity</h1>
        <p className="sub">
          See who is working where, manage check-outs across the version-controlled database, and get notified when a
          locked component frees up. Editing a component checks it out and locks it for everyone else.
        </p>
        <div className="dl-tabs">
          <button className={`tab ${tab === 'checkouts' ? 'active' : ''}`} onClick={() => setTab('checkouts')}>
            <IcLock size={15} /> Check-outs <span className="count">{checkedOut.length}</span>
          </button>
          <button className={`tab ${tab === 'presence' ? 'active' : ''}`} onClick={() => setTab('presence')}>
            <IcUsersThree size={15} /> Who's online <span className="count">{COLLAB_TEAM.length}</span>
          </button>
          <button className={`tab ${tab === 'notify' ? 'active' : ''}`} onClick={() => setTab('notify')}>
            <IcBell size={15} /> My notifications <span className="count">{myNotifs.length}</span>
          </button>
        </div>
      </div>

      <div className="dl-body">
        {tab === 'checkouts' && (
          <>
            <div className="dl-stats">
              <div className="dl-stat"><div className="v">{checkedOut.length}</div><div className="k">Checked out</div></div>
              <div className="dl-stat"><div className="v" style={{ color: '#15803d' }}>{mineCount}</div><div className="k">By me</div></div>
              <div className="dl-stat"><div className="v">{checkedOut.length - mineCount}</div><div className="k">By others</div></div>
              <div className="dl-stat"><div className="v">{entries.length - checkedOut.length}</div><div className="k">Available</div></div>
            </div>

            <div className="dl-toolbar">
              <label className="checkbox">
                <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
                <span className="box"><IcCheck size={12} /></span>
                Show only components checked out to me
              </label>
              <span className="co-spacer" style={{ flex: 1 }} />
              <button className="btn" disabled={selKeys.length === 0}
                      onClick={() => setConfirm({ mode: 'undo', keys: selKeys })}>
                <IcUndo size={14} /> Undo check-out{selKeys.length ? ` (${selKeys.length})` : ''}
              </button>
              <button className="btn primary" disabled={selKeys.length === 0}
                      onClick={() => setConfirm({ mode: 'checkin', keys: selKeys })}>
                <IcCheck size={14} /> Check in{selKeys.length ? ` (${selKeys.length})` : ''}
              </button>
            </div>

            <div className="co-table">
              <div className="co-row head">
                <span><span className="hist-check" onClick={toggleAll}
                            style={{ cursor: 'pointer', background: allSelected ? 'var(--magenta)' : '#fff',
                                     borderColor: allSelected ? 'var(--magenta)' : 'var(--line-2)' }}>
                  {allSelected && <IcCheck size={12} />}
                </span></span>
                <span>Component</span><span>Type</span><span>Checked out to</span><span>Since</span><span>Action</span>
              </div>
              {visible.map(e => {
                const I = Icon[e.type] || IcFile;
                const u = e.status === 'me' ? COLLAB_ME : collabUser(e.status);
                return (
                  <div key={e.key} className="co-row">
                    <span>
                      <span className="hist-check" onClick={() => setSel({ ...sel, [e.key]: !sel[e.key] })}
                            style={{ cursor: 'pointer', background: sel[e.key] ? 'var(--magenta)' : '#fff',
                                     borderColor: sel[e.key] ? 'var(--magenta)' : 'var(--line-2)' }}>
                        {sel[e.key] && <IcCheck size={12} />}
                      </span>
                    </span>
                    <span className="co-comp">
                      <span className="ci"><I size={15} /></span>
                      {e.label}
                    </span>
                    <span style={{ color: 'var(--ink-3)' }}>{e.type}</span>
                    <span className="co-who">
                      <span className="pav" style={{ width: 24, height: 24, background: u.color, fontSize: 9, position: 'static', border: 0 }}>
                        {collabInitials(u.name)}
                      </span>
                      <span>{e.status === 'me' ? 'You' : u.name}</span>
                    </span>
                    <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{e.since ? fmtAgo(e.since) : '—'}</span>
                    <span>
                      <button className="btn ghost" style={{ fontSize: 12, padding: '4px 8px' }}
                              onClick={() => setHistory({ key: e.key, label: e.label })}>
                        <IcHistory size={13} /> History
                      </button>
                    </span>
                  </div>
                );
              })}
              {visible.length === 0 && (
                <div className="dtable-empty">
                  {onlyMine ? 'You have no components checked out.' : 'Nothing is checked out right now.'}
                </div>
              )}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcInfo size={13} />
              Components checked-in together are recorded as one change set. New components show a <span style={{ color: '#1e40af', fontWeight: 600 }}>New</span> tag and can't be undone.
            </div>
          </>
        )}

        {tab === 'presence' && (
          <>
            <div className="dl-toolbar">
              <span className="muted">{COLLAB_TEAM.length} team members · live presence across the workspace</span>
            </div>
            <div className="co-table">
              <div className="co-row head" style={{ gridTemplateColumns: '44px 1.4fr 1.4fr 1fr 120px' }}>
                <span /><span>User</span><span>Currently editing</span><span>Status</span><span>Last active</span>
              </div>
              {COLLAB_TEAM.map(u => {
                const editing = entries.find(e => e.status === u.id);
                const viewing = entries.find(e => e.viewers.includes(u.id));
                const isMe = u.id === 'jb';
                return (
                  <div key={u.id} className="co-row" style={{ gridTemplateColumns: '44px 1.4fr 1.4fr 1fr 120px' }}>
                    <span>
                      <span className="pav editing" style={{ width: 30, height: 30, background: u.color, fontSize: 11, position: 'static', border: 0 }}>
                        {collabInitials(u.name)}
                      </span>
                    </span>
                    <span style={{ fontWeight: 500 }}>{u.name}{isMe && <span className="muted"> (you)</span>}</span>
                    <span style={{ color: editing ? 'var(--ink)' : 'var(--ink-4)' }}>
                      {editing ? editing.label : viewing ? <em>viewing {viewing.label}</em> : '—'}
                    </span>
                    <span>
                      {editing
                        ? <span className="test-result running"><IcCircleDot size={13} /> Editing</span>
                        : <span style={{ color: '#15803d', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><IcCircleCheck size={13} /> Online</span>}
                    </span>
                    <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{editing && editing.since ? fmtAgo(editing.since) : 'now'}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'notify' && (
          <>
            <div className="dl-toolbar">
              <span className="muted">You'll get a notification the moment these locked components are checked back in.</span>
            </div>
            {myNotifs.length === 0 ? (
              <div className="dtable-empty" style={{ border: '1px dashed var(--line-2)', borderRadius: 8, background: '#fff' }}>
                You're not waiting on any components. Open a locked component and choose "Notify me when available".
              </div>
            ) : (
              <div className="co-table">
                {myNotifs.map(e => {
                  const I = Icon[e.type] || IcFile;
                  const u = collabUser(e.status);
                  return (
                    <div key={e.key} className="co-row" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 140px' }}>
                      <span className="co-comp"><span className="ci"><I size={15} /></span>{e.label}</span>
                      <span style={{ color: 'var(--ink-3)' }}>{e.type}</span>
                      <span className="co-who">
                        <span className="pav" style={{ width: 24, height: 24, background: u.color, fontSize: 9, position: 'static', border: 0 }}>{collabInitials(u.name)}</span>
                        {u.name}
                      </span>
                      <span>
                        <button className="btn ghost" style={{ fontSize: 12 }} onClick={() => collabToggleNotify(e.key)}>
                          <IcX size={13} /> Cancel
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.mode === 'checkin' ? `Check in ${confirm.keys.length} component(s)?` : `Undo check-out on ${confirm.keys.length} component(s)?`}
          message={confirm.mode === 'checkin'
            ? 'Changes made during the check-out will be saved to the database and the components checked back in.'
            : 'Any changes made since check-out will be reverted, and the components checked back in.'}
          confirmLabel={confirm.mode === 'checkin' ? 'Check in' : 'Undo check-out'}
          confirmKind={confirm.mode === 'checkin' ? 'primary' : 'danger'}
          onConfirm={() => runBulk(confirm.mode)}
          onCancel={() => setConfirm(null)} />
      )}
      {history && (
        <HistoryModal componentKey={history.key} label={history.label} onClose={() => setHistory(null)} />
      )}
    </div>
  );
}

window.WorkspaceActivity = WorkspaceActivity;
