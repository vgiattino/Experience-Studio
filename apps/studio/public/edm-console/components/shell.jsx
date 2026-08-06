// ============================================================
// App Shell — top bar + sidebar nav
// ============================================================

const NAV_SECTIONS = [
  {
    items: [
      { id: 'home', label: 'Home', icon: 'IcHome' },
    ]
  },
  {
    label: 'Structure', mini: 'STRUCTURE',
    items: [
      { id: 'components', label: 'Components', icon: 'IcComponent' },
      { id: 'database', label: 'Database', icon: 'IcSource' },
      { id: 'console-groups', label: 'Console Grouping & Security', icon: 'IcUserShield' },
    ]
  },
  {
    label: 'Modeling', mini: 'MODELING',
    items: [
      { id: 'models', label: 'Models', icon: 'IcModels' },
      { id: 'metadata', label: 'Metadata Studio', icon: 'IcLayers' },
    ]
  },
  {
    label: 'Marketplace', mini: 'MARKET',
    items: [
      { id: 'marketplace', label: 'Opus Marketplace', icon: 'IcMarketplace' },
    ]
  },
  {
    label: 'Delivery', mini: 'DELIVER',
    items: [
      { id: 'workspace', label: 'Workspace Activity', icon: 'IcUsersThree' },
      { id: 'releases', label: 'Releases', icon: 'IcRocketShip' },
      { id: 'tests', label: 'Test Center', icon: 'IcFlask' },
      { id: 'environments', label: 'Environments', icon: 'IcServer' },
    ]
  }
];

function Sidebar({ current, onNavigate, expanded, onToggleExpanded }) {
  return (
    <aside className={`sidebar ${expanded ? 'expanded' : ''}`}
           onMouseEnter={() => onToggleExpanded(true)}
           onMouseLeave={() => onToggleExpanded(false)}>
      {NAV_SECTIONS.map((section, si) => (
        <React.Fragment key={si}>
          {section.label && (
            <div className="sidebar-section">
              <span className="sidebar-section-full">{section.label}</span>
              <span className="sidebar-section-mini">{section.mini}</span>
            </div>
          )}
          {section.items.map(item => {
            const Icon = window[item.icon];
            return (
              <button key={item.id}
                      className={`nav-item ${current === item.id ? 'active' : ''}`}
                      onClick={() => onNavigate(item.id)}>
                <span className="nav-icon"><Icon size={20} /></span>
                <span className="nav-label">{item.label}</span>
                {!expanded && <span className="tip">{item.label}</span>}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </aside>
  );
}

// --------------------------------------------------------------
// Top bar
// --------------------------------------------------------------
function TopBar({ onLogout, onNavigate, onOpenSecurity, onReplaySetup }) {
  const [openMenu, setOpenMenu] = React.useState(null); // 'notif' | 'avatar' | null
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <header className="topbar">
      <OpusLogo size={28} />
      <div className="topbar-right" ref={wrapRef}>
        <button className="topbar-icon" title="Announcements"><IcSend size={18} /></button>
        <button className="topbar-icon" title="Console Grouping & Security"
                onClick={onOpenSecurity}>
          <IcUserShield size={18} />
        </button>
        <button className="topbar-icon" title="Settings"><IcCog size={18} /></button>

        <div style={{ position: 'relative' }}>
          <button className="topbar-icon" title="Notifications"
                  onClick={() => setOpenMenu(openMenu === 'notif' ? null : 'notif')}>
            <IcBell size={18} />
            <span className="dot" />
          </button>
          {openMenu === 'notif' && <NotifPopover onClose={() => setOpenMenu(null)} />}
        </div>

        <button className="topbar-icon" title="Help"><IcHelp size={18} /></button>

        <div style={{ position: 'relative' }}>
          <button className="avatar"
                  onClick={() => setOpenMenu(openMenu === 'avatar' ? null : 'avatar')}
                  title="Account">JB</button>
          {openMenu === 'avatar' && (
            <AvatarMenu onLogout={onLogout}
                        onReplaySetup={onReplaySetup}
                        onNavigate={(p) => { setOpenMenu(null); onNavigate(p); }} />
          )}
        </div>
      </div>
    </header>
  );
}

function NotifPopover() {
  const [items, setItems] = React.useState([
    { id: 1, title: 'SFTP configuration failed for "My custom source"', meta: '2 min ago', read: false },
    { id: 2, title: 'Bloomberg flow finished successfully', meta: '18 min ago', read: false },
    { id: 3, title: 'kim.wexler@email.com requested approval', meta: '1 hour ago', read: false },
    { id: 4, title: 'Master security model updated to v4.2.1', meta: 'Yesterday', read: true },
    { id: 5, title: 'New comment on "Add an attribute"', meta: '2 days ago', read: true },
  ]);
  const unread = items.filter(i => !i.read).length;
  return (
    <div className="popover fade-in" style={{ width: 320 }}>
      <div className="popover-head">
        <span>Notifications</span>
        <small>{unread} unread</small>
      </div>
      <div className="popover-list">
        {items.map(n => (
          <div key={n.id} className={`notif ${n.read ? 'read' : ''}`}
               onClick={() => setItems(items.map(x => x.id === n.id ? { ...x, read: true } : x))}>
            <span className="nf-dot" />
            <div className="nf-body">
              <div className="nf-title">{n.title}</div>
              <div className="nf-meta">{n.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AvatarMenu({ onLogout, onReplaySetup, onNavigate }) {
  return (
    <div className="popover fade-in" style={{ minWidth: 240 }}>
      <div className="avatar-card">
        <span className="avatar">JB</span>
        <div className="vstack">
          <span className="ac-name">Jimmy Brown</span>
          <span className="ac-mail">jimmy.brown@hhm.com</span>
        </div>
      </div>
      <div style={{ padding: 4 }}>
        <div className="menu-item" onClick={() => onNavigate('home')}>
          <IcUser size={16} /> My profile
        </div>
        <div className="menu-item" onClick={() => onNavigate('home')}>
          <IcCog size={16} /> Preferences
        </div>
        <div className="menu-divider" />
        <div className="menu-item" onClick={onReplaySetup}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 16.5L4 20l3.5-.5" /><path d="M9 14l-3 3" />
            <path d="M13 4c4 0 7 3 7 7-3 3-6 5-8 5l-4-4c0-2 2-5 5-8z" />
            <circle cx="15" cy="9" r="1.5" />
          </svg>
          Replay first-time setup
        </div>
        <div className="menu-divider" />
        <div className="menu-item" onClick={onLogout}>
          <IcLogout size={16} /> Sign out
        </div>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
window.TopBar = TopBar;
window.NAV_SECTIONS = NAV_SECTIONS;
