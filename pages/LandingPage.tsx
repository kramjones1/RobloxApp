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
  heroTitle: {
    fontSize: 'clamp(48px, 12vw, 140px)',
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
    fontSize: 'clamp(18px, 3vw, 32px)',
    marginTop: 16,
    fontWeight: 400,
  },
  cta: {
    marginTop: 32,
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    color: '#fff',
    border: 'none',
    padding: '16px 48px',
    borderRadius: 50,
    fontSize: 18,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 4px 24px rgba(108,99,255,0.3)',
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
    transition: 'transform 0.2s, border-color 0.2s',
  },
  cardIcon: {
    fontSize: 40,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 600,
    margin: '0 0 10px',
  },
  cardDesc: {
    color: '#888',
    fontSize: 15,
    lineHeight: 1.6,
    margin: 0,
  },
  about: {
    background: '#0a0a0a',
  },
  aboutContent: {
    maxWidth: 900,
    textAlign: 'center' as const,
    padding: '0 20px',
  },
  aboutTitle: {
    color: '#fff',
    fontSize: 'clamp(28px, 5vw, 44px)',
    fontWeight: 700,
    margin: '0 0 20px',
  },
  aboutText: {
    color: '#888',
    fontSize: 17,
    lineHeight: 1.9,
    margin: 0,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 'clamp(28px, 5vw, 44px)',
    fontWeight: 700,
    margin: 0,
    textAlign: 'center' as const,
  },
  sectionSub: {
    color: '#888',
    fontSize: 17,
    marginTop: 8,
    textAlign: 'center' as const,
  },
};

const features = [
  { icon: '⚡', title: 'Instant Matching', desc: 'Connect with a random stranger in seconds. No swiping, no profiles, just real conversations.' },
  { icon: '🎥', title: 'Live Video Chat', desc: 'Face-to-face conversation with high-quality video and audio. Real-time and authentic.' },
  { icon: '🛡️', title: 'Safe & Anonymous', desc: 'Your identity stays private. No account details shared. Report inappropriate users instantly.' },
  { icon: '🌍', title: 'No Sign-up Required', desc: 'Jump straight into a conversation. No email verification, no personal information needed.' },
];

interface Props {
  onStart: () => void;
}

export default function LandingPage({ onStart }: Props) {
  return (
    <>
      <section style={{ ...s.section, ...s.hero }}>
        <h1 style={s.heroTitle}>Talk</h1>
        <p style={s.heroTagline}>Random video chat. Meet new people.</p>
        <button style={s.cta} onClick={onStart}>Start Chatting</button>
      </section>

      <section style={{ ...s.section, ...s.features }}>
        <h2 style={s.sectionTitle}>Why Talk?</h2>
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
          <h2 style={s.aboutTitle}>About Talk</h2>
          <p style={s.aboutText}>
            Talk is a free, anonymous video chat platform that connects you with random people from around the world.
            Our mission is to break down barriers and bring people together through spontaneous face-to-face conversations.
            Whether you want to make new friends, practice a language, or just have fun, Talk provides a safe and
            welcoming space for genuine human connection. No sign-ups, no tracking — just real conversations.
          </p>
        </div>
      </section>
    </>
  );
}
