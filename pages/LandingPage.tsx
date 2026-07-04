import React from 'react';

const s = {
  section: {
    minHeight: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif',
    padding: '100px 0 60px',
  },
  hero: {
    background: 'linear-gradient(135deg, #0a0a0a 0%, #111128 50%, #0a0a0a 100%)',
  },
  heroInner: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    padding: '0 40px',
    gap: 20,
  },
  heroLeft: {
    flex: '1 1 400px',
    padding: '20px 0',
  },
  heroTitle: {
    fontSize: 'clamp(40px, 6vw, 80px)',
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
    marginTop: 20,
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    color: '#fff',
    border: 'none',
    padding: '12px 36px',
    borderRadius: 50,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 24px rgba(108,99,255,0.3)',
  },
  heroRight: {
    flex: '1 1 380px',
    padding: '10px 0 30px',
    display: 'flex',
    justifyContent: 'center',
  },
  authBox: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '24px 20px',
    width: '100%',
    maxWidth: 360,
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
    margin: '0 0 20px',
    textAlign: 'center' as const,
  },
  input: {
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)',
    padding: '11px 14px',
    borderRadius: 10,
    fontSize: 15,
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
  toggle: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center' as const,
    marginTop: 16,
    cursor: 'pointer',
  },
  sectionTitle: { color: '#fff', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 700, margin: 0, textAlign: 'center' as const },
  about: { background: '#0a0a0a' },
  aboutContent: { textAlign: 'center' as const, padding: '0 40px' },
  aboutTitle: { color: '#fff', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 700, margin: '0 0 20px' },
  aboutText: { color: '#888', fontSize: 17, lineHeight: 1.9, margin: 0 },
  credit: { color: '#555', fontSize: 14, textAlign: 'center' as const, padding: '40px 20px 0' },
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
}

export default function LandingPage({ onStart, authMode, authMsg, submitting, email, password, onEmailChange, onPasswordChange, onSubmit, onToggleAuth }: Props) {
  const showAuth = !!onSubmit;
  return (
    <>
      <section style={{ ...s.section, ...s.hero }}>
        <div style={s.heroInner}>
          <div className="hero-left" style={s.heroLeft}>
            <h1 style={s.heroTitle}>LiveMe</h1>
            <p style={s.heroTagline}>Random video chat. Meet new people.</p>
            {!showAuth && <button style={s.cta} onClick={onStart}>Start Chatting</button>}
          </div>
          {showAuth && (
            <div style={s.heroRight}>
              <div style={s.authBox}>
                <p style={s.authTitle}>{authMode === 'login' ? 'Welcome back' : 'Join LiveMe'}</p>
                <p style={s.authSub}>{authMode === 'login' ? 'Sign in to continue' : 'Create your free account'}</p>
                <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input style={s.input} type="email" placeholder="Email" value={email} onChange={e => onEmailChange?.(e.target.value)} required />
                  <input style={s.input} type="password" placeholder="Password (min 6 chars)" value={password} onChange={e => onPasswordChange?.(e.target.value)} required minLength={6} />
                  <button type="submit" disabled={submitting} style={{...s.submitBtn, opacity: submitting ? 0.5 : 1}}>
                    {submitting ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Sign Up'}
                  </button>
                  {authMsg && <p style={{ color: '#ff9800', fontSize: 13, textAlign: 'center', wordBreak: 'break-word', margin: 0 }}>{authMsg}</p>}
                  <p style={{ color: '#666', fontSize: 13, textAlign: 'center', cursor: 'pointer', margin: 0 }} onClick={onToggleAuth}>
                    {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
                  </p>
                </form>
              </div>
            </div>
          )}
        </div>
      </section>

      <p style={s.credit}>© 2026 Anito MJI</p>

      <section style={{ ...s.section, ...s.about }}>
        <div style={s.aboutContent}>
          <h2 style={s.aboutTitle}>About LiveMe</h2>
          <p style={s.aboutText}>
            LiveMe is a free, anonymous video chat platform that connects you with random people from around the world.
            Our mission is to break down barriers and bring people together through spontaneous face-to-face conversations.
            Whether you want to make new friends, practice a language, or just have fun, LiveMe provides a safe and
            welcoming space for genuine human connection. No sign-ups, no tracking — just real conversations.
          </p>
        </div>
      </section>
    </>
  );
}
