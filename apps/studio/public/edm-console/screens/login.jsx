// ============================================================
// Login screen — split layout (form left, image right)
// ============================================================
function Login({ onSuccess }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPwd, setShowPwd] = React.useState(false);
  const [remember, setRemember] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  // Hint: any non-empty creds work; demo user is "jimmy" / "opus"
  function submit(e) {
    e?.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please enter both your username and password to sign in.');
      return;
    }
    setSubmitting(true);
    // Simulate auth round trip
    setTimeout(() => {
      // Fail intentionally only for the obvious "wrong" credential
      if (username.toLowerCase() === 'wrong' || password === 'wrong') {
        setSubmitting(false);
        setError('Your credentials don\'t match an active Opus EDM account.');
        return;
      }
      setSubmitting(false);
      onSuccess({ username, remember });
    }, 720);
  }

  return (
    <div className="login">
      <div className="login-pane">
        <form className="login-form-wrap login-form fade-in" onSubmit={submit}>
          <div className="login-logo">
            <OpusLogo size={36} />
          </div>

          {error && (
            <div className="login-error" role="alert">
              <IcWarn size={16} /> {error}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="login-user">Username</label>
            <input id="login-user" className={`input ${error ? 'error' : ''}`}
                   type="text" autoComplete="username"
                   placeholder="Enter your username"
                   value={username} onChange={e => setUsername(e.target.value)}
                   autoFocus />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="login-pwd">Password</label>
            <div className="input-wrap">
              <input id="login-pwd" className={`input has-icon ${error ? 'error' : ''}`}
                     type={showPwd ? 'text' : 'password'} autoComplete="current-password"
                     placeholder="Enter your password"
                     value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" className="input-icon"
                      onClick={() => setShowPwd(s => !s)}
                      aria-label={showPwd ? 'Hide password' : 'Show password'}>
                {showPwd ? <IcEyeOff size={18} /> : <IcEye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn primary login-submit" disabled={submitting}>
            {submitting ? (
              <>
                <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.35)" strokeWidth="2.5" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                Signing in…
              </>
            ) : 'Log In'}
          </button>

          <label className="checkbox" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            <span className="box"><IcCheck size={12} /></span>
            <span>Remember me</span>
          </label>

          <div className="login-links">
            <a href="#" onClick={e => e.preventDefault()}>Opus EDM Wiki</a>
            <a href="#" onClick={e => e.preventDefault()}>About Opus EDM</a>
          </div>
        </form>

        <div className="login-footer">
          <div>Opus EDM Suite</div>
          <div>© 2026 Gresham. All Rights Reserved.</div>
        </div>
      </div>
      <div className="login-image" style={{ backgroundImage: 'url(highway.svg)' }} />
    </div>
  );
}

window.Login = Login;
