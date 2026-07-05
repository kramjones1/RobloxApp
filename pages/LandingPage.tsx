import React from 'react';

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
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
  },
  brand: {
    textAlign: 'center' as const,
    marginBottom: 32,
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
}

export default function LandingPage({ onStart, authMode, authMsg, submitting, email, password, onEmailChange, onPasswordChange, onSubmit, onToggleAuth, showForgot, forgotSent, forgotEmail, forgotCooldown, onForgotEmailChange, onForgotSubmit, onShowForgot, onBackToSignIn }: Props) {
  const showAuth = !!onSubmit;
  return (
    <section style={{ ...s.section, ...s.hero }}>
      <div style={s.center}>
        <div style={s.brand}>
          <h1 style={s.heroTitle}>LiveMe</h1>
          <p style={s.heroTagline}>Random video chat. Meet new people.</p>
          {!showAuth && <button style={s.cta} onClick={onStart}>Start Chatting</button>}
        </div>

        {showAuth && (
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
                    <p style={{ color: '#666', fontSize: 13, textAlign: 'center', cursor: 'pointer', margin: 0 }} onClick={onBackToSignIn}>
                      ← Back to Sign In
                    </p>
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
        )}
      </div>
      <p style={s.credit}>© 2026 Anito MJI</p>
    </section>
  );
}
