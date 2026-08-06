// ============================================================
// Root app — login → app shell with state-based routing
// ============================================================

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "magenta",
  "font": "system",
  "density": "regular",
  "sidebar": "hover"
}/*EDITMODE-END*/;

// Accent palettes → drive the --magenta family used across the app
const ACCENTS = {
  magenta: { p: '#a11478', d: '#6d0d51', dd: '#570a41', soft: '#fceaec' },
  blue:    { p: '#0067bd', d: '#0556a0', dd: '#044684', soft: '#eef3f7' },
  teal:    { p: '#0f857a', d: '#0c6d64', dd: '#09564f', soft: '#e7f6f3' },
  violet:  { p: '#6d28d9', d: '#5b21b6', dd: '#4c1d95', soft: '#f3effe' },
};
const FONTS = {
  system: '"Segoe UI", "Segoe UI Variable", "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  inter:  '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  grotesk:'"Helvetica Neue", Helvetica, Arial, sans-serif',
};

// Detect session set by the Angular auth gateway
const _angularSession = (() => {
  try { return JSON.parse(localStorage.getItem('opus.session.user') || 'null'); }
  catch { return null; }
})();

function ComponentsPage() {
  const [sel, setSel] = React.useState(null); // { route, label }
  const [activeGroup, setActiveGroup] = React.useState(null);

  function handleSelect(route, label) {
    setSel({ route, label });
  }

  function renderDetail() {
    if (!sel) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      height: '100%', color: 'var(--ink-4)', gap: 12 }}>
          <IcComponent size={36} />
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-3)' }}>Select a component to view</div>
          <div style={{ fontSize: 13 }}>Browse the catalogue on the left and click any instance</div>
        </div>
      );
    }
    switch (sel.route) {
      case 'porter':      return <Porter selectedName={sel.label} hideSidebar />;
      case 'inspector':   return <Inspector />;
      case 'matcher':     return <Matcher />;
      case 'constructor': return <Enrich />;
      case 'generator':   return <Generator />;
      case 'manager':     return <Manager />;
      case 'flow':        return <DataFlow />;
      case 'rules':       return <Rules />;
      case 'solutions':        return <Solution />;
      case 'diagram':          return <Diagram selectedName={sel.label} />;
      case 'database-objects': return <DatabaseObjects initialType="table" />;
      case 'illustrator':      return <Illustrator />;
      case 'metadata':    return <MetadataStudio onNavigate={() => {}} />;
      default:            return <Stub section={sel.label} onNavigate={() => {}} />;
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <ComponentsExplorerPanel
        current={sel?.route}
        activeGroup={activeGroup}
        onSelectComponent={(route, label) => handleSelect(route, label)}
        onSelectGroup={(gid) => setActiveGroup(gid)}
      />
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0, height: '100%' }}>
        {renderDetail()}
      </div>
    </div>
  );
}

function ConsoleGroupsPage() {
  return <ConsoleSecurity inline onClose={() => {}} />;
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // App flow: email → login → (first-time setup) → app
  // Skip directly to app if already authed via Angular
  const [stage, setStage] = React.useState(() => {
    if (_angularSession) return 'app';
    if (localStorage.getItem('opus.email.seen') === 'true') return 'login';
    return 'email';
  });
  const [authed, setAuthed] = React.useState(!!_angularSession);
  const [user, setUser] = React.useState(_angularSession);
  const [page, setPage] = React.useState('home');
  const [sidebarExpanded, setSidebarExpanded] = React.useState(false);
  const [securityOpen, setSecurityOpen] = React.useState(false);

  // ---- apply tweaks to CSS variables / root ----
  React.useEffect(() => {
    const root = document.documentElement;
    const a = ACCENTS[t.accent] || ACCENTS.magenta;
    root.style.setProperty('--magenta', a.p);
    root.style.setProperty('--magenta-600', a.d);
    root.style.setProperty('--magenta-700', a.dd);
    root.style.setProperty('--magenta-soft', a.soft);
    root.style.setProperty('--font', FONTS[t.font] || FONTS.system);
  }, [t.accent, t.font]);

  const pinned = t.sidebar === 'expanded';

  function handleLogin(u) {
    setUser(u);
    setAuthed(true);
    setPage('home');
    if (localStorage.getItem(SETUP_LS_KEY) !== 'true') setStage('setup');
    else setStage('app');
  }
  function handleLogout() {
    setAuthed(false);
    setUser(null);
    localStorage.removeItem('opus.session.user');
    sessionStorage.removeItem('opus.session.user');
    window.location.href = '/login';
  }
  function completeSetup() {
    localStorage.setItem(SETUP_LS_KEY, 'true');
    setStage('app');
    setPage('home');
    ruleToast && ruleToast('Opus EDM platform ready. Welcome aboard!', 'success');
  }
  function replaySetup() {
    localStorage.removeItem(SETUP_LS_KEY);
    localStorage.removeItem('opus.email.seen');
    setAuthed(false);
    setUser(null);
    setStage('email');
  }

  function renderPage() {
    switch (page) {
      case 'home':         return <Dashboard onNavigate={setPage} />;
      case 'components':   return <ComponentsPage onNavigate={setPage} />;
      case 'database':          return <DatabaseParameters />;
      case 'database-objects':  return <DatabaseObjects initialType="table" />;
      case 'view-builder':      return <DatabaseObjects initialType="view" />;
      case 'stored-proc':       return <DatabaseObjects initialType="stored-proc" />;
      case 'illustrator':          return <Illustrator />;
      case 'illustrator-template': return <Illustrator initialMode="template" />;
      case 'console-groups': return <ConsoleGroupsPage />;
      case 'models':       return <Stub section="Models" onNavigate={setPage} />;
      case 'metadata':     return <MetadataStudio onNavigate={setPage} />;
      case 'marketplace':  return <Marketplace />;
      case 'workspace':    return <WorkspaceActivity onNavigate={setPage} />;
      case 'releases':     return <Releases />;
      case 'tests':        return <TestCenter />;
      case 'environments': return <Environments />;
      case 'diagram':      return <Diagram />;
      case 'solutions':    return <Solution />;
      default:             return <Stub section={page} onNavigate={setPage} />;
    }
  }

  // Tweaks panel is rendered in every stage so it's reachable anywhere
  const tweaksPanel = (
    <TweaksPanel>
      <TweakSection label="Brand" />
      <TweakColor label="Accent" value={(ACCENTS[t.accent] || ACCENTS.magenta).p}
                  options={['#a11478', '#0067bd', '#0f857a', '#6d28d9']}
                  onChange={(hex) => {
                    const map = { '#a11478': 'magenta', '#0067bd': 'blue', '#0f857a': 'teal', '#6d28d9': 'violet' };
                    setTweak('accent', map[hex] || 'magenta');
                  }} />
      <TweakSelect label="Font" value={t.font}
                   options={[
                     { value: 'system', label: 'Segoe UI (system)' },
                     { value: 'inter', label: 'Inter' },
                     { value: 'grotesk', label: 'Helvetica / Arial' },
                   ]}
                   onChange={(v) => setTweak('font', v)} />
      <TweakSection label="Layout" />
      <TweakRadio label="Density" value={t.density}
                  options={['regular', 'compact']}
                  onChange={(v) => setTweak('density', v)} />
      <TweakRadio label="Sidebar" value={t.sidebar}
                  options={[
                    { value: 'hover', label: 'Hover' },
                    { value: 'expanded', label: 'Pinned' },
                  ]}
                  onChange={(v) => setTweak('sidebar', v)} />
    </TweaksPanel>
  );

  if (stage === 'email') {
    return <>
      <SetupEmail
        onStart={() => { localStorage.setItem('opus.email.seen', 'true'); setStage('login'); }}
        onSkip={() => { localStorage.setItem('opus.email.seen', 'true'); setStage('login'); }} />
      {tweaksPanel}
    </>;
  }

  if (stage === 'login' || !authed) {
    return <>
      <Login onSuccess={handleLogin} />
      {tweaksPanel}
    </>;
  }

  if (stage === 'setup') {
    return <>
      <SetupWizard initialEmail={user?.username + '@acmecapital.com'}
                   onComplete={completeSetup} />
      {tweaksPanel}
    </>;
  }

  return (
    <div className={`app fade-in ${t.density === 'compact' ? 'compact' : ''}`}>
      <TopBar onLogout={handleLogout} onNavigate={setPage}
              onOpenSecurity={() => setSecurityOpen(true)}
              onReplaySetup={replaySetup} />
      <div className="body">
        <Sidebar current={page} onNavigate={setPage}
                 expanded={pinned || sidebarExpanded}
                 onToggleExpanded={(v) => { if (!pinned) setSidebarExpanded(v); }} />
        <main className="main">
          {renderPage()}
        </main>
      </div>
      {securityOpen && <ConsoleSecurity onClose={() => setSecurityOpen(false)} />}
      <ToastHost />
      {tweaksPanel}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
