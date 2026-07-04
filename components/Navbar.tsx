import React from 'react';

interface NavbarProps {
  page: string;
  setPage: (p: string) => void;
  user: any;
  onLogout: () => void;
}

const styles = {
  nav: {
    position: 'fixed' as const,
    top: 0, left: 0, right: 0,
    zIndex: 100,
    background: 'rgba(10,10,10,0.85)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '0 24px',
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'system-ui, sans-serif',
  },
  logo: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '-0.5px',
    background: 'linear-gradient(135deg, #6c63ff, #2a6eff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
  },
  link: {
    color: '#999',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'color 0.2s',
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    padding: 0,
  },
  linkActive: {
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'inherit',
    padding: 0,
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  email: {
    color: '#888',
    fontSize: 13,
  },
  logoutBtn: {
    background: 'none',
    border: '1px solid #444',
    color: '#aaa',
    borderRadius: 6,
    padding: '4px 12px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
  },
};

export default function Navbar({ page, setPage, user, onLogout }: NavbarProps) {
  return (
    <nav style={styles.nav}>
      <span style={styles.logo} onClick={() => setPage('home')}>Talk</span>
      <div style={styles.links}>
        <button style={page === 'home' ? styles.linkActive : styles.link} onClick={() => setPage('home')}>Home</button>
        <button style={page === 'privacy' ? styles.linkActive : styles.link} onClick={() => setPage('privacy')}>Privacy</button>
        <button style={page === 'terms' ? styles.linkActive : styles.link} onClick={() => setPage('terms')}>Terms</button>
      </div>
      <div style={styles.userSection}>
        {user ? (
          <>
            <span style={styles.email}>{user.email}</span>
            <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
          </>
        ) : (
          <button style={styles.logoutBtn} onClick={() => setPage('auth')}>Sign In</button>
        )}
      </div>
    </nav>
  );
}
