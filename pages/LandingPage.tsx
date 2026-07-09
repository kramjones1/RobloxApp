import React from 'react';
type Page = 'home' | 'privacy' | 'terms' | 'profile' | 'messages';

const s = {
  section: {
    minHeight: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    fontFamily: 'system-ui, sans-serif',
    padding: 0,
    flex: 1,
  },
  hero: {
    background: 'linear-gradient(135deg, #0a0a0a 0%, #111128 50%, #0a0a0a 100%)',
    flex: 1,
  },
  row: {
    flex: 1,
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 1100,
    margin: '0 auto',
    padding: '0 40px',
    gap: 40,
  },
  left: {
    flex: '1 1 400px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    padding: '20px 0',
  },
  heroTitle: {
    fontSize: 'clamp(48px, 8vw, 96px)',
    fontWeight: 800,
    margin: 0,
    letterSpacing: '-3px',
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    lineHeight: 1.1,
  },
  heroTagline: {
    color: '#999',
    fontSize: 'clamp(16px, 2vw, 22px)',
    marginTop: 8,
    fontWeight: 400,
  },
  cta: {
    marginTop: 24,
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    color: '#fff',
    border: 'none',
    padding: '14px 48px',
    borderRadius: 50,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 24px rgba(108,99,255,0.3)',
  },
  right: {
    flex: '0 0 auto',
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 0',
  },
  authBox: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '32px 24px',
    width: '100%',
    maxWidth: 400,
  },
  authTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 4px',
    textAlign: 'center' as const,
  },
  authSub: {
    color: '#888',
    fontSize: 13,
    margin: '0 0 24px',
    textAlign: 'center' as const,
  },
  input: {
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)',
    padding: '14px 16px',
    borderRadius: 12,
    fontSize: 16,
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    color: '#fff',
    border: 'none',
    padding: '12px',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    width: '100%',
  },
  credit: { color: '#555', fontSize: 14, textAlign: 'center' as const, padding: '40px 20px 0', marginTop: 'auto' },
};

interface Props {
  onStart: () => void;
  onNav?: (p: Page) => void;
  authMode?: 'login' | 'register';
  authMsg?: string;
  submitting?: boolean;
  email?: string;
  password?: string;
  onEmailChange?: (v: string) => void;
  onPasswordChange?: (v: string) => void;
  onSubmit?: (e: React.FormEvent) => void;
  onToggleAuth?: () => void;
  showForgot?: boolean;
  forgotSent?: boolean;
  forgotEmail?: string;
  forgotCooldown?: number;
  onForgotEmailChange?: (v: string) => void;
  onForgotSubmit?: (e: React.FormEvent) => void;
  onShowForgot?: () => void;
  onBackToSignIn?: () => void;
  onGoogleSignIn?: () => void;
  onGitHubSignIn?: () => void;
}

export default function LandingPage({
  onNav, onStart, authMode, authMsg, submitting, email, password,
  onEmailChange, onPasswordChange, onSubmit, onToggleAuth,
  showForgot, forgotSent, forgotEmail, forgotCooldown,
  onForgotEmailChange, onForgotSubmit, onShowForgot, onBackToSignIn,
  onGoogleSignIn, onGitHubSignIn,
}: Props) {
  const showAuth = !!onSubmit;
  return (
    <section style={{ ...s.section, ...s.hero }}>
      <div style={s.row}>
        <div style={s.left}>
          <h1 style={s.heroTitle}>LiveMe</h1>
          <p style={s.heroTagline}>Random video chat. Meet new people.</p>
          {!showAuth && <button style={s.cta} onClick={onStart}>Start Chatting</button>}
        </div>

        {showAuth && (
          <div style={s.right}>
            <div style={s.authBox}>
              {showForgot ? (
                <>
                  <p style={s.authTitle}>Reset password</p>
                  <p style={s.authSub}>{forgotSent ? 'Check your email' : 'Enter your email to receive a reset link'}</p>
                  {forgotSent ? (
                    <>
                      <p style={{ color: '#aaa', fontSize: 14, textAlign: 'center', lineHeight: 1.5, margin: '0 0 16px', wordBreak: 'break-word' }}>
                        If an account exists at <b style={{ color: '#fff' }}>{forgotEmail}</b>, we've sent a password reset link.
                      </p>
                      <button onClick={onBackToSignIn} style={s.submitBtn}>Back to Sign In</button>
                    </>
                  ) : (
                    <form onSubmit={onForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input style={s.input} type="email" placeholder="Your email address" value={forgotEmail} onChange={e => onForgotEmailChange?.(e.target.value)} required />
                      <button type="submit" disabled={submitting || (forgotCooldown || 0) > 0} style={{...s.submitBtn, opacity: submitting || (forgotCooldown || 0) > 0 ? 0.5 : 1}}>
                        {submitting ? 'Sending...' : (forgotCooldown || 0) > 0 ? `Wait ${forgotCooldown}s` : 'Send Reset Link'}
                      </button>
                      <p style={{ color: '#666', fontSize: 13, textAlign: 'center', cursor: 'pointer', margin: 0 }} onClick={onBackToSignIn}>← Back to Sign In</p>
                    </form>
                  )}
                  {authMsg && <p style={{ color: authMsg.includes('error') || authMsg.includes('Error') ? '#f44336' : '#ff9800', fontSize: 13, textAlign: 'center', wordBreak: 'break-word', margin: '12px 0 0' }}>{authMsg}</p>}
                </>
              ) : (
                <>
                  <p style={s.authTitle}>{authMode === 'login' ? 'Welcome back' : 'Join LiveMe'}</p>
                  <p style={s.authSub}>{authMode === 'login' ? 'Sign in to continue' : 'Create your free account'}</p>
                  <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input style={s.input} type="email" placeholder="Email" value={email} onChange={e => onEmailChange?.(e.target.value)} required />
                    <input style={s.input} type="password" placeholder="Password (min 8 chars)" value={password} onChange={e => onPasswordChange?.(e.target.value)} required minLength={8} />
                    <button type="submit" disabled={submitting} style={{...s.submitBtn, opacity: submitting ? 0.5 : 1}}>
                      {submitting ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Sign Up'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                      <span style={{ color: '#666', fontSize: 12 }}>OR</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                    </div>
                    <button type="button" onClick={onGoogleSignIn} style={{
                      background: '#4285F4', color: '#fff', border: 'none', padding: '12px', borderRadius: 10,
                      fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#fff" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#fff" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#fff" d="M10.54 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 0 0 0 24c0 3.77.87 7.35 2.56 10.56l7.98-5.97z"/><path fill="#fff" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.97C6.51 42.62 14.62 48 24 48z"/></svg>
                      Sign {authMode === 'login' ? 'in' : 'up'} with Google
                    </button>
                    <button type="button" onClick={onGitHubSignIn} style={{
                      background: '#24292e', color: '#fff', border: 'none', padding: '12px', borderRadius: 10,
                      fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      <svg width="20" height="20" viewBox="0 0 16 16" fill="white"><path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                      Sign {authMode === 'login' ? 'in' : 'up'} with GitHub
                    </button>
                    {authMode === 'login' && (
                      <p style={{ color: '#6c63ff', fontSize: 13, textAlign: 'center', cursor: 'pointer', margin: '0 0 8px' }} onClick={onShowForgot}>
                        Forgot password?
                      </p>
                    )}
                    {authMsg && <p style={{ color: '#ff9800', fontSize: 13, textAlign: 'center', wordBreak: 'break-word', margin: 0 }}>{authMsg}</p>}
                    <p style={{ color: '#666', fontSize: 13, textAlign: 'center', cursor: 'pointer', margin: 0 }} onClick={onToggleAuth}>
                      {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      
    </section>
  );
}
