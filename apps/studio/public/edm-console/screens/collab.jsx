// ============================================================
// Collaboration layer — shared store for the whole app
//   • component check-out / check-in (Version Control model)
//   • co-presence (who's viewing / editing)
//   • "notify me when available" subscriptions
//   • audit trail / change history with compare + rollback
//   • Workspace Activity page = "View All Check-outs" wizard equivalent
//
// State lives on window.__collab and notifies React via a tiny store.
// ============================================================

// ---- Team ----
const COLLAB_ME = { id: 'jb', name: 'Jimmy Brown', email: 'jimmy.brown@hhm.com', color: '#b51e7a' };
const COLLAB_TEAM = [
  COLLAB_ME,
  { id: 'kw', name: 'Kim Wexler',    email: 'kim.wexler@hhm.com',     color: '#1968d3' },
  { id: 'sg', name: 'Saul Goodman',  email: 'saul.goodman@hhm.com',   color: '#0f7c70' },
  { id: 'cm', name: 'Chuck McGill',  email: 'chuck.mcgill@hhm.com',   color: '#b45309' },
  { id: 'me', name: 'Mike Ehrmantraut', email: 'mike.ehrmantraut@hhm.com', color: '#6d28d9' },
];
function collabUser(id) { return COLLAB_TEAM.find(u => u.id === id) || COLLAB_ME; }
function collabInitials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('');
}

// ---- Seed checkout + history state ----
// status: 'available' | 'me' | other userId.  viewers: [userIds].  notify: [userIds] who want a ping.
function nowMinus(mins) {
  const d = new Date(Date.now() - mins * 60000);
  return d;
}
function fmtTime(d) {
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtAgo(d) {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const COLLAB_INITIAL = {
  components: {
    'porter:Archive and Update File Monitor Bloomberg Back Office Security Corp Pf Failed File': {
      id: 'porter:archive-bbg', label: 'Archive & Update File Monitor — BBG BO Corp Pfd', type: 'Porter',
      status: 'me', since: nowMinus(12), viewers: ['kw'], notify: [],
    },
    'rules:Cast As Date': {
      id: 'rules:cast-as-date', label: 'Cast As Date', type: 'Rule',
      status: 'kw', since: nowMinus(48), viewers: ['jb'], notify: ['jb'],
    },
    'solution:0000 Party': {
      id: 'sol:0000-party', label: '0000 Party', type: 'Solution',
      status: 'sg', since: nowMinus(125), viewers: [], notify: [],
    },
    'constructor:Enrich Bloomberg Party Aligned': {
      id: 'con:enrich-bbg', label: 'Enrich Bloomberg Party Aligned', type: 'Constructor',
      status: 'available', since: null, viewers: [], notify: [],
    },
    'porter:Enrich Bloomberg Security': {
      id: 'porter:enrich-bbg-sec', label: 'Enrich Bloomberg Security', type: 'Porter',
      status: 'cm', since: nowMinus(33), viewers: [], notify: [],
    },
    'rules:Calculate Cusip Check Digit': {
      id: 'rules:cusip', label: 'Calculate Cusip Check Digit', type: 'Rule',
      status: 'available', since: null, viewers: [], notify: [],
    },
  },
  // audit history keyed by component key — newest first
  history: {
    'porter:Archive and Update File Monitor Bloomberg Back Office Security Corp Pf Failed File': [
      { id: 'h1', action: 'Modified', user: 'jb', at: nowMinus(12), ver: 'v4.2.1', comment: 'Added target deduplication step + field mapping',
        before: ['Source File → File Action → Target File', 'precedence: Previous_Step_Completed_OK'],
        after:  ['Source File → File Action → Source Deduplication → Target Table', 'precedence: Previous_Step_Completed_OK', 'dedup keys: ISIN, Source'] },
      { id: 'h2', action: 'Modified', user: 'kw', at: nowMinus(1500), ver: 'v4.2.0', comment: 'Switched archive path to UNC',
        before: ['archive: C:\\EDM\\Archive'], after: ['archive: \\\\EC2AMAZ-6GSNBAI\\C$\\Archive'] },
      { id: 'h3', action: 'Labelled', user: 'sg', at: nowMinus(2900), ver: 'v4.2.0', comment: 'Release 2026.04 baseline', before: [], after: [] },
      { id: 'h4', action: 'Created', user: 'sg', at: nowMinus(8000), ver: 'v4.1.0', comment: 'Initial port from BBG BO feed', before: [], after: [] },
    ],
    'rules:Cast As Date': [
      { id: 'h5', action: 'Modified', user: 'kw', at: nowMinus(48), ver: 'v4.2.1', comment: 'Handle null DateTime → default 1900-01-01',
        before: ['CAST({INPUT}.[DateTime] AS DATE)'],
        after:  ['ISNULL(CAST({INPUT}.[DateTime] AS DATE), \'1900-01-01\')'] },
      { id: 'h6', action: 'Created', user: 'cm', at: nowMinus(6000), ver: 'v4.1.0', comment: 'New date-cast helper rule', before: [], after: [] },
    ],
  },
};

// ---- tiny store ----
window.__collab = window.__collab || JSON.parse(JSON.stringify(COLLAB_INITIAL), (k, v) => {
  // revive Date strings
  if ((k === 'since' || k === 'at') && typeof v === 'string') return new Date(v);
  return v;
});
// because JSON stringify killed Date objects above when window.__collab pre-existed, rebuild fresh once:
if (!window.__collabReady) {
  window.__collab = COLLAB_INITIAL;
  window.__collabReady = true;
  window.__collabSubs = new Set();
}
function collabEmit() { (window.__collabSubs || new Set()).forEach(fn => fn()); }
function useCollab() {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    window.__collabSubs.add(force);
    return () => window.__collabSubs.delete(force);
  }, []);
  return window.__collab;
}

// ---- actions ----
function ensureComponent(key, label, type) {
  const c = window.__collab.components;
  if (!c[key]) c[key] = { id: key, label, type, status: 'available', since: null, viewers: [], notify: [] };
  return c[key];
}
function collabCheckout(key) {
  const c = window.__collab.components[key];
  if (!c || (c.status !== 'available')) return false;
  c.status = 'me'; c.since = new Date();
  c.viewers = c.viewers.filter(v => v !== 'jb');
  collabEmit();
  ruleToast && ruleToast(`Checked out "${c.label}" — you can now edit`, 'success');
  return true;
}
function collabCheckin(key, comment) {
  const c = window.__collab.components[key];
  if (!c || c.status !== 'me') return;
  c.status = 'available'; c.since = null;
  // record history
  const h = window.__collab.history[key] || (window.__collab.history[key] = []);
  h.unshift({ id: 'h' + Date.now(), action: 'Modified', user: 'jb', at: new Date(),
              ver: 'v4.2.2', comment: comment || 'Checked in changes', before: [], after: [] });
  // notify subscribers
  if (c.notify.length) {
    ruleToast && ruleToast(`Notified ${c.notify.length} ${c.notify.length === 1 ? 'person' : 'people'} the component is available`, 'info');
    c.notify = [];
  }
  collabEmit();
  ruleToast && ruleToast(`Checked in "${c.label}"`, 'success');
}
function collabUndoCheckout(key) {
  const c = window.__collab.components[key];
  if (!c || c.status !== 'me') return;
  c.status = 'available'; c.since = null;
  collabEmit();
  ruleToast && ruleToast(`Undid check-out — changes discarded`, 'info');
}
function collabToggleNotify(key) {
  const c = window.__collab.components[key];
  if (!c) return;
  const has = c.notify.includes('jb');
  c.notify = has ? c.notify.filter(x => x !== 'jb') : [...c.notify, 'jb'];
  collabEmit();
  ruleToast && ruleToast(has ? 'Notification cancelled' : `You'll be notified when "${c.label}" is available`, has ? 'info' : 'success');
}
// admin: force check-in / undo from the console
function collabForceCheckin(key) {
  const c = window.__collab.components[key];
  if (!c) return;
  c.status = 'available'; c.since = null; c.notify = []; collabEmit();
}

// ============================================================
// Presence avatars
// ============================================================
function PresenceAvatars({ editorId, viewerIds, max = 4 }) {
  const all = [];
  if (editorId && editorId !== 'available') all.push({ id: editorId, editing: true });
  (viewerIds || []).forEach(v => { if (!all.find(a => a.id === v)) all.push({ id: v, editing: false }); });
  const shown = all.slice(0, max);
  const extra = all.length - shown.length;
  return (
    <span className="presence" title={all.map(a => collabUser(a.id).name + (a.editing ? ' (editing)' : ' (viewing)')).join(', ')}>
      {shown.map(a => {
        const u = collabUser(a.id);
        return (
          <span key={a.id} className={`pav ${a.editing ? 'editing' : ''}`}
                style={{ background: u.color }} title={u.name}>
            {collabInitials(u.name)}
          </span>
        );
      })}
      {extra > 0 && <span className="pav" style={{ background: '#9a9a9a' }}>+{extra}</span>}
    </span>
  );
}

// ============================================================
// Check-out bar — drop into component editor headers
//   props: componentKey, label, type
// ============================================================
function CheckoutBar({ componentKey, label, type, onOpenHistory }) {
  const collab = useCollab();
  React.useEffect(() => { ensureComponent(componentKey, label, type); collabEmit(); }, [componentKey]);
  const c = collab.components[componentKey];
  if (!c) return null;

  const mine = c.status === 'me';
  const other = c.status !== 'me' && c.status !== 'available';
  const otherUser = other ? collabUser(c.status) : null;
  const notifying = c.notify.includes('jb');
  const histCount = (collab.history[componentKey] || []).length;

  return (
    <div className={`checkout-bar ${mine ? 'mine' : other ? 'other' : 'avail'}`}>
      <span className={`checkout-status ${mine ? 'mine' : other ? 'other' : 'avail'}`}>
        {mine && <><IcUnlock size={15} /> Checked out to you · editing</>}
        {other && <><IcLock size={15} /> Checked out to {otherUser.name} · read-only{c.since ? ` · ${fmtAgo(c.since)}` : ''}</>}
        {!mine && !other && <><IcCircleCheck size={15} /> Available · checked in</>}
      </span>

      <span className="presence-label" style={{ marginLeft: 4 }}>
        <PresenceAvatars editorId={c.status} viewerIds={c.viewers} />
      </span>

      <span className="co-spacer" />

      {histCount > 0 && (
        <button className="btn ghost" style={{ fontSize: 12 }} onClick={onOpenHistory}>
          <IcHistory size={14} /> History ({histCount})
        </button>
      )}

      {mine && (
        <>
          <button className="btn" onClick={() => collabUndoCheckout(componentKey)}>
            <IcUndo size={14} /> Undo check-out
          </button>
          <CheckinButton componentKey={componentKey} />
        </>
      )}
      {other && (
        <button className={`btn ${notifying ? 'primary' : ''}`} onClick={() => collabToggleNotify(componentKey)}>
          <IcBell size={14} /> {notifying ? 'Notifying you' : 'Notify me when available'}
        </button>
      )}
      {!mine && !other && (
        <button className="btn primary" onClick={() => collabCheckout(componentKey)}>
          <IcUnlock size={14} /> Check out to edit
        </button>
      )}
    </div>
  );
}

function CheckinButton({ componentKey }) {
  const [open, setOpen] = React.useState(false);
  const [comment, setComment] = React.useState('');
  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)}>
        <IcCheck size={14} /> Check in
      </button>
      {open && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal">
            <div className="modal-head"><h3>Check in changes</h3></div>
            <div className="modal-body">
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label">Change comment <span style={{ color: 'var(--red)' }}>*</span></label>
                <textarea className="textarea" autoFocus value={comment}
                          onChange={e => setComment(e.target.value)}
                          placeholder="Describe what you changed — this is stored in the audit trail."
                          style={{ minHeight: 90 }} />
                <div className="field-help">Committed to version control and added to the change history.</div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn primary" disabled={!comment.trim()}
                      onClick={() => { collabCheckin(componentKey, comment.trim()); setOpen(false); }}>
                <IcCheck size={14} /> Check in
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// History / audit modal — timeline + compare + rollback
// ============================================================
function HistoryModal({ componentKey, label, onClose }) {
  const collab = useCollab();
  const hist = collab.history[componentKey] || [];
  const [sel, setSel] = React.useState([]);     // up to 2 selected for compare
  const [diffOpen, setDiffOpen] = React.useState(false);

  function toggle(id) {
    setSel(s => s.includes(id) ? s.filter(x => x !== id)
              : s.length < 2 ? [...s, id] : [s[1], id]);
  }
  const selEntries = sel.map(id => hist.find(h => h.id === id)).filter(Boolean)
    .sort((a, b) => b.at - a.at);

  function rollback(entry) {
    const h = collab.history[componentKey];
    h.unshift({ id: 'h' + Date.now(), action: 'Modified', user: 'jb', at: new Date(),
                ver: 'v4.2.3', comment: `Rolled back to ${entry.ver} (${fmtTime(entry.at)})`, before: [], after: [] });
    collabEmit();
    ruleToast && ruleToast(`Rolled back to ${entry.ver}`, 'success');
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: diffOpen ? 920 : 720, maxWidth: '96vw' }}>
        <div className="modal-head">
          <h3><IcHistory size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              {diffOpen ? 'Compare versions' : 'Change history'} — {label}</h3>
          <button className="icon-btn" onClick={onClose}><IcX size={16} /></button>
        </div>

        {!diffOpen && (
          <>
            <div className="modal-body" style={{ paddingTop: 8 }}>
              <div className="hist-list">
                <div className="hist-item" style={{ cursor: 'default', fontWeight: 600,
                      color: 'var(--ink-4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  <span /><span>Action</span><span>Comment</span><span>Author · When</span><span>Version</span>
                </div>
                {hist.map(h => {
                  const u = collabUser(h.user);
                  return (
                    <div key={h.id} className={`hist-item ${sel.includes(h.id) ? 'sel' : ''}`}
                         onClick={() => toggle(h.id)}>
                      <span className="hist-check">{sel.includes(h.id) && <IcCheck size={12} />}</span>
                      <span><span className={`hist-action ha-${h.action.toLowerCase()}`}>{h.action}</span></span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.comment}</span>
                      <span className="co-who">
                        <span className="pav" style={{ width: 22, height: 22, background: u.color, fontSize: 9, position: 'static', border: 0 }}>
                          {collabInitials(u.name)}
                        </span>
                        <span style={{ fontSize: 12 }}>{u.name.split(' ')[0]} · {fmtAgo(h.at)}</span>
                      </span>
                      <span className="hist-ver">{h.ver}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {sel.length === 0 ? 'Select up to 2 versions to compare' :
                 sel.length === 1 ? '1 selected — pick another to compare' : '2 selected'}
              </span>
              <div className="hstack" style={{ gap: 8 }}>
                <button className="btn" disabled={sel.length !== 2} onClick={() => setDiffOpen(true)}>
                  <IcDiff size={14} /> Compare
                </button>
                <button className="btn" disabled={sel.length !== 1}
                        onClick={() => rollback(hist.find(h => h.id === sel[0]))}>
                  <IcRollback size={14} /> Roll back to this
                </button>
                <button className="btn" onClick={() => ruleToast && ruleToast('Exported version(s) to file', 'success')}>
                  <IcExport size={14} /> Export
                </button>
              </div>
            </div>
          </>
        )}

        {diffOpen && selEntries.length === 2 && (
          <>
            <div className="modal-body">
              <DiffView older={selEntries[1]} newer={selEntries[0]} />
            </div>
            <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
              <button className="btn" onClick={() => setDiffOpen(false)}><IcChevLeft size={14} /> Back to history</button>
              <button className="btn" onClick={() => ruleToast && ruleToast('Opened in external diff tool', 'info')}>
                <IcLink size={14} /> Show in external tool
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DiffView({ older, newer }) {
  // Build a naive line diff from before/after arrays (fallback to comment)
  const a = older.after?.length ? older.after : older.before?.length ? older.before : [older.comment];
  const b = newer.after?.length ? newer.after : newer.before?.length ? newer.before : [newer.comment];
  return (
    <>
      <div className="hstack" style={{ gap: 12, marginBottom: 10, fontSize: 12, color: 'var(--ink-4)' }}>
        <span><strong style={{ color: 'var(--ink)' }}>{older.ver}</strong> · {collabUser(older.user).name} · {fmtTime(older.at)}</span>
        <IcArrowRight size={14} />
        <span><strong style={{ color: 'var(--ink)' }}>{newer.ver}</strong> · {collabUser(newer.user).name} · {fmtTime(newer.at)}</span>
      </div>
      <div className="diff-cols">
        <div className="diff-col">
          <div className="diff-col-head"><IcGitCommit size={13} /> {older.ver} (older)</div>
          <div className="diff-lines">
            {a.map((line, i) => (
              <div key={i} className={`diff-line ${b.includes(line) ? 'ctx' : 'del'}`}>{line}</div>
            ))}
          </div>
        </div>
        <div className="diff-col">
          <div className="diff-col-head"><IcGitCommit size={13} /> {newer.ver} (newer)</div>
          <div className="diff-lines">
            {b.map((line, i) => (
              <div key={i} className={`diff-line ${a.includes(line) ? 'ctx' : 'add'}`}>{line}</div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

window.COLLAB_ME = COLLAB_ME;
window.COLLAB_TEAM = COLLAB_TEAM;
window.collabUser = collabUser;
window.collabInitials = collabInitials;
window.useCollab = useCollab;
window.CheckoutBar = CheckoutBar;
window.HistoryModal = HistoryModal;
window.PresenceAvatars = PresenceAvatars;
window.collabForceCheckin = collabForceCheckin;
window.collabCheckin = collabCheckin;
window.collabUndoCheckout = collabUndoCheckout;
window.collabToggleNotify = collabToggleNotify;
window.fmtAgo = fmtAgo;
window.fmtTime = fmtTime;
