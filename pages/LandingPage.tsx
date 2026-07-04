import React from 'react';

const s = {
  section: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif',
    padding: '80px 0 40px',
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
    padding: '0 20px',
  },
  heroLeft: {
    flex: '1 1 400px',
    maxWidth: 600,
    padding: '40px 0',
  },
  heroTitle: {
    fontSize: 'clamp(48px, 8vw, 100px)',
    fontWeight: 800,
    margin: 0,
    letterSpacing: '-4px',
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff, #00d4ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    lineHeight: 1.1,
  },
  heroTagline: {
    color: '#999',
    fontSize: 'clamp(18px, 2.5vw, 28px)',
    marginTop: 12,
    fontWeight: 400,
  },
  cta: {
    marginTop: 24,
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    color: '#fff',
    border: 'none',
    padding: '14px 40px',
    borderRadius: 50,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 24px rgba(108,99,255,0.3)',
  },
  heroRight: {
    flex: '1 1 360px',
    maxWidth: 420,
    padding: '40px 0',
    display: 'flex',
    justifyContent: 'center',
  },
  authBox: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '32px 28px',
    width: '100%',
    maxWidth: 380,
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
  features: {
    background: '#0d0d0d',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 24,
    width: '100%',
    maxWidth: 1400,
    marginTop: 48,
    padding: '0 20px',
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: '40px 28px',
    textAlign: 'center' as const,
  },
  cardIcon: { fontSize: 40, marginBottom: 16 },
  cardTitle: { color: '#fff', fontSize: 20, fontWeight: 600, margin: '0 0 10px' },
  cardDesc: { color: '#888', fontSize: 15, lineHeight: 1.6, margin: 0 },
  about: { background: '#0a0a0a' },
  aboutContent: { maxWidth: 900, textAlign: 'center' as const, padding: '0 20px' },
  aboutTitle: { color: '#fff', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 700, margin: '0 0 20px' },
  aboutText: { color: '#888', fontSize: 17, lineHeight: 1.9, margin: 0 },
  sectionTitle: { color: '#fff', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 700, margin: 0, textAlign: 'center' as const },
  sectionSub: { color: '#888', fontSize: 17, marginTop: 8, textAlign: 'center' as const },
};

const features = [
  { icon: '⚡', title: 'Instant Matching', desc: 'Connect with a random stranger in seconds. No swiping, no profiles, just real conversations.' },
  { icon: '🎥', title: 'Live Video Chat', desc: 'Face-to-face conversation with high-quality video and audio. Real-time and authentic.' },
  { icon: '🛡️', title: 'Safe & Anonymous', desc: 'Your identity stays private. No account details shared. Report inappropriate users instantly.' },
  { icon: '🌍', title: 'No Sign-up Required', desc: 'Jump straight into a conversation. No email verification, no personal information needed.' },
];

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
          <div style={s.heroLeft}>
            <h1 style={s.heroTitle}>LiveMe</h1>
            <p style={s.heroTagline}>Random video chat. Meet new people.</p>
            <button style={s.cta} onClick={onStart}>Start Chatting</button>
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

      <section style={{ ...s.section, ...s.features }}>
        <h2 style={s.sectionTitle}>Why LiveMe?</h2>
        <p style={s.sectionSub}>Everything you need for spontaneous conversations</p>
        <div style={s.featuresGrid}>
          {features.map((f, i) => (
            <div key={i} style={s.card}>
              <div style={s.cardIcon}>{f.icon}</div>
              <h3 style={s.cardTitle}>{f.title}</h3>
              <p style={s.cardDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

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
