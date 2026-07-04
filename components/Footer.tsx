import React from 'react';

interface FooterProps {
  setPage: (p: string) => void;
}

const styles = {
  footer: {
    background: 'rgba(10,10,10,0.9)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    padding: '32px 24px',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center' as const,
  },
  logo: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.5px',
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: 12,
    display: 'inline-block',
  },
  links: {
    display: 'flex',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  link: {
    color: '#777',
    fontSize: 13,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    padding: 0,
    transition: 'color 0.2s',
  },
  copyright: {
    color: '#555',
    fontSize: 12,
  },
};

export default function Footer({ setPage }: FooterProps) {
  return (
    <footer style={styles.footer}>
      <div style={styles.logo}>LiveMe</div>
      <div style={styles.links}>
        <button style={styles.link} onClick={() => setPage('home')}>Home</button>
        <button style={styles.link} onClick={() => setPage('privacy')}>Privacy</button>
        <button style={styles.link} onClick={() => setPage('terms')}>Terms</button>
      </div>
      <div style={styles.copyright}>&copy; {new Date().getFullYear()} LiveMe. All rights reserved.</div>
    </footer>
  );
}
